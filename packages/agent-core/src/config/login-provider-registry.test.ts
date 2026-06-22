import { describe, expect, it } from 'vitest';

describe('loginProviderRegistry', () => {
  it('contains exactly 3 login-capable provider types', () => {
    // @ts-expect-error — not yet implemented
    const { loginProviderRegistry } = await import('./login-provider-registry');
    const keys = Object.keys(loginProviderRegistry);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('openai-completions');
    expect(keys).toContain('openai_responses');
    expect(keys).toContain('anthropic');
  });

  it('has correct label and defaultBaseUrl for each type', async () => {
    // @ts-expect-error — not yet implemented
    const { loginProviderRegistry } = await import('./login-provider-registry');
    expect(loginProviderRegistry['openai-completions']).toEqual({
      label: 'OpenAI Chat Completions 兼容',
      defaultBaseUrl: 'https://api.openai.com/v1',
    });
    expect(loginProviderRegistry['openai_responses']).toEqual({
      label: 'OpenAI Responses API',
      defaultBaseUrl: 'https://api.openai.com/v1',
    });
    expect(loginProviderRegistry['anthropic']).toEqual({
      label: 'Anthropic 原生',
      defaultBaseUrl: 'https://api.anthropic.com/v1',
    });
  });

  describe('getLoginProviderOptions()', () => {
    it('returns 3 options with value/label/description matching registry', async () => {
      // @ts-expect-error — not yet implemented
      const { getLoginProviderOptions, loginProviderRegistry } = await import('./login-provider-registry');
      const options = getLoginProviderOptions();
      expect(options).toHaveLength(3);

      for (const opt of options) {
        expect(opt).toHaveProperty('value');
        expect(opt).toHaveProperty('label');
        expect(opt).toHaveProperty('description');
        expect(opt.description).toBe(loginProviderRegistry[opt.value].defaultBaseUrl);
      }
    });
  });
});
