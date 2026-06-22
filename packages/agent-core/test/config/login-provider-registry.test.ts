import { describe, expect, it } from 'vitest';
import {
  loginProviderRegistry,
  type LoginProviderType,
  getLoginProviderOptions,
} from '#/config/login-provider-registry';

describe('loginProviderRegistry', () => {
  it('contains exactly 3 login-capable provider types', () => {
    const keys = Object.keys(loginProviderRegistry);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('openai-completions');
    expect(keys).toContain('openai_responses');
    expect(keys).toContain('anthropic');
  });

  it('has correct label and defaultBaseUrl for each type', () => {
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

  it('LoginProviderType is derived from registry keys', () => {
    const valid: LoginProviderType[] = ['openai-completions', 'openai_responses', 'anthropic'];
    expect(valid).toHaveLength(3);
  });

  describe('getLoginProviderOptions()', () => {
    it('returns 3 options with value/label/description matching registry', () => {
      const options = getLoginProviderOptions();
      expect(options).toHaveLength(3);

      for (const opt of options) {
        expect(opt).toHaveProperty('value');
        expect(opt).toHaveProperty('label');
        expect(opt).toHaveProperty('description');
        expect(opt.description).toBe(loginProviderRegistry[opt.value].defaultBaseUrl);
      }
    });

    it('preserves the correct display order', () => {
      const options = getLoginProviderOptions();
      expect(options[0]!.value).toBe('openai-completions');
      expect(options[1]!.value).toBe('openai_responses');
      expect(options[2]!.value).toBe('anthropic');
    });
  });
});
