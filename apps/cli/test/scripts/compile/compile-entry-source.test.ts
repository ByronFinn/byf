import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildCompileEntrySource,
  CATALOG_GLOBAL_NAME,
  type CompileEntryInput,
} from '../../../scripts/compile/compile-entry-source.mjs';

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
 * F5.2 — "the generated entry parses" has to be answered by the parser that actually
 * consumes it.
 *
 * The first version shelled out to `bun x tsc`, discarded the exit code and grepped the
 * output for `error TS1…`, so a tsc that never started gave empty output, an empty
 * match, and a green test. The fix for that kept tsc and added a liveness proof — which
 * converted the file into five cold starts of a whole type checker inside a suite that
 * runs ten files in parallel on a 4-core runner. Measured cost of one such start: ~2s
 * here; on CI the same calls reported 3.7s, 5.1s and 22.2s (run 35765202338), and after
 * the per-spawn budget was raised to 20s, CI still reported three of them killed at the
 * budget (run 35769431862). No timeout number survives that spread, because the variable
 * is runner contention, not the code under test.
 *
 * So there is no subprocess here. `Bun.Transpiler` with the `ts` loader is the same
 * parser `bun build` / `bun compile` applies to this entry — so "this parses" is a claim
 * about the real consumer rather than about a second compiler that has to be kept
 * configured (`--allowImportingTsExtensions`, `--types bun` and `--typeRoots` existed
 * only to keep tsc from refusing to look at the file) — and it costs about 10µs per
 * transform (200 transforms: 2ms). The vacuous-pass shape disappears with the process:
 * nothing can "fail to start", and the two rejection cases below are an unambiguous
 * liveness proof, since a parser that had stopped working would *accept* them.
 *
 * Deliberately no longer checked: type-level (TS2xxx) diagnostics of the generated
 * entry. They were scaffolding for the spawn, and the old fixture stubs failed type
 * checks on purpose. The end-to-end claim — "a release binary compiles out of this" — is
 * CI's: `Compile darwin-arm64 binary` and `test:native:smoke` run the real compiler over
 * exactly this codegen output.
 */

const transpiler = new Bun.Transpiler({ loader: 'ts' });

/**
 * Parse messages for `code`, empty when it parses.
 *
 * A thrown error that carries no parse messages is rethrown rather than reported as
 * "clean": otherwise any future failure mode of the transpiler — out of memory, a bad
 * loader, an internal panic — would read as a successful parse, which is the same class
 * of lie this file has already been rewritten for twice.
 */
function parseMessages(code: string): string[] {
  try {
    transpiler.transformSync(code);
    return [];
  } catch (error) {
    const details = (error as { errors?: unknown }).errors;
    if (Array.isArray(details) && details.length > 0) {
      return details.map((item) => String((item as Error).message ?? item));
    }
    throw error;
  }
}

describe('compile-entry codegen output is parseable TypeScript', () => {
  it('the parser itself rejects what it must reject before "parses clean" can mean anything', () => {
    // Liveness, asserted first: a transpiler on the wrong loader, or a helper that
    // swallowed failures, would silently turn every clean-parse assertion below into a
    // pass. These two shapes are the exact defects this file exists to catch.
    expect(
      parseMessages('(globalThis as any)__BYF_WEB_EMBEDDED_ASSETS__ = m;\n').length,
    ).toBeGreaterThan(0);
    expect(parseMessages('const brokenTail: = (;\n').length).toBeGreaterThan(0);
    // And it is not simply always failing, which would make the negative cases theatre.
    expect(parseMessages('export const fine: number = 1;\n')).toEqual([]);
  });

  it('has no syntax errors', () => {
    const source = sourceFor(ENTRY_INPUT);
    expect(parseMessages(source), `generated entry does not parse:\n${source}`).toEqual([]);
  });

  it('has no syntax errors in the no-SPA-asset shape either', () => {
    // The release family also compiles an entry with no asset set at all; that branch
    // emits a different file, and "the other branch parses" is not evidence about it.
    const source = sourceFor({ ...ENTRY_INPUT, assetSets: [{ entryPath: null, globalName: 'X' }] });
    expect(parseMessages(source), `asset-less entry does not parse:\n${source}`).toEqual([]);
  });

  it('negative self-test: the pre-fix globalThis shape really is rejected', () => {
    // Exactly what codegen emitted before 36064cf — a bare interpolated name after a
    // parenthesized cast, which `--profile=release` could not compile.
    const brokenShape = [
      'const embeddedAssets_0 = new Map<string, string>();',
      '(globalThis as any)__BYF_WEB_EMBEDDED_ASSETS__ = embeddedAssets_0;',
      '',
    ].join('\n');
    const messages = parseMessages(brokenShape);
    expect(
      messages.length,
      'the known-bad shape parsed, so the check above is vacuous',
    ).toBeGreaterThan(0);
    expect(messages.join('\n')).toMatch(/Expected|Unexpected/);
  });

  it('negative self-test: a broken tail appended to the real codegen output is caught', () => {
    // Same pipeline, real output, one broken line. The pairing is the point: it proves
    // the rejection below comes from the appended tail and not from the fixture.
    const broken = `${sourceFor(ENTRY_INPUT)}\nconst brokenTail: = (;\n`;
    expect(
      parseMessages(broken).length,
      'a broken tail appended to the generated entry produced no parse error',
    ).toBeGreaterThan(0);
  });
});
