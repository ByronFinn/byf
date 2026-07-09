/**
 * Shared platform-package table for @byfriends/cli npm optionalDependencies
 * (PRD-0020 / #220, esbuild-style).
 *
 * MVP matrix only: darwin-arm64 + linux-x64. Other platforms are deferred.
 *
 * Used by:
 *   - bin/byf.cjs (launcher)
 *   - scripts/postinstall.mjs
 *   - scripts/npm/package-platforms.mjs
 *   - unit tests
 */

/** @typedef {{ packageName: string, target: string, os: string, cpu: string, subpath: string }} PlatformPackage */

/** @type {readonly PlatformPackage[]} */
export const PLATFORM_PACKAGES = Object.freeze([
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
 * @returns {PlatformPackage | null}
 */
export function platformPackageForHost(opts = {}) {
  const platform = opts.platform ?? process.platform;
  const arch = opts.arch ?? process.arch;
  for (const pkg of PLATFORM_PACKAGES) {
    if (pkg.os === platform && pkg.cpu === arch) return pkg;
  }
  return null;
}

/**
 * @param {string} target e.g. darwin-arm64
 * @returns {PlatformPackage | null}
 */
export function platformPackageForTarget(target) {
  for (const pkg of PLATFORM_PACKAGES) {
    if (pkg.target === target) return pkg;
  }
  return null;
}

/**
 * Human-readable list of supported MVP targets.
 * @returns {string}
 */
export function supportedPlatformSummary() {
  return PLATFORM_PACKAGES.map((p) => p.target).join(', ');
}

/**
 * True when `name` is a CLI platform optionalDep package.
 * @param {string} name
 */
export function isCliPlatformPackageName(name) {
  return PLATFORM_PACKAGES.some((p) => p.packageName === name);
}
