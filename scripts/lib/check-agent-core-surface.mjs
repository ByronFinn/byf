/**
 * AC-2.4 (PRD-0038) — the published surface of @byfriends/agent-core is a
 * reviewed list, not whatever the barrel happens to re-export.
 *
 * agent-core is on the registry, so every name the root barrel lets through is
 * a promise that costs a `major` to take back. `export *` forwards a module's
 * whole surface invisibly: a new internal export in `./agent` silently becomes
 * public API in the next release with no diff in index.ts to review. This gate
 * pins the shape of the barrel — which modules are star-exported and which
 * names are explicitly forwarded — so widening the public surface must be an
 * intentional edit to the checked-in snapshot.
 *
 * The deeper form (a full per-symbol API report) belongs to apiExtractor's
 * apiReport for the SDK, tracked separately; this file guards the part that is
 * invisible in review, and it deliberately needs no build artifacts.
 *
 * Regenerate intentionally:
 *   bun scripts/lib/check-agent-core-surface.mjs --update
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const BARREL_REL = path.join('packages', 'agent-core', 'src', 'index.ts');
const SNAPSHOT_REL = path.join('scripts', 'lib', 'agent-core-surface.json');

/**
 * Collect `export * from './m'` / `export * as ns from './m'` targets and the
 * names inside explicit `export { a, b } from './m'` blocks. Comments are
 * stripped so a commented-out export does not count as public.
 */
export function parseBarrel(source) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const starFrom = new Set();
  for (const m of code.matchAll(/export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g)) {
    starFrom.add(m[1]);
  }

  const named = [];
  for (const m of code.matchAll(/export\s*\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
    const specifier = m[2] ?? '(local)';
    for (const raw of m[1].split(',')) {
      const entry = raw.trim();
      if (entry.length === 0) continue;
      // `orig as alias` publishes the alias; the alias is the public name.
      const asMatch = /^(\S+)\s+as\s+(\S+)$/.exec(entry);
      named.push({
        from: specifier,
        name: asMatch ? asMatch[2] : entry,
        aliased: asMatch !== null,
      });
    }
  }

  const reexportTypes = new Set();
  for (const m of code.matchAll(/export\s+type\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    reexportTypes.add(m[2]);
  }

  return {
    starFrom: [...starFrom].sort(),
    named: named.sort((a, b) => `${a.from}:${a.name}`.localeCompare(`${b.from}:${b.name}`)),
    typeOnlyFrom: [...reexportTypes].sort(),
  };
}

export async function readSnapshot(repoRoot) {
  const file = path.join(repoRoot, SNAPSHOT_REL);
  return JSON.parse(await readFile(file, 'utf8'));
}

export async function readBarrel(repoRoot) {
  const source = await readFile(path.join(repoRoot, BARREL_REL), 'utf8');
  return parseBarrel(source);
}

/**
 * @returns {{ ok: boolean, missing: string[], added: string[], detail: string[] }}
 */
export function compareSurface(current, snapshot) {
  const cur = {
    stars: new Set(current.starFrom),
    names: new Set(current.named.map((n) => `${n.from}#${n.name}`)),
  };
  const snap = {
    stars: new Set(snapshot.starFrom),
    names: new Set(snapshot.named.map((n) => `${n.from}#${n.name}`)),
  };
  const detail = [];
  for (const s of cur.stars) if (!snap.stars.has(s)) detail.push(`new export * from '${s}'`);
  for (const s of snap.stars) if (!cur.stars.has(s)) detail.push(`removed export * from '${s}'`);
  for (const n of cur.names) if (!snap.names.has(n)) detail.push(`new named export ${n}`);
  for (const n of snap.names) if (!cur.names.has(n)) detail.push(`removed named export ${n}`);
  return {
    ok: detail.length === 0,
    missing: [...snap.stars].filter((s) => !cur.stars.has(s)),
    added: [...cur.stars].filter((s) => !snap.stars.has(s)),
    detail,
  };
}

export const SURFACE_SNAPSHOT_RELATIVE = SNAPSHOT_REL;
