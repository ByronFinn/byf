import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readConfigFile } from '#/config';
import { ErrorCodes } from '#/errors';
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
