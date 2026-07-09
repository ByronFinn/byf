#!/usr/bin/env bun
/**
 * Apply publish-time package.json transforms, run a command, then restore.
 *
 * Why this exists (PRD-0020 / research bun-publish-workspace-protocol-rewrite-1):
 *   - Bun's built-in `bun pm pack` / `bun publish` rewrite is the primary path
 *     for stripping `workspace:` / `catalog:`.
 *   - `@changesets/cli` does not invoke Bun; it only runs `pnpm publish` or
 *     `npm publish`. The residual root `packageManager: pnpm@…` currently
 *     steers changesets to pnpm (which also rewrites). That residual is
 *     removed by the PRD-0020 breaking minor (#221 / #222).
 *   - Independently, Bun 1.3.x does not expand `publishConfig.exports` (etc.)
 *     into the packed manifest — pnpm does. Without an explicit overlay,
 *     library packages would publish dev-time `.ts` exports.
 *
 * This wrapper is the explicit gap-fill: rewrite protocols + expand
 * publishConfig on every publishable package, run the given command
 * (typically `changeset publish`), then restore the original manifests so
 * the working tree keeps monorepo protocols.
 *
 * Usage:
 *   bun scripts/with-publish-manifests.mjs changeset publish
 *   bun scripts/with-publish-manifests.mjs bunx changeset publish
 */
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPublishablePackages } from './lib/list-publishable-packages.mjs';
import { loadPublishRewriteContext, preparePublishManifest } from './lib/publish-manifest.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function restoreBackups(backups) {
  for (const { path: manifestPath, original } of backups) {
    try {
      await writeFile(manifestPath, original, 'utf8');
    } catch (error) {
      console.error(`failed to restore ${manifestPath}:`, error);
    }
  }
  if (backups.length > 0) {
    console.log(`prepare-publish: restored ${backups.length} package.json file(s)`);
  }
}

async function main() {
  const cmd = process.argv.slice(2);
  if (cmd.length === 0) {
    console.error(
      'usage: bun scripts/with-publish-manifests.mjs <command> [args...]\n' +
        'example: bun scripts/with-publish-manifests.mjs changeset publish',
    );
    process.exitCode = 2;
    return;
  }

  const packages = await listPublishablePackages();
  const ctx = await loadPublishRewriteContext(rootDir);
  /** @type {Array<{ path: string, original: string }>} */
  const backups = [];

  try {
    for (const pkg of packages) {
      const manifestPath = path.join(pkg.path, 'package.json');
      const original = await readFile(manifestPath, 'utf8');
      const manifest = JSON.parse(original);
      const prepared = preparePublishManifest(manifest, ctx);
      await writeFile(manifestPath, `${JSON.stringify(prepared, null, 2)}\n`, 'utf8');
      backups.push({ path: manifestPath, original });
      console.log(`prepare-publish: ${pkg.name}`);
    }

    const [bin, ...args] = cmd;
    const result = spawnSync(bin, args, {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
      shell: false,
    });
    if (result.error) {
      console.error(result.error);
      process.exitCode = 1;
      return;
    }
    process.exitCode = result.status ?? 1;
  } finally {
    // Must fully await restore before process teardown — do not call process.exit()
    // in the try block or async finally writes can be skipped.
    await restoreBackups(backups);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
