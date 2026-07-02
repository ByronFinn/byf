#!/usr/bin/env node
/**
 * Validate the published layout of every publishable workspace package with
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
 * Package discovery is shared with `check-published-manifest.mjs` and covers
 * the whole workspace (packages/* AND apps/*), so app-shaped packages such as
 * `@byfriends/cli` and `@byfriends/vis-server` are validated too.
 *
 * `--ignore-rules cjs-resolves-to-esm`: every package here is `type: "module"`
 * and ships ESM only. CJS consumers must use dynamic import — that is by design,
 * not a packaging bug, so we tolerate the corresponding attw notice.
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPublishablePackages } from './lib/list-publishable-packages.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const attwBin = path.join(rootDir, 'node_modules', '.bin', 'attw');

async function isLibraryPackage(pkgDir) {
  // attw resolves the package's public entry (`.`) to type declarations.
  // A package that exposes neither `exports` nor `main` (e.g. a bin-only CLI)
  // has no public module entry, so attw has nothing to resolve — we skip it.
  const manifest = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  return manifest.exports != null || manifest.main != null;
}

async function main() {
  const packages = await listPublishablePackages();
  if (packages.length === 0) {
    console.log('attw-pkg: no publishable packages found, nothing to validate');
    return;
  }

  const staging = await mkdtemp(path.join(tmpdir(), 'byf-attw-pkg-'));
  let failures = 0;

  try {
    for (const pkg of packages) {
      const { name, path: pkgDir } = pkg;
      if (!(await isLibraryPackage(pkgDir))) {
        console.log(`⏭ ${name} (no exports/main — bin-only package, skipped)`);
        continue;
      }
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
