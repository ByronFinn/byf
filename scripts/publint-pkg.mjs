#!/usr/bin/env bun
/**
 * Run `publint` against every publishable workspace package.
 *
 * Replaces the former `pnpm -r --filter '!@byfriends/monorepo' exec publint`
 * (pnpm no longer the toolchain since ADR 0028). Package discovery is shared
 * with `attw-pkg.mjs` and `check-published-manifest.mjs`.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { listPublishablePackages } from './lib/list-publishable-packages.mjs';

const publintBin = path.join(
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'),
  'node_modules',
  '.bin',
  'publint',
);

const packages = await listPublishablePackages();
let failed = false;
for (const pkg of packages) {
  const result = spawnSync(publintBin, [pkg.path, '--pack', 'bun'], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed = true;
    console.error(`publint failed for ${pkg.name}`);
  }
}
if (failed) {
  process.exit(1);
}
