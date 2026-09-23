import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** CLI platform optionalDep packages (PRD-0020 / #220). */
const CLI_PLATFORM_PACKAGE_NAMES = new Set(['@byfriends/cli-darwin-arm64', '@byfriends/cli-linux']);

/** TypeScript source suffixes — a registry consumer cannot load these. */
const SOURCE_SUFFIX_PATTERN = /\.(?:ts|tsx|mts|cts)$/;

/**
 * AC-2.2 (PRD-0038 R2) — what makes a workspace package publishable.
 *
 * `private !== true` alone was not enough: `@byfriends/storage` declared no
 * `publishConfig`, no `files` and no `build`, and pointed `exports` straight at
 * `./src/index.ts`. Under the old rule it joined the publish set and the next
 * `changeset publish` would have shipped an unloadable bare-TypeScript tarball
 * (it is absent from the registry today, so this was a live risk, not a past one).
 *
 * A package is publishable only when **both** hold:
 *
 *   1. Explicit publication intent — a non-empty `publishConfig` object. The
 *      package must *say* it is published; being non-private is not a statement
 *      of intent. This is also where `access` / `provenance` already live, so
 *      every package in this repo's publish set already satisfies it.
 *   2. A shippable surface — the registry-facing `exports` (i.e. after the
 *      `publishConfig.exports` overlay that `scripts/lib/publish-manifest.mjs`
 *      applies at publish time) resolve to built artifacts rather than
 *      TypeScript sources; **or** the package declares `files` / a `build`
 *      script, which is how bin-only packages such as `@byfriends/cli` ship.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {{ publishable: boolean, reasons: string[] }}
 */
export function describePublishability(manifest) {
  const reasons = [];

  if (manifest.private === true) {
    return { publishable: false, reasons: ['private: true'] };
  }
  if (typeof manifest.name !== 'string' || manifest.name.length === 0) {
    return { publishable: false, reasons: ['no "name" field'] };
  }

  if (!hasExplicitPublishIntent(manifest)) {
    reasons.push(
      'no `publishConfig` — a package must declare publication intent ' +
        '(e.g. `"publishConfig": { "access": "public" }`)',
    );
  }

  const sourceExports = findSourceExportTargets(manifest);
  const hasShippableSurface = sourceExports.length === 0 && hasEffectiveExports(manifest);
  if (!hasShippableSurface) {
    if (Array.isArray(manifest.files) && manifest.files.length > 0) {
      // `files` + a build step is the bin-only shape; nothing more to demand.
    } else if (typeof manifest.scripts?.build === 'string') {
      // ditto, a build script is an explicit "there is dist output to ship" claim
    } else if (sourceExports.length > 0) {
      reasons.push(
        `publish-facing \`exports\` resolve to TypeScript sources (${sourceExports.join(', ')}) ` +
          'which a registry consumer cannot load — add `publishConfig.exports` pointing at ' +
          'built output, or declare `files`/`build`',
      );
    } else {
      reasons.push(
        'no publish-facing `exports`, no `files` and no `build` script — nothing to ship',
      );
    }
  }

  return { publishable: reasons.length === 0, reasons };
}

function hasExplicitPublishIntent(manifest) {
  const publishConfig = manifest.publishConfig;
  return (
    publishConfig != null &&
    typeof publishConfig === 'object' &&
    !Array.isArray(publishConfig) &&
    Object.keys(publishConfig).length > 0
  );
}

/** The `exports` map a consumer would see after the publishConfig overlay. */
function effectiveExports(manifest) {
  const fromPublishConfig = manifest.publishConfig?.exports;
  if (fromPublishConfig != null && typeof fromPublishConfig === 'object') {
    return fromPublishConfig;
  }
  return manifest.exports ?? null;
}

function hasEffectiveExports(manifest) {
  return collectExportTargets(effectiveExports(manifest)).length > 0;
}

/**
 * Every publish-facing `exports` target that names a TypeScript source file.
 * Declarations (`.d.ts`) and the repo's built `.mjs` / `.d.mts` outputs are not
 * sources. An empty result plus at least one target means the surface is built.
 */
function findSourceExportTargets(manifest) {
  return [
    ...new Set(collectExportTargets(effectiveExports(manifest)).filter(isTypeScriptSourceTarget)),
  ];
}

function isTypeScriptSourceTarget(target) {
  const clean = String(target).split('?')[0].split('#')[0];
  if (clean.endsWith('.d.ts') || clean.endsWith('.d.mts') || clean.endsWith('.d.cts')) {
    return false;
  }
  if (SOURCE_SUFFIX_PATTERN.test(clean)) return true;
  // Anything still addressed under `src/` is dev-time source even with a JS suffix.
  return /(^|\/)src\//.test(clean);
}

function collectExportTargets(value, out = []) {
  if (typeof value === 'string') {
    if (value.length > 0) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectExportTargets(item, out);
    return out;
  }
  if (value != null && typeof value === 'object') {
    for (const nested of Object.values(value)) collectExportTargets(nested, out);
  }
  return out;
}

/**
 * Return all workspace packages that will be published to a registry.
 *
 * Discovers packages by expanding the `workspaces` globs in the root
 * package.json (Bun's source of truth since ADR 0028), then applies the
 * AC-2.2 publishability criteria. This replaces the former `pnpm -r ls --json`
 * query so the set no longer depends on pnpm.
 *
 * CLI platform packages (`@byfriends/cli-darwin-arm64`, `…-linux-x64`) are
 * omitted unless their staged binary exists. The main `changeset publish`
 * path (release-npm) therefore does not ship empty platform tarballs;
 * `release.yml` stages the compile binary then publishes those packages.
 *
 * @returns {Promise<Array<{ name: string, path: string, version: string }>>}
 */
export async function listPublishablePackages() {
  const { included } = await inspectPublishablePackages();
  return included.map(({ name, path: pkgPath, version }) => ({ name, path: pkgPath, version }));
}

/**
 * Same discovery as {@link listPublishablePackages}, but also returns the
 * rejected packages with the reason each was rejected, so a human (or the
 * `--list` mode of `scripts/check-published-manifest.mjs`) can tell "not
 * published yet" apart from "silently dropped by a rule change".
 *
 * @returns {Promise<{
 *   included: Array<{ name: string, path: string, version: string }>,
 *   excluded: Array<{ name: string, path: string, reasons: string[] }>
 * }>}
 */
export async function inspectPublishablePackages() {
  const rootManifest = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const globs = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : (rootManifest.workspaces?.packages ?? []);
  const packageDirs = await expandWorkspaceGlobs(globs);
  /** @type {Array<{ name: string, path: string, version: string }>} */
  const included = [];
  /** @type {Array<{ name: string, path: string, reasons: string[] }>} */
  const excluded = [];
  for (const dir of packageDirs) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (typeof manifest.name !== 'string') continue;
    const { publishable, reasons } = describePublishability(manifest);
    if (publishable && CLI_PLATFORM_PACKAGE_NAMES.has(manifest.name)) {
      const binaryPath = path.join(dir, 'bin', 'byf');
      try {
        await access(binaryPath);
      } catch {
        excluded.push({
          name: manifest.name,
          path: dir,
          reasons: [
            'platform binary bin/byf not staged — skipped so empty packages are not published',
          ],
        });
        continue;
      }
    }
    if (!publishable) {
      excluded.push({ name: manifest.name, path: dir, reasons });
      continue;
    }
    included.push({ name: manifest.name, path: dir, version: manifest.version ?? '0.0.0' });
  }
  return { included, excluded };
}

async function expandWorkspaceGlobs(globs) {
  const dirs = new Set();
  for (const glob of globs) {
    for (const dir of await expandGlob(glob)) {
      dirs.add(path.resolve(rootDir, dir));
    }
  }
  return [...dirs];
}

// Minimal workspace-glob expansion: supports `<prefix>/*` (one level) and
// exact directory entries. Sufficient for this repo's workspace declarations.
async function expandGlob(glob) {
  if (!glob.endsWith('/*')) {
    try {
      const st = await stat(path.join(rootDir, glob));
      if (st.isDirectory()) return [glob];
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
    result.push(path.join(prefix, entry.name));
  }
  return result;
}
