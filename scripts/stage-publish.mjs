#!/usr/bin/env bun
/**
 * Stage-publish: pack → `npm stage publish` (approve manually).
 *
 * Replaces `changeset publish` when the npm token is gated by
 * E_STAGE_REQUIRED (npm staging policy). The wrapper reuses the same
 * manifest-preparation libraries as `with-publish-manifests.mjs` so
 * workspace:/catalog: specifiers are rewritten and publishConfig is
 * expanded before packing.
 *
 * Usage:
 *   bun scripts/stage-publish.mjs
 *
 * Required env:
 *   NPM_TOKEN  – npm automation token with staging publish permission
 *
 * After running, manually approve the staged packages via npm website.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listPublishablePackages } from './lib/list-publishable-packages.mjs';
import { loadPublishRewriteContext, preparePublishManifest } from './lib/publish-manifest.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    shell: false,
    ...opts,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
  };
}

async function main() {
  const token = process.env.NPM_TOKEN || process.env.NODE_AUTH_TOKEN;
  if (!token) {
    console.error('stage-publish: NPM_TOKEN or NODE_AUTH_TOKEN is required');
    process.exitCode = 1;
    return;
  }

  const packages = await listPublishablePackages();
  const ctx = await loadPublishRewriteContext(rootDir);
  /** @type {Array<{ path: string, original: string }>} */
  const backups = [];

  const stageDir = await mkdtemp(path.join(tmpdir(), 'byf-stage-'));

  try {
    {
      for (const pkg of packages) {
        const manifestPath = path.join(pkg.path, 'package.json');
        const original = await readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(original);
        const prepared = preparePublishManifest(manifest, ctx);
        await writeFile(manifestPath, `${JSON.stringify(prepared, null, 2)}\n`, 'utf8');
        backups.push({ path: manifestPath, original });
        console.log(`prepare-publish: ${pkg.name}`);
      }

      const staged = [];
      for (const pkg of packages) {
        console.log(`\n── packing ${pkg.name}@${pkg.version}`);
        const packResult = run('npm', ['pack', pkg.path, '--pack-destination', stageDir]);
        if (packResult.status !== 0) {
          console.error(`pack failed for ${pkg.name}:`, packResult.stderr);
          process.exitCode = 1;
          return;
        }

        let tarballName = '';
        try {
          const packInfo = JSON.parse(packResult.stdout);
          tarballName = Array.isArray(packInfo) ? packInfo[0].filename : packInfo.filename;
        } catch {
          const lines = packResult.stdout.trim().split('\n');
          tarballName = lines[lines.length - 1];
        }
        const tarballPath = path.join(stageDir, tarballName);
        console.log(`  packed: ${tarballName}`);

        console.log(`── staging ${pkg.name}@${pkg.version}`);
        const stageResult = run('npm', [
          'stage',
          'publish',
          tarballPath,
          '--access',
          'public',
          '--tag',
          'latest',
        ]);
        const stageOutput = stageResult.stdout + stageResult.stderr;
        console.log(stageOutput.trim());
        if (stageResult.status !== 0) {
          if (/already staged|E409|E\.Stage|Cannot stage/.test(stageOutput)) {
            console.log(`  already staged/published, skipping`);
          } else {
            console.error(`stage publish failed for ${pkg.name}:`, stageOutput);
            process.exitCode = 1;
            return;
          }
        } else {
          staged.push({ name: pkg.name, version: pkg.version });
        }
      }

      console.log('\n==========================================');
      console.log(`${staged.length} package(s) staged successfully.`);
      console.log('');
      console.log('Please approve manually via npm website:');
      for (const pkg of staged) {
        console.log(`  https://www.npmjs.com/package/${pkg.name}`);
      }
      console.log('==========================================');
    }
  } finally {
    for (const { path: manifestPath, original } of backups) {
      await writeFile(manifestPath, original, 'utf8');
    }
    if (backups.length > 0) {
      console.log(`prepare-publish: restored ${backups.length} package.json file(s)`);
    }
    await rm(stageDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
