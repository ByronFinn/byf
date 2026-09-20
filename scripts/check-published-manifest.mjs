#!/usr/bin/env node
/**
 * Verify that packed manifests contain no workspace-only protocols.
 *
 * Primary rewrite path (PRD-0020 / ADR 0028): `bun pm pack` / `bun publish`
 * strip `workspace:` and `catalog:` into concrete versions. Bare `npm pack` /
 * `npm publish` do NOT — they ship the manifest verbatim, so `workspace:^`
 * ends up on the registry and breaks installs (EUNSUPPORTEDPROTOCOL).
 *
 * `@changesets/cli` never calls Bun; it only runs `pnpm publish` or
 * `npm publish`. The real publish entrypoint therefore wraps changesets with
 * `scripts/with-publish-manifests.mjs` (protocol rewrite + publishConfig
 * overlay). This script is the independent hard gate: for each non-private
 * workspace package we `bun pm pack`, extract the tarball, and reject any
 * `workspace:` / `catalog:` left in the shipped sections (`dependencies`,
 * `peerDependencies`, `optionalDependencies`).
 *
 * Note: Bun 1.3.x rewrites protocols but does not merge `publishConfig`
 * exports/main/… into the packed manifest — that overlay is handled by
 * `scripts/lib/publish-manifest.mjs` (attw + the publish wrapper), not here.
 *
 * The set itself is decided by `describePublishability()` in
 * `scripts/lib/list-publishable-packages.mjs` (AC-2.2 / PRD-0038): a package must
 * carry an explicit `publishConfig` **and** either non-source publish-facing
 * `exports` or `files`/`build`. Run with `--list` to print that set plus the
 * rejection reason for every other workspace package without packing anything.
 *
 * Tarball extraction uses the system `tar` (bsdtar on macOS, GNU tar on Linux)
 * rather than a Node tar library, so the script has no runtime dependencies.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  inspectPublishablePackages,
  listPublishablePackages,
} from './lib/list-publishable-packages.mjs';

const PROTOCOL_PATTERNS = [/^workspace:/, /^catalog:/];
const SHIPPED_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * `bun scripts/check-published-manifest.mjs --list`
 *
 * Print the AC-2.2 publish set and the reason every other workspace package was
 * left out. Read-only — no packing, no network — so it is safe to run as the
 * first line of a release job or when a human asks "what would we ship?".
 */
async function printPublishSet() {
  const { included, excluded } = await inspectPublishablePackages();
  console.log(`publish set (${String(included.length)} package(s)):`);
  for (const pkg of included.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${pkg.name}@${pkg.version}  ${pkg.path}`);
  }
  console.log(`\nnot published (${String(excluded.length)} package(s)):`);
  for (const pkg of excluded.sort((a, b) => a.name.localeCompare(b.name))) {
    console.log(`  ${pkg.name}`);
    for (const reason of pkg.reasons) console.log(`      - ${reason}`);
  }
}

function findResiduals(manifest) {
  const residuals = [];
  for (const section of SHIPPED_SECTIONS) {
    const deps = manifest[section];
    if (!deps || typeof deps !== 'object') continue;
    for (const [dep, spec] of Object.entries(deps)) {
      if (typeof spec !== 'string') continue;
      if (PROTOCOL_PATTERNS.some((re) => re.test(spec))) {
        residuals.push({ section, dep, spec });
      }
    }
  }
  return residuals;
}

function extractTarball(tarballPath, destDir) {
  // -xzf works on both bsdtar (macOS) and GNU tar (Linux).
  const result = spawnSync('tar', ['-xzf', tarballPath, '-C', destDir], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`tar extraction failed (status ${result.status}): ${result.stderr}`);
  }
}

async function main() {
  if (process.argv.includes('--list')) {
    await printPublishSet();
    return;
  }

  const packages = await listPublishablePackages();
  if (packages.length === 0) {
    console.log('check-published-manifest: no publishable packages found');
    return;
  }

  const staging = await mkdtemp(path.join(tmpdir(), 'byf-pubcheck-'));
  let failures = 0;

  try {
    for (const pkg of packages) {
      let packed;
      try {
        packed = execFileSync('bun', ['pm', 'pack', '--destination', staging, '--quiet'], {
          cwd: pkg.path,
          encoding: 'utf8',
        }).trim();
      } catch (error) {
        console.error(`✗ ${pkg.name}: bun pm pack failed`);
        if (error.stdout) console.error(String(error.stdout).trim());
        if (error.stderr) console.error(String(error.stderr).trim());
        failures += 1;
        continue;
      }
      const tarballPath = packed.split('\n').pop();
      if (!tarballPath) {
        console.error(`✗ ${pkg.name}: bun pm pack produced no tarball`);
        failures += 1;
        continue;
      }

      const safeName = pkg.name.replace(/[^a-zA-Z0-9_-]/g, '-');
      const extractDir = await mkdtemp(path.join(staging, `${safeName}-`));
      try {
        extractTarball(tarballPath, extractDir);
        const manifestPath = path.join(extractDir, 'package', 'package.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

        const residuals = findResiduals(manifest);
        if (residuals.length > 0) {
          console.error(`✗ ${pkg.name}: workspace-only protocol leaked into published manifest`);
          for (const { section, dep, spec } of residuals) {
            console.error(`    ${section}.${dep} = "${spec}"`);
          }
          failures += 1;
        } else {
          console.log(`✓ ${pkg.name}`);
        }
      } finally {
        await rm(extractDir, { recursive: true, force: true });
      }
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  if (failures > 0) {
    console.error(
      `\ncheck-published-manifest: ${failures} package(s) would ship workspace:/catalog: specifiers`,
    );
    console.error(
      'These are rewritten by `bun pm pack`/`bun publish` and by `scripts/with-publish-manifests.mjs`, not by bare `npm publish`.',
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
