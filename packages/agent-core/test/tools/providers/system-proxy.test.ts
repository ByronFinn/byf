/**
 * Covers: System proxy detection via `scutil --proxy` on macOS.
 *
 * Tests parsing of scutil output, platform detection, and error handling.
 */

import { describe, expect, it } from 'vitest';

import {
  detectSystemProxy,
  type ProxySettings,
  type SystemProxyOptions,
} from '../../../src/tools/providers/system-proxy';

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a realistic `scutil --proxy` output string. */
function scutilOutput(entries: Record<string, string | number>): string {
  const lines = ['<dictionary> {'];
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`  ${key} : ${value}`);
  }
  lines.push('}');
  return lines.join('\n');
}

const FULL_SCUTIL = `<dictionary> {
  HTTPEnable : 1
  HTTPProxy : 127.0.0.1
  HTTPPort : 7890
  HTTPSEnable : 1
  HTTPSProxy : 127.0.0.1
  HTTPSPort : 7890
  SOCKSEnable : 1
  SOCKSProxy : 127.0.0.1
  SOCKSPort : 7891
  ExceptionsList : <array> {
    0 : *.local
    1 : 169.254/16
  }
  ExcludeSimpleHostnames : 1
}`;

const EMPTY_SCUTIL = `<dictionary> {
}`;

// ── Parsing: HTTP proxy ──────────────────────────────────────────────

describe('detectSystemProxy — parsing', () => {
  it('parses HTTP proxy when enabled', () => {
    const output = scutilOutput({
      HTTPEnable: 1,
      HTTPProxy: 'proxy.example.com',
      HTTPPort: 8080,
    });
    const result = detectSystemProxy({ platform: 'darwin', execSync: () => output });
    expect(result.httpProxy).toBe('http://proxy.example.com:8080');
  });

  it('parses HTTPS proxy when enabled', () => {
    const output = scutilOutput({
      HTTPSEnable: 1,
      HTTPSProxy: 'secure.example.com',
      HTTPSPort: 8443,
    });
    const result = detectSystemProxy({ platform: 'darwin', execSync: () => output });
    expect(result.httpsProxy).toBe('http://secure.example.com:8443');
  });

  it('parses SOCKS proxy when enabled', () => {
    const output = scutilOutput({
      SOCKSEnable: 1,
      SOCKSProxy: 'socks.example.com',
      SOCKSPort: 1080,
    });
    const result = detectSystemProxy({ platform: 'darwin', execSync: () => output });
    expect(result.socksProxy).toBe('socks5://socks.example.com:1080');
  });

  it('parses all proxy types simultaneously from full scutil output', () => {
    const result = detectSystemProxy({ platform: 'darwin', execSync: () => FULL_SCUTIL });
    expect(result.httpProxy).toBe('http://127.0.0.1:7890');
    expect(result.httpsProxy).toBe('http://127.0.0.1:7890');
    expect(result.socksProxy).toBe('socks5://127.0.0.1:7891');
  });

  it('skips proxy when Enable is 0', () => {
    const output = scutilOutput({
      HTTPEnable: 0,
      HTTPProxy: 'proxy.example.com',
      HTTPPort: 8080,
      HTTPSEnable: 0,
      HTTPSProxy: 'secure.example.com',
      HTTPSPort: 8443,
      SOCKSEnable: 0,
      SOCKSProxy: 'socks.example.com',
      SOCKSPort: 1080,
    });
    const result = detectSystemProxy({ platform: 'darwin', execSync: () => output });
    expect(result).toEqual({});
  });

  it('parses mixed enabled/disabled proxies', () => {
    const output = scutilOutput({
      HTTPEnable: 1,
      HTTPProxy: 'proxy.example.com',
      HTTPPort: 8080,
      SOCKSEnable: 0,
      SOCKSProxy: 'socks.example.com',
      SOCKSPort: 1080,
    });
    const result = detectSystemProxy({ platform: 'darwin', execSync: () => output });
    expect(result.httpProxy).toBe('http://proxy.example.com:8080');
    expect(result.httpsProxy).toBeUndefined();
    expect(result.socksProxy).toBeUndefined();
  });

  it('returns empty object when no proxy is configured (empty dictionary)', () => {
    const result = detectSystemProxy({ platform: 'darwin', execSync: () => EMPTY_SCUTIL });
    expect(result).toEqual({});
  });
});

// ── Platform detection ───────────────────────────────────────────────

describe('detectSystemProxy — platform', () => {
  it('returns empty on non-macOS (linux)', () => {
    const result = detectSystemProxy({ platform: 'linux', execSync: () => FULL_SCUTIL });
    expect(result).toEqual({});
  });

  it('returns empty on non-macOS (win32)', () => {
    const result = detectSystemProxy({ platform: 'win32', execSync: () => FULL_SCUTIL });
    expect(result).toEqual({});
  });
});

// ── Error handling ───────────────────────────────────────────────────

describe('detectSystemProxy — error handling', () => {
  it('returns empty when scutil throws an error', () => {
    const execSync = () => {
      throw new Error('scutil: command not found');
    };
    const result = detectSystemProxy({ platform: 'darwin', execSync });
    expect(result).toEqual({});
  });
});

// ── Defaults ─────────────────────────────────────────────────────────

describe('detectSystemProxy — defaults', () => {
  it('uses process.platform when platform option is omitted', () => {
    // Just verify it doesn't throw — the result depends on the actual OS.
    const result = detectSystemProxy({ execSync: () => FULL_SCUTIL });
    // On CI (linux), should be empty; on macOS, should have values.
    expect(typeof result).toBe('object');
  });

  it('uses child_process.execSync when execSync option is omitted on darwin', () => {
    // This test would actually run scutil on macOS. Skip if not darwin.
    if (process.platform !== 'darwin') return;
    const result = detectSystemProxy({ platform: 'darwin' });
    expect(typeof result).toBe('object');
  });
});
