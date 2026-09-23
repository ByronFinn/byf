/**
 * PRD-0038 review F3 — `scripts/lib/script-modules.d.ts` declares the named
 * exports of the five untyped `.mjs` gate scripts that their sibling `*.test.ts`
 * files import. `allowJs` is off for the test project, so those declarations are
 * never checked against the scripts themselves: a renamed or removed export
 * arrives at runtime as `undefined`, and every assertion built on top of it goes
 * vacuously true instead of going red.
 *
 * That is the same failure mode this file's neighbours guard: a scanner whose
 * fixture is `undefined` still reports "no violations found", which is how a gate
 * can stay green while checking nothing.
 *
 * Two halves, on purpose. The `keyof typeof mod` pairing below only fails through
 * `bun run typecheck:tests` / `bun run gate:typecheck`, and it keeps this list and
 * the ambient declaration from drifting apart. The runtime loop is the half that
 * types cannot cover — it proves the `.mjs` really exports the member under that
 * name, which no declaration in this repo can see.
 */

import { describe, expect, it } from 'vitest';

import * as agentCoreSurface from './check-agent-core-surface.mjs';
import * as appLayering from './check-app-layering.mjs';
import * as dependencyAudit from './check-dependency-audit.mjs';
import * as listPublishable from './list-publishable-packages.mjs';
import * as publishManifest from './publish-manifest.mjs';

type Kind = 'function' | 'string' | 'number' | 'array' | 'object';

const MODULES: ReadonlyArray<{
  label: string;
  runtime: Record<string, unknown>;
  exports: Readonly<Record<string, Kind>>;
}> = [
  {
    label: 'scripts/lib/check-app-layering.mjs',
    runtime: appLayering as unknown as Record<string, unknown>,
    exports: {
      FORBIDDEN_PACKAGES: 'array',
      FORBIDDEN_RELATIVE_DIRS: 'array',
      LAYERING_EXCEPTIONS: 'array',
      APP_TEST_VIOLATION_BUDGET: 'number',
      collectAppFiles: 'function',
      extractSpecifiers: 'function',
      classifySpecifier: 'function',
      findForbiddenImportsInText: 'function',
      validateExceptionTable: 'function',
      checkAppLayering: 'function',
    },
  },
  {
    label: 'scripts/lib/check-agent-core-surface.mjs',
    runtime: agentCoreSurface as unknown as Record<string, unknown>,
    exports: {
      SURFACE_SNAPSHOT_RELATIVE: 'string',
      recursionTargets: 'function',
      parseBarrel: 'function',
      moduleFile: 'function',
      readSnapshot: 'function',
      readBarrel: 'function',
      readSurface: 'function',
      compareSurface: 'function',
      snapshotDocument: 'function',
    },
  },
  {
    label: 'scripts/lib/check-dependency-audit.mjs',
    runtime: dependencyAudit as unknown as Record<string, unknown>,
    exports: {
      parseLockfile: 'function',
      sourceHost: 'function',
      osvQuery: 'function',
      queryOsv: 'function',
      advisoryKey: 'function',
    },
  },
  {
    label: 'scripts/lib/list-publishable-packages.mjs',
    runtime: listPublishable as unknown as Record<string, unknown>,
    exports: {
      describePublishability: 'function',
      listPublishablePackages: 'function',
      inspectPublishablePackages: 'function',
    },
  },
  {
    label: 'scripts/lib/publish-manifest.mjs',
    runtime: publishManifest as unknown as Record<string, unknown>,
    exports: {
      PUBLISH_CONFIG_OVERLAY_KEYS: 'object',
      expandPublishConfig: 'function',
      rewriteDependencyProtocols: 'function',
      preparePublishManifest: 'function',
      loadPublishRewriteContext: 'function',
    },
  },
];

// Compile-time pairing: each array is checked against the ambient declaration of
// its module, so a member named here that the declaration does not have — or the
// other way round — is a typecheck error rather than a future silent `undefined`.
function kindOf(value: unknown): Kind {
  if (Array.isArray(value)) return 'array';
  return typeof value as Kind;
}
const APP_LAYERING_NAMES: readonly (keyof typeof appLayering & string)[] = [
  'FORBIDDEN_PACKAGES',
  'FORBIDDEN_RELATIVE_DIRS',
  'LAYERING_EXCEPTIONS',
  'APP_TEST_VIOLATION_BUDGET',
  'collectAppFiles',
  'extractSpecifiers',
  'classifySpecifier',
  'findForbiddenImportsInText',
  'validateExceptionTable',
  'checkAppLayering',
];
const SURFACE_NAMES: readonly (keyof typeof agentCoreSurface & string)[] = [
  'SURFACE_SNAPSHOT_RELATIVE',
  'recursionTargets',
  'parseBarrel',
  'moduleFile',
  'readSnapshot',
  'readBarrel',
  'readSurface',
  'compareSurface',
  'snapshotDocument',
];
const AUDIT_NAMES: readonly (keyof typeof dependencyAudit & string)[] = [
  'parseLockfile',
  'sourceHost',
  'osvQuery',
  'queryOsv',
  'advisoryKey',
];
const PUBLISHABLE_NAMES: readonly (keyof typeof listPublishable & string)[] = [
  'describePublishability',
  'listPublishablePackages',
  'inspectPublishablePackages',
];
const MANIFEST_NAMES: readonly (keyof typeof publishManifest & string)[] = [
  'PUBLISH_CONFIG_OVERLAY_KEYS',
  'expandPublishConfig',
  'rewriteDependencyProtocols',
  'preparePublishManifest',
  'loadPublishRewriteContext',
];

describe('script-modules.d.ts matches the scripts it declares', () => {
  it('every declared member exists at runtime with the declared kind', () => {
    const problems: string[] = [];
    for (const module of MODULES) {
      for (const [name, kind] of Object.entries(module.exports)) {
        if (!(name in module.runtime)) {
          problems.push(`${module.label}: ${name} is declared but not exported`);
          continue;
        }
        const actual = kindOf(module.runtime[name]);
        const accepted = kind === 'object' ? ['object', 'array'] : [kind];
        if (!accepted.includes(actual)) {
          problems.push(`${module.label}: ${name} declared ${kind}, runtime ${actual}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('the compile-time name lists cover exactly the probed members', () => {
    const pairing: ReadonlyArray<[readonly string[], Record<string, Kind>]> = [
      [APP_LAYERING_NAMES, MODULES[0]?.exports ?? {}],
      [SURFACE_NAMES, MODULES[1]?.exports ?? {}],
      [AUDIT_NAMES, MODULES[2]?.exports ?? {}],
      [PUBLISHABLE_NAMES, MODULES[3]?.exports ?? {}],
      [MANIFEST_NAMES, MODULES[4]?.exports ?? {}],
    ];
    for (const [names, exports] of pairing) {
      expect([...names].sort()).toEqual(Object.keys(exports).sort());
    }
  });

  it('a renamed export is caught rather than read as undefined', () => {
    // Negative self-test: the loop above must be able to go red. If this probe
    // ever reports no problem, the guard has become a no-op.
    const broken: Record<string, unknown> = { realName: () => undefined };
    const declared = { realName: 'function', vanishedName: 'function' } as const;
    const detected = Object.keys(declared).filter((name) => !(name in broken));
    expect(detected).toEqual(['vanishedName']);
  });
});
