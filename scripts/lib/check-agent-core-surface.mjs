/**
 * AC-2.4 (PRD-0038) — the published surface of @byfriends/agent-core is a
 * reviewed list, not whatever the barrel happens to re-export.
 *
 * agent-core is on the registry, so every name the root barrel lets through is
 * a promise that costs a `major` to take back. `export *` forwards a module's
 * whole surface invisibly, so this gate pins three things:
 *
 *   1. which modules the root barrel star-exports;
 *   2. every explicitly forwarded name — value *and* type re-exports, because
 *      `export type { Foo } from './m'` publishes `Foo` exactly as loudly as
 *      `export { Foo } from './m'` does (the first version of this scanner read
 *      only the latter, so a whole class of publish decisions left no diff);
 *   3. the same two shapes one level down, in every star-exported module (see
 *      `recursionTargets`). Without that, `export type { … OperationOutcome … }
 *      from './agent-harness'` inside `src/harness/index.ts` is published API that
 *      no edit to `src/index.ts` ever shows.
 *
 * Widening the public surface must therefore be an intentional edit to the
 * checked-in snapshot. The deeper form (a full per-symbol API report) belongs to
 * apiExtractor's apiReport for the SDK, tracked separately; this file guards the
 * part that is invisible in review, and it deliberately needs no build artifacts.
 *
 * Regenerate intentionally:
 *   bun scripts/lib/check-agent-core-surface.mjs --update
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const PKG_SRC_REL = path.join('packages', 'agent-core', 'src');
const BARREL_REL = path.join(PKG_SRC_REL, 'index.ts');
const SNAPSHOT_REL = path.join('scripts', 'lib', 'agent-core-surface.json');

/**
 * Every star target of the root barrel is recursed into — there is no allowlist,
 * because an allowlist is exactly the blind spot this closes: the modules that
 * were left out (`./config`, `./errors`, `./session/export`) are published API
 * whose contents no edit to `src/index.ts` ever shows.
 *
 * One level only. A recursed module's own `export *` lines are recorded in the
 * snapshot (so `export * from './storage'` inside `src/harness/index.ts` is pinned
 * as a *line*) but their targets are not followed; going deeper would need a
 * visited-set fixpoint and would end up pinning most of `src/`.
 */
export function recursionTargets(barrel) {
  return barrel.starFrom;
}

/**
 * Collect `export * from './m'` / `export * as ns from './m'` targets and the
 * names inside explicit `export { … } from './m'` / `export type { … } from './m'`
 * blocks. Comments are stripped so a commented-out export does not count as public.
 */
export function parseBarrel(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const starFrom = new Set();
  for (const m of code.matchAll(/export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g)) {
    starFrom.add(m[1]);
  }

  const named = [];
  // The optional `type` keyword is the part the first version of this regex could
  // not see: `export\s*\{` never matched `export type {`.
  for (const m of code.matchAll(/export\s+(type\s+)?\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
    const declarationIsTypeOnly = m[1] !== undefined;
    const specifier = m[3] ?? '(local)';
    for (const raw of m[2].split(',')) {
      const entry = raw.trim();
      if (entry.length === 0) continue;
      // An inline marker (`export { a, type B } from './m'`) publishes a type-only
      // name even though the declaration itself exports values.
      const inlineIsTypeOnly = /^type\s+/.test(entry);
      const withoutType = inlineIsTypeOnly ? entry.replace(/^type\s+/, '').trim() : entry;
      // `orig as alias` publishes the alias; the alias is the public name.
      const asMatch = /^(\S+)\s+as\s+(\S+)$/.exec(withoutType);
      named.push({
        from: specifier,
        name: asMatch ? asMatch[2] : withoutType,
        aliased: asMatch !== null,
        typeOnly: declarationIsTypeOnly || inlineIsTypeOnly,
      });
    }
  }

  const byKey = (entry) => `${entry.from}#${entry.name}`;
  return {
    starFrom: [...starFrom].sort(),
    named: named.sort(
      (a, b) => byKey(a).localeCompare(byKey(b)) || Number(a.typeOnly) - Number(b.typeOnly),
    ),
  };
}

/** A star specifier → the source file TypeScript reads for it, or `null`. */
export function moduleFile(repoRoot, specifier) {
  const bare = specifier.replace(/^\.\//, '');
  for (const candidate of [
    path.join(PKG_SRC_REL, `${bare}.ts`),
    path.join(PKG_SRC_REL, bare, 'index.ts'),
  ]) {
    if (existsSync(path.join(repoRoot, candidate))) return candidate;
  }
  return null;
}

/**
 * The pinned document, exactly as `snapshotDocument` writes it: `starFrom`,
 * `named`, `nested`, `note`. There is no `unresolved` on disk — that is a
 * current-tree scanner diagnostic `compareSurface` reads off `current` only, and
 * recording it would pin a transient scan state as if it were an intended
 * surface.
 */
export async function readSnapshot(repoRoot) {
  const file = path.join(repoRoot, SNAPSHOT_REL);
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function readBarrel(repoRoot) {
  const source = await readFile(path.join(repoRoot, BARREL_REL), 'utf8');
  return parseBarrel(source);
}

/**
 * The whole pinned surface: the root barrel plus one level into every module it
 * star-exports (see {@link recursionTargets}).
 *
 * `unresolved` is the fail-closed half of that promise: a star target that no
 * longer maps to a file must not degrade into "nothing to compare, gate green" —
 * compareSurface turns it red.
 *
 * @returns {Promise<{starFrom: string[], named: object[],
 *   nested: Record<string, {starFrom: string[], named: object[]}>,
 *   unresolved: string[]}>}
 */
export async function readSurface(repoRoot) {
  const barrel = await readBarrel(repoRoot);
  const nested = {};
  const unresolved = [];
  for (const target of recursionTargets(barrel)) {
    const rel = moduleFile(repoRoot, target);
    if (rel === null) {
      unresolved.push(target);
      continue;
    }
    nested[target] = parseBarrel(await readFile(path.join(repoRoot, rel), 'utf8'));
  }
  return { ...barrel, nested, unresolved };
}

/**
 * Flatten one parsed module into `key → { added, removed }`, so the diff below has
 * a single rule instead of one per export shape.
 *
 * @param {{starFrom?: string[], named?: object[]}|undefined} parsed
 * @param {string} origin '' for the root barrel, `via ./harness ` further down
 */
function flatten(parsed, origin) {
  const entries = new Map();
  for (const star of parsed?.starFrom ?? []) {
    entries.set(`S${origin}${star}`, {
      added: `${origin}new export * from '${star}'`,
      removed: `${origin}removed export * from '${star}'`,
    });
  }
  for (const entry of parsed?.named ?? []) {
    const kind = entry.typeOnly ? 'type ' : '';
    entries.set(`N${origin}${entry.from}#${entry.name}${entry.typeOnly ? '#type' : ''}`, {
      added: `${origin}new ${kind}named export ${entry.from}#${entry.name}`,
      removed: `${origin}removed ${kind}named export ${entry.from}#${entry.name}`,
    });
  }
  return entries;
}

/**
 * @param {{starFrom?: string[], named?: object[], nested?: object,
 *   unresolved?: string[]}} current
 * @param {{starFrom?: string[], named?: object[], nested?: object}} snapshot
 * @returns {{ ok: boolean, missing: string[], added: string[], detail: string[] }}
 *   `missing` / `added` are the machine-readable surface delta — every differing
 *   key from the root barrel and from each recursed module, `<module>#<name>` for
 *   named exports (with a trailing `#type` marker when the export is type-only, so
 *   a value export and a type export of the same name stay distinguishable) and
 *   `'./x'`-style paths for star targets, each recursed entry prefixed with
 *   `via <module> `. `missing` is the breaking candidate list. `detail` is the same
 *   diff in human wording, plus the scanner-state "the pin is blind" diagnostics,
 *   which are not surface deltas.
 */
export function compareSurface(current, snapshot) {
  const detail = [];
  const added = [];
  const missing = [];
  const diff = (cur, snap) => {
    for (const [key, messages] of cur) {
      if (!snap.has(key)) {
        detail.push(messages.added);
        added.push(key.slice(1));
      }
    }
    for (const [key, messages] of snap) {
      if (!cur.has(key)) {
        detail.push(messages.removed);
        missing.push(key.slice(1));
      }
    }
  };

  diff(flatten(current, ''), flatten(snapshot, ''));
  const modules = new Set([
    ...Object.keys(current.nested ?? {}),
    ...Object.keys(snapshot.nested ?? {}),
  ]);
  for (const module of [...modules].sort()) {
    const origin = `via ${module} `;
    diff(flatten(current.nested?.[module], origin), flatten(snapshot.nested?.[module], origin));
  }

  // Fail closed on a blind spot: every star target is promised to be recursed. If
  // one is missing from `nested` (a scanner regression) or stops resolving (a
  // renamed module, a dropped index.ts), the gate must say so — not quietly shrink
  // the pinned set and call the result green.
  const stars = new Set(current.starFrom ?? []);
  for (const target of stars) {
    if (current.nested?.[target] === undefined && !(current.unresolved ?? []).includes(target)) {
      detail.push(`star target '${target}' is not recursed — the pin is blind`);
    }
  }
  for (const target of current.unresolved ?? []) {
    detail.push(`star target '${target}' resolves to no file, so its surface is not pinned`);
  }

  return {
    ok: detail.length === 0,
    missing,
    added,
    detail,
  };
}

export const SURFACE_SNAPSHOT_RELATIVE = SNAPSHOT_REL;

/** The snapshot document, in the shape `readSnapshot` consumes. */
export function snapshotDocument(surface) {
  return {
    starFrom: surface.starFrom,
    named: surface.named,
    nested: surface.nested,
    note:
      'AC-2.4 (PRD-0038). Pinned published surface of @byfriends/agent-core: the root ' +
      'barrel (value and type named exports) plus one level into every module it ' +
      `star-exports (${surface.nested ? Object.keys(surface.nested).join(', ') : ''}). ` +
      'Widening it must be an intentional edit here; see check-agent-core-surface.mjs. ' +
      'Regenerated by `bun scripts/lib/check-agent-core-surface.mjs --update`.',
  };
}

// `--update` re-records the snapshot from the tree. Without a main block this file
// is only a library, and the header command would be a claim nothing implements.
if (import.meta.main) {
  const repoRoot = path.resolve(import.meta.dir, '..', '..');
  if (process.argv.includes('--update')) {
    const surface = await readSurface(repoRoot);
    const file = path.join(repoRoot, SNAPSHOT_REL);
    await Bun.write(file, `${JSON.stringify(snapshotDocument(surface), null, 2)}\n`);
    const nestedCount = Object.values(surface.nested).reduce(
      (sum, parsed) => sum + parsed.starFrom.length + parsed.named.length,
      0,
    );
    console.log(
      `wrote ${path.relative(repoRoot, file)}: ${String(surface.starFrom.length)} stars, ` +
        `${String(surface.named.length)} names, ${String(nestedCount)} nested entries`,
    );
  } else {
    const result = compareSurface(await readSurface(repoRoot), await readSnapshot(repoRoot));
    for (const line of result.detail) console.error(`  - ${line}`);
    process.exit(result.ok ? 0 : 1);
  }
}
