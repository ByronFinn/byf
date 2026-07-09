#!/usr/bin/env bun
/**
 * Validate the published layout of every publishable workspace package with
 * @arethetypeswrong/cli (attw).
 *
 * Why a dedicated script instead of `attw --pack`?
 *   `attw --pack` runs `npm pack` internally, which does NOT expand
 *   `publishConfig.exports`. Our dev-time `exports` point at `.ts` sources that
 *   are excluded from the tarball by `files: ["dist"]`, so npm-packed manifests
 *   resolve to nothing.
 *
 *   `bun pm pack` rewrites `workspace:` / `catalog:` but (as of Bun 1.3.x) does
 *   **not** merge `publishConfig` into the packed manifest. We pack with bun,
 *   extract, apply the publishConfig overlay ourselves (same fields pnpm used
 *   to expand), then point attw at the resulting package directory.
 *
 * Package discovery is shared with `check-published-manifest.mjs` and covers
 * the whole workspace (packages/* AND apps/*), so app-shaped packages such as
 * `@byfriends/cli` and `@byfriends/vis-server` are validated too.
 *
 * `--ignore-rules cjs-resolves-to-esm`: every package here is `type: "module"`
 * and ships ESM only. CJS consumers must use dynamic import — that is by design,
 * not a packaging bug, so we tolerate the corresponding attw notice.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPublishablePackages } from './lib/list-publishable-packages.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const attwBin = path.join(rootDir, 'node_modules', '.bin', 'attw');

/** package.json fields `publishConfig` is allowed to override on publish. */
const PUBLISH_CONFIG_OVERLAY_KEYS = [
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

function expandPublishConfig(manifest) {
  const pc = manifest.publishConfig;
  if (pc == null || typeof pc !== 'object' || Array.isArray(pc)) {
    return manifest;
  }
  const next = { ...manifest };
  for (const key of PUBLISH_CONFIG_OVERLAY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(pc, key)) {
      next[key] = pc[key];
    }
  }
  delete next.publishConfig;
  return next;
}

async function isLibraryPackage(pkgDir) {
  // attw resolves the package's public entry (`.`) to type declarations.
  // A package that exposes neither `exports` nor `main` (e.g. a bin-only CLI)
  // has no public module entry, so attw has nothing to resolve — we skip it.
  // Prefer the post-publish surface when only publishConfig carries exports.
  const manifest = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  const published = expandPublishConfig(manifest);
  return published.exports != null || published.main != null;
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

      const packed = execFileSync('bun', ['pm', 'pack', '--destination', staging, '--quiet'], {
        cwd: pkgDir,
        encoding: 'utf8',
      }).trim();
      const tarballPath = packed.split('\n').pop();
      if (!tarballPath) {
        console.error(`✗ ${name}: bun pm pack produced no tarball`);
        failures += 1;
        continue;
      }

      const extractDir = path.join(staging, `${name.replace('/', '__')}-extract`);
      await rm(extractDir, { recursive: true, force: true });
      await mkdir(extractDir, { recursive: true });
      const tarResult = spawnSync('tar', ['-xzf', tarballPath, '-C', extractDir], {
        encoding: 'utf8',
      });
      if (tarResult.status !== 0) {
        console.error(`✗ ${name}: tar extract failed: ${tarResult.stderr}`);
        failures += 1;
        continue;
      }

      const packageDir = path.join(extractDir, 'package');
      const manifestPath = path.join(packageDir, 'package.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      const published = expandPublishConfig(manifest);
      await writeFile(manifestPath, `${JSON.stringify(published, null, 2)}\n`, 'utf8');

      // attw only accepts a tarball. `npm pack` produces a layout it can parse;
      // plain `tar -czf` of the same tree was rejected ("Unexpected end of JSON
      // input") under Bun 1.3 / attw 0.18 on macOS.
      let expandedTarball;
      try {
        const packedName = execFileSync('npm', ['pack', '--silent'], {
          cwd: packageDir,
          encoding: 'utf8',
        }).trim();
        expandedTarball = path.join(packageDir, packedName.split('\n').pop());
      } catch (error) {
        console.error(`✗ ${name}: npm pack of expanded package failed`);
        if (error.stdout) console.error(String(error.stdout).trim());
        if (error.stderr) console.error(String(error.stderr).trim());
        failures += 1;
        continue;
      }

      try {
        execFileSync(
          attwBin,
          [expandedTarball, '--profile', 'node16', '--ignore-rules', 'cjs-resolves-to-esm'],
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
