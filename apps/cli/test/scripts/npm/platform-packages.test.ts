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

  it('uses @byfriends/cli-<platform> package names', () => {
    // 平台包名 = 平台缩写（linux 曾为 -linux-x64，因 npm unpublish 烧毁改短）。
    expect(PLATFORM_PACKAGES.map((p) => p.packageName).sort()).toEqual([
      '@byfriends/cli-darwin-arm64',
      '@byfriends/cli-linux',
    ]);
    for (const pkg of PLATFORM_PACKAGES) {
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
      '@byfriends/cli-linux',
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
