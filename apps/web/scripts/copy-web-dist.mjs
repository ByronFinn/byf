#!/usr/bin/env node
// Copy client/dist/** into server/dist/public/ so the bundled server can serve
// the SPA out of a single deploy artifact. Mirrors apps/vis/scripts/copy-web-dist.mjs.

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, 'client', 'dist');
const dst = join(root, 'server', 'dist', 'public');

try {
  await stat(src);
} catch {
  process.stderr.write(`[copy-web-dist] source missing: ${src}\n`);
  process.stderr.write('Did you run `bun run --filter @byfriends/web-client build` first?\n');
  process.exit(1);
}

await rm(dst, { recursive: true, force: true });
await mkdir(dirname(dst), { recursive: true });
await cp(src, dst, { recursive: true });

process.stdout.write(`[copy-web-dist] copied ${src} -> ${dst}\n`);
