#!/usr/bin/env node
/**
 * npm bin launcher for @byfriends/cli (PRD-0020 / #220).
 *
 * Resolves the platform optionalDependency package for this host, then
 * replaces this process with the compile native binary. Node is only the
 * installer-side trampoline — the real CLI is the Bun compile executable.
 *
 * Pattern: esbuild / swc / turbo optionalDependencies + JS bin shim.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');

const RELEASES_INSTALL = 'https://github.com/ByronFinn/byf/releases/latest/download/install.sh';

/** Keep in sync with scripts/npm/platform-packages.mjs (inlined so the published bin is self-contained). */
const PLATFORM_PACKAGES = Object.freeze([
  {
    packageName: '@byfriends/cli-darwin-arm64',
    target: 'darwin-arm64',
    os: 'darwin',
    cpu: 'arm64',
    subpath: 'bin/byf',
  },
  {
    packageName: '@byfriends/cli-linux-x64',
    target: 'linux-x64',
    os: 'linux',
    cpu: 'x64',
    subpath: 'bin/byf',
  },
]);

/**
 * @param {{ platform?: string, arch?: string }} [opts]
 */
function platformPackageForHost(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  for (const pkg of PLATFORM_PACKAGES) {
    if (pkg.os === platform && pkg.cpu === arch) return pkg;
  }
  return null;
}

function supportedSummary() {
  return PLATFORM_PACKAGES.map((p) => p.target).join(', ');
}

/**
 * Resolve the absolute path of the native binary for this host.
 * @param {{ platform?: string, arch?: string, requireFrom?: string }} [opts]
 * @returns {{ ok: true, binPath: string, packageName: string } | { ok: false, code: string, message: string }}
 */
function resolveNativeBinary(opts = {}) {
  const override = process.env.BYF_BINARY_PATH;
  if (typeof override === 'string' && override.length > 0) {
    if (!existsSync(override)) {
      return {
        ok: false,
        code: 'override-missing',
        message:
          `BYF_BINARY_PATH is set to "${override}" but that file does not exist.\n` +
          `Unset BYF_BINARY_PATH or point it at a valid byf binary.`,
      };
    }
    return { ok: true, binPath: override, packageName: '(BYF_BINARY_PATH)' };
  }

  const platformPkg = platformPackageForHost({
    platform: opts.platform,
    arch: opts.arch,
  });
  if (platformPkg === null) {
    const key = `${opts.platform ?? process.platform}-${opts.arch ?? process.arch}`;
    return {
      ok: false,
      code: 'unsupported-platform',
      message:
        `Unsupported platform: ${key}.\n` +
        `@byfriends/cli npm packages currently ship native binaries only for: ${supportedSummary()}.\n` +
        `Other platforms are deferred. Install from GitHub Release if available:\n` +
        `  curl -fsSL ${RELEASES_INSTALL} | bash\n` +
        `Or see https://github.com/ByronFinn/byf/releases`,
    };
  }

  // Resolve relative to this launcher so nested / hoisted optionalDeps both work.
  const requireFrom = opts.requireFrom ?? __filename;
  const req = createRequire(requireFrom);

  let packageJsonPath;
  try {
    packageJsonPath = req.resolve(`${platformPkg.packageName}/package.json`);
  } catch {
    return {
      ok: false,
      code: 'optional-dep-missing',
      message:
        `The platform package "${platformPkg.packageName}" could not be found.\n` +
        `It is an optionalDependency of @byfriends/cli and provides the native binary for ${platformPkg.target}.\n` +
        `\n` +
        `Common causes:\n` +
        `  - installed with --no-optional / --omit=optional\n` +
        `  - optional dependency install failed (network, registry, os/cpu mismatch)\n` +
        `  - unsupported or mis-detected platform\n` +
        `\n` +
        `Fix: reinstall without omitting optional deps:\n` +
        `  npm install -g @byfriends/cli\n` +
        `Or install the compile binary from GitHub Release:\n` +
        `  curl -fsSL ${RELEASES_INSTALL} | bash`,
    };
  }

  const binPath = path.join(path.dirname(packageJsonPath), platformPkg.subpath);
  if (!existsSync(binPath)) {
    return {
      ok: false,
      code: 'binary-missing',
      message:
        `Platform package "${platformPkg.packageName}" is installed but the binary is missing at:\n` +
        `  ${binPath}\n` +
        `The package may be incomplete. Reinstall @byfriends/cli or install from GitHub Release:\n` +
        `  curl -fsSL ${RELEASES_INSTALL} | bash`,
    };
  }

  return { ok: true, binPath, packageName: platformPkg.packageName };
}

function main() {
  const resolved = resolveNativeBinary();
  if (!resolved.ok) {
    console.error(`byf: ${resolved.message}`);
    process.exit(1);
  }

  const result = spawnSync(resolved.binPath, process.argv.slice(2), {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Lets `byf update` know this process came from the npm optionalDep layout
      // even though the child is a Bun compile standalone binary.
      BYF_INSTALL_LAYOUT: process.env.BYF_INSTALL_LAYOUT ?? 'npm-optional',
    },
  });

  if (result.error) {
    console.error(`byf: failed to execute ${resolved.binPath}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.signal) {
    // Mirror the signal to the parent when possible.
    process.kill(process.pid, result.signal);
    process.exit(1);
  }

  process.exit(result.status === null ? 1 : result.status);
}

// Exported for unit tests (require this file with BYF_LAUNCHER_TEST=1 to skip main).
module.exports = {
  PLATFORM_PACKAGES,
  platformPackageForHost,
  resolveNativeBinary,
  supportedSummary,
};

if (process.env.BYF_LAUNCHER_TEST !== '1' && require.main === module) {
  main();
}
