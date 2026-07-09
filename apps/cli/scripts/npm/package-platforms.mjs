#!/usr/bin/env bun
/**
 * Copy compile binaries into npm platform package dirs before publish.
 *
 * Usage (from apps/cli or via filter):
 *   BYF_CODE_BUILD_TARGET=darwin-arm64 bun scripts/npm/package-platforms.mjs
 *   bun scripts/npm/package-platforms.mjs --all   # every MVP target that has a binary
 *
 * Expects: dist-native/bin/<target>/byf (from scripts/compile/build.mjs).
 * Writes:  npm/<target>/bin/byf + syncs version from apps/cli/package.json.
 *
 * CI: release.yml matrix runs this per target after compile, then npm-publishes
 * the platform package. See docs/agents/releasing.md.
 */
import { copyFile, chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { appRoot, executableName, nativeBinPath, targetTriple } from '../native/paths.mjs';
import {
  PLATFORM_PACKAGES,
  platformPackageForTarget,
  supportedPlatformSummary,
} from './platform-packages.mjs';

const { values } = parseArgs({
  options: {
    all: { type: 'boolean', default: false },
    target: { type: 'string' },
  },
  allowPositionals: false,
});

function npmPackageDir(target) {
  return resolve(appRoot, 'npm', target);
}

async function readCliVersion() {
  const pkg = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf-8'));
  return pkg.version;
}

/**
 * @param {string} target
 * @param {string} version
 */
async function packageOne(target, version) {
  const meta = platformPackageForTarget(target);
  if (meta === null) {
    throw new Error(
      `Unknown platform target "${target}". MVP supports: ${supportedPlatformSummary()}`,
    );
  }

  const sourceBinary = nativeBinPath(target);
  try {
    await stat(sourceBinary);
  } catch {
    throw new Error(
      `Native binary not found at ${sourceBinary}. Run build:native:release (or build:native:compile) first.`,
    );
  }

  const pkgDir = npmPackageDir(target);
  const pkgJsonPath = join(pkgDir, 'package.json');
  const destBinary = join(pkgDir, meta.subpath);

  const manifest = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
  if (manifest.name !== meta.packageName) {
    throw new Error(
      `Platform package name mismatch in ${pkgJsonPath}: expected ${meta.packageName}, got ${manifest.name}`,
    );
  }

  manifest.version = version;
  await writeFile(pkgJsonPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  await mkdir(dirname(destBinary), { recursive: true });
  await copyFile(sourceBinary, destBinary);
  if (process.platform !== 'win32') {
    await chmod(destBinary, 0o755);
  }

  console.log(
    `==> Packaged ${meta.packageName}@${version}: ${sourceBinary} -> ${destBinary} (${executableName()})`,
  );
}

const version = await readCliVersion();
const targets = values.all
  ? PLATFORM_PACKAGES.map((p) => p.target)
  : [values.target ?? targetTriple()];

let failures = 0;
for (const target of targets) {
  try {
    await packageOne(target, version);
  } catch (error) {
    failures += 1;
    const message = error instanceof Error ? error.message : String(error);
    console.error(`package-platforms: ${target}: ${message}`);
  }
}

if (failures > 0) {
  process.exit(1);
}
