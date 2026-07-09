#!/usr/bin/env node
import { existsSync } from 'node:fs';
/**
 * Postinstall hook for @byfriends/cli (PRD-0020 / #220).
 *
 * Verifies that the platform optionalDependency binary resolved for this host.
 * Never fails the install (optionalDeps can be omitted or unsupported).
 *
 * Rules:
 *   - Always exits 0.
 *   - Non-global / monorepo workspace installs stay quiet unless clearly broken.
 *   - Missing optionalDep on a supported platform: print a clear warning.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEASES_INSTALL = 'https://github.com/ByronFinn/byf/releases/latest/download/install.sh';

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

function platformPackageForHost() {
  for (const pkg of PLATFORM_PACKAGES) {
    if (pkg.os === process.platform && pkg.cpu === process.arch) return pkg;
  }
  return null;
}

function supportedSummary() {
  return PLATFORM_PACKAGES.map((p) => p.target).join(', ');
}

function warn(message) {
  console.warn(`byf postinstall: ${message}`);
}

try {
  const platformPkg = platformPackageForHost();
  if (platformPkg === null) {
    // Unsupported host: optionalDeps correctly skipped by npm. Mention Release path once.
    if (process.env.npm_config_global === 'true') {
      warn(
        `no native binary package for ${process.platform}-${process.arch} ` +
          `(MVP platforms: ${supportedSummary()}). ` +
          `Try GitHub Release: curl -fsSL ${RELEASES_INSTALL} | bash`,
      );
    }
    process.exit(0);
  }

  const here = fileURLToPath(import.meta.url);
  const requireFromCli = createRequire(join(dirname(here), '..', 'package.json'));
  let packageJsonPath;
  try {
    packageJsonPath = requireFromCli.resolve(`${platformPkg.packageName}/package.json`);
  } catch {
    warn(
      `optional dependency "${platformPkg.packageName}" is not installed. ` +
        `The \`byf\` command needs it for the ${platformPkg.target} native binary. ` +
        `Reinstall without --no-optional, or use: curl -fsSL ${RELEASES_INSTALL} | bash`,
    );
    process.exit(0);
  }

  const binPath = join(dirname(packageJsonPath), platformPkg.subpath);
  if (!existsSync(binPath)) {
    warn(
      `"${platformPkg.packageName}" is present but binary missing at ${binPath}. ` +
        `Reinstall @byfriends/cli or install from GitHub Release.`,
    );
  }
} catch {
  // Never fail install.
}

process.exit(0);
