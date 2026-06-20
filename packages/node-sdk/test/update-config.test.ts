/**
 * `ByfHarness.updateConfig` — SDK layer for `byf update-config`.
 *
 * Tests the end-to-end flow: read config → analyze → (optionally) fix → write.
 *
 * These tests will fail (RED) until:
 *   1. `ByfHarness.updateConfig` is implemented in `byf-harness.ts`
 *   2. `UpdateConfigInput` / `UpdateConfigResult` types are added to `types.ts`
 *   3. `Finding` type is re-exported through `@byfriends/sdk`
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ByfHarness } from '#/index';
import type { Finding, UpdateConfigInput, UpdateConfigResult } from '#/types';
import { TEST_IDENTITY } from './test-identity';

// Allow forcing writeConfigFile to fail so we can exercise the rollback path.
// The real implementation is restored by default; individual tests opt in.
vi.mock('@byfriends/agent-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@byfriends/agent-core')>();
  return {
    ...actual,
    writeConfigFile: vi.fn(actual.writeConfigFile),
  };
});

const { writeConfigFile } = await import('@byfriends/agent-core');

/* ---------------------------------------------------------------------- */
/*  Fixture TOML strings                                                   */
/* ---------------------------------------------------------------------- */

/** Config with three deprecated fields: default_yolo (removed),
 *  max_steps_per_run (renamed), services.byf_search (removed). */
const DEPRECATED_FIELDS_TOML = `
default_model = "test-model"
default_yolo = true

[providers.test]
type = "openai-completions"
base_url = "https://example.test/v1"
api_key = "sk-test"

[models."test-model"]
provider = "test"
model = "test-model"
max_context_size = 262144

[loop_control]
max_steps_per_run = 100

[services.byf_search]
enabled = true
`;

/** Clean config — no deprecated fields. */
const CLEAN_TOML = `
default_model = "test-model"

[providers.test]
type = "openai-completions"
base_url = "https://example.test/v1"
api_key = "sk-test"

[models."test-model"]
provider = "test"
model = "test-model"
max_context_size = 262144

[loop_control]
max_steps_per_turn = 100
`;

/** Minimal valid config (no deprecated fields, no optional sections). */
const MINIMAL_TOML = `
[providers.test]
type = "openai-completions"
base_url = "https://example.test/v1"
api_key = "sk-test"
`;

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
  // Restore the real writeConfigFile between tests so only opt-in tests fail.
  vi.mocked(writeConfigFile).mockRestore();
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-sdk-update-config-'));
  tempDirs.push(dir);
  return dir;
}

function findingPaths(findings: readonly Finding[]): readonly string[] {
  return findings.map((f) => f.path);
}

/* ---------------------------------------------------------------------- */
/*  Tests                                                                  */
/* ---------------------------------------------------------------------- */

describe('ByfHarness.updateConfig', () => {
  /* ---------------------------------------------------------------- */
  /*  Dry-run (default)                                                 */
  /* ---------------------------------------------------------------- */

  describe('dry-run (no --fix)', () => {
    it('returns findings for config with deprecated fields', async () => {
      const dir = await makeTempDir();
      await writeFile(join(dir, 'config.toml'), DEPRECATED_FIELDS_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig();

      const paths = findingPaths(result.findings);
      expect(paths).toContain('default_yolo');
      expect(paths).toContain('loop_control.max_steps_per_run');
      expect(paths).toContain('services.byf_search');
      expect(result.fixed).toBe(false);
    });

    it('returns empty findings for clean config', async () => {
      const dir = await makeTempDir();
      await writeFile(join(dir, 'config.toml'), CLEAN_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig();

      expect(result.findings).toEqual([]);
      expect(result.fixed).toBe(false);
    });

    it('does not modify the config file', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, DEPRECATED_FIELDS_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      await harness.updateConfig();

      const after = await readFile(configPath, 'utf-8');
      expect(after).toContain('default_yolo');
      expect(after).toContain('max_steps_per_run');
      expect(after).toContain('byf_search');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Fix mode                                                          */
  /* ---------------------------------------------------------------- */

  describe('fix mode (--fix)', () => {
    it('removes deprecated fields and writes updated config', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, DEPRECATED_FIELDS_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig({ fix: true });

      expect(result.findings.length).toBeGreaterThanOrEqual(3);
      expect(result.fixed).toBe(true);

      const after = await readFile(configPath, 'utf-8');
      expect(after).not.toContain('default_yolo');
      expect(after).not.toContain('max_steps_per_run');
      expect(after).not.toContain('byf_search');
    });

    it('is idempotent — second run reports no findings', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, DEPRECATED_FIELDS_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });

      const first: UpdateConfigResult = await harness.updateConfig({ fix: true });
      expect(first.fixed).toBe(true);

      const second: UpdateConfigResult = await harness.updateConfig();
      expect(second.findings).toEqual([]);
      expect(second.fixed).toBe(false);
    });

    it('preserves valid fields and unknown raw fields during fix', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, DEPRECATED_FIELDS_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      await harness.updateConfig({ fix: true });

      const after = await readFile(configPath, 'utf-8');
      expect(after).toContain('test-model');
      expect(after).toContain('openai-completions');
      // max_steps_per_run should be gone; max_steps_per_turn still present (it was already in raw)
      expect(after).toContain('max_steps_per_turn');
    });

    it('with fix=true on already-clean config is a no-op', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, CLEAN_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig({ fix: true });

      expect(result.findings).toEqual([]);
      expect(result.fixed).toBe(false);

      const after = await readFile(configPath, 'utf-8');
      expect(after).toContain('test-model');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Edge cases                                                        */
  /* ---------------------------------------------------------------- */

  describe('edge cases', () => {
    it('handles missing config file gracefully', async () => {
      const dir = await makeTempDir();
      // No config file — ByfHarness uses default config
      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig();

      // Default config has no deprecated fields
      expect(result.findings).toEqual([]);
      expect(result.fixed).toBe(false);
    });

    it('handles minimal valid config with no deprecated fields', async () => {
      const dir = await makeTempDir();
      await writeFile(join(dir, 'config.toml'), MINIMAL_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig();

      expect(result.findings).toEqual([]);
      expect(result.fixed).toBe(false);
    });

    // ── TOML syntax error rejection (AC L143) ───────────────────
    it('rejects --fix on config with TOML syntax errors', async () => {
      const dir = await makeTempDir();
      // Create harness first (no config in default location, so construction succeeds)
      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      // Then write an invalid TOML file to a specific path
      const configPath = join(dir, 'invalid.toml');
      await writeFile(configPath, 'this is not valid toml = {{{', 'utf-8');

      await expect(
        harness.updateConfig({ fix: true, configPath }),
      ).rejects.toThrow();
    });

    // ── Backup file creation (AC L142) ──────────────────────────
    it('creates a backup file during --fix', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, DEPRECATED_FIELDS_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig({ fix: true });

      expect(result.fixed).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Backup file must actually exist on disk
      const stat = await import('node:fs/promises').then((m) => m.stat(result.backupPath!));
      expect(stat.isFile()).toBe(true);
    });

    // ── Backup file mode 0o600 (AC L100, security-sensitive) ────
    it('creates the backup file with secure permissions (0o600)', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, DEPRECATED_FIELDS_TOML, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });
      const result: UpdateConfigResult = await harness.updateConfig({ fix: true });

      expect(result.backupPath).toBeDefined();
      const stat = await import('node:fs/promises').then((m) => m.stat(result.backupPath!));
      // Mask to permission bits only; config holds api_key secrets.
      expect(stat.mode & 0o777).toBe(0o600);
    });

    // ── Rollback restores original on write failure (AC L101) ──
    it('restores the original config bytes when the fix write fails', async () => {
      const dir = await makeTempDir();
      const configPath = join(dir, 'config.toml');
      await writeFile(configPath, DEPRECATED_FIELDS_TOML, 'utf-8');
      const original = await readFile(configPath, 'utf-8');

      const harness = new ByfHarness({ homeDir: dir, identity: TEST_IDENTITY });

      // Force the write step to fail so the catch branch runs rollback.
      vi.mocked(writeConfigFile).mockRejectedValueOnce(
        new Error('simulated write failure'),
      );

      await expect(
        harness.updateConfig({ fix: true }),
      ).rejects.toThrow('simulated write failure');

      // The rollback contract: the file must be byte-restored to the pre-fix
      // state, including the deprecated fields that the fix would have removed.
      const after = await readFile(configPath, 'utf-8');
      expect(after).toBe(original);
      expect(after).toContain('default_yolo');
      expect(after).toContain('byf_search');
    });
  });
});