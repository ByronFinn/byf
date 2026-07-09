import { createRequire } from 'node:module';

import { BYF_BUILD_INFO } from '#/cli/build-info';
import { isBunStandaloneExecutable } from '#/native/standalone';

import { getEmbeddedNativeAssetManifest, getNativePackageRoot } from './native-assets';

const smokePackages = ['@mariozechner/clipboard', 'koffi'];
const nodeRequire = createRequire(import.meta.url);

function currentTarget(): string {
  return BYF_BUILD_INFO.buildTarget ?? `${process.platform}-${process.arch}`;
}

/**
 * Bun compile embeds N-API `.node` files (see scripts/compile/build.mjs).
 * Verify clipboard loads; koffi is Windows-only dead code on MVP (spike #210).
 */
function runBunStandaloneNativeSmoke(target: string): void {
  try {
    nodeRequire('@mariozechner/clipboard');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Bun standalone clipboard load failed: ${message}`, { cause: error });
  }
  process.stdout.write(`Native asset smoke passed: ${target}\n`);
  process.exit(0);
}

function runSeaNativeSmoke(): void {
  const manifest = getEmbeddedNativeAssetManifest();
  if (manifest === null) {
    throw new Error('Native asset manifest is not available.');
  }
  for (const packageName of smokePackages) {
    const packageRoot = getNativePackageRoot(packageName, { manifest });
    if (packageRoot === null) {
      throw new Error(`Native package is not available: ${packageName}`);
    }
  }
  process.stdout.write(`Native asset smoke passed: ${manifest.target}\n`);
  process.exit(0);
}

export function runNativeAssetSmokeIfRequested(): boolean {
  if (process.env['BYF_CODE_NATIVE_ASSET_SMOKE'] !== '1') return false;

  try {
    // Prefer Bun compile path (official); fall back to SEA asset tree (legacy).
    if (isBunStandaloneExecutable()) {
      runBunStandaloneNativeSmoke(currentTarget());
      return true;
    }
    runSeaNativeSmoke();
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Native asset smoke failed: ${message}\n`);
    process.exit(1);
  }
}
