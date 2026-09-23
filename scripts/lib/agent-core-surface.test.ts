/**
 * AC-2.4 (PRD-0038) — the pinned published surface of @byfriends/agent-core.
 *
 * Three halves, all required:
 *   1. the real repository scan (live surface must equal the reviewed snapshot);
 *   2. parser unit tests for each export shape that is public API;
 *   3. negative self-tests that mutate the surface and require the scanner to go
 *      red — without them, a scanner that silently matched nothing would also
 *      "pass", which is exactly how the `export type { … }` hole survived its
 *      first landing (PRD-0038 review F4).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { BarrelNamedExport, ParsedBarrel, Surface } from './check-agent-core-surface.mjs';
import {
  compareSurface,
  moduleFile,
  parseBarrel,
  readSnapshot,
  readSurface,
} from './check-agent-core-surface.mjs';

// Derived from this file, not `process.cwd()`: build/test-preload.ts tells users a
// single-file run (`bun test scripts/lib/agent-core-surface.test.ts`) is supported,
// and a cwd-based root made that run report two failures describing nothing real.
const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');

function name(from: string, entry: string, typeOnly = false): BarrelNamedExport {
  return { from, name: entry, aliased: false, typeOnly };
}

/**
 * One recursed module of a scanned surface. `Surface['nested']` is a `Record`, so an
 * indexed read is `ParsedBarrel | undefined`; a missing target means the scanner did
 * not recurse it, which is a failure with a reason, not something to `!` away.
 */
function nestedModule(
  surface: { nested: Record<string, ParsedBarrel> },
  target: string,
): ParsedBarrel {
  const parsed = surface.nested[target];
  if (parsed === undefined) {
    throw new Error(`the scanner did not recurse '${target}': nested entry is missing`);
  }
  return parsed;
}

/** Write a throwaway repository exposing only what the scanner reads. */
async function withFakeRepo(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), 'byf-surface-'));
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

describe('AC-2.4 agent-core published surface', () => {
  it('matches the reviewed snapshot — widening public API is an explicit edit', async () => {
    const current = await readSurface(REPO_ROOT);
    const snapshot = await readSnapshot(REPO_ROOT);
    const result = compareSurface(current, snapshot);
    expect(
      result.detail,
      `agent-core's published surface changed shape. Every name the barrel forwards is ` +
        `npm API, so this must be a reviewed decision: update ` +
        `scripts/lib/agent-core-surface.json intentionally (and treat removals as ` +
        `breaking).\n` +
        result.detail.map((d) => `  - ${d}`).join('\n'),
    ).toEqual([]);
  });

  it('records the star-exported modules that make whole surfaces public', async () => {
    const snapshot = await readSnapshot(REPO_ROOT);
    // Each entry here is a module whose entire export list is npm-visible.
    expect(snapshot.starFrom).toEqual([
      './agent',
      './config',
      './errors',
      './harness',
      './rpc',
      './session',
      './session/export',
    ]);
  });

  it('really recurses: the nested modules are compared, not merely named', async () => {
    const current = await readSurface(REPO_ROOT);
    // Every star target of the barrel is recursed — an allowlist here is the very
    // blind spot F4 reported.
    expect(Object.keys(current.nested).sort()).toEqual(current.starFrom.slice().sort());
    // `OperationOutcome` is genuinely public and no edit to src/index.ts shows it.
    // Drop the recursion and this whole block reads `{}` and passes anyway — which
    // is why the mutation cases below assert red, not just shape.
    const harnessNames = nestedModule(current, './harness').named.map((entry) => entry.name);
    expect(harnessNames).toContain('OperationOutcome');
    expect(harnessNames).toContain('AgentHarness');
    expect(nestedModule(current, './harness').starFrom).toContain('./storage');
    expect(current.unresolved).toEqual([]);
  });

  it('flags a newly star-exported module', () => {
    const snapshot = { starFrom: ['./agent'], named: [] };
    const current = { starFrom: ['./agent', './tools'], named: [] };
    const result = compareSurface(current, snapshot);
    expect(result.ok).toBe(false);
    expect(result.added).toEqual(['./tools']);
  });

  it('flags a removed named export as a breaking change, not as silence', () => {
    const snapshot = { starFrom: [], named: [name('./errors', 'ByfError')] };
    const current = { starFrom: [], named: [] };
    expect(compareSurface(current, snapshot).detail).toEqual([
      'removed named export ./errors#ByfError',
    ]);
  });

  it('flags a removed type re-export too — `export type` publishes as loudly', () => {
    const snapshot = { starFrom: [], named: [name('./runtime-types', 'RuntimeConfig', true)] };
    const current = { starFrom: [], named: [] };
    expect(compareSurface(current, snapshot).detail).toEqual([
      'removed type named export ./runtime-types#RuntimeConfig',
    ]);
  });
});

describe('AC-2.4 negative self-test — the scanner must go red', () => {
  it('mutation: a new name added to an existing `export type { … } from` line', async () => {
    // The hole this closes: the named-export regex was `export\s*\{`, which cannot
    // match `export type {`, so the type-named set was never compared and this
    // mutation left the old scanner byte-for-byte green.
    const barrel = await readFile(
      path.join(REPO_ROOT, 'packages', 'agent-core', 'src', 'index.ts'),
      'utf8',
    );
    const widened = parseBarrel(
      barrel.replace(
        'export type { RuntimeConfig }',
        'export type { RuntimeConfig, BrandNewInternalType }',
      ),
    );
    // Parsed from real barrel text, not a hand-built object: that is the half that
    // would silently pass if `export type` stayed invisible to the scanner.
    expect(
      widened.named.map((entry) => entry.name),
      'the scanner still cannot see a name added to an `export type { … } from` line',
    ).toContain('BrandNewInternalType');
    const snapshot = await readSnapshot(REPO_ROOT);
    const result = compareSurface(widened, snapshot);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain('new type named export ./runtime-types#BrandNewInternalType');

    // ...but that comparison is against the *full* pin, so `detail` also carries
    // every "star target not recursed" line a root-barrel-only parse produces.
    // `toContain` therefore cannot tell whether the type-named diff is what made
    // it red. Pair the mutated parse against the unmutated one and read `added` /
    // `missing`, which are the surface delta only — the blindness diagnostics stay
    // in `detail`. If the type-named set ever stops being compared, `added` goes
    // empty even though the assertion above could still pass on noise.
    const baseline = compareSurface(widened, parseBarrel(barrel));
    expect(baseline.added).toEqual(['./runtime-types#BrandNewInternalType#type']);
    expect(baseline.missing).toEqual([]);
  });

  it('mutation: a new named export inside ./harness/index.ts goes red', async () => {
    const snapshot = await readSnapshot(REPO_ROOT);
    const current = structuredClone(snapshot);
    nestedModule(current, './harness').named.push(
      name('./agent-harness', 'InternalThingThatLeaked'),
    );
    const result = compareSurface(current, snapshot);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain(
      'via ./harness new named export ./agent-harness#InternalThingThatLeaked',
    );
  });

  it('mutation: a new star export inside ./harness/index.ts goes red', async () => {
    const snapshot = await readSnapshot(REPO_ROOT);
    const current = structuredClone(snapshot);
    nestedModule(current, './harness').starFrom.push('./some-new-internal-module');
    expect(compareSurface(current, snapshot).detail).toContain(
      "via ./harness new export * from './some-new-internal-module'",
    );
  });

  it('a recursed target that stops resolving is red, not silently skipped', async () => {
    const snapshot = await readSnapshot(REPO_ROOT);
    const current = structuredClone(snapshot);
    delete current.nested['./rpc'];
    expect(compareSurface(current, snapshot).detail).toContain(
      "star target './rpc' is not recursed — the pin is blind",
    );
  });

  it('scans a scratch tree, so the pin never depends on the caller cwd', async () => {
    await withFakeRepo(
      {
        'packages/agent-core/src/index.ts':
          "export * from './harness';\nexport type { Hidden } from './runtime-types';\n",
        'packages/agent-core/src/harness/index.ts':
          "export * from './storage';\nexport { Thing } from './thing';\n",
      },
      async (root) => {
        const surface = await readSurface(root);
        expect(surface.starFrom).toEqual(['./harness']);
        expect(surface.named).toEqual([
          { from: './runtime-types', name: 'Hidden', aliased: false, typeOnly: true },
        ]);
        expect(surface.nested['./harness']).toEqual({
          starFrom: ['./storage'],
          named: [{ from: './thing', name: 'Thing', aliased: false, typeOnly: false }],
        });
        expect(compareSurface(surface, surface).detail).toEqual([]);
      },
    );
  });
});

describe('AC-2.4 barrel parser', () => {
  it('ignores commented-out exports', () => {
    const result = parseBarrel(
      [
        "export * from './agent';",
        "// export * from './retired';",
        "/* export { Ghost } from './ghost'; */",
      ].join('\n'),
    );
    expect(result.starFrom).toEqual(['./agent']);
    expect(result.named).toEqual([]);
  });

  it('publishes the alias, not the original name', () => {
    const result = parseBarrel("export { startWebServer as startVisServer } from './x';");
    expect(result.named).toEqual([
      { from: './x', name: 'startVisServer', aliased: true, typeOnly: false },
    ]);
  });

  it('keeps local re-exports distinct from module re-exports', () => {
    const result = parseBarrel(['export { Foo };', "export { Bar } from './b';"].join('\n'));
    expect(result.named.map((n) => n.from)).toEqual(['./b', '(local)']);
  });

  it('sees `export type { … } from` and marks the names type-only', () => {
    const result = parseBarrel(
      "export type { RuntimeConfig, TelemetryClient } from './runtime-types';",
    );
    expect(result.named).toEqual([
      { from: './runtime-types', name: 'RuntimeConfig', aliased: false, typeOnly: true },
      { from: './runtime-types', name: 'TelemetryClient', aliased: false, typeOnly: true },
    ]);
  });

  it('sees an inline `type` marker inside a value export', () => {
    const result = parseBarrel("export { createByfCore, type ByfCoreOptions } from './impl';");
    expect(result.named).toEqual([
      { from: './impl', name: 'ByfCoreOptions', aliased: false, typeOnly: true },
      { from: './impl', name: 'createByfCore', aliased: false, typeOnly: false },
    ]);
  });

  it('sees `export * as ns from` as a star target', () => {
    expect(parseBarrel("export * as ns from './x';").starFrom).toEqual(['./x']);
  });

  it('resolves a directory target to its index.ts and a file target directly', () => {
    expect(moduleFile(REPO_ROOT, './harness')).toEqual(
      path.join('packages', 'agent-core', 'src', 'harness', 'index.ts'),
    );
    expect(moduleFile(REPO_ROOT, './errors')).toEqual(
      path.join('packages', 'agent-core', 'src', 'errors.ts'),
    );
    expect(moduleFile(REPO_ROOT, './definitely-not-a-module')).toBeNull();
  });
});
