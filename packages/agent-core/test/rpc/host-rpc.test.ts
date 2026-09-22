import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readConfigFile } from '#/config';
import { ErrorCodes } from '#/errors';
import { StdioMcpClient } from '#/mcp/client-stdio';
import { ProviderManager } from '#/providers/provider-manager';
import { createHostRPC, type HostRPCDeps } from '#/rpc/host-rpc';
import { SessionStore } from '#/session/store';

/**
 * host-rpc 单测（PRD-0031 M9 拆分的后续保护）。
 *
 * `host-rpc.ts` 承载主机级 RPC 域（config / configDocument / workspace /
 * mcp / skills / inspector），是 2026-08-18 从 `core-impl.ts` 抽出。这些测试
 * 直接构造 `createHostRPC`，锁定关键方法的行为等价，防止未来在此域内回归。
 */
function makeDeps(
  homeDir: string,
  configPath: string,
): { deps: HostRPCDeps; providerManager: ProviderManager } {
  const providerManager = new ProviderManager({ config: readConfigFile(configPath) });
  const sessionStore = new SessionStore(homeDir);
  return {
    deps: {
      homeDir,
      configPath,
      userHomeDir: homeDir,
      providerManager,
      sessionStore,
    },
    providerManager,
  };
}

describe('host-rpc', () => {
  let tmp: string;
  let homeDir: string;
  let configPath: string;

  afterEach(async () => {
    if (tmp !== undefined) {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  async function setup(): Promise<{
    rpc: ReturnType<typeof createHostRPC>;
    providerManager: ProviderManager;
  }> {
    tmp = await mkdtemp(join(tmpdir(), 'byf-host-rpc-'));
    homeDir = join(tmp, 'home');
    configPath = join(homeDir, 'config.toml');
    await mkdir(homeDir, { recursive: true });
    const { deps, providerManager } = makeDeps(homeDir, configPath);
    return { rpc: createHostRPC(deps), providerManager };
  }

  describe('config', () => {
    it('setByfConfig writes the merged config to disk and returns the updated value', async () => {
      const { rpc } = await setup();
      const result = await rpc.setByfConfig({ defaultProvider: 'deepseek' });
      expect(result.defaultProvider).toBe('deepseek');
      // Persisted on disk (a fresh read sees it).
      expect(readConfigFile(configPath).defaultProvider).toBe('deepseek');
    });

    it('setByfConfig synchronizes the shared providerManager', async () => {
      const { rpc, providerManager } = await setup();
      await rpc.setByfConfig({ defaultPermissionMode: 'yolo' });
      expect(providerManager.config.defaultPermissionMode).toBe('yolo');
    });

    it('getByfConfig returns the default config when the file is absent', async () => {
      const { rpc } = await setup();
      const config = await rpc.getByfConfig();
      expect(config.defaultProvider).toBeUndefined();
    });

    it('removeByfModel deletes the alias and clears defaultModel', async () => {
      const { rpc } = await setup();
      await writeFile(
        configPath,
        'default_model = "deepseek-chat"\n\n' +
          '[models."deepseek-chat"]\nprovider = "deepseek"\nmodel = "deepseek-chat"\nmax_context_size = 64000\n',
      );
      const result = await rpc.removeByfModel({ modelId: 'deepseek-chat' });
      expect(result.models?.['deepseek-chat']).toBeUndefined();
      expect(result.defaultModel).toBeUndefined();
    });

    it('removeByfModel throws MODEL_CONFIG_INVALID for an unknown alias', async () => {
      const { rpc } = await setup();
      await expect(rpc.removeByfModel({ modelId: 'nope' })).rejects.toMatchObject({
        code: ErrorCodes.MODEL_CONFIG_INVALID,
      });
    });

    it('removeByfProvider clears models, defaultModel and defaultProvider bound to it', async () => {
      const { rpc } = await setup();
      await writeFile(
        configPath,
        'default_model = "deepseek-chat"\ndefault_provider = "deepseek"\n\n' +
          '[providers.deepseek]\ntype = "openai-completions"\nbase_url = "https://x"\n\n' +
          '[models."deepseek-chat"]\nprovider = "deepseek"\nmodel = "deepseek-chat"\nmax_context_size = 64000\n',
      );
      const result = await rpc.removeByfProvider({ providerId: 'deepseek' });
      expect(result.providers['deepseek']).toBeUndefined();
      expect(result.models?.['deepseek-chat']).toBeUndefined();
      expect(result.defaultModel).toBeUndefined();
      expect(result.defaultProvider).toBeUndefined();
    });
  });

  describe('config document', () => {
    it('validateConfigText reports invalid for malformed TOML', async () => {
      const { rpc } = await setup();
      // Schema-grade failure: default_model must be a string, not a number.
      const result = await rpc.validateConfigText({ text: 'default_model = 123' });
      expect(result.valid).toBe(false);
      expect(result.diagnostics.length).toBeGreaterThan(0);
    });

    it('validateConfigText reports valid for well-formed config', async () => {
      const { rpc } = await setup();
      const result = await rpc.validateConfigText({ text: 'default_provider = "deepseek"' });
      expect(result.valid).toBe(true);
    });

    it('writeConfigText persists the document and bumps the revision', async () => {
      const { rpc } = await setup();
      await writeFile(configPath, '[providers.foo]\ntype = "openai-completions"\n');
      const before = await rpc.getConfigDocument();
      const written = await rpc.writeConfigText({
        text: '[providers.bar]\ntype = "openai-completions"\n',
        expectedRevision: before.revision,
      });
      expect(written.revision).toBeTruthy();
      const after = await rpc.getConfigDocument();
      expect(after.parsed.providers['bar']).toBeDefined();
      expect(after.parsed.providers['foo']).toBeUndefined();
    });
  });

  /**
   * PRD-0038 AC-1.3：`testMcpConnection` 的命令名单门（review F2）。
   *
   * 这些用例**不经过任何 web 路由**：直接调用 core 的收口点，证明"名单装在链路上"
   * 而不是"装在其中一个入口上"——SDK / TUI / 未来的任何 host 表面走的都是这里。
   *
   * 负向用例的证据也不是错误码，而是**子进程从未起来**：
   * - 直接证据：`StdioMcpClient.prototype.connect`（spawn 的唯一发生点）没被调用过；
   * - 黑盒证据：被拒的那条 config 若真被执行，磁盘上会留下一个文件。
   * 两层都不依赖门自己的说法，门被删掉时两条都会红。
   */
  describe('mcp probe command allowlist (host-rpc chokepoint)', () => {
    async function setupProbe(saved?: unknown): Promise<{
      rpc: ReturnType<typeof createHostRPC>;
      workDir: string;
      marker: string;
    }> {
      const { rpc } = await setup();
      const workDir = join(tmp, 'work');
      await mkdir(workDir, { recursive: true });
      if (saved !== undefined) {
        await writeFile(join(homeDir, 'mcp.json'), JSON.stringify(saved), 'utf-8');
      }
      return { rpc, workDir, marker: join(tmp, 'stdio-client-was-spawned') };
    }

    it('rejects an unlisted stdio command here, and client-stdio is never reached', async () => {
      const { rpc, workDir, marker } = await setupProbe({
        mcpServers: { fs: { transport: 'stdio', command: 'npx', args: ['-y', 'server-fs'] } },
      });
      const connect = spyOn(StdioMcpClient.prototype, 'connect');
      try {
        await expect(
          rpc.testMcpConnection({
            workDir,
            scope: 'user',
            // `touch` 是刻意选的：一旦门失效，spawn 会真的执行它并留下 marker 文件，
            // 后面那条断言就不只是"报了个错"，而是"没有子进程跑过"。
            config: { transport: 'stdio', command: 'touch', args: [marker] },
          }),
        ).rejects.toMatchObject({
          code: ErrorCodes.REQUEST_INVALID,
          details: { reason: 'stdio_command_not_allowlisted', command: 'touch' },
        });
        expect(connect).not.toHaveBeenCalled();
        expect(existsSync(marker)).toBe(false);
      } finally {
        connect.mockRestore();
      }
    });

    it('an absolute path to an unlisted binary is not a way in（按整串比较，不比 basename）', async () => {
      const { rpc, workDir, marker } = await setupProbe({
        mcpServers: { fs: { transport: 'stdio', command: 'npx' } },
      });
      const connect = spyOn(StdioMcpClient.prototype, 'connect');
      try {
        await expect(
          rpc.testMcpConnection({
            workDir,
            scope: 'user',
            config: { transport: 'stdio', command: '/usr/bin/touch', args: [marker] },
          }),
        ).rejects.toMatchObject({ details: { reason: 'stdio_command_not_allowlisted' } });
        expect(connect).not.toHaveBeenCalled();
        expect(existsSync(marker)).toBe(false);
      } finally {
        connect.mockRestore();
      }
    });

    it('default-denies when nothing is saved yet（两 scope 都没有 server）', async () => {
      const { rpc, workDir } = await setupProbe();
      const connect = spyOn(StdioMcpClient.prototype, 'connect');
      try {
        await expect(
          rpc.testMcpConnection({
            workDir,
            scope: 'user',
            config: { transport: 'stdio', command: process.execPath },
          }),
        ).rejects.toMatchObject({ details: { reason: 'stdio_command_not_allowlisted' } });
        expect(connect).not.toHaveBeenCalled();
      } finally {
        connect.mockRestore();
      }
    });

    it('a listed command still gets its pre-save probe（任一 scope 都算，且 args 不参与判定）', async () => {
      // 保存的条目里 `command` 不带 args，探针请求带上了 `--version`：仍然放行——
      // 这就是 AC-1.3"保存前测试体验保留"的那条旅程，也同时是本门**明确不覆盖**的
      // 面（名单只钉可执行文件名，args/env/cwd 随请求体进 spawn）。见
      // host-rpc.ts `assertProbeCommandAllowlisted` 的范围说明：名单里的解释器 +
      // 任意 args 依旧是本机代码执行，这是已登记的残余，不是实现缺陷。
      const { rpc, workDir } = await setupProbe({
        mcpServers: { self: { transport: 'stdio', command: process.execPath } },
      });
      const connect = spyOn(StdioMcpClient.prototype, 'connect');
      try {
        const result = await rpc.testMcpConnection({
          workDir,
          scope: 'user',
          config: { transport: 'stdio', command: process.execPath, args: ['--version'] },
        });
        // 这条断言让上面那组 `not.toHaveBeenCalled()` 不是空话：同一个 spy 在门放行时
        // 确实会响，所以"没响"才是证据。
        expect(connect).toHaveBeenCalledTimes(1);
        // 探针本身失败（bun 不是 MCP server），但那是 spawn **之后**的结果：
        // 说明门放行了，而不是拒绝。
        expect(result.ok).toBe(false);
        expect(typeof result.error).toBe('string');
      } finally {
        connect.mockRestore();
      }
    });

    it('a command saved in the project scope counts for a user-scope probe too', async () => {
      const { rpc, workDir } = await setupProbe();
      await mkdir(join(workDir, '.byf'), { recursive: true });
      await writeFile(
        join(workDir, '.byf', 'mcp.json'),
        JSON.stringify({ mcpServers: { self: { transport: 'stdio', command: process.execPath } } }),
        'utf-8',
      );
      const result = await rpc.testMcpConnection({
        workDir,
        scope: 'user',
        config: { transport: 'stdio', command: process.execPath, args: ['--version'] },
      });
      expect(result.ok).toBe(false);
      expect(typeof result.error).toBe('string');
    });

    it('http / sse probes are out of scope for a command allowlist（不过度封锁）', async () => {
      const { rpc, workDir } = await setupProbe();
      // 没有任何已保存配置：若这道门按"有没有 command 字段"之外的形式误伤，这里就会抛。
      const result = await rpc.testMcpConnection({
        workDir,
        scope: 'user',
        config: { transport: 'http', url: 'http://127.0.0.1:1/mcp' },
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('workspace + inspector', () => {
    it('listWorkspaces / hiddenWorkspaces are empty on a fresh home', async () => {
      const { rpc } = await setup();
      expect(await rpc.listWorkspaces()).toEqual([]);
      expect(await rpc.hiddenWorkspaces()).toEqual([]);
    });

    it('listInspectableSessions is empty on a fresh home', async () => {
      const { rpc } = await setup();
      expect(await rpc.listInspectableSessions()).toEqual([]);
    });
  });
});
