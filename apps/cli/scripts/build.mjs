#!/usr/bin/env bun
/**
 * CLI production build (ADR 0028 / PRD-0020 R18).
 *
 * Replaces apps/cli/tsdown.config.ts as the official JS build entry.
 * - Single entry `src/main.ts` → `dist/main.mjs`
 * - Shebang banner
 * - Inlines workspace packages except `@byfriends/web-server` (keeps SPA assets
 *   co-located with the published runtime dependency that serves them; the
 *   former `@byfriends/vis-server` never-bundle entry was dropped together with
 *   the package — PRD-0038 R5 / AC-5.6)
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
  '--bundle-workspace',
  '--never-bundle',
  '@byfriends/web-server',
  // Bun is the only official runtime (ADR-0028 / 库运行时契约). The default
  // `node` target pulls undici's webidl polyfill into the bundle, which throws
  // at import time under Bun (`new CacheStorage`), so `bun dist/main.mjs` —
  // i.e. `dev:prod` — could not start at all. Same reason web-server already
  // passes `--target bun`; see apps/web/AGENTS.md.
  '--target',
  'bun',
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
