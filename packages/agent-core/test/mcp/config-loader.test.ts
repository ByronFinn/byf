import { mkdtempSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCodes, ByfError } from '../../src/errors';
import { loadMcpServers, resolveMcpJsonPaths } from '../../src/mcp/config-loader';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'byf-mcp-loader-'));
  tempDirs.push(dir);
  return dir;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, JSON.stringify(value), 'utf-8');
}

describe('resolveMcpJsonPaths', () => {
  it('returns the canonical user and project paths', () => {
    const paths = resolveMcpJsonPaths({ cwd: '/work/proj', homeDir: '/home/user/.byf' });
    expect(paths.user).toBe('/home/user/.byf/mcp.json');
    expect(paths.project).toBe('/work/proj/.byf/mcp.json');
  });
});

describe('loadMcpServers', () => {
  it('returns an empty map when no files exist', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const servers = await loadMcpServers({ cwd, homeDir: home });
    expect(servers).toEqual({});
  });

  it('treats empty JSON files as empty maps', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '   \n');
    const servers = await loadMcpServers({ cwd, homeDir: home });
    expect(servers).toEqual({});
  });

  it('merges project-local mcp.json with user-global, project overriding on conflict', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();

    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-user' },
        userOnly: { transport: 'stdio', command: 'user-only' },
      },
    });
    await writeJson(join(cwd, '.byf', 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'shared-project' },
        local: { transport: 'http', url: 'http://localhost:8080/mcp' },
      },
    });

    const servers = await loadMcpServers({ cwd, homeDir: home });

    expect(Object.keys(servers).toSorted()).toEqual(['local', 'shared', 'userOnly']);
    expect(servers['shared']).toEqual({
      transport: 'stdio',
      command: 'shared-project',
    });
    expect(servers['userOnly']).toEqual({
      transport: 'stdio',
      command: 'user-only',
    });
    expect(servers['local']).toEqual({
      transport: 'http',
      url: 'http://localhost:8080/mcp',
    });
  });

  it('throws ByfError(config.invalid) on invalid JSON', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '{not json}', 'utf-8');
    await expect(loadMcpServers({ cwd, homeDir: home })).rejects.toBeInstanceOf(ByfError);
    await expect(loadMcpServers({ cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('throws ByfError(config.invalid) on schema violation (unknown transport)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { bad: { transport: 'ws', url: 'https://x' } },
    });
    await expect(loadMcpServers({ cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('throws ByfError(config.invalid) on schema violation (missing required field)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { bad: { transport: 'stdio' } },
    });
    await expect(loadMcpServers({ cwd, homeDir: home })).rejects.toMatchObject({
      code: ErrorCodes.CONFIG_INVALID,
    });
  });

  it('infers transport=stdio when an entry omits transport but has command', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        gh: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
      },
    });
    const servers = await loadMcpServers({ cwd, homeDir: home });
    expect(servers['gh']).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    });
  });

  it('infers transport=http when an entry omits transport but has url', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        remote: { url: 'https://mcp.example.com/sse' },
      },
    });
    const servers = await loadMcpServers({ cwd, homeDir: home });
    expect(servers['remote']).toEqual({
      transport: 'http',
      url: 'https://mcp.example.com/sse',
    });
  });

  it('honors BYF_HOME env var when homeDir is not supplied', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { from_env: { transport: 'stdio', command: 'env-cmd' } },
    });
    const saved = process.env['BYF_HOME'];
    process.env['BYF_HOME'] = home;
    try {
      const servers = await loadMcpServers({ cwd });
      expect(servers['from_env']).toEqual({ transport: 'stdio', command: 'env-cmd' });
    } finally {
      if (saved === undefined) delete process.env['BYF_HOME'];
      else process.env['BYF_HOME'] = saved;
    }
  });
});

// ---- config-store(PRD-0036 / ADR-0039)--------------------------------------

import {
  assertMcpConfigScope,
  isMcpMaskedPlaceholder,
  listMcpConfigs,
  maskMcpJsonText,
  maskServerConfig,
  readMcpRaw,
  restoreMaskedTree,
} from '../../src/mcp/config-store';

describe('config-store listMcpConfigs', () => {
  it('returns empty scopes when no files exist', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const listing = await listMcpConfigs({ cwd, homeDir: home });
    expect(listing.user.servers).toEqual([]);
    expect(listing.project.servers).toEqual([]);
    expect(listing.user.invalid).toBeUndefined();
    expect(listing.project.path).toBe(join(cwd, '.byf', 'mcp.json'));
  });

  it('treats empty files as empty scopes', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '\n  \n');
    const listing = await listMcpConfigs({ cwd, homeDir: home });
    expect(listing.user.servers).toEqual([]);
    expect(listing.user.invalid).toBeUndefined();
  });

  it('marks user entries overridden when project defines the same name (R-M4)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        shared: { transport: 'stdio', command: 'user-side' },
        onlyUser: { transport: 'stdio', command: 'u' },
      },
    });
    await writeJson(join(cwd, '.byf', 'mcp.json'), {
      mcpServers: { shared: { transport: 'http', url: 'http://localhost/mcp' } },
    });
    const listing = await listMcpConfigs({ cwd, homeDir: home });
    const shared = listing.user.servers.find((s) => s.name === 'shared');
    const onlyUser = listing.user.servers.find((s) => s.name === 'onlyUser');
    expect(shared?.overridden).toBe(true);
    expect(onlyUser?.overridden).toBeUndefined();
    expect(listing.project.servers.find((s) => s.name === 'shared')?.overridden).toBeUndefined();
  });

  it('masks env/headers values in entries; plaintext never leaves (D1)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        gh: {
          transport: 'stdio',
          command: 'gh-mcp',
          env: { GITHUB_TOKEN: 'ghp-plain-secret' },
        },
        api: {
          transport: 'http',
          url: 'http://localhost/mcp',
          headers: { Authorization: 'Bearer sk-live' },
        },
      },
    });
    const listing = await listMcpConfigs({ cwd, homeDir: home });
    const text = JSON.stringify(listing);
    expect(text).not.toContain('ghp-plain-secret');
    expect(text).not.toContain('sk-live');
    expect(text).toContain('__MCP_MASKED_');
    const gh = listing.user.servers.find((s) => s.name === 'gh');
    expect(
      isMcpMaskedPlaceholder(
        String((gh?.config as { env: Record<string, string> }).env['GITHUB_TOKEN']),
      ),
    ).toBe(true);
  });

  it('reports invalid state with message for corrupt JSON', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '{ "mcpServers": ');
    const listing = await listMcpConfigs({ cwd, homeDir: home });
    expect(listing.user.servers).toEqual([]);
    expect(listing.user.invalid?.message).toBeDefined();
    // 损坏只影响该 scope;另一 scope 正常。
    expect(listing.project.invalid).toBeUndefined();
  });

  it('reports invalid state for schema-invalid server entries', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: { bad: { transport: 'stdio' } },
    });
    const listing = await listMcpConfigs({ cwd, homeDir: home });
    expect(listing.user.invalid?.message).toBeDefined();
  });
});

describe('config-store readMcpRaw', () => {
  it('returns empty text for missing file', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const doc = await readMcpRaw({ cwd, homeDir: home, scope: 'user' });
    expect(doc.text).toBe('');
    expect(doc.invalid).toBeUndefined();
  });

  it('returns masked normalized text for valid file (D4)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(
      join(home, 'mcp.json'),
      '{"mcpServers":{"gh":{"transport":"stdio","command":"gh","env":{"TOKEN":"sk-secret"}}}}',
    );
    const doc = await readMcpRaw({ cwd, homeDir: home, scope: 'user' });
    expect(doc.text).not.toContain('sk-secret');
    expect(doc.text).toContain('__MCP_MASKED_1__');
    // 规范化:2 空格缩进 + 尾换行。
    expect(doc.text).toContain('\n  "mcpServers"');
    expect(doc.text.endsWith('\n')).toBe(true);
  });

  it('returns disk original text for corrupt file (D3)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const original = '{ "mcpServers": {"a": ';
    await writeFile(join(home, 'mcp.json'), original);
    const doc = await readMcpRaw({ cwd, homeDir: home, scope: 'user' });
    expect(doc.text).toBe(original);
    expect(doc.invalid?.message).toBeDefined();
  });
});

describe('config-store mask/restore round-trip', () => {
  it('mask + restore against unchanged disk restores the original tree', () => {
    const disk = {
      mcpServers: {
        gh: {
          transport: 'stdio',
          command: 'gh',
          env: { A: 'secret-a', B: 'secret-b' },
          args: ['--x'],
        },
        api: { transport: 'http', url: 'http://x', headers: { Authorization: 'Bearer t' } },
      },
    };
    const masked = JSON.parse(maskMcpJsonText(JSON.stringify(disk)));
    const restored = restoreMaskedTree(masked, disk);
    expect(restored).toEqual(disk);
  });

  it('keeps new values and blanks placeholders without a disk counterpart (D2)', () => {
    const disk = { env: { A: 'old' } };
    const masked = { env: { A: '__MCP_MASKED_1__', B: '__MCP_MASKED_2__' } };
    const restored = restoreMaskedTree(masked, disk) as { env: Record<string, string> };
    expect(restored.env['A']).toBe('old');
    expect(restored.env['B']).toBe('');
  });

  it('maskServerConfig leaves non-secret fields untouched', () => {
    const masked = maskServerConfig({
      transport: 'stdio',
      command: 'run',
      args: ['--flag'],
      env: { K: 'v' },
      enabledTools: ['t'],
    });
    expect(masked.command).toBe('run');
    expect(masked.args).toEqual(['--flag']);
    expect(masked.enabledTools).toEqual(['t']);
    expect(masked.env?.['K']).toBe('__MCP_MASKED_1__');
  });

  it('assertMcpConfigScope rejects unknown scopes', () => {
    expect(() => assertMcpConfigScope('global')).toThrow();
    assertMcpConfigScope('user');
    assertMcpConfigScope('project');
  });
});
