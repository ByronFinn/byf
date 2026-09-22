/**
 * AC-2.2 (PRD-0038 R2) — the publish set must be decided by real criteria.
 *
 * Before this gate the only filter was `private !== true`, so `@byfriends/storage`
 * (no `publishConfig`, no `files`, no `build`, `exports` → `./src/index.ts`) sat in
 * the publish set and would have shipped as an unloadable bare-TypeScript tarball.
 * Q6 of PRD-0038 keeps the package as a work-in-memory (PRD-0037 C7) and moves it
 * out of the set via `private: true`; this test pins both halves.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { PackageManifest } from './list-publishable-packages.mjs';
import {
  describePublishability,
  inspectPublishablePackages,
} from './list-publishable-packages.mjs';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');

/** The exact registry surface expected today — a new/removed entry must be a decision. */
const EXPECTED_PUBLISH_SET = [
  '@byfriends/agent-core',
  '@byfriends/cli',
  '@byfriends/kaos',
  '@byfriends/kosong',
  '@byfriends/oauth',
  '@byfriends/sdk',
  '@byfriends/web-server',
];

/**
 * Acknowledged, still-open AC-2.2 mismatches, by id. An id here must match a real
 * condition in the repository: close the mismatch and this list becomes stale, which
 * fails the gate until the entry is deleted. That keeps a tracked gap from turning
 * into a permanent silent pass.
 */
const AGENT_CORE_BARREL_DRIFT = 'agent-core-barrel-claims-not-registry-published';
const KNOWN_DOC_DRIFT: string[] = [];

function libraryManifest(overrides: Partial<PackageManifest>) {
  return {
    name: '@byfriends/demo',
    version: '1.0.0',
    publishConfig: {
      access: 'public',
      exports: { '.': { types: './dist/index.d.mts', import: './dist/index.mjs' } },
    },
    files: ['dist'],
    ...overrides,
  };
}

describe('AC-2.2 publishability criteria', () => {
  it('accepts a package with publishConfig and built-artifact exports', () => {
    expect(describePublishability(libraryManifest({}))).toEqual({
      publishable: true,
      reasons: [],
    });
  });

  it('rejects a package that declares no publishConfig, even when not private', () => {
    const { publishable, reasons } = describePublishability(
      libraryManifest({ publishConfig: undefined }),
    );
    expect(publishable).toBe(false);
    expect(reasons.join('\n')).toContain('no `publishConfig`');
  });

  it('treats an empty publishConfig object as no intent', () => {
    expect(describePublishability(libraryManifest({ publishConfig: {} })).publishable).toBe(false);
  });

  it('rejects publish-facing exports that resolve to TypeScript sources', () => {
    const { publishable, reasons } = describePublishability({
      name: '@byfriends/storage-like',
      version: '0.1.0',
      exports: { '.': { types: './src/index.ts', default: './src/index.ts' } },
    });
    expect(publishable).toBe(false);
    expect(reasons.join('\n')).toContain('resolve to TypeScript sources (./src/index.ts)');
  });

  it('a publishConfig.exports overlay is what counts, not the dev-time source exports', () => {
    // Matches every library package in this repo: root `exports` point at `src/*.ts`
    // for in-monorepo dev, `publishConfig.exports` point at `dist` for the registry.
    const manifest = {
      name: '@byfriends/demo',
      version: '1.0.0',
      exports: { '.': { types: './src/index.ts', default: './src/index.ts' } },
      publishConfig: { access: 'public', exports: { '.': { import: './dist/index.mjs' } } },
    };
    expect(describePublishability(manifest).publishable).toBe(true);
  });

  it('accepts a bin-only package via files/build instead of exports', () => {
    const manifest = {
      name: '@byfriends/cli-like',
      version: '1.0.0',
      publishConfig: { access: 'public' },
      files: ['bin', 'dist'],
      scripts: { build: 'bun scripts/build.mjs' },
    };
    expect(describePublishability(manifest)).toEqual({ publishable: true, reasons: [] });
  });

  it('accepts a build script with no files field', () => {
    const manifest = {
      name: '@byfriends/demo',
      version: '1.0.0',
      publishConfig: { access: 'public' },
      scripts: { build: 'bun ../../build/bun-lib-build.mjs ./src/index.ts' },
    };
    expect(describePublishability(manifest).publishable).toBe(true);
  });

  it('rejects a package with nothing to ship', () => {
    const { publishable, reasons } = describePublishability({
      name: '@byfriends/empty',
      version: '1.0.0',
      publishConfig: { access: 'public' },
    });
    expect(publishable).toBe(false);
    expect(reasons.join('\n')).toContain('nothing to ship');
  });

  it('private wins immediately and is the only stated reason', () => {
    expect(
      describePublishability({ name: '@byfriends/demo', version: '1.0.0', private: true }),
    ).toEqual({ publishable: false, reasons: ['private: true'] });
  });

  it('does not mistake a .d.ts declaration for a TypeScript source', () => {
    const manifest = {
      name: '@byfriends/demo',
      version: '1.0.0',
      publishConfig: { access: 'public', exports: { '.': { types: './dist/index.d.ts' } } },
    };
    expect(describePublishability(manifest).publishable).toBe(true);
  });
});

describe('AC-2.2 real repository publish set', () => {
  it('excludes @byfriends/storage from the publish set', async () => {
    const { included } = await inspectPublishablePackages();
    expect(
      included.map((pkg) => pkg.name),
      'AC-2.2: @byfriends/storage is an in-progress SQLite/lease asset (PRD-0037 C7, ' +
        'PRD-0038 Q6) — keep the sources and tests, do not publish them.',
    ).not.toContain('@byfriends/storage');
  });

  it('marks packages/storage private, per the Q6 ruling', async () => {
    const manifest = JSON.parse(
      await readFile(path.join(REPO_ROOT, 'packages', 'storage', 'package.json'), 'utf8'),
    );
    expect(manifest.private).toBe(true);
  });

  it('publishes exactly the reviewed set — additions and removals are explicit decisions', async () => {
    const { included } = await inspectPublishablePackages();
    expect(
      included.map((pkg) => pkg.name).sort((a, b) => a.localeCompare(b)),
      `AC-2.2: the publish set changed. If this is intentional, update EXPECTED_PUBLISH_SET in ` +
        `scripts/lib/publishability.test.ts and record why in the PRD-0038 / changeset note. ` +
        `@byfriends/vis-server is expected to leave this set in G5 (Q7 / AC-5.6).`,
    ).toEqual([...EXPECTED_PUBLISH_SET].sort((a, b) => a.localeCompare(b)));
  });

  it('every published package satisfies both AC-2.2 criteria on disk', async () => {
    const { included } = await inspectPublishablePackages();
    const offenders = [];
    for (const pkg of included) {
      const manifest = JSON.parse(await readFile(path.join(pkg.path, 'package.json'), 'utf8'));
      const verdict = describePublishability(manifest);
      if (!verdict.publishable) offenders.push(`${pkg.name}: ${verdict.reasons.join('; ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('pins @byfriends/agent-core as a publish-shaped package and tracks its doc drift', async () => {
    // Evidence gathered for AC-2.2's second clause:
    //   - agent-core has publishConfig.access=public, publishConfig.exports → dist,
    //     files:["dist"] and a build script, and it IS in the publish set.
    //   - it is live on the registry (@byfriends/agent-core@0.6.0, same release train
    //     as @byfriends/sdk@0.6.0), and README.md lists it as a library entry point.
    //   - "the CLI needs it, so it must be published" is NOT the reason: nothing in
    //     the publish set depends on it at runtime — @byfriends/sdk keeps it in
    //     devDependencies and inlines it via `bun-lib-build --bundle-workspace`.
    // So retracting it to private is viable but is a breaking change the owner must
    // call, not a gate. What the gate does hold is that the record and the set agree,
    // and that any acknowledged mismatch stays on this list until it is closed.
    const { included } = await inspectPublishablePackages();
    expect(included.map((pkg) => pkg.name)).toContain('@byfriends/agent-core');

    const barrel = await readFile(
      path.join(REPO_ROOT, 'packages', 'agent-core', 'src', 'index.ts'),
      'utf8',
    );
    const contradictsSet = barrel.includes('is not registry-published');
    const isRecorded = KNOWN_DOC_DRIFT.includes(AGENT_CORE_BARREL_DRIFT);
    expect(
      contradictsSet,
      contradictsSet
        ? `AC-2.2: agent-core's barrel claims "@byfriends/agent-core is not registry-published" ` +
            `while the package is in the publish set and live on the registry. Either correct the ` +
            `comment in packages/agent-core/src/index.ts (outside this task's writable domain) or ` +
            `move the package to private; until then the id "${AGENT_CORE_BARREL_DRIFT}" must stay ` +
            `in KNOWN_DOC_DRIFT for this gate to pass.`
        : `AC-2.2: the "not registry-published" comment is gone — the record and the publish set ` +
            `now agree, so delete "${AGENT_CORE_BARREL_DRIFT}" from KNOWN_DOC_DRIFT to tighten the gate.`,
    ).toBe(isRecorded);

    if (contradictsSet) {
      console.warn(
        [
          'AC-2.2 NOT FULLY MET (tracked, see PRD-0038 R5 / AC-5.8):',
          '  packages/agent-core/src/index.ts states "@byfriends/agent-core is not',
          '  registry-published", but it is in the publish set and on the registry.',
          '  Owner must pick one: (a) correct the comment, or (b) add',
          '  "private": true to packages/agent-core/package.json and drop the entry from',
          '  EXPECTED_PUBLISH_SET here.',
          '  Separately, the barrel `export *` still re-exports 6 of the 16 top-level',
          '  directories in src/ — an uncurated public surface that needs its own AC.',
        ].join('\n'),
      );
    }
  });
});
