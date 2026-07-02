#!/usr/bin/env node
/**
 * Verify that published manifests contain no pnpm-only protocols.
 *
 * `pnpm publish` (and therefore `changeset publish`) rewrites `workspace:` and
 * `catalog:` specifiers into concrete versions before publishing. `npm publish`
 * does NOT — it ships the manifest verbatim, so `workspace:^` ends up on the
 * registry and breaks installs for everyone using npm (EUNSUPPORTEDPROTOCOL).
 *
 * This is the guardrail that makes such a regression fail loudly before it
 * reaches a registry. For each non-private workspace package we `pnpm pack`
 * (which expands `publishConfig` the same way `pnpm publish` does), extract the
 * tarball, and reject any `workspace:` / `catalog:` specifier left in the
 * sections that actually ship: `dependencies`, `peerDependencies`, and
 * `optionalDependencies`. `devDependencies` are stripped from tarballs, so we
 * do not check them.
 *
 * Tarball extraction uses the system `tar` (bsdtar on macOS, GNU tar on Linux)
 * rather than a Node tar library, so the script has no runtime dependencies.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { listPublishablePackages } from './lib/list-publishable-packages.mjs';

const PROTOCOL_PATTERNS = [/^workspace:/, /^catalog:/];
const SHIPPED_SECTIONS = ['dependencies', 'peerDependencies', 'optionalDependencies'];

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
        packed = execFileSync('pnpm', ['pack', '--pack-destination', staging], {
          cwd: pkg.path,
          encoding: 'utf8',
        }).trim();
      } catch (error) {
        console.error(`✗ ${pkg.name}: pnpm pack failed`);
        if (error.stdout) console.error(String(error.stdout).trim());
        if (error.stderr) console.error(String(error.stderr).trim());
        failures += 1;
        continue;
      }
      const tarballPath = packed.split('\n').pop();
      if (!tarballPath) {
        console.error(`✗ ${pkg.name}: pnpm pack produced no tarball`);
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
          console.error(`✗ ${pkg.name}: pnpm-only protocol leaked into published manifest`);
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
      'These are rewritten only by `pnpm publish`/`changeset publish`, not by `npm publish`.',
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
