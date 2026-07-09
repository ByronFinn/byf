/**
 * Unit tests for publish-time package.json rewrite (R5/R14 hard gate).
 *
 * Integration coverage lives in `scripts/check-published-manifest.mjs`
 * (`bun pm pack` + residual protocol scan). These tests pin rewrite branch
 * rules so regressions fail without a full pack.
 */
import { describe, expect, it } from 'vitest';

import {
  expandPublishConfig,
  preparePublishManifest,
  rewriteDependencyProtocols,
} from './publish-manifest.mjs';

function ctx(options?: { packages?: Array<[string, string]>; catalog?: Record<string, string> }) {
  const packagesByName = new Map(
    (options?.packages ?? [['@byfriends/agent-core', '1.2.3']]).map(([name, version]) => [
      name,
      { version },
    ]),
  );
  return {
    packagesByName,
    catalog: options?.catalog ?? { zod: '^4.3.6' },
  };
}

describe('expandPublishConfig', () => {
  it('returns the same object when publishConfig is missing', () => {
    const manifest = { name: 'pkg', version: '1.0.0' };
    expect(expandPublishConfig(manifest)).toEqual(manifest);
  });

  it('ignores non-object publishConfig', () => {
    const manifest = { name: 'pkg', publishConfig: 'public' as unknown as object };
    expect(expandPublishConfig(manifest)).toEqual(manifest);
  });

  it('overlays exports/main/types and drops publishConfig when only overlay keys remain', () => {
    const manifest = {
      name: 'pkg',
      main: './src/index.ts',
      exports: { '.': './src/index.ts' },
      publishConfig: {
        main: './dist/index.js',
        exports: { '.': './dist/index.js' },
        types: './dist/index.d.ts',
      },
    };
    expect(expandPublishConfig(manifest)).toEqual({
      name: 'pkg',
      main: './dist/index.js',
      exports: { '.': './dist/index.js' },
      types: './dist/index.d.ts',
    });
  });

  it('keeps non-overlay keys (access, registry, tag, provenance) on publishConfig', () => {
    const result = expandPublishConfig({
      name: 'pkg',
      publishConfig: {
        exports: { '.': './dist/index.js' },
        access: 'public',
        provenance: true,
        tag: 'next',
      },
    });
    expect(result.exports).toEqual({ '.': './dist/index.js' });
    expect(result.publishConfig).toEqual({
      access: 'public',
      provenance: true,
      tag: 'next',
    });
  });
});

describe('rewriteDependencyProtocols', () => {
  it('rewrites workspace:* and workspace: (empty range) to the concrete package version', () => {
    const result = rewriteDependencyProtocols(
      {
        dependencies: {
          '@byfriends/agent-core': 'workspace:*',
          '@byfriends/other': 'workspace:',
        },
      },
      ctx({
        packages: [
          ['@byfriends/agent-core', '1.2.3'],
          ['@byfriends/other', '0.4.0'],
        ],
      }),
    );
    expect(result.dependencies).toEqual({
      '@byfriends/agent-core': '1.2.3',
      '@byfriends/other': '0.4.0',
    });
  });

  it('rewrites workspace:^ and workspace:~ to caret/tilde ranges', () => {
    const result = rewriteDependencyProtocols(
      {
        dependencies: {
          a: 'workspace:^',
          b: 'workspace:~',
        },
      },
      ctx({
        packages: [
          ['a', '2.0.1'],
          ['b', '3.4.5'],
        ],
      }),
    );
    expect(result.dependencies).toEqual({
      a: '^2.0.1',
      b: '~3.4.5',
    });
  });

  it('keeps an explicit range after workspace: as-is', () => {
    const result = rewriteDependencyProtocols(
      {
        dependencies: {
          a: 'workspace:^1.2.3',
          b: 'workspace:1.0.2',
        },
      },
      ctx({
        packages: [
          ['a', '9.9.9'],
          ['b', '9.9.9'],
        ],
      }),
    );
    expect(result.dependencies).toEqual({
      a: '^1.2.3',
      b: '1.0.2',
    });
  });

  it('throws when workspace: target is missing from the monorepo map', () => {
    expect(() =>
      rewriteDependencyProtocols(
        { dependencies: { '@missing/pkg': 'workspace:*' } },
        ctx({ packages: [] }),
      ),
    ).toThrow(/workspace package not found/);
  });

  it('rewrites bare catalog: via the root catalog entry for the dep name', () => {
    const result = rewriteDependencyProtocols(
      { dependencies: { zod: 'catalog:' } },
      ctx({ catalog: { zod: '^4.3.6' } }),
    );
    expect(result.dependencies).toEqual({ zod: '^4.3.6' });
  });

  it('rewrites catalog:<same-name> the same as bare catalog:', () => {
    const result = rewriteDependencyProtocols(
      { dependencies: { zod: 'catalog:zod' } },
      ctx({ catalog: { zod: '^4.0.0' } }),
    );
    expect(result.dependencies).toEqual({ zod: '^4.0.0' });
  });

  it('rejects named catalogs (catalog:foo)', () => {
    expect(() =>
      rewriteDependencyProtocols(
        { dependencies: { zod: 'catalog:default' } },
        ctx({ catalog: { zod: '^4.3.6' } }),
      ),
    ).toThrow(/Named catalog "default"/);
  });

  it('throws when catalog has no entry for the dependency', () => {
    expect(() =>
      rewriteDependencyProtocols({ dependencies: { lodash: 'catalog:' } }, ctx({ catalog: {} })),
    ).toThrow(/no entry in root package\.json catalog/);
  });

  it('leaves non-protocol specs unchanged', () => {
    const deps = {
      chalk: '^5.0.0',
      local: 'file:../local',
    };
    const result = rewriteDependencyProtocols({ dependencies: deps }, ctx());
    expect(result.dependencies).toEqual(deps);
  });

  it('rewrites peerDependencies and optionalDependencies by default', () => {
    const result = rewriteDependencyProtocols(
      {
        peerDependencies: { '@byfriends/agent-core': 'workspace:^' },
        optionalDependencies: { zod: 'catalog:' },
      },
      ctx({
        packages: [['@byfriends/agent-core', '1.0.0']],
        catalog: { zod: '^4.3.6' },
      }),
    );
    expect(result.peerDependencies).toEqual({ '@byfriends/agent-core': '^1.0.0' });
    expect(result.optionalDependencies).toEqual({ zod: '^4.3.6' });
  });

  it('rewrites devDependencies unless includeDevDependencies is false', () => {
    const withDev = rewriteDependencyProtocols(
      { devDependencies: { '@byfriends/agent-core': 'workspace:*' } },
      ctx(),
    );
    expect(withDev.devDependencies).toEqual({ '@byfriends/agent-core': '1.2.3' });

    const withoutDev = rewriteDependencyProtocols(
      { devDependencies: { '@byfriends/agent-core': 'workspace:*' } },
      ctx(),
      { includeDevDependencies: false },
    );
    expect(withoutDev.devDependencies).toEqual({ '@byfriends/agent-core': 'workspace:*' });
  });
});

describe('preparePublishManifest', () => {
  it('rewrites protocols then applies publishConfig overlay', () => {
    const result = preparePublishManifest(
      {
        name: '@byfriends/example',
        version: '0.1.0',
        main: './src/index.ts',
        dependencies: {
          '@byfriends/agent-core': 'workspace:^',
          zod: 'catalog:',
        },
        publishConfig: {
          main: './dist/index.js',
          exports: { '.': './dist/index.js' },
          access: 'public',
        },
      },
      ctx({
        packages: [['@byfriends/agent-core', '2.0.0']],
        catalog: { zod: '^4.3.6' },
      }),
    );

    expect(result).toEqual({
      name: '@byfriends/example',
      version: '0.1.0',
      main: './dist/index.js',
      exports: { '.': './dist/index.js' },
      dependencies: {
        '@byfriends/agent-core': '^2.0.0',
        zod: '^4.3.6',
      },
      publishConfig: {
        access: 'public',
      },
    });
  });
});
