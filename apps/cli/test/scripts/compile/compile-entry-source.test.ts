import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildCompileEntrySource,
  CATALOG_GLOBAL_NAME,
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

function sourceFor(input) {
  return buildCompileEntrySource(input);
}

describe('compile-entry codegen (PRD-0038 release blocker)', () => {
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

describe('compile-entry codegen output is parseable TypeScript', () => {
  const dir = mkdtempSync(join(tmpdir(), 'byf-compile-entry-'));

  it('has no syntax errors once its stub imports exist', () => {
    const source = sourceFor(ENTRY_INPUT);
    // Re-point the absolute imports at local stubs; the assertions are about the
    // shape of the generated code, not about resolving the real build tree.
    const localised = source
      .replaceAll(ENTRY_INPUT.catalogInjectPath, join(dir, 'catalog-inject.ts'))
      .replaceAll(ENTRY_INPUT.assetSets[0].entryPath, join(dir, 'web-embedded-assets.ts'))
      .replaceAll(ENTRY_INPUT.mainEntryPath, join(dir, 'main.ts'));
    writeFileSync(join(dir, 'catalog-inject.ts'), 'export default "";');
    writeFileSync(
      join(dir, 'web-embedded-assets.ts'),
      'export const embeddedAssets: Map<string,string> = new Map();',
    );
    writeFileSync(join(dir, 'main.ts'), 'export function main() {}');
    writeFileSync(join(dir, 'clipboard.linux-x64-gnu.node'), '');
    writeFileSync(join(dir, 'entry.ts'), localised);

    const result = Bun.spawnSync({
      cmd: [
        'bun',
        'x',
        'tsc',
        '--noEmit',
        '--target',
        'esnext',
        '--module',
        'preserve',
        '--moduleResolution',
        'bundler',
        '--types',
        'bun',
        join(dir, 'entry.ts'),
      ],
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const output = result.stdout.toString() + result.stderr.toString();
    // Only syntax diagnostics are a regression here: the stubs intentionally fail
    // type-level checks (e.g. a .node import), which is not what this guards.
    const syntaxOnly = output
      .split('\n')
      .filter((line) => /error TS1\d{3}:/.test(line))
      .join('\n');
    try {
      expect(syntaxOnly).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
