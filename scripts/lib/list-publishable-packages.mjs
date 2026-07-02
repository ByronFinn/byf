import { execFileSync } from 'node:child_process';

/**
 * Return all workspace packages that will be published to a registry.
 *
 * Uses `pnpm -r ls --json` so the set follows `pnpm-workspace.yaml` exactly —
 * new workspace globs and new packages are picked up automatically, unlike a
 * hardcoded `packages/*` scan. Private packages are filtered out.
 *
 * @returns {Promise<Array<{ name: string, path: string, version: string }>>}
 */
export async function listPublishablePackages() {
  const stdout = execFileSync('pnpm', ['-r', 'ls', '--depth', '-1', '--json'], {
    encoding: 'utf8',
  });
  const all = JSON.parse(stdout);
  return all
    .filter((pkg) => pkg.private !== true)
    .map((pkg) => ({ name: pkg.name, path: pkg.path, version: pkg.version }));
}
