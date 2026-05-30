import { mkdirSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ByfHarness } from '#/index';

let homeDir: string;

beforeEach(() => {
  homeDir = join(tmpdir(), `byf-sdk-auth-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(homeDir, { recursive: true });
});

afterEach(() => {
  rmSync(homeDir, { recursive: true, force: true });
});

describe('ByfHarness.auth', () => {
  it('can construct auth facade without host identity', () => {
    expect(() => new ByfHarness({ homeDir })).not.toThrow();
  });

  it('reports no config when no providers are configured', async () => {
    const harness = new ByfHarness({ homeDir });
    const status = await harness.auth.status('my-provider');
    expect(status.providers).toEqual([
      { providerName: 'my-provider', hasConfig: false },
    ]);
  });

  it('reports hasConfig when a provider is configured', async () => {
    await writeFile(
      join(homeDir, 'config.toml'),
      `
[providers.my-provider]
type = "openai"
api_key = "sk-test-123"
`,
    );
    const harness = new ByfHarness({ homeDir });
    const status = await harness.auth.status('my-provider');
    expect(status.providers).toEqual([
      { providerName: 'my-provider', hasConfig: true },
    ]);
  });

  it('removes provider and its models on removeProvider', async () => {
    await writeFile(
      join(homeDir, 'config.toml'),
      `
default_model = "my-provider/gpt-4"

[providers.my-provider]
type = "openai"
api_key = "sk-test"
base_url = "https://api.openai.com/v1"

[providers.other]
type = "openai-completions"
api_key = "sk-existing"

[models."my-provider/gpt-4"]
provider = "my-provider"
model = "gpt-4"
max_context_size = 128000

[models.other-default]
provider = "other"
model = "other-model"
max_context_size = 1000
`,
    );

    const harness = new ByfHarness({ homeDir });

    await harness.auth.removeProvider('my-provider');

    const config = await harness.getConfig({ reload: true });
    expect(config.defaultModel).toBeUndefined();
    expect(config.providers['my-provider']).toBeUndefined();
    expect(config.providers['other']).toMatchObject({ apiKey: 'sk-existing' });
    expect(config.models?.['my-provider/gpt-4']).toBeUndefined();
    expect(config.models?.['other-default']).toMatchObject({ provider: 'other' });
  });
});
