import { access } from 'node:fs/promises';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** CLI platform optionalDep packages (PRD-0020 / #220). */
const CLI_PLATFORM_PACKAGE_NAMES = new Set([
  '@byfriends/cli-darwin-arm64',
  '@byfriends/cli-linux-x64',
]);

/**
 * Return all workspace packages that will be published to a registry.
 *
 * Discovers packages by expanding the `workspaces` globs in the root
 * package.json (Bun's source of truth since ADR 0028), then filters out
 * private packages. This replaces the former `pnpm -r ls --json` query so the
 * set no longer depends on pnpm.
 *
 * CLI platform packages (`@byfriends/cli-darwin-arm64`, `…-linux-x64`) are
 * omitted unless their staged binary exists. The main `changeset publish`
 * path (release-npm) therefore does not ship empty platform tarballs;
 * `release.yml` stages the compile binary then publishes those packages.
 *
 * @returns {Promise<Array<{ name: string, path: string, version: string }>>}
 */
export async function listPublishablePackages() {
  const rootManifest = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  const globs = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : (rootManifest.workspaces?.packages ?? []);
  const packageDirs = await expandWorkspaceGlobs(globs);
  const results = [];
  for (const dir of packageDirs) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (manifest.private === true) continue;
    if (typeof manifest.name !== 'string') continue;
    if (CLI_PLATFORM_PACKAGE_NAMES.has(manifest.name)) {
      const binaryPath = path.join(dir, 'bin', 'byf');
      try {
        await access(binaryPath);
      } catch {
        // Binary not staged — skip so empty platform packages are not published.
        continue;
      }
    }
    results.push({ name: manifest.name, path: dir, version: manifest.version ?? '0.0.0' });
  }
  return results;
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
