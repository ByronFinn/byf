import { describe, expect, it } from 'vitest';

import {
  isCliPlatformPackageName,
  platformPackageForHost,
  platformPackageForTarget,
  PLATFORM_PACKAGES,
  supportedPlatformSummary,
} from '../../../scripts/npm/platform-packages.mjs';

describe('PLATFORM_PACKAGES (MVP matrix)', () => {
  it('lists only darwin-arm64 and linux-x64', () => {
    expect(PLATFORM_PACKAGES.map((p) => p.target).sort()).toEqual(['darwin-arm64', 'linux-x64']);
  });

  it('uses @byfriends/cli-<target> package names', () => {
    for (const pkg of PLATFORM_PACKAGES) {
      expect(pkg.packageName).toBe(`@byfriends/cli-${pkg.target}`);
      expect(pkg.subpath).toBe('bin/byf');
    }
  });
});

describe('platformPackageForHost', () => {
  it('resolves darwin arm64', () => {
    expect(platformPackageForHost({ platform: 'darwin', arch: 'arm64' })?.packageName).toBe(
      '@byfriends/cli-darwin-arm64',
    );
  });

  it('resolves linux x64', () => {
    expect(platformPackageForHost({ platform: 'linux', arch: 'x64' })?.packageName).toBe(
      '@byfriends/cli-linux-x64',
    );
  });

  it('returns null for deferred platforms', () => {
    expect(platformPackageForHost({ platform: 'darwin', arch: 'x64' })).toBeNull();
    expect(platformPackageForHost({ platform: 'linux', arch: 'arm64' })).toBeNull();
    expect(platformPackageForHost({ platform: 'win32', arch: 'x64' })).toBeNull();
  });
});

describe('platformPackageForTarget', () => {
  it('looks up by target triple', () => {
    expect(platformPackageForTarget('linux-x64')?.os).toBe('linux');
    expect(platformPackageForTarget('win32-x64')).toBeNull();
  });
});

describe('helpers', () => {
  it('supportedPlatformSummary lists MVP targets', () => {
    expect(supportedPlatformSummary()).toContain('darwin-arm64');
    expect(supportedPlatformSummary()).toContain('linux-x64');
  });

  it('isCliPlatformPackageName', () => {
    expect(isCliPlatformPackageName('@byfriends/cli-darwin-arm64')).toBe(true);
    expect(isCliPlatformPackageName('@byfriends/cli')).toBe(false);
  });
});
