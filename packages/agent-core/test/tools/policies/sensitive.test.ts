import { describe, expect, it } from 'vitest';

import { isSensitiveFile } from '../../../src/tools/policies/sensitive';

describe('isSensitiveFile', () => {
  it('flags base .env files in any directory', () => {
    for (const path of ['.env', '/app/.env', 'project/.env']) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('flags .env.<environment> variants', () => {
    for (const path of ['.env.local', '.env.production', '/app/.env.staging']) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('flags cloud credential file locations', () => {
    for (const path of [
      '/home/user/.aws/credentials',
      '/home/user/.gcp/credentials',
      '.aws/credentials',
      '.gcp/credentials',
      'credentials',
    ]) {
      expect(isSensitiveFile(path), path).toBe(true);
    }
  });

  it('does not flag normal source / config files or env exemplars', () => {
    // Mirrors the py parametrization exactly. `.envrc`, `environment.py`,
    // `.env_example`, `server.key.example`, `id_rsa.pub`, `credentials.json`
    // (basename is `credentials.json`, not the bare `credentials` token) must
    // all pass through.
    for (const path of [
      'app.py',
      'config.yml',
      'README.md',
      'package.json',
      'server.key.example',
      'id_rsa.pub',
      'credentials.json',
      '.envrc',
      'environment.py',
      '.env_example',
      '.env.example',
      '.env.sample',
      '.env.template',
      '/app/.env.example',
    ]) {
      expect(isSensitiveFile(path), path).toBe(false);
    }
  });
});
