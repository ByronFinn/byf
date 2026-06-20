/**
 * `byf update-config`
 *
 * Verifies the CLI layer: argument handling, report display, fix delegation,
 * and error reporting. Follows the same deps-injection pattern as `export`.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { handleUpdateConfig, registerUpdateConfigCommand } from '#/cli/sub/update-config';
import type { OutputFormat, UpdateConfigDeps } from '#/cli/sub/update-config';
import type { Finding, UpdateConfigResult } from '@byfriends/sdk';

/* ---------------------------------------------------------------------- */
/*  Helpers                                                                */
/* ---------------------------------------------------------------------- */

let tmp: string;

const mocks = vi.hoisted(() => ({
  harnessUpdateConfig: vi.fn<
    (input: { fix?: boolean }) => ReturnType<typeof harnessUpdateConfigDefault>
  >(),
}));

function harnessUpdateConfigDefault(input: { fix?: boolean }): Promise<UpdateConfigResult> {
  return Promise.resolve({ findings: [], fixed: false });
}

vi.mock('@byfriends/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@byfriends/sdk')>();
  return {
    ...actual,
    ByfHarness: class {
      homeDir = '/tmp/byf-update-config-home';
      updateConfig = mocks.harnessUpdateConfig;
    },
  };
});

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'byf-update-config-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
  mocks.harnessUpdateConfig.mockImplementation(harnessUpdateConfigDefault);
});

/* ---------------------------------------------------------------------- */
/*  Fixture helpers                                                        */
/* ---------------------------------------------------------------------- */

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    kind: 'removed',
    path: 'default_yolo',
    detail: 'Top-level field default_yolo is removed. Use yolo instead.',
    ...overrides,
  };
}

function makeDeps(
  overrides: Partial<UpdateConfigDeps> = {},
): {
  deps: UpdateConfigDeps;
  stdout: string[];
  stderr: string[];
  exitCodes: number[];
  updateConfigInputs: unknown[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const updateConfigInputs: unknown[] = [];

  const deps: UpdateConfigDeps = {
    updateConfig: async (input: { fix?: boolean; configPath?: string }) => {
      updateConfigInputs.push(input);
      return { findings: [], fixed: false };
    },
    stdout: {
      write: (chunk: string) => {
        stdout.push(chunk);
        return true;
      },
    },
    stderr: {
      write: (chunk: string) => {
        stderr.push(chunk);
        return true;
      },
    },
    exit: ((code: number) => {
      exitCodes.push(code);
      throw new ExitCalled(code);
    }) as UpdateConfigDeps['exit'],
    ...overrides,
  };
  return { deps, stdout, stderr, exitCodes, updateConfigInputs };
}

class ExitCalled extends Error {
  constructor(public readonly code: number) {
    super(`exit(${code})`);
  }
}

async function runUpdateConfig(
  deps: UpdateConfigDeps,
  opts: { fix?: boolean; configPath?: string; outputFormat?: string } = {},
): Promise<void> {
  try {
    await handleUpdateConfig(deps, {
      fix: opts.fix ?? false,
      configPath: opts.configPath,
      outputFormat: opts.outputFormat as OutputFormat | undefined,
    });
  } catch (error) {
    if (error instanceof ExitCalled) return;
    throw error;
  }
}

/* ---------------------------------------------------------------------- */
/*  Tests                                                                  */
/* ---------------------------------------------------------------------- */

describe('byf update-config', () => {
  /* ---------------------------------------------------------------- */
  /*  Dry-run                                                            */
  /* ---------------------------------------------------------------- */

  describe('dry-run (default)', () => {
    it('prints findings when deprecated fields are detected', async () => {
      const findings: Finding[] = [
        makeFinding({ path: 'default_yolo' }),
        makeFinding({ path: 'loop_control.max_steps_per_run', kind: 'renamed' }),
        makeFinding({ path: 'services.byf_search' }),
      ];
      const { deps, stdout, stderr } = makeDeps({
        updateConfig: async () => ({ findings, fixed: false }),
      });

      await runUpdateConfig(deps);

      // Each finding should appear in stdout
      const stdoutText = stdout.join('');
      expect(stdoutText).toContain('default_yolo');
      expect(stdoutText).toContain('loop_control.max_steps_per_run');
      expect(stdoutText).toContain('services.byf_search');

      // Should suggest --fix
      expect(stdoutText).toMatch(/--fix/i);

      // stderr should be empty (no errors)
      expect(stderr).toEqual([]);
    });

    it('prints a no-issues message when config is clean', async () => {
      const { deps, stdout, stderr } = makeDeps({
        updateConfig: async () => ({ findings: [], fixed: false }),
      });

      await runUpdateConfig(deps);

      expect(stderr).toEqual([]);
      const stdoutText = stdout.join('');
      expect(stdoutText).toMatch(/no issues|up to date|nothing/i);
    });

    it('does not call updateConfig with fix:true by default', async () => {
      const findings: Finding[] = [makeFinding()];
      const captured: unknown[] = [];
      const { deps } = makeDeps({
        updateConfig: async (input) => {
          captured.push(input);
          return { findings, fixed: false };
        },
      });

      await runUpdateConfig(deps);

      expect(captured).toHaveLength(1);
      expect((captured[0] as { fix?: boolean }).fix).toBeFalsy();
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Fix mode                                                          */
  /* ---------------------------------------------------------------- */

  describe('fix mode (--fix)', () => {
    it('calls updateConfig with fix:true', async () => {
      const findings: Finding[] = [makeFinding()];
      const captured: unknown[] = [];
      const { deps } = makeDeps({
        updateConfig: async (input) => {
          captured.push(input);
          return { findings, fixed: input.fix === true };
        },
      });

      await runUpdateConfig(deps, { fix: true });

      expect(captured).toHaveLength(1);
      expect((captured[0] as { fix?: boolean }).fix).toBe(true);
    });

    it('prints the findings and an update confirmation', async () => {
      const findings: Finding[] = [
        makeFinding({ path: 'default_yolo' }),
        makeFinding({ path: 'services.byf_search' }),
      ];
      const { deps, stdout, stderr } = makeDeps({
        updateConfig: async () => ({ findings, fixed: true }),
      });

      await runUpdateConfig(deps, { fix: true });

      const stdoutText = stdout.join('');
      expect(stdoutText).toContain('default_yolo');
      expect(stdoutText).toContain('services.byf_search');
      expect(stdoutText).toMatch(/updated/i);

      expect(stderr).toEqual([]);
    });

    it('reports zero fixes when findings are empty (nothing to do)', async () => {
      const { deps, stdout, stderr } = makeDeps({
        updateConfig: async () => ({ findings: [], fixed: false }),
      });

      await runUpdateConfig(deps, { fix: true });

      expect(stderr).toEqual([]);
      const stdoutText = stdout.join('');
      expect(stdoutText).toMatch(/no issues|up to date|nothing/i);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Error handling                                                    */
  /* ---------------------------------------------------------------- */

  describe('error handling', () => {
    it('surfaces errors from updateConfig and exits 1', async () => {
      const { deps, stderr, exitCodes } = makeDeps({
        updateConfig: async () => {
          throw new Error('Config file is not writable');
        },
      });

      await runUpdateConfig(deps);

      expect(exitCodes).toContain(1);
      expect(stderr.join('').toLowerCase()).toContain('not writable');
    });

    it('exits 1 on unexpected errors', async () => {
      const { deps, stderr, exitCodes } = makeDeps({
        updateConfig: async () => {
          throw new Error('Internal error');
        },
      });

      await runUpdateConfig(deps);

      expect(exitCodes).toContain(1);
      expect(stderr.join('').toLowerCase()).toContain('internal error');
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Command registration                                              */
  /* ---------------------------------------------------------------- */

  describe('command registration', () => {
    it('registers the update-config subcommand', () => {
      const program = new Command('byf');
      const { deps } = makeDeps();

      registerUpdateConfigCommand(program, deps);

      const cmd = program.commands.find((c) => c.name() === 'update-config');
      expect(cmd).toBeDefined();
      expect(cmd!.description()).toBeTruthy();
    });

    it('describes the command without implementation details', () => {
      const program = new Command('byf');
      const { deps } = makeDeps();

      registerUpdateConfigCommand(program, deps);

      const cmd = program.commands.find((c) => c.name() === 'update-config');
      expect(cmd!.description()).not.toMatch(/sdk/i);
      expect(cmd!.description()).not.toMatch(/harness/i);
    });

    it('parses --fix flag as an option', async () => {
      const captured: unknown[] = [];
      const { deps } = makeDeps({
        updateConfig: async (input) => {
          captured.push(input);
          return { findings: input.fix === true ? [makeFinding()] : [], fixed: input.fix === true };
        },
      });
      const program = new Command('byf');
      registerUpdateConfigCommand(program, deps);

      await program.parseAsync(['node', 'byf', 'update-config', '--fix']);

      expect(captured).toHaveLength(1);
      expect((captured[0] as { fix?: boolean }).fix).toBe(true);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Output format                                                     */
  /* ---------------------------------------------------------------- */

  describe('output format', () => {
    it('prints JSON when --output-format=json is used', async () => {
      const findings: Finding[] = [
        makeFinding({ path: 'default_yolo' }),
        makeFinding({ path: 'services.byf_search' }),
      ];
      const { deps, stdout, stderr } = makeDeps({
        updateConfig: async () => ({ findings, fixed: false }),
      });

      await runUpdateConfig(deps, { outputFormat: 'json' });

      expect(stderr).toEqual([]);
      const parsed = JSON.parse(stdout.join(''));
      expect(parsed.findings).toHaveLength(2);
      expect(parsed.findings[0].path).toBe('default_yolo');
      expect(parsed.fixed).toBe(false);
    });

    it('prints JSON with backupPath when --fix is applied', async () => {
      const findings: Finding[] = [makeFinding()];
      const { deps, stdout } = makeDeps({
        updateConfig: async () => ({ findings, fixed: true, backupPath: '/tmp/config.toml.bak.2026-06-20T10-00-00-000Z' }),
      });

      await runUpdateConfig(deps, { fix: true, outputFormat: 'json' });

      const parsed = JSON.parse(stdout.join(''));
      expect(parsed.fixed).toBe(true);
      expect(parsed.backupPath).toContain('.bak.');
    });

    it('prints backup path in pretty output after --fix', async () => {
      const findings: Finding[] = [makeFinding()];
      const { deps, stdout } = makeDeps({
        updateConfig: async () => ({ findings, fixed: true, backupPath: '/tmp/config.toml.bak.2026-06-20T10-00-00-000Z' }),
      });

      await runUpdateConfig(deps, { fix: true });

      const output = stdout.join('');
      expect(output).toContain('Backup saved to');
      expect(output).toContain('.bak.');
    });
  });
});