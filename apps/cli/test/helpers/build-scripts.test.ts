/**
 * F3 (PRD-0038 review) — `apps/cli/test/helpers/build-scripts.d.ts` declares
 * named exports for eight untyped `.mjs` build scripts. `allowJs` is off for the
 * test project, so those declarations are never checked against the scripts: a
 * renamed or removed export shows up as TS7016-free `undefined` at runtime, and
 * every assertion built on it goes vacuously true.
 *
 * The clearest instance is `CATALOG_GLOBAL_NAME`, which
 * `apps/cli/test/scripts/compile/compile-entry-source.test.ts` interpolates into
 * a `not.toContain(...)` expectation — `not.toContain(undefined)` passes for any
 * string. This file imports each module for real and probes each declared name.
 *
 * The compile-time half (the `satisfies` clauses) only fails through
 * `bun run typecheck:tests` / `bun run gate:typecheck`: it keeps this list and the
 * ambient declaration from drifting apart. The runtime loop is what catches a
 * rename in the `.mjs` itself, which no type here can see.
 */

import { describe, expect, it } from 'vitest';

import * as builtInCatalog from '../../scripts/built-in-catalog.mjs';
import * as compileEntrySource from '../../scripts/compile/compile-entry-source.mjs';
import * as signStep from '../../scripts/native/04-sign.mjs';
import * as nativeExec from '../../scripts/native/exec.mjs';
import * as nativeManifest from '../../scripts/native/manifest.mjs';
import * as nativeDeps from '../../scripts/native/native-deps.mjs';
import * as nativePaths from '../../scripts/native/paths.mjs';
import * as platformPackages from '../../scripts/npm/platform-packages.mjs';

type Kind = 'function' | 'string' | 'number' | 'object';

/** One entry per declared module, mirroring build-scripts.d.ts member for member. */
const MODULES: ReadonlyArray<{
  label: string;
  runtime: Record<string, unknown>;
  exports: Readonly<Record<string, Kind>>;
}> = [
  {
    label: 'scripts/native/exec.mjs',
    runtime: nativeExec as unknown as Record<string, unknown>,
    exports: {
      commandForExecFile: 'function',
      fail: 'function',
      run: 'function',
      tryRun: 'function',
    },
  },
  {
    label: 'scripts/native/paths.mjs',
    runtime: nativePaths as unknown as Record<string, unknown>,
    exports: {
      appRoot: 'string',
      targetTriple: 'function',
      executableName: 'function',
      nativeDistRoot: 'function',
      nativeIntermediatesDir: 'function',
      nativeBinDir: 'function',
      nativeBinPath: 'function',
      nativeManifestDir: 'function',
      nativeArtifactsDir: 'function',
      nativeSmokeHome: 'function',
      nativeManifestKey: 'function',
    },
  },
  {
    label: 'scripts/native/manifest.mjs',
    runtime: nativeManifest as unknown as Record<string, unknown>,
    exports: {
      NATIVE_ASSET_MANIFEST_VERSION: 'number',
      buildManifestKey: 'function',
      isManifestVersionSupported: 'function',
      buildAssetKey: 'function',
    },
  },
  {
    label: 'scripts/native/native-deps.mjs',
    runtime: nativeDeps as unknown as Record<string, unknown>,
    exports: {
      SUPPORTED_TARGETS: 'object',
      nativeDeps: 'object',
      isSupportedTarget: 'function',
      resolveTargetDeps: 'function',
    },
  },
  {
    label: 'scripts/native/04-sign.mjs',
    runtime: signStep as unknown as Record<string, unknown>,
    exports: { buildCodesignArgs: 'function', runSignStep: 'function' },
  },
  {
    label: 'scripts/npm/platform-packages.mjs',
    runtime: platformPackages as unknown as Record<string, unknown>,
    exports: {
      PLATFORM_PACKAGES: 'object',
      platformPackageForHost: 'function',
      platformPackageForTarget: 'function',
      supportedPlatformSummary: 'function',
      isCliPlatformPackageName: 'function',
    },
  },
  {
    label: 'scripts/built-in-catalog.mjs',
    runtime: builtInCatalog as unknown as Record<string, unknown>,
    exports: {
      BUILT_IN_CATALOG_ENV: 'string',
      BUILT_IN_CATALOG_DEFINE: 'string',
      builtInCatalogDefine: 'function',
    },
  },
  {
    label: 'scripts/compile/compile-entry-source.mjs',
    runtime: compileEntrySource as unknown as Record<string, unknown>,
    exports: {
      CATALOG_GLOBAL_NAME: 'string',
      buildCompileEntrySource: 'function',
    },
  },
];

// Compile-time pairing. Each `keyof typeof mod` is the ambient declaration, so a
// member that this list names but the declaration does not (or the other way
// round) is a typecheck error rather than a future silent `undefined`.
const EXEC_NAMES: readonly (keyof typeof nativeExec)[] = [
  'commandForExecFile',
  'fail',
  'run',
  'tryRun',
];
void EXEC_NAMES;
const PATHS_NAMES: readonly (keyof typeof nativePaths)[] = [
  'appRoot',
  'targetTriple',
  'executableName',
  'nativeDistRoot',
  'nativeIntermediatesDir',
  'nativeBinDir',
  'nativeBinPath',
  'nativeManifestDir',
  'nativeArtifactsDir',
  'nativeSmokeHome',
  'nativeManifestKey',
];
void PATHS_NAMES;
const CATALOG_NAMES: readonly (keyof typeof builtInCatalog)[] = [
  'BUILT_IN_CATALOG_ENV',
  'BUILT_IN_CATALOG_DEFINE',
  'builtInCatalogDefine',
];
void CATALOG_NAMES;
const COMPILE_ENTRY_NAMES: readonly (keyof typeof compileEntrySource)[] = [
  'CATALOG_GLOBAL_NAME',
  'buildCompileEntrySource',
];
void COMPILE_ENTRY_NAMES;

describe('build-scripts.d.ts vs the real .mjs exports (F3)', () => {
  it('every declared export exists on the script with the declared kind', () => {
    const problems: string[] = [];
    for (const module of MODULES) {
      for (const [exportName, kind] of Object.entries(module.exports)) {
        const value = module.runtime[exportName];
        const actual = Array.isArray(value) ? 'object' : typeof value;
        if (actual !== kind) problems.push(`${module.label}.${exportName}: ${actual}, not ${kind}`);
      }
    }
    expect(
      problems,
      `an export named in apps/cli/test/helpers/build-scripts.d.ts is missing from the ` +
        `script (or changed kind). The declaration is unchecked (allowJs is off), so a ` +
        `rename lands as \`undefined\` and every assertion built on it goes vacuously true.`,
    ).toEqual([]);
  });

  it('covers all eight declared modules and does not thin out', () => {
    // The count is the point: deleting an entry from MODULES to make the test pass
    // would re-open the hole this file exists to close.
    expect(MODULES).toHaveLength(8);
    const declaredNames = MODULES.reduce(
      (sum, module) => sum + Object.keys(module.exports).length,
      0,
    );
    expect(declaredNames).toBeGreaterThanOrEqual(30);
  });

  it('CATALOG_GLOBAL_NAME is a usable string, so not.toContain() is not vacuous', () => {
    const value = compileEntrySource.CATALOG_GLOBAL_NAME as unknown;
    expect(typeof value).toBe('string');
    expect(typeof value === 'string' && value.length > 0).toBe(true);
  });
});
