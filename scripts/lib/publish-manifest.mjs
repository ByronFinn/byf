/**
 * Publish-time package.json transforms shared by attw, the changesets publish
 * wrapper, and any other tooling that must see the registry-facing surface.
 *
 * Two gaps relative to a pure `bun pm pack` / `bun publish` path:
 *
 * 1. `bun pm pack` rewrites `workspace:` / `catalog:` but (as of Bun 1.3.x)
 *    does **not** merge `publishConfig` fields such as `exports` into the
 *    packed manifest. Consumers would otherwise resolve to dev-time `.ts`
 *    sources that are not in `files`.
 * 2. `@changesets/cli` only invokes `pnpm publish` or `npm publish` — never
 *    `bun publish`. With root `packageManager` no longer pinning pnpm (#221),
 *    changesets falls through to `npm publish`, which rewrites neither
 *    protocols nor publishConfig.
 *
 * `preparePublishManifest` closes both gaps so the working-tree manifest
 * matches what a correct pack/publish would ship.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { listPublishablePackages } from './list-publishable-packages.mjs';

/** Fields `publishConfig` is allowed to overlay onto the root manifest. */
export const PUBLISH_CONFIG_OVERLAY_KEYS = [
  'exports',
  'main',
  'module',
  'types',
  'typings',
  'browser',
  'bin',
  'imports',
  'type',
  'unpkg',
  'jsdelivr',
];

const SHIPPED_DEP_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const ALL_DEP_SECTIONS = [...SHIPPED_DEP_SECTIONS, 'devDependencies'];

/**
 * Merge `publishConfig` overlay keys into the root manifest (pnpm-compatible).
 * Leaves non-overlay keys (`access`, `registry`, `tag`, `provenance`, …) on
 * `publishConfig` so the publish client still sees them.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {Record<string, unknown>}
 */
export function expandPublishConfig(manifest) {
  const pc = manifest.publishConfig;
  if (pc == null || typeof pc !== 'object' || Array.isArray(pc)) {
    return manifest;
  }
  const next = { ...manifest };
  const remaining = { ...pc };
  for (const key of PUBLISH_CONFIG_OVERLAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(pc, key)) {
      next[key] = pc[key];
      delete remaining[key];
    }
  }
  if (Object.keys(remaining).length === 0) {
    delete next.publishConfig;
  } else {
    next.publishConfig = remaining;
  }
  return next;
}

/**
 * @param {string} spec
 * @param {string} depName
 * @param {{ packagesByName: Map<string, { version: string }>, catalog: Record<string, string> }} ctx
 */
function rewriteSpec(spec, depName, ctx) {
  if (spec.startsWith('workspace:')) {
    const range = spec.slice('workspace:'.length);
    const workspacePkg = ctx.packagesByName.get(depName);
    if (workspacePkg == null) {
      throw new Error(`Cannot rewrite "${spec}" for ${depName}: workspace package not found`);
    }
    const version = workspacePkg.version;
    if (range === '' || range === '*') return version;
    if (range === '^' || range === '~') return `${range}${version}`;
    // Explicit range/version after the protocol (e.g. workspace:^1.2.3, workspace:1.0.2)
    return range;
  }
  if (spec.startsWith('catalog:')) {
    const catalogKey = spec.slice('catalog:'.length);
    if (catalogKey !== '' && catalogKey !== depName) {
      // Named catalogs (`catalog:foo`) are not used in this monorepo yet.
      throw new Error(
        `Named catalog "${catalogKey}" for ${depName} is not supported by the publish rewrite helper`,
      );
    }
    const version = ctx.catalog[depName];
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(
        `Cannot rewrite "catalog:" for ${depName}: no entry in root package.json catalog`,
      );
    }
    return version;
  }
  return spec;
}

/**
 * Rewrite `workspace:` / `catalog:` in dependency sections to concrete specs.
 * Mirrors Bun's pack/publish rewrite rules for the protocols this repo uses.
 *
 * @param {Record<string, unknown>} manifest
 * @param {{ packagesByName: Map<string, { version: string }>, catalog: Record<string, string> }} ctx
 * @param {{ includeDevDependencies?: boolean }} [options]
 */
export function rewriteDependencyProtocols(manifest, ctx, options = {}) {
  const sections =
    options.includeDevDependencies === false ? SHIPPED_DEP_SECTIONS : ALL_DEP_SECTIONS;
  const next = { ...manifest };
  for (const section of sections) {
    const deps = manifest[section];
    if (deps == null || typeof deps !== 'object' || Array.isArray(deps)) continue;
    const rewritten = { ...deps };
    let changed = false;
    for (const [dep, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') continue;
      const updated = rewriteSpec(spec, dep, ctx);
      if (updated !== spec) {
        rewritten[dep] = updated;
        changed = true;
      }
    }
    if (changed) next[section] = rewritten;
  }
  return next;
}

/**
 * Full publish-facing manifest: protocol rewrite then publishConfig overlay.
 *
 * @param {Record<string, unknown>} manifest
 * @param {{ packagesByName: Map<string, { version: string }>, catalog: Record<string, string> }} ctx
 */
export function preparePublishManifest(manifest, ctx) {
  return expandPublishConfig(rewriteDependencyProtocols(manifest, ctx));
}

/**
 * Load workspace package versions + root catalog for protocol rewrite.
 * Includes private workspace packages so `workspace:*` deps on them resolve.
 *
 * @param {string} rootDir
 */
export async function loadPublishRewriteContext(rootDir) {
  const rootManifest = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const catalog =
    rootManifest.catalog != null && typeof rootManifest.catalog === 'object'
      ? /** @type {Record<string, string>} */ (rootManifest.catalog)
      : {};

  // Prefer full workspace discovery (including private) for protocol rewrite.
  const globs = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : (rootManifest.workspaces?.packages ?? []);

  const packagesByName = new Map();
  // Reuse publishable list for public packages; also scan globs for private ones.
  const publishable = await listPublishablePackages();
  for (const pkg of publishable) {
    packagesByName.set(pkg.name, { version: pkg.version, path: pkg.path });
  }

  // Scan workspace dirs for private packages not returned by listPublishablePackages.
  for (const glob of globs) {
    const dirs = await expandWorkspaceGlob(rootDir, glob);
    for (const dir of dirs) {
      let manifest;
      try {
        manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
      } catch {
        continue;
      }
      if (typeof manifest.name !== 'string') continue;
      if (packagesByName.has(manifest.name)) continue;
      packagesByName.set(manifest.name, {
        version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
        path: dir,
      });
    }
  }

  return { packagesByName, catalog, rootDir };
}

/** @param {string} rootDir @param {string} glob */
async function expandWorkspaceGlob(rootDir, glob) {
  const { readdir, stat } = await import('node:fs/promises');
  if (!glob.endsWith('/*')) {
    try {
      const st = await stat(path.join(rootDir, glob));
      if (st.isDirectory()) return [path.resolve(rootDir, glob)];
    } catch {
      return [];
    }
    return [];
  }
  const prefix = glob.slice(0, -2);
  const absPrefix = path.join(rootDir, prefix);
  let entries;
  try {
    entries = await readdir(absPrefix, { withFileTypes: true });
  } catch {
    return [];
  }
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    result.push(path.resolve(rootDir, prefix, entry.name));
  }
  return result;
}
