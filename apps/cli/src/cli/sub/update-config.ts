/**
 * `byf update-config` sub-command.
 *
 * CLI glue only: flag parsing, report formatting, and exit code handling.
 * The actual config analysis / fix logic is owned by the SDK.
 */

import {
  ByfHarness,
  type Finding,
  type UpdateConfigInput,
  type UpdateConfigResult,
} from '@byfriends/sdk';
import type { Command } from 'commander';

import { createByfHostIdentity } from '#/cli/version';

interface WritableLike {
  write(chunk: string): boolean;
}

export type OutputFormat = 'pretty' | 'json';

export interface UpdateConfigDeps {
  readonly updateConfig: (input: UpdateConfigInput) => Promise<UpdateConfigResult>;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly exit: (code: number) => never;
}

export interface UpdateConfigOptions {
  readonly fix: boolean;
  readonly configPath?: string;
  readonly outputFormat?: OutputFormat;
}

export async function handleUpdateConfig(
  deps: UpdateConfigDeps,
  opts: UpdateConfigOptions,
): Promise<void> {
  let result: UpdateConfigResult;
  try {
    result = await deps.updateConfig({
      fix: opts.fix,
      configPath: opts.configPath,
    });
  } catch (error) {
    deps.stderr.write(`Error: ${errorMessage(error)}\n`);
    deps.exit(1);
    return;
  }

  const { findings, fixed, backupPath } = result;
  const format = opts.outputFormat ?? 'pretty';

  if (format === 'json') {
    printJson(deps.stdout, findings, fixed, backupPath);
    return;
  }

  // ── Pretty output ────────────────────────────────────────────
  if (findings.length === 0) {
    deps.stdout.write('No deprecated fields found. Config is up to date.\n');
    return;
  }

  // Group findings by kind
  const groups = groupByKind(findings);
  for (const [kind, items] of Object.entries(groups)) {
    const label = kindLabel(kind);
    deps.stdout.write(`${label} (${items.length}):\n`);
    for (const item of items) {
      deps.stdout.write(`  - ${item.path}`);
      if (item.detail) {
        deps.stdout.write(`  (${item.detail})`);
      }
      deps.stdout.write('\n');
    }
  }
  deps.stdout.write('\n');

  if (fixed) {
    deps.stdout.write('Config has been updated.\n');
    if (backupPath) {
      deps.stdout.write(`Backup saved to ${backupPath}\n`);
    }
  } else {
    deps.stdout.write('Run with --fix to apply these changes.\n');
  }
}

export function registerUpdateConfigCommand(
  parent: Command,
  deps?: Partial<UpdateConfigDeps>,
): void {
  parent
    .command('update-config')
    .description('Update config.toml to the current schema version.')
    .option('--fix', 'Apply fixes to the config file.', false)
    .option(
      '--config <path>',
      'Path to config file. Defaults to ~/.byf/config.toml.',
    )
    .option(
      '--output-format <format>',
      'Output format. pretty (default) or json.',
      'pretty',
    )
    .action(
      async (options: { fix?: boolean; config?: string; outputFormat?: string }) => {
        const format = normalizeOutputFormat(options.outputFormat);
        await handleUpdateConfig(createDefaultUpdateConfigDeps(deps), {
          fix: options.fix === true,
          configPath: options.config,
          outputFormat: format,
        });
      },
    );
}

function normalizeOutputFormat(value: string | undefined): OutputFormat {
  if (value === 'json') return 'json';
  return 'pretty';
}

function createDefaultUpdateConfigDeps(
  overrides: Partial<UpdateConfigDeps> = {},
): UpdateConfigDeps {
  let harness: ByfHarness | undefined;
  const identity = createByfHostIdentity();
  const getHarness = (): ByfHarness => {
    harness ??= new ByfHarness({ identity });
    return harness;
  };
  return {
    updateConfig:
      overrides.updateConfig ??
      (async (input: UpdateConfigInput) => getHarness().updateConfig(input)),
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr,
    exit:
      overrides.exit ??
      ((code: number) => {
        process.exit(code);
      }),
  };
}

/* ── JSON output ───────────────────────────────────────────── */

function printJson(
  stdout: WritableLike,
  findings: readonly Finding[],
  fixed: boolean,
  backupPath: string | undefined,
): void {
  const output = {
    findings: findings.map((f) => ({
      kind: f.kind,
      path: f.path,
      detail: f.detail,
      deprecatedSince: f.deprecatedSince,
    })),
    fixed,
    backupPath,
  };
  stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

/* ── Internal helpers ──────────────────────────────────────── */

function groupByKind(
  findings: readonly Finding[],
): Record<string, Finding[]> {
  const groups: Record<string, Finding[]> = {};
  for (const f of findings) {
    (groups[f.kind] ??= []).push(f);
  }
  return groups;
}

const KIND_LABELS: Record<string, string> = {
  removed: 'Removed',
  renamed: 'Renamed',
  migrated: 'Migrated',
  dangling: 'Dangling reference',
  unknown: 'Unknown field',
  'invalid-value': 'Invalid value',
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}