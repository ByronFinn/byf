#!/usr/bin/env bun
/**
 * CLI production build (ADR 0028 / PRD-0020 R18).
 *
 * Replaces apps/cli/tsdown.config.ts as the official JS build entry.
 * - Single entry `src/main.ts` → `dist/main.mjs`
 * - Shebang + __dirname ESM shim banner
 * - Inlines workspace packages except `@byfriends/vis-server` (keeps SPA assets
 *   co-located with the published runtime dependency)
 * - Injects `__BYF_CODE_BUILT_IN_CATALOG__` from BYF_CODE_BUILT_IN_CATALOG_FILE
 * - Raw `.md` / `.yaml` via bun-lib-build loader
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

import { BUILT_IN_CATALOG_DEFINE, builtInCatalogDefine } from './built-in-catalog.mjs';

const packageRoot = path.resolve(import.meta.dirname, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const helper = path.join(repoRoot, 'build/bun-lib-build.mjs');

const defineValue = builtInCatalogDefine();

const args = [
  helper,
  './src/main.ts',
  '--shebang',
  '--banner-dirname',
  '--bundle-workspace',
  '--never-bundle',
  '@byfriends/vis-server',
  '--no-splitting',
  `--define=${BUILT_IN_CATALOG_DEFINE}=${defineValue}`,
];

const code = await new Promise((resolve, reject) => {
  const child = spawn('bun', args, {
    cwd: packageRoot,
    stdio: 'inherit',
  });
  child.on('error', reject);
  child.on('close', resolve);
});

process.exit(code === null ? 1 : code);
