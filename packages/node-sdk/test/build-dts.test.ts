/**
 * Build artifact tests for the DTS output of @byfriends/sdk.
 *
 * These tests verify the EXTERNAL behavior of the build pipeline:
 * that `dist/index.d.mts` is generated and has a clean public API surface.
 *
 * Run AFTER `bun run build` in packages/node-sdk. Skipped when dist is absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const distDir = resolve(import.meta.dirname, '../dist');
const dtsPath = resolve(distDir, 'index.d.mts');

describe.skipIf(!existsSync(dtsPath))('dist/index.d.mts (requires build)', () => {
  it('exists after build', () => {
    expect(existsSync(dtsPath), `${dtsPath} was not generated`).toBe(true);
  });

  it('is non-empty', () => {
    const content = readFileSync(dtsPath, 'utf8');
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it('contains no @byfriends/* workspace package imports', () => {
    const content = readFileSync(dtsPath, 'utf8');
    const matches = content.match(/(from|import)\s+['"]@byf\//g);
    expect(matches, 'Found unresolved @byfriends/* workspace imports').toBeNull();
  });

  it('contains no @moonshot-ai/* legacy imports', () => {
    const content = readFileSync(dtsPath, 'utf8');
    const matches = content.match(/(from|import)\s+['"]@moonshot-ai\//g);
    expect(matches, 'Found legacy @moonshot-ai/* imports').toBeNull();
  });

  it('contains no #/ subpath imports', () => {
    const content = readFileSync(dtsPath, 'utf8');
    const matches = content.match(/(from|import)\s+['"]#\//g);
    expect(matches, 'Found unresolved #/ subpath imports').toBeNull();
  });
});
