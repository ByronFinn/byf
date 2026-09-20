/**
 * AC-2.1 (PRD-0038 R2) — apps layer must not import @byfriends/agent-core directly.
 *
 * Two halves, both required by the AC:
 *   1. the real repository scan (`src/**` must be clean, `test/**` reported separately)
 *   2. a negative self-test proving the scanner actually goes red on a violation —
 *      without it, a scanner that silently matched nothing would also "pass".
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  APP_TEST_VIOLATION_BUDGET,
  LAYERING_EXCEPTIONS,
  checkAppLayering,
  extractSpecifiers,
  validateExceptionTable,
} from './check-app-layering.mjs';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');

/**
 * Minimal fake repository used by the negative self-test. Returns its root so
 * each case can write the files it needs.
 */
async function withFakeRepo(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'byf-layering-'));
  try {
    for (const [relative, body] of Object.entries(files)) {
      const absolute = path.join(root, relative);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, body, 'utf8');
    }
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const LAYERING_CONSTRAINT =
  'AC-2.1: the apps layer may only consume core capabilities through @byfriends/sdk ' +
  '(root AGENTS.md, apps/cli/AGENTS.md, ADR-0006 关键不变式).';

describe('AC-2.1 apps-layer boundary gate (real repository)', () => {
  it('rejects direct @byfriends/agent-core imports in apps/**/src/**', async () => {
    const result = await checkAppLayering(REPO_ROOT);

    expect(
      result.srcViolations,
      `Found ${String(result.srcViolations.length)} out-of-bounds import(s) in the apps source layer.\n` +
        `Files scanned: ${String(result.filesScanned)}\n\n` +
        result.srcViolations
          .map(
            (violation) =>
              `  ✗ ${violation.relative}:${String(violation.line)} imports "${violation.specifier}"\n` +
              `      ${violation.snippet}\n` +
              `      ${LAYERING_CONSTRAINT}\n` +
              `      Fix: import the same capability from "@byfriends/sdk"; if a real exception is ` +
              `needed, add an exact-file entry with a written reason to LAYERING_EXCEPTIONS in ` +
              `scripts/lib/check-app-layering.mjs (directory-wide exemptions are rejected).`,
          )
          .join('\n\n'),
    ).toEqual([]);
  });

  it('scanned a non-trivial number of app source files (guard is not a no-op)', async () => {
    const result = await checkAppLayering(REPO_ROOT);
    // apps/cli + apps/web + apps/vis together are in the hundreds; anything this
    // low means the walk stopped finding the apps tree at all.
    expect(result.filesScanned).toBeGreaterThan(200);
  });

  it('keeps the separately-counted apps test scope within its ratchet budget', async () => {
    const result = await checkAppLayering(REPO_ROOT);
    const count = result.testViolations.length;
    // Deliberately reported before the assertion so the CI log carries the number
    // even on the run where it goes red, and on green runs for trend reading.
    console.info(
      `AC-2.1 apps test-scope direct agent-core imports: ${String(count)} ` +
        `(budget ${String(APP_TEST_VIOLATION_BUDGET)})` +
        (count === 0
          ? ''
          : `\n${result.testViolations.map((v) => `  - ${v.relative}:${String(v.line)}`).join('\n')}`),
    );
    expect(
      count,
      `apps test files import @byfriends/agent-core ${String(count)} time(s), above the ` +
        `${String(APP_TEST_VIOLATION_BUDGET)} budget. ${LAYERING_CONSTRAINT} ` +
        `Lower the number or (only with justification recorded in PRD-0038) raise ` +
        `APP_TEST_VIOLATION_BUDGET.`,
    ).toBeLessThanOrEqual(APP_TEST_VIOLATION_BUDGET);
  });

  it('has no stale exception entries (every whitelisted file still violates)', async () => {
    const result = await checkAppLayering(REPO_ROOT);
    expect(
      result.staleExceptions,
      `LAYERING_EXCEPTIONS has entries that no longer match a violation: ${result.staleExceptions.join(', ')}. ` +
        `A dead whitelist entry silently swallows the next violation added to that file — delete it.`,
    ).toEqual([]);
  });

  it('exception table is well-formed and currently empty unless justified', async () => {
    expect(validateExceptionTable([...LAYERING_EXCEPTIONS])).toEqual([]);
  });
});

describe('AC-2.1 negative self-test — the scanner must go red', () => {
  it('flags a bare package import in an app src file', async () => {
    await withFakeRepo(
      {
        'apps/demo/src/leak.ts': `import { Agent } from '@byfriends/agent-core';\nexport const a = Agent;\n`,
      },
      async (root) => {
        const result = await checkAppLayering(root);
        expect(result.srcViolations.map((v) => v.relative)).toEqual(['apps/demo/src/leak.ts']);
        expect(result.srcViolations[0]?.specifier).toBe('@byfriends/agent-core');
        expect(result.srcViolations[0]?.scope).toBe('src');
      },
    );
  });

  it('flags a subpath import, a type-only import, a re-export and a dynamic import', async () => {
    await withFakeRepo(
      {
        'apps/demo/src/sub.ts': `import { Session } from '@byfriends/agent-core/session';\n`,
        'apps/demo/src/types.ts': `import type { WireRecord } from '@byfriends/agent-core';\n`,
        'apps/demo/src/reship.ts': `export * from '@byfriends/agent-core';\n`,
        'apps/demo/src/lazy.ts': `const mod = await import('@byfriends/agent-core');\n`,
        'apps/demo/src/required.ts': `const core = require('@byfriends/agent-core');\n`,
      },
      async (root) => {
        const result = await checkAppLayering(root);
        expect(result.srcViolations.map((v) => v.relative).sort()).toEqual([
          'apps/demo/src/lazy.ts',
          'apps/demo/src/required.ts',
          'apps/demo/src/reship.ts',
          'apps/demo/src/sub.ts',
          'apps/demo/src/types.ts',
        ]);
      },
    );
  });

  it('flags a relative escape into packages/agent-core (bypass via path, not name)', async () => {
    await withFakeRepo(
      {
        'packages/agent-core/src/session/index.ts': `export {};\n`,
        'apps/demo/src/leak.ts': `import { SessionStore } from '../../../packages/agent-core/src/session';\n`,
      },
      async (root) => {
        const result = await checkAppLayering(root);
        expect(result.srcViolations).toHaveLength(1);
        expect(result.srcViolations[0]?.forbidden).toBe('packages/agent-core');
      },
    );
  });

  it('accepts the sanctioned path (@byfriends/sdk) and unrelated packages', async () => {
    await withFakeRepo(
      {
        'apps/demo/src/ok.ts':
          `import { ByfHarness } from '@byfriends/sdk';\n` +
          `import { z } from 'zod';\n` +
          `import { helper } from './helper';\n` +
          `export const x = [ByfHarness, z, helper];\n`,
        'apps/demo/src/helper.ts': `export const helper = 1;\n`,
      },
      async (root) => {
        const result = await checkAppLayering(root);
        expect(result.srcViolations).toEqual([]);
        expect(result.testViolations).toEqual([]);
      },
    );
  });

  it('classifies a spec file inside src/ as test scope, not src scope', async () => {
    await withFakeRepo(
      {
        'apps/demo/src/leak.test.ts': `import { Agent } from '@byfriends/agent-core';\nexport {};\n`,
      },
      async (root) => {
        const result = await checkAppLayering(root);
        expect(result.srcViolations).toEqual([]);
        expect(result.testViolations.map((v) => v.relative)).toEqual([
          'apps/demo/src/leak.test.ts',
        ]);
      },
    );
  });

  it('ignores prose that merely names the package', async () => {
    await withFakeRepo(
      {
        'apps/demo/src/commented.ts':
          `// we must not import @byfriends/agent-core here\n` +
          `/** from '@byfriends/agent-core' is banned (ADR-0006) */\n` +
          ` * from '@byfriends/agent-core'\n` +
          `export const ok = 1;\n`,
      },
      async (root) => {
        const result = await checkAppLayering(root);
        expect(result.srcViolations).toEqual([]);
      },
    );
  });

  it('does not treat an identifier that merely starts with a keyword as a specifier', async () => {
    const specifiers = extractSpecifiers(
      `importFoo('@byfriends/agent-core');\nconst from = '@byfriends/agent-core';\n`,
    );
    expect(specifiers).toEqual([]);
  });

  it('an exact-file exception clears a violation, and the file still counts as exceptioned', async () => {
    await withFakeRepo(
      {
        'apps/demo/src/leak.ts': `import { Agent } from '@byfriends/agent-core';\n`,
      },
      async (root) => {
        const exceptions = [
          {
            file: 'apps/demo/src/leak.ts',
            specifier: '@byfriends/agent-core',
            reason: 'self-test fixture',
          },
        ];
        const result = await checkAppLayering(root, { exceptions });
        expect(result.srcViolations).toEqual([]);
        expect(result.exceptioned).toHaveLength(1);
        expect(result.staleExceptions).toEqual([]);
      },
    );
  });

  it('a directory-wide exception is rejected instead of silently widening the gate', async () => {
    const problems = validateExceptionTable([
      { file: 'apps/demo/src/', specifier: '@byfriends/agent-core', reason: 'whole folder' },
    ]);
    expect(problems.join('\n')).toContain('only exact file paths are allowed');
  });

  it('an exception for a file that never violates is reported as stale', async () => {
    await withFakeRepo(
      {
        'apps/demo/src/clean.ts': `import { ByfHarness } from '@byfriends/sdk';\n`,
      },
      async (root) => {
        const result = await checkAppLayering(root, {
          exceptions: [{ file: 'apps/demo/src/clean.ts', reason: 'nothing to excuse' }],
        });
        expect(result.staleExceptions).toEqual(['apps/demo/src/clean.ts']);
      },
    );
  });
});
