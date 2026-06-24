import { readFileSync, globSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC_DIR = join(import.meta.dirname, '..', 'src');

/**
 * Acceptance criteria for Slice 3: no managed:byf OAuth references
 * remain in the oauth package source code.
 */
describe('oauth package: no upstream OAuth references', () => {
  const sourceFiles = globSync(join(SRC_DIR, '**', '*.ts'));

  it('has no auth.byf.com references', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('auth.byf.com')) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('has no managed:byf provider references', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('managed:byf')) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('has no BYF_CODE_PROVIDER_NAME references', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf-8');
      if (content.includes('BYF_CODE_PROVIDER_NAME')) {
        violations.push(file);
      }
    }
    expect(violations).toEqual([]);
  });

  it('has no OAuth device code flow files', () => {
    const oauthFiles = [
      'oauth.ts',
      'oauth-manager.ts',
      'managed-byf.ts',
      'managed-usage.ts',
      'managed-feedback.ts',
      'identity.ts',
      'constants.ts',
      'storage.ts',
      'token-state.ts',
      'toolkit.ts',
    ];
    for (const file of oauthFiles) {
      expect(sourceFiles.some((f) => f.endsWith(file))).toBe(false);
    }
  });

  it('exports API-key-based provider config functions', async () => {
    const mod = await import('../src/index');
    expect(mod.fetchModels).toBeTypeOf('function');
    expect(mod.applyProviderConfig).toBeTypeOf('function');
    expect(mod.removeProviderConfig).toBeTypeOf('function');
    expect(mod.capabilitiesForModel).toBeTypeOf('function');
    expect(mod.filterModelsByPrefix).toBeTypeOf('function');
  });

  it('does not export OAuth functions', async () => {
    const mod = (await import('../src/index')) as Record<string, unknown>;
    expect(mod['pollDeviceToken']).toBeUndefined();
    expect(mod['refreshAccessToken']).toBeUndefined();
    expect(mod['requestDeviceAuthorization']).toBeUndefined();
    expect(mod['OAuthManager']).toBeUndefined();
    expect(mod['ByfOAuthToolkit']).toBeUndefined();
    expect(mod['FileTokenStorage']).toBeUndefined();
  });
});
