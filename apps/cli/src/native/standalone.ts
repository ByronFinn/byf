/**
 * Detect packaged native binaries (Bun compile + legacy Node SEA).
 *
 * Bun 1.3.x does not expose `Bun.isStandaloneExecutable` (documented in newer
 * docs / research notes). Compiled executables report `Bun.main` under the
 * virtual `/$bunfs/` filesystem — that is the reliable 1.3.14 signal.
 */

import { createRequire } from 'node:module';

interface BunStandaloneGlobal {
  readonly isStandaloneExecutable?: boolean;
  readonly main?: string;
}

interface NodeSeaModule {
  isSea(): boolean;
}

const nodeRequire = createRequire(import.meta.url);
let cachedSea: NodeSeaModule | null | undefined;

function loadSeaModule(): NodeSeaModule | null {
  if (cachedSea !== undefined) return cachedSea;
  try {
    cachedSea = nodeRequire('node:sea') as NodeSeaModule;
  } catch {
    cachedSea = null;
  }
  return cachedSea;
}

/** True when this process is a Bun `bun build --compile` standalone executable. */
export function isBunStandaloneExecutable(): boolean {
  try {
    const bunGlobal = (globalThis as { Bun?: BunStandaloneGlobal }).Bun;
    if (bunGlobal === undefined || bunGlobal === null) return false;
    if (bunGlobal.isStandaloneExecutable === true) return true;
    const main = typeof bunGlobal.main === 'string' ? bunGlobal.main : '';
    // Bun 1.3.x: entry lives under the virtual standalone filesystem.
    return main.startsWith('/$bunfs/') || main.includes('/$bunfs/');
  } catch {
    return false;
  }
}

/**
 * True when running as a packaged native binary (Bun compile or Node SEA).
 * Prefer this for install-source / update paths.
 */
export function isNativePackagedBinary(): boolean {
  if (isBunStandaloneExecutable()) return true;
  const sea = loadSeaModule();
  if (sea === null) return false;
  try {
    return sea.isSea();
  } catch {
    return false;
  }
}
