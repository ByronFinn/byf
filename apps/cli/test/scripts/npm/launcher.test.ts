import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

// Load launcher without running main().
process.env.BYF_LAUNCHER_TEST = '1';
const require = createRequire(import.meta.url);
const launcherPath = join(import.meta.dirname, '../../../bin/byf.cjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveNativeBinary, platformPackageForHost } = require(launcherPath) as {
  resolveNativeBinary: (opts?: {
    platform?: string;
    arch?: string;
    requireFrom?: string;
  }) =>
    | { ok: true; binPath: string; packageName: string }
    | { ok: false; code: string; message: string };
  platformPackageForHost: (opts?: {
    platform?: string;
    arch?: string;
  }) => { packageName: string; target: string } | null;
};

const tempDirs: string[] = [];

afterEach(() => {
  delete process.env.BYF_BINARY_PATH;
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeFakePlatformTree(packageName: string, withBinary: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'byf-launcher-'));
  tempDirs.push(root);
  const pkgDir = join(root, 'node_modules', ...packageName.split('/'));
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: packageName, version: '0.0.0-test' }),
  );
  if (withBinary) {
    const binDir = join(pkgDir, 'bin');
    mkdirSync(binDir, { recursive: true });
    const binPath = join(binDir, 'byf');
    writeFileSync(binPath, '#!/bin/sh\necho fake\n');
    chmodSync(binPath, 0o755);
  }
  // requireFrom must be a file path under root so createRequire walks node_modules.
  const requireFrom = join(root, 'index.js');
  writeFileSync(requireFrom, 'module.exports = {}');
  return requireFrom;
}

describe('platformPackageForHost (launcher)', () => {
  it('matches MVP hosts only', () => {
    expect(platformPackageForHost({ platform: 'darwin', arch: 'arm64' })?.target).toBe(
      'darwin-arm64',
    );
    expect(platformPackageForHost({ platform: 'win32', arch: 'x64' })).toBeNull();
  });
});

describe('resolveNativeBinary', () => {
  it('returns unsupported-platform for deferred hosts', () => {
    const result = resolveNativeBinary({ platform: 'win32', arch: 'x64' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unsupported-platform');
    expect(result.message).toContain('Unsupported platform');
    expect(result.message).toContain('GitHub Release');
  });

  it('returns optional-dep-missing when package is not installed', () => {
    const requireFrom = makeFakePlatformTree('@byfriends/cli-other', false);
    const result = resolveNativeBinary({
      platform: 'darwin',
      arch: 'arm64',
      requireFrom,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('optional-dep-missing');
    expect(result.message).toContain('@byfriends/cli-darwin-arm64');
    expect(result.message).toContain('--no-optional');
  });

  it('returns binary-missing when package exists without bin/byf', () => {
    const requireFrom = makeFakePlatformTree('@byfriends/cli-darwin-arm64', false);
    const result = resolveNativeBinary({
      platform: 'darwin',
      arch: 'arm64',
      requireFrom,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('binary-missing');
  });

  it('resolves bin path when optionalDep is present', () => {
    const requireFrom = makeFakePlatformTree('@byfriends/cli-darwin-arm64', true);
    const result = resolveNativeBinary({
      platform: 'darwin',
      arch: 'arm64',
      requireFrom,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.packageName).toBe('@byfriends/cli-darwin-arm64');
    expect(
      result.binPath.endsWith(`${join('bin', 'byf')}`) || result.binPath.endsWith('bin/byf'),
    ).toBe(true);
  });

  it('honors BYF_BINARY_PATH override', () => {
    const root = mkdtempSync(join(tmpdir(), 'byf-override-'));
    tempDirs.push(root);
    const bin = join(root, 'custom-byf');
    writeFileSync(bin, '#!/bin/sh\n');
    chmodSync(bin, 0o755);
    process.env.BYF_BINARY_PATH = bin;
    const result = resolveNativeBinary({ platform: 'win32', arch: 'x64' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.binPath).toBe(bin);
  });

  it('errors when BYF_BINARY_PATH points nowhere', () => {
    process.env.BYF_BINARY_PATH = join(tmpdir(), 'does-not-exist-byf-binary');
    const result = resolveNativeBinary();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('override-missing');
  });
});
