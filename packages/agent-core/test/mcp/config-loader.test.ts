import { mkdtempSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ErrorCodes, ByfError } from '../../src/errors';
import { loadMcpServers, resolveMcpJsonPaths } from '../../src/mcp/config-loader';
import {
  assertMcpConfigScope,
  isMcpMaskedPlaceholder,
  listMcpConfigs,
  maskMcpJsonText,
  maskServerConfig,
  readMcpRaw,
  removeMcpServer,
  resolveServerConfigForProbe,
  restoreMaskedTree,
  upsertMcpServer,
  writeMcpRaw,
} from '../../src/mcp/config-store';

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
      isMcpMaskedPlaceholder((gh?.config as { env: Record<string, string> }).env['GITHUB_TOKEN']),
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
    expect(() => {
      assertMcpConfigScope('global');
    }).toThrow();
    assertMcpConfigScope('user');
    assertMcpConfigScope('project');
  });
});

// ---- config-store write side(PRD-0036 #313 / ADR-0039 D2)-------------------

async function readJsonFile(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, 'utf-8')) as Record<string, unknown>;
}

describe('config-store upsertMcpServer', () => {
  it('creates the project file (atomic, schema-valid) when missing', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const state = await upsertMcpServer({
      cwd,
      homeDir: home,
      scope: 'project',
      name: 'gh',
      config: { transport: 'stdio', command: 'gh', args: ['--x'], enabled: true },
    });
    expect(state.servers.map((s) => s.name)).toEqual(['gh']);
    const path = join(cwd, '.byf', 'mcp.json');
    const disk = await readJsonFile(path);
    expect(disk).toEqual({
      mcpServers: { gh: { transport: 'stdio', command: 'gh', args: ['--x'], enabled: true } },
    });
    // 写入对 loadMcpServers 可见(新会话生效语义)。
    const merged = await loadMcpServers({ cwd, homeDir: home });
    expect(merged['gh']).toBeDefined();
    // tmp+rename 原子写:目录里不残留 .tmp 文件。
    const files = await readdir(join(cwd, '.byf'));
    expect(files.filter((f) => f.includes('.tmp.'))).toEqual([]);
  });

  it('restores placeholders against disk values; new values overwrite (R-M2a/D2)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        gh: {
          transport: 'stdio',
          command: 'gh',
          env: { TOKEN: 'disk-secret', OTHER: 'keep-me' },
        },
      },
    });
    const state = await upsertMcpServer({
      cwd,
      homeDir: home,
      scope: 'user',
      name: 'gh',
      config: {
        transport: 'stdio',
        command: 'gh2',
        // 占位符 = 保留磁盘原值;新值 = 覆盖。
        env: { TOKEN: '__MCP_MASKED_1__', OTHER: 'brand-new' },
      },
    });
    expect(state.servers).toHaveLength(1);
    const disk = (await readJsonFile(join(home, 'mcp.json'))) as {
      mcpServers: Record<string, { env: Record<string, string> }>;
    };
    expect(disk.mcpServers['gh'].env).toEqual({ TOKEN: 'disk-secret', OTHER: 'brand-new' });
    const text = JSON.stringify(disk);
    expect(text).not.toContain('__MCP_MASKED_');
  });

  it('enabled one-tick toggle path keeps disk env values (D2)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        gh: { transport: 'stdio', command: 'gh', env: { TOKEN: 'disk-secret' }, enabled: true },
      },
    });
    // 一键切换:携带掩码 config + enabled 翻转。
    await upsertMcpServer({
      cwd,
      homeDir: home,
      scope: 'user',
      name: 'gh',
      config: {
        transport: 'stdio',
        command: 'gh',
        env: { TOKEN: '__MCP_MASKED_1__' },
        enabled: false,
      },
    });
    const disk = (await readJsonFile(join(home, 'mcp.json'))) as {
      mcpServers: Record<string, { env: Record<string, string>; enabled: boolean }>;
    };
    expect(disk.mcpServers['gh'].enabled).toBe(false);
    expect(disk.mcpServers['gh'].env).toEqual({ TOKEN: 'disk-secret' });
  });

  it('preserves advanced fields from disk; transport switch drops old transport fields (R-M3a)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        api: {
          transport: 'stdio',
          command: 'old',
          args: ['--a'],
          env: { A: 'x' },
          cwd: '/old',
          enabledTools: ['t1'],
          startupTimeoutMs: 5000,
        },
      },
    });
    await upsertMcpServer({
      cwd,
      homeDir: home,
      scope: 'user',
      name: 'api',
      config: { transport: 'http', url: 'http://localhost/mcp', enabled: true },
    });
    const disk = (await readJsonFile(join(home, 'mcp.json'))) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    const api = disk.mcpServers['api'];
    expect(api['transport']).toBe('http');
    expect(api['url']).toBe('http://localhost/mcp');
    // 旧 transport 专属字段被丢弃。
    expect(api['command']).toBeUndefined();
    expect(api['args']).toBeUndefined();
    expect(api['env']).toBeUndefined();
    expect(api['cwd']).toBeUndefined();
    // 公共高级字段保留。
    expect(api['enabledTools']).toEqual(['t1']);
    expect(api['startupTimeoutMs']).toBe(5000);
  });

  it('keeps advanced fields when transport unchanged', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        api: {
          transport: 'stdio',
          command: 'old',
          enabledTools: ['t1'],
          disabledTools: ['t2'],
          toolTimeoutMs: 9000,
        },
      },
    });
    await upsertMcpServer({
      cwd,
      homeDir: home,
      scope: 'user',
      name: 'api',
      config: { transport: 'stdio', command: 'new', enabled: true },
    });
    const disk = (await readJsonFile(join(home, 'mcp.json'))) as {
      mcpServers: Record<string, Record<string, unknown>>;
    };
    const api = disk.mcpServers['api'];
    expect(api['command']).toBe('new');
    expect(api['enabledTools']).toEqual(['t1']);
    expect(api['disabledTools']).toEqual(['t2']);
    expect(api['toolTimeoutMs']).toBe(9000);
  });

  it('rejects upsert into an invalid file without touching it', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const path = join(home, 'mcp.json');
    await writeFile(path, '{ broken');
    await expect(
      upsertMcpServer({
        cwd,
        homeDir: home,
        scope: 'user',
        name: 'x',
        config: { transport: 'stdio', command: 'c' },
      }),
    ).rejects.toThrow();
    expect(await readFile(path, 'utf-8')).toBe('{ broken');
  });

  it('rejects schema-invalid config without writing', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const path = join(home, 'mcp.json');
    await expect(
      upsertMcpServer({
        cwd,
        homeDir: home,
        scope: 'user',
        name: 'x',
        config: { transport: 'stdio' },
      }),
    ).rejects.toThrow();
    // 校验失败 → 不落盘(文件仍不存在)。
    await expect(readFile(path, 'utf-8')).rejects.toThrow();
  });
});

describe('config-store removeMcpServer', () => {
  it('removes the named server and keeps siblings', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        a: { transport: 'stdio', command: 'a' },
        b: { transport: 'stdio', command: 'b' },
      },
    });
    const state = await removeMcpServer({ cwd, homeDir: home, scope: 'user', name: 'a' });
    expect(state.servers.map((s) => s.name)).toEqual(['b']);
    const disk = await readJsonFile(join(home, 'mcp.json'));
    expect(Object.keys((disk as { mcpServers: Record<string, unknown> }).mcpServers)).toEqual([
      'b',
    ]);
  });

  it('throws MCP_SERVER_NOT_FOUND for unknown names', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), { mcpServers: {} });
    await expect(
      removeMcpServer({ cwd, homeDir: home, scope: 'user', name: 'nope' }),
    ).rejects.toThrow(/not found/);
  });
});

describe('config-store resolveServerConfigForProbe', () => {
  it('restores placeholder env against disk values without writing (D2)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeJson(join(home, 'mcp.json'), {
      mcpServers: {
        gh: {
          transport: 'stdio',
          command: 'gh',
          env: { GITHUB_TOKEN: 'disk-secret', KEEP: 'keep-me' },
          enabledTools: ['gh'],
        },
      },
    });
    const config = await resolveServerConfigForProbe({
      cwd,
      homeDir: home,
      scope: 'user',
      name: 'gh',
      config: {
        transport: 'stdio',
        command: 'gh',
        env: { GITHUB_TOKEN: '__MCP_MASKED_1__', NEW: 'plain' },
      },
    });
    expect(config.env).toEqual({ GITHUB_TOKEN: 'disk-secret', NEW: 'plain' });
    // 高级公共字段按 R-M3a 从磁盘保留,便于用真实完整配置做探测。
    expect(config.enabledTools).toEqual(['gh']);
    // 探测只读,不落盘。
    const disk = await readJsonFile(join(home, 'mcp.json'));
    expect(JSON.stringify(disk)).not.toContain('__MCP_MASKED_');
  });

  it('throws CONFIG_INVALID when the scope file is corrupt (D3 guard)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '{ "mcpServers": ', 'utf-8');
    await expect(
      resolveServerConfigForProbe({
        cwd,
        homeDir: home,
        scope: 'user',
        config: { transport: 'stdio', command: 'gh' },
      }),
    ).rejects.toMatchObject({ code: ErrorCodes.CONFIG_INVALID });
  });
});

describe('config-store writeMcpRaw', () => {
  it('restores placeholders against valid disk text before writing', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(
      join(home, 'mcp.json'),
      JSON.stringify({
        mcpServers: { gh: { transport: 'stdio', command: 'gh', env: { TOKEN: 'disk-secret' } } },
      }),
    );
    const doc = await writeMcpRaw({
      cwd,
      homeDir: home,
      scope: 'user',
      text: JSON.stringify({
        mcpServers: {
          gh: { transport: 'stdio', command: 'gh', env: { TOKEN: '__MCP_MASKED_1__' } },
        },
      }),
    });
    expect(doc.invalid).toBeUndefined();
    expect(doc.text).toContain('__MCP_MASKED_1__');
    const disk = await readFile(join(home, 'mcp.json'), 'utf-8');
    expect(disk).toContain('disk-secret');
    expect(disk).not.toContain('__MCP_MASKED_');
  });

  it('repairs a corrupt file when the new text is valid (R-M5)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    await writeFile(join(home, 'mcp.json'), '{ "mcpServers": ');
    const doc = await writeMcpRaw({
      cwd,
      homeDir: home,
      scope: 'user',
      text: '{\n  "mcpServers": { "a": { "transport": "stdio", "command": "c" } }\n}\n',
    });
    expect(doc.invalid).toBeUndefined();
    const disk = await readJsonFile(join(home, 'mcp.json'));
    expect(disk).toBeDefined();
  });

  it('rejects invalid JSON with 422-style CONFIG_INVALID and keeps the corrupt file', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const path = join(home, 'mcp.json');
    await writeFile(path, '{ "mcpServers": ');
    await expect(
      writeMcpRaw({ cwd, homeDir: home, scope: 'user', text: '{ still broken' }),
    ).rejects.toThrow();
    expect(await readFile(path, 'utf-8')).toBe('{ "mcpServers": ');
  });

  it('restores placeholders against schema-invalid but JSON-parseable disk (D2 regression)', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    // JSON 合法但 schema 非法(stdio 缺 command):列表报 invalid、UI 走 RAW
    // 兜底;掩码 RAW 以「JSON 可解析」为准展示,还原基底不得依赖 schema 结果。
    await writeFile(
      join(home, 'mcp.json'),
      JSON.stringify({
        mcpServers: { gh: { transport: 'stdio', env: { TOKEN: 'keep-me' } } },
      }),
    );
    const listing = await listMcpConfigs({ cwd, homeDir: home });
    expect(listing.user.invalid).toBeDefined();
    const raw = await readMcpRaw({ cwd, homeDir: home, scope: 'user' });
    expect(raw.text).toContain('__MCP_MASKED_1__');
    expect(raw.invalid).toBeUndefined();
    // 用户只修复 schema 问题、不动占位符 → 保存后磁盘保留原值。
    const doc = await writeMcpRaw({
      cwd,
      homeDir: home,
      scope: 'user',
      text: JSON.stringify({
        mcpServers: {
          gh: { transport: 'stdio', command: 'gh', env: { TOKEN: '__MCP_MASKED_1__' } },
        },
      }),
    });
    expect(doc.invalid).toBeUndefined();
    const disk = await readFile(join(home, 'mcp.json'), 'utf-8');
    expect(disk).toContain('keep-me');
    expect(disk).not.toContain('__MCP_MASKED_');
  });

  it('normalizes empty text to an empty skeleton', async () => {
    const home = makeTempDir();
    const cwd = makeTempDir();
    const doc = await writeMcpRaw({ cwd, homeDir: home, scope: 'user', text: '' });
    expect(doc.text).toBe('{\n  "mcpServers": {}\n}\n');
  });
});
