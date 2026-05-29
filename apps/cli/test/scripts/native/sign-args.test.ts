import { describe, expect, it } from 'vitest';

// @ts-expect-error: No type definitions for .mjs
import { buildCodesignArgs } from '../../../scripts/native/04-sign.mjs';

describe('buildCodesignArgs', () => {
  it('returns ad-hoc args for identity "-"', () => {
    const args = buildCodesignArgs({
      identity: '-',
      executable: '/path/byf',
      entitlementsPath: '/path/entitlements.plist',
      keychainPath: null,
    });
    expect(args).toEqual(['--sign', '-', '/path/byf']);
  });

  it('returns hardened-runtime args for Developer ID identity', () => {
    const args = buildCodesignArgs({
      identity: 'Developer ID Application: Byf AI (ABCD1234)',
      executable: '/path/byf',
      entitlementsPath: '/path/entitlements.plist',
      keychainPath: '/tmp/sign.keychain-db',
    });
    expect(args).toEqual([
      '--sign',
      'Developer ID Application: Byf AI (ABCD1234)',
      '--options',
      'runtime',
      '--entitlements',
      '/path/entitlements.plist',
      '--timestamp',
      '--keychain',
      '/tmp/sign.keychain-db',
      '--force',
      '/path/byf',
    ]);
  });

  it('omits --keychain when keychainPath is null but uses Developer ID otherwise', () => {
    const args = buildCodesignArgs({
      identity: 'Developer ID Application: Byf AI (ABCD1234)',
      executable: '/path/byf',
      entitlementsPath: '/path/entitlements.plist',
      keychainPath: null,
    });
    expect(args).toContain('--entitlements');
    expect(args).not.toContain('--keychain');
  });
});
