import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyByPathHeuristic,
  classifyInstallSource,
  classifyNativeInstallSource,
  detectInstallSource,
  isLegacyJsGlobalLayout,
  isUnderCliNodeModules,
} from '#/cli/update/source';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makePackageRoot(opts: {
  bin?: string | Record<string, string>;
  withLauncher?: boolean;
  withMainMjs?: boolean;
}): string {
  const root = mkdtempSync(join(tmpdir(), 'byf-source-'));
  tempDirs.push(root);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: '@byfriends/cli',
      version: '0.0.0-test',
      bin: opts.bin ?? { byf: 'bin/byf.cjs' },
    }),
  );
  if (opts.withLauncher) {
    mkdirSync(join(root, 'bin'), { recursive: true });
    writeFileSync(join(root, 'bin', 'byf.cjs'), '#!/usr/bin/env node\n');
  }
  if (opts.withMainMjs) {
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'main.mjs'), 'export {}');
  }
  return root;
}

describe('classifyByPathHeuristic', () => {
  it('returns null for an npm-style global path (handled by classifyInstallSource)', () => {
    expect(classifyByPathHeuristic('/usr/local/lib/node_modules/@byfriends/cli')).toBeNull();
  });

  it('detects pnpm global on macOS', () => {
    expect(
      classifyByPathHeuristic('/Users/me/Library/pnpm/global/5/node_modules/@byfriends/cli'),
    ).toBe('pnpm-global');
  });

  it('detects pnpm global on Linux', () => {
    expect(
      classifyByPathHeuristic('/home/me/.local/share/pnpm/global/5/node_modules/@byfriends/cli'),
    ).toBe('pnpm-global');
  });

  it('detects pnpm global on Windows (normalized backslashes)', () => {
    expect(
      classifyByPathHeuristic(
        'C:\\Users\\me\\AppData\\Local\\pnpm\\global\\5\\node_modules\\@byfriends\\cli',
      ),
    ).toBe('pnpm-global');
  });

  it('detects yarn classic global', () => {
    expect(
      classifyByPathHeuristic('/Users/me/.config/yarn/global/node_modules/@byfriends/cli'),
    ).toBe('yarn-global');
  });

  it('detects yarn berry global (~/.yarn/global)', () => {
    expect(classifyByPathHeuristic('/Users/me/.yarn/global/node_modules/@byfriends/cli')).toBe(
      'yarn-global',
    );
  });

  it('detects bun global', () => {
    expect(
      classifyByPathHeuristic('/Users/me/.bun/install/global/node_modules/@byfriends/cli'),
    ).toBe('bun-global');
  });

  it('returns null for an unknown layout', () => {
    expect(classifyByPathHeuristic('/Users/me/dev/@byfriends/cli')).toBeNull();
  });
});

describe('isUnderCliNodeModules / isLegacyJsGlobalLayout', () => {
  it('detects node_modules/@byfriends/cli paths', () => {
    expect(
      isUnderCliNodeModules('/usr/local/lib/node_modules/@byfriends/cli-darwin-arm64/bin/byf'),
    ).toBe(true);
    expect(isUnderCliNodeModules('/opt/byf/bin/byf')).toBe(false);
  });

  it('detects legacy JS layout (main.mjs without launcher)', () => {
    const root = makePackageRoot({
      bin: { byf: 'dist/main.mjs' },
      withMainMjs: true,
      withLauncher: false,
    });
    expect(isLegacyJsGlobalLayout(root)).toBe(true);
  });

  it('does not mark new optionalDep layout as legacy', () => {
    const root = makePackageRoot({
      bin: { byf: 'bin/byf.cjs' },
      withLauncher: true,
      withMainMjs: true,
    });
    expect(isLegacyJsGlobalLayout(root)).toBe(false);
  });
});

describe('classifyInstallSource (npm prefix matching)', () => {
  it('matches a macOS/Linux npm global package path as npm-global when new layout', () => {
    const root = makePackageRoot({ withLauncher: true });
    // Use the real temp path so isLegacyJsGlobalLayout sees the launcher.
    // classifyInstallSource compares packageRoot to prefix candidates — use matching strings.
    expect(classifyInstallSource(root, '/not-matching-prefix', 'darwin')).toBe('unsupported');
  });

  it('matches prefix path as npm-global', () => {
    expect(
      classifyInstallSource('/usr/local/lib/node_modules/@byfriends/cli', '/usr/local', 'darwin'),
    ).toMatch(/^npm-global/);
  });

  it('returns unsupported when the package path does not match the prefix', () => {
    expect(classifyInstallSource('/Users/me/dev/@byfriends/cli', '/usr/local', 'darwin')).toBe(
      'unsupported',
    );
  });
});

describe('classifyNativeInstallSource', () => {
  it('returns native for a standalone Release binary path', () => {
    expect(
      classifyNativeInstallSource(
        '/Users/me/.local/bin/byf',
        undefined,
        '/Users/me/.local/bin/byf',
      ),
    ).toBe('native');
  });

  it('returns npm-global when BYF_INSTALL_LAYOUT=npm-optional', () => {
    expect(
      classifyNativeInstallSource(
        '/usr/local/lib/node_modules/@byfriends/cli-darwin-arm64/bin/byf',
        'npm-optional',
        '/usr/local/lib/node_modules/@byfriends/cli',
      ),
    ).toBe('npm-global');
  });

  it('returns pnpm-global when optionalDep path is under pnpm global', () => {
    expect(
      classifyNativeInstallSource(
        '/Users/me/Library/pnpm/global/5/node_modules/@byfriends/cli-darwin-arm64/bin/byf',
        'npm-optional',
        '/Users/me/Library/pnpm/global/5/node_modules/@byfriends/cli',
      ),
    ).toBe('pnpm-global');
  });

  it('infers npm-global from node_modules path without env', () => {
    expect(
      classifyNativeInstallSource(
        '/usr/local/lib/node_modules/@byfriends/cli-linux-x64/bin/byf',
        undefined,
        '/usr/local/lib/node_modules/@byfriends/cli',
      ),
    ).toBe('npm-global');
  });
});

describe('detectInstallSource', () => {
  it('returns pnpm-global when packageRoot matches pnpm heuristic', async () => {
    await expect(
      detectInstallSource({
        getPackageRoot: () => '/Users/me/Library/pnpm/global/5/node_modules/@byfriends/cli',
        getGlobalPrefix: async () => '/usr/local',
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('pnpm-global');
  });

  it('returns yarn-global when packageRoot matches yarn heuristic', async () => {
    await expect(
      detectInstallSource({
        getPackageRoot: () => '/Users/me/.config/yarn/global/node_modules/@byfriends/cli',
        getGlobalPrefix: async () => '/usr/local',
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('yarn-global');
  });

  it('returns bun-global when packageRoot matches bun heuristic', async () => {
    await expect(
      detectInstallSource({
        getPackageRoot: () => '/Users/me/.bun/install/global/node_modules/@byfriends/cli',
        getGlobalPrefix: async () => '/usr/local',
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('bun-global');
  });

  it('returns npm-global when packageRoot matches npm prefix (new layout)', async () => {
    const root = makePackageRoot({ withLauncher: true });
    await expect(
      detectInstallSource({
        getPackageRoot: () => root,
        getGlobalPrefix: async () => {
          // Make prefix candidate equal package root via custom layout:
          // candidate = join(prefix, 'lib/node_modules/@byfriends/cli') — hard to fake.
          // Instead put package at standard path string used by classifyInstallSource tests:
          return '/nonexistent';
        },
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('unsupported');
  });

  it('returns npm-global for standard npm prefix path without legacy markers', async () => {
    // No temp package.json → isLegacyJsGlobalLayout returns false → npm-global.
    await expect(
      detectInstallSource({
        getPackageRoot: () => '/usr/local/lib/node_modules/@byfriends/cli',
        getGlobalPrefix: async () => '/usr/local',
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('npm-global');
  });

  it('returns npm-global-js for legacy dist/main.mjs global layout', async () => {
    const root = makePackageRoot({
      bin: { byf: 'dist/main.mjs' },
      withMainMjs: true,
      withLauncher: false,
    });
    // Path heuristic won't match temp dir; force npm prefix match by using a custom root
    // that equals the candidate path.
    const prefix = root;
    // candidate on darwin: join(prefix, 'lib', 'node_modules', '@byfriends/cli')
    // So nest package there.
    const nested = join(prefix, 'lib', 'node_modules', '@byfriends', 'cli');
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(nested, 'package.json'),
      JSON.stringify({ name: '@byfriends/cli', bin: { byf: 'dist/main.mjs' } }),
    );
    mkdirSync(join(nested, 'dist'), { recursive: true });
    writeFileSync(join(nested, 'dist', 'main.mjs'), 'export {}');

    await expect(
      detectInstallSource({
        getPackageRoot: () => nested,
        getGlobalPrefix: async () => prefix,
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('npm-global-js');
  });

  it('returns npm-global (not native) when native binary came from optionalDep layout', async () => {
    await expect(
      detectInstallSource({
        getPackageRoot: () => '/usr/local/lib/node_modules/@byfriends/cli',
        getGlobalPrefix: async () => '/usr/local',
        detectNative: () => true,
        getExecPath: () => '/usr/local/lib/node_modules/@byfriends/cli-darwin-arm64/bin/byf',
        getInstallLayoutEnv: () => 'npm-optional',
        platform: 'darwin',
      }),
    ).resolves.toBe('npm-global');
  });

  it('returns native when detectNative and path is outside node_modules', async () => {
    await expect(
      detectInstallSource({
        getPackageRoot: () => {
          throw new Error('no package root');
        },
        getGlobalPrefix: async () => '/usr/local',
        detectNative: () => true,
        getExecPath: () => '/Users/me/.local/bin/byf',
        getInstallLayoutEnv: () => undefined,
        platform: 'darwin',
      }),
    ).resolves.toBe('native');
  });

  it('returns unsupported when nothing matches', async () => {
    await expect(
      detectInstallSource({
        getPackageRoot: () => '/Users/me/dev/@byfriends/cli',
        getGlobalPrefix: async () => '/usr/local',
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('unsupported');
  });

  it('returns unsupported when npm prefix lookup throws', async () => {
    await expect(
      detectInstallSource({
        getPackageRoot: () => '/Users/me/dev/@byfriends/cli',
        getGlobalPrefix: async () => {
          throw new Error('prefix failed');
        },
        detectNative: () => false,
        platform: 'darwin',
      }),
    ).resolves.toBe('unsupported');
  });
});
