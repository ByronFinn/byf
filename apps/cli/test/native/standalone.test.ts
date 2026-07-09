/**
 * Unit tests for Bun-compile / SEA standalone detection.
 *
 * update-source and native asset paths treat this as the source of truth for
 * `native` vs other install layouts. Higher-level suites stub `detectNative`,
 * so these cases pin the /$bunfs/ heuristic and future `Bun.isStandaloneExecutable`.
 *
 * `globalThis.Bun` is non-configurable under the Bun runtime, so branch rules
 * are tested via pure `detectBunStandalone`; process wrappers are smoke-checked.
 */
import { describe, expect, it } from 'vitest';

import {
  detectBunStandalone,
  isBunStandaloneExecutable,
  isNativePackagedBinary,
} from '#/native/standalone';

describe('detectBunStandalone', () => {
  it('returns false when Bun is missing or null', () => {
    expect(detectBunStandalone(undefined)).toBe(false);
    expect(detectBunStandalone(null)).toBe(false);
  });

  it('returns true when isStandaloneExecutable is true (future API)', () => {
    expect(detectBunStandalone({ isStandaloneExecutable: true, main: '/Users/me/byf' })).toBe(true);
  });

  it('returns false when isStandaloneExecutable is false and main is normal', () => {
    expect(detectBunStandalone({ isStandaloneExecutable: false, main: '/Users/me/byf' })).toBe(
      false,
    );
  });

  it('returns true when main starts with /$bunfs/ (Bun 1.3.x compile)', () => {
    expect(detectBunStandalone({ main: '/$bunfs/root/apps/cli/src/main.ts' })).toBe(true);
  });

  it('returns true when main contains /$bunfs/ mid-path', () => {
    expect(detectBunStandalone({ main: '/private/var/$bunfs/root/entry.js' })).toBe(true);
  });

  it('returns false for a normal main path without $bunfs', () => {
    expect(detectBunStandalone({ main: '/Users/dev/byf/apps/cli/src/main.ts' })).toBe(false);
  });

  it('returns false when main is missing or not a string', () => {
    expect(detectBunStandalone({})).toBe(false);
    expect(detectBunStandalone({ main: undefined })).toBe(false);
  });

  it('prefers isStandaloneExecutable=true over a non-$bunfs main', () => {
    expect(
      detectBunStandalone({
        isStandaloneExecutable: true,
        main: '/not/a/standalone/path',
      }),
    ).toBe(true);
  });
});

describe('isBunStandaloneExecutable / isNativePackagedBinary (process wrappers)', () => {
  it('isBunStandaloneExecutable is false under bun test (not a compile binary)', () => {
    expect(isBunStandaloneExecutable()).toBe(false);
  });

  it('isNativePackagedBinary is false under bun test (not compile, not SEA)', () => {
    expect(isNativePackagedBinary()).toBe(false);
  });
});
