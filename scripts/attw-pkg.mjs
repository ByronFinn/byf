#!/usr/bin/env node
/**
 * Validate the published layout of every ./packages/* workspace package with
 * @arethetypeswrong/cli (attw).
 *
 * Why a dedicated script instead of `attw --pack`?
 *   `attw --pack` runs `npm pack` internally, which does NOT expand
 *   `publishConfig.exports`. Our dev-time `exports` point at `.ts` sources that
 *   are excluded from the tarball by `files: ["dist"]`, so npm-packed manifests
 *   resolve to nothing. Real releases go through `pnpm publish`, which DOES
 *   expand `publishConfig`. To match the real release path we pack with pnpm
 *   first, then feed the resulting tarball to attw.
 *
 * `--ignore-rules cjs-resolves-to-esm`: every package here is `type: "module"`
 * and ships ESM only. CJS consumers must use dynamic import — that is by design,
 * not a packaging bug, so we tolerate the corresponding attw notice.
 */
import { execFileSync } from 'node:child_process';
import { access, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const attwBin = path.join(rootDir, 'node_modules', '.bin', 'attw');

async function pathExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function listPackageDirs() {
  const packagesRoot = path.join(rootDir, 'packages');
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(packagesRoot, entry.name);
    // Skip leftover directories without a manifest (e.g. stale empty packages).
    if (await pathExists(path.join(dir, 'package.json'))) {
      dirs.push(dir);
    }
  }
  return dirs;
}

async function main() {
  const packageDirs = await listPackageDirs();
  if (packageDirs.length === 0) {
    console.log('attw-pkg: no packages/* found, nothing to validate');
    return;
  }

  const staging = await mkdtemp(path.join(tmpdir(), 'byf-attw-pkg-'));
  let failures = 0;

  try {
    for (const pkgDir of packageDirs) {
      const name = path.basename(pkgDir);
      // Pack with pnpm so publishConfig is expanded into the manifest, matching
      // what `pnpm publish` actually ships.
      const packed = execFileSync('pnpm', ['pack', '--pack-destination', staging], {
        cwd: pkgDir,
        encoding: 'utf8',
      }).trim();
      const tarballPath = packed.split('\n').pop();
      if (!tarballPath) {
        console.error(`✗ ${name}: pnpm pack produced no tarball`);
        failures += 1;
        continue;
      }

      try {
        execFileSync(
          attwBin,
          [tarballPath, '--profile', 'node16', '--ignore-rules', 'cjs-resolves-to-esm'],
          { cwd: rootDir, stdio: 'inherit' },
        );
        console.log(`✓ ${name}`);
      } catch {
        console.error(`✗ ${name}: attw failed`);
        failures += 1;
      }
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(`\nattw-pkg: ${failures} package(s) failed validation`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
