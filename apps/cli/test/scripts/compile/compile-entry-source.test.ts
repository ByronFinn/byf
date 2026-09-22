import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildCompileEntrySource,
  CATALOG_GLOBAL_NAME,
  type CompileEntryInput,
} from '../../../scripts/compile/compile-entry-source.mjs';
import { defined } from '../../helpers/defined';

const ENTRY_INPUT = {
  clipboardRelativeRequire: './clipboard.linux-x64-gnu.node',
  mainEntryPath: '/abs/apps/cli/src/main.ts',
  catalogInjectPath: '/abs/apps/cli/dist-native/intermediates/catalog-inject.ts',
  assetSets: [
    {
      entryPath: '/abs/apps/cli/dist-native/intermediates/web-embedded-assets.ts',
      globalName: '__BYF_WEB_EMBEDDED_ASSETS__',
    },
  ],
};

function sourceFor(input: CompileEntryInput): string {
  return buildCompileEntrySource(input);
}

describe('compile-entry codegen (PRD-0038 release blocker)', () => {
  beforeAll(() => {
    // Several assertions below are `not.toContain(...)`, and an interpolated
    // `undefined` makes every one of them vacuously true. The import-and-probe
    // guard in `test/helpers/build-scripts.test.ts` pins the same thing from the
    // declaration side; this is the cheap local version.
    expect(typeof CATALOG_GLOBAL_NAME).toBe('string');
    expect(CATALOG_GLOBAL_NAME.length).toBeGreaterThan(0);
  });

  it('writes every embedded global through computed property access', () => {
    const source = sourceFor(ENTRY_INPUT);
    expect(source).toContain(')["__BYF_WEB_EMBEDDED_ASSETS__"] = embeddedAssets_0;');
    // The bug that made `--profile=release` fail to compile for any artifact
    // carrying SPA assets: a bare interpolated name after a parenthesized cast.
    expect(source).not.toContain(')__BYF_WEB_EMBEDDED_ASSETS__');
    expect(source).not.toContain(`)${CATALOG_GLOBAL_NAME}`);
  });

  it('carries an async boot so --bytecode can compile the entry', () => {
    const source = sourceFor(ENTRY_INPUT);
    expect(source).toContain('async function boot()');
    expect(source).toContain('void boot();');
    // A top-level await is exactly what `--bytecode` rejects.
    expect(source).not.toMatch(/^await /m);
    expect(source).not.toMatch(/^const \{ main \} = await /m);
  });

  it('keeps globalThis writes before the boot import', () => {
    const source = sourceFor(ENTRY_INPUT);
    const lastAssign = source.lastIndexOf('= embeddedAssets_0;');
    const bootImport = source.indexOf('await import(');
    expect(lastAssign).toBeGreaterThan(-1);
    expect(bootImport).toBeGreaterThan(lastAssign);
  });

  it('omits asset blocks entirely when there is no SPA asset set', () => {
    const source = sourceFor({ ...ENTRY_INPUT, assetSets: [{ entryPath: null, globalName: 'X' }] });
    expect(source).not.toContain('embeddedAssets_');
    expect(source).toContain(CATALOG_GLOBAL_NAME);
  });

  it('quotes asset paths so a name cannot break out of the string literal', () => {
    const nasty = String.raw`/abs/we"ird\assets.ts`;
    const source = sourceFor({
      ...ENTRY_INPUT,
      mainEntryPath: nasty,
      assetSets: [{ entryPath: nasty, globalName: '__X__' }],
    });
    // JSON.stringify escaping, not raw interpolation: the quote is escaped and
    // the backslash is doubled, so no path can close the string literal early.
    expect(source).toContain('"/abs/we\\"ird\\\\assets.ts"');
    expect(source).not.toContain('from "/abs/we"ird');
  });
});

/**
 * F5.2 — "the generated code has no syntax diagnostics" is only an assertion if
 * the compiler demonstrably ran. The first version spawned `bun x tsc`, threw the
 * exit code away, and filtered the output for `error TS1…`, so a tsc that failed
 * to start (unresolvable `bun x` lookup, bad flags, a config collision) produced
 * empty output, an empty filter, and a green test.
 *
 * Three layers now, in this order:
 *   1. `tscRuns()` — the toolchain itself is the repo-pinned TypeScript and it
 *      reports a deliberate type error. A broken invocation fails here.
 *   2. the codegen output has no TS1xxx **and no TS5xxx** diagnostic — TS5 is the
 *      "tsc never checked this file" family.
 *   3. a negative self-test that feeds tsc the exact shape the release build used
 *      to emit and requires a TS1xxx back.
 */

const REPO_ROOT = join(import.meta.dir, '..', '..', '..', '..', '..');
const TSC_ENTRY = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
const TYPE_ROOTS = join(REPO_ROOT, 'node_modules', '@types');

interface TscRun {
  readonly exitCode: number;
  readonly output: string;
  readonly diagnostics: string[];
  readonly syntax: string[];
  readonly config: string[];
}

function runTsc(dir: string, file: string): TscRun {
  const result = Bun.spawnSync({
    cmd: [
      // The binary, not `bun x tsc`: `x` resolves through the network/PATH, and a
      // resolution failure is precisely the vacuous pass this file guards against.
      process.execPath,
      TSC_ENTRY,
      '--noEmit',
      '--target',
      'esnext',
      '--module',
      'preserve',
      '--moduleResolution',
      'bundler',
      // The generated entry imports `.ts` paths, which is what Bun's bundler
      // consumes. Without this flag tsc answers TS5097 for every one of them, and
      // a filter that only looks at TS1xxx discards that whole class of "the
      // compiler never read this file" failure in silence.
      '--allowImportingTsExtensions',
      '--types',
      'bun',
      '--typeRoots',
      TYPE_ROOTS,
      file,
    ],
    cwd: dir,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = result.stdout.toString() + result.stderr.toString();
  const diagnostics = output
    .split('\n')
    .filter((line) => /error TS\d+:/.test(line))
    .map((line) => line.trim());
  return {
    exitCode: result.exitCode,
    output,
    diagnostics,
    syntax: diagnostics.filter((line) => /error TS1\d{3}:/.test(line)),
    config: diagnostics.filter((line) => /error TS5\d{3}:/.test(line)),
  };
}

/**
 * The temp dir is created and removed per test. It used to be a `mkdtempSync` in
 * the describe body, which runs at collection time: a file that failed to load
 * still leaked a directory, and a test skipped by a filter left one behind too.
 */
function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'byf-compile-entry-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Write the generated entry plus the stubs its imports point at. */
function writeFixture(dir: string, source: string): string {
  const localised = source
    .replaceAll(ENTRY_INPUT.catalogInjectPath, join(dir, 'catalog-inject.ts'))
    .replaceAll(
      defined(ENTRY_INPUT.assetSets[0], 'assetSets[0]').entryPath,
      join(dir, 'web-embedded-assets.ts'),
    )
    .replaceAll(ENTRY_INPUT.mainEntryPath, join(dir, 'main.ts'));
  writeFileSync(join(dir, 'catalog-inject.ts'), 'export default "";');
  writeFileSync(
    join(dir, 'web-embedded-assets.ts'),
    'export const embeddedAssets: Map<string,string> = new Map();',
  );
  writeFileSync(join(dir, 'main.ts'), 'export function main() {}');
  writeFileSync(join(dir, 'clipboard.linux-x64-gnu.node'), '');
  const entry = join(dir, 'entry.ts');
  writeFileSync(entry, localised);
  return entry;
}

describe('compile-entry codegen output is parseable TypeScript', () => {
  it('the typechecker used as the parser is the repo-pinned one and it reports', () => {
    expect(existsSync(TSC_ENTRY), `missing ${TSC_ENTRY}`).toBe(true);
    withTempDir((dir) => {
      const file = join(dir, 'control.ts');
      writeFileSync(file, "export const wrongType: number = 'not a number';\n");
      const run = runTsc(dir, file);
      // A deliberate *type* error must be reported. If this fails, tsc never ran,
      // and every "no syntax diagnostics" assertion below means nothing.
      expect(
        run.diagnostics.some((line) => /error TS2\d{3}:/.test(line)),
        `tsc produced no type diagnostic for a known type error.\n${run.output}`,
      ).toBe(true);
    });
  });

  it('has no syntax errors once its stub imports exist', () => {
    withTempDir((dir) => {
      const entry = writeFixture(dir, sourceFor(ENTRY_INPUT));
      const run = runTsc(dir, entry);
      // Only syntax diagnostics are a regression here: the stubs intentionally fail
      // type-level checks (e.g. a .node import), which is not what this guards.
      expect(run.syntax, run.output).toEqual([]);
      // TS5xxx is the "the compiler refused to check this file" family (bad flag,
      // a tsconfig collision). Empty output with a non-zero exit is not a pass.
      expect(run.config, run.output).toEqual([]);
    });
  });

  it('negative self-test: the pre-fix globalThis shape really does produce TS1xxx', () => {
    withTempDir((dir) => {
      // Exactly what codegen emitted before 36064cf: a bare interpolated name after
      // a parenthesized cast, which `--profile=release` could not compile. Feeding
      // it through the same pipeline must be loud — otherwise the filter above is
      // matching nothing and the test is theatre.
      const brokenShape = [
        'const embeddedAssets_0 = new Map<string, string>();',
        '(globalThis as any)__BYF_WEB_EMBEDDED_ASSETS__ = embeddedAssets_0;',
        '',
      ].join('\n');
      const file = join(dir, 'broken.ts');
      writeFileSync(file, brokenShape);
      const run = runTsc(dir, file);
      expect(
        run.syntax.length,
        `a known-bad shape produced no syntax diagnostic.\n${run.output}`,
      ).toBeGreaterThan(0);
      expect(run.syntax[0]).toMatch(/error TS1\d{3}:/);
    });
  });

  it('negative self-test: appending a broken tail to the real codegen output is caught', () => {
    withTempDir((dir) => {
      const clean = writeFixture(dir, sourceFor(ENTRY_INPUT));
      expect(runTsc(dir, clean).syntax).toEqual([]);
      const broken = writeFixture(dir, `${sourceFor(ENTRY_INPUT)}\nconst brokenTail: = (;\n`);
      const run = runTsc(dir, broken);
      expect(
        run.syntax.length,
        `a broken tail appended to the real codegen output produced no syntax ` +
          `diagnostic, so the filter above cannot be trusted.\n${run.output}`,
      ).toBeGreaterThan(0);
    });
  });
});
