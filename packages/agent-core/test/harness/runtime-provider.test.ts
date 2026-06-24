import { describe, expect, it } from 'vitest';

import type { ByfConfig } from '../../src/config';
import { ByfError } from '../../src/errors';
import { ProviderManager } from '../../src/providers/provider-manager';
import { resolveRuntimeProvider } from '../../src/providers/runtime-provider';

const BASE_CONFIG: ByfConfig = {
  defaultModel: 'byf/byf-for-coding',
  providers: {
    'test-provider': {
      type: 'openai-completions',
      apiKey: 'test-key',
      baseUrl: 'https://api.example/v1',
    },
  },
  models: {
    'byf/byf-for-coding': {
      provider: 'test-provider',
      model: 'byf-for-coding',
      maxContextSize: 1_000_000,
      capabilities: ['thinking', 'image_in', 'video_in', 'tool_use'],
    },
  },
};

const TEST_BYF_HEADERS = {
  'User-Agent': 'byf-cli/0.0.0-test',
  'X-Msh-Platform': 'byf_code_cli',
  'X-Msh-Version': '0.0.0-test',
};

describe('resolveRuntimeProvider model metadata', () => {
  it('uses config model metadata as the source of truth', () => {
    const resolved = resolveRuntimeProvider({
      config: BASE_CONFIG,
    });

    expect(resolved.modelCapabilities).toMatchObject({
      image_in: true,
      video_in: true,
      thinking: true,
      tool_use: true,
      max_context_tokens: 1_000_000,
    });
    expect(resolved.modelName).toBe('byf/byf-for-coding');
    expect(resolved.provider.model).toBe('byf-for-coding');
  });

  it('resolves requested aliases to the configured provider and provider model', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          ...BASE_CONFIG.providers,
          custom: {
            type: 'openai-completions',
            apiKey: 'sk-custom',
            baseUrl: 'https://custom.example/v1',
          },
        },
        models: {
          ...BASE_CONFIG.models!,
          'gpt-alias': {
            provider: 'custom',
            model: 'gpt-runtime',
            maxContextSize: 200000,
            capabilities: ['tool_use'],
          },
        },
      },
      model: 'gpt-alias',
    });

    expect(resolved.providerName).toBe('custom');
    expect(resolved.modelName).toBe('gpt-alias');
    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      model: 'gpt-runtime',
      apiKey: 'sk-custom',
      baseUrl: 'https://custom.example/v1',
    });
    expect(resolved.modelCapabilities).toMatchObject({
      tool_use: true,
      max_context_tokens: 200000,
    });
  });

  it('uses config Byf capabilities without requiring an api key during OAuth setup', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          'test-provider': {
            type: 'openai-completions',
            apiKey: '',
            baseUrl: 'https://api.example/v1',
            oauth: { storage: 'file', key: 'oauth/byf' },
          },
        },
      },
    });

    expect(resolved.modelCapabilities).toMatchObject({
      image_in: true,
      video_in: true,
      thinking: true,
      tool_use: true,
      max_context_tokens: 1_000_000,
    });
  });

  it('does not infer Byf capabilities from the provider model name', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        models: {
          'byf/byf-for-coding': {
            provider: 'test-provider',
            model: 'byf-for-coding',
            maxContextSize: 1_000_000,
          },
        },
      },
    });

    expect(resolved.modelCapabilities).toMatchObject({
      image_in: false,
      video_in: false,
      thinking: false,
      tool_use: false,
      max_context_tokens: 1_000_000,
    });
  });

  it('rejects provider model names that are not configured aliases', () => {
    expect(() =>
      resolveRuntimeProvider({
        config: BASE_CONFIG,
        model: 'byf-for-coding',
      }),
    ).toThrow(/not configured in config.toml/);
  });

  it('throws when no model is selected', () => {
    expect(() =>
      resolveRuntimeProvider({
        config: {
          providers: {},
        },
      }),
    ).toThrow(/No model is selected/);
  });

  it('throws when the selected model is not configured as an alias', () => {
    expect(() =>
      resolveRuntimeProvider({
        config: BASE_CONFIG,
        model: 'byf',
      }),
    ).toThrow(ByfError);
  });

  it('throws when the selected provider has neither apiKey nor oauth configured', () => {
    expect(() =>
      resolveRuntimeProvider({
        config: {
          ...BASE_CONFIG,
          providers: {
            'test-provider': {
              type: 'openai-completions',
              baseUrl: 'https://api.example/v1',
            },
          },
        },
      }),
    ).toThrow(/no credentials configured/i);
  });

  it('throws when apiKey is an empty string and no oauth is configured', () => {
    expect(() =>
      resolveRuntimeProvider({
        config: {
          ...BASE_CONFIG,
          providers: {
            'test-provider': {
              type: 'openai-completions',
              apiKey: '',
              baseUrl: 'https://api.example/v1',
            },
          },
        },
      }),
    ).toThrow(/no credentials configured/i);
  });

  it('allows vertexai providers without an apiKey', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        defaultModel: 'gemini',
        providers: {
          vertex: {
            type: 'vertexai',
          },
        },
        models: {
          gemini: {
            provider: 'vertex',
            model: 'gemini-1.5-pro',
            maxContextSize: 1_000_000,
          },
        },
      },
    });

    expect(resolved.provider).toMatchObject({ type: 'vertexai' });
  });

  it('throws when the selected model alias has no maxContextSize', () => {
    const config = {
      ...BASE_CONFIG,
      models: {
        broken: {
          provider: 'test-provider',
          model: 'byf-for-coding',
          capabilities: ['thinking'],
        },
      },
    } as unknown as ByfConfig;

    expect(() =>
      resolveRuntimeProvider({
        config,
        model: 'broken',
      }),
    ).toThrow(/max_context_size/);
  });
});

describe('resolveRuntimeProvider maxOutputSize forwarding', () => {
  it('forwards alias.maxOutputSize to the anthropic provider config as defaultMaxTokens', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          ...BASE_CONFIG.providers,
          anthropic: { type: 'anthropic', apiKey: 'sk-anthropic' },
        },
        models: {
          ...BASE_CONFIG.models!,
          'opus-alias': {
            provider: 'anthropic',
            model: 'claude-opus-4-7',
            maxContextSize: 200000,
            maxOutputSize: 24000,
          },
        },
      },
      model: 'opus-alias',
    });

    expect(resolved.provider).toMatchObject({
      type: 'anthropic',
      model: 'claude-opus-4-7',
      defaultMaxTokens: 24000,
    });
  });

  it('omits defaultMaxTokens when alias.maxOutputSize is unset', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          ...BASE_CONFIG.providers,
          anthropic: { type: 'anthropic', apiKey: 'sk-anthropic' },
        },
        models: {
          ...BASE_CONFIG.models!,
          'opus-alias': {
            provider: 'anthropic',
            model: 'claude-opus-4-7',
            maxContextSize: 200000,
          },
        },
      },
      model: 'opus-alias',
    });

    expect(resolved.provider).toMatchObject({
      type: 'anthropic',
      model: 'claude-opus-4-7',
    });
    expect('defaultMaxTokens' in resolved.provider).toBe(false);
  });
});

describe('resolveRuntimeProvider Byf request headers', () => {
  it('does not set defaultHeaders when no byfRequestHeaders or customHeaders exist', () => {
    const resolved = resolveRuntimeProvider({ config: BASE_CONFIG });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      model: 'byf-for-coding',
    });
    expect('defaultHeaders' in resolved.provider).toBe(false);
  });

  it('uses only customHeaders when byfRequestHeaders are missing', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          'test-provider': {
            type: 'openai-completions',
            apiKey: 'test-key',
            baseUrl: 'https://api.example/v1',
            customHeaders: {
              'User-Agent': 'Custom/1',
            },
          },
        },
      },
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      defaultHeaders: {
        'User-Agent': 'Custom/1',
      },
    });
  });

  it('passes byfRequestHeaders through to Byf provider defaultHeaders', () => {
    const resolved = resolveRuntimeProvider({
      config: BASE_CONFIG,
      byfRequestHeaders: TEST_BYF_HEADERS,
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      defaultHeaders: TEST_BYF_HEADERS,
    });
  });

  it('passes the prompt cache key to Byf generation kwargs', () => {
    const resolved = resolveRuntimeProvider({
      config: BASE_CONFIG,
      promptCacheKey: 'session-test',
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      generationKwargs: {
        prompt_cache_key: 'session-test',
      },
    });
  });

  it('forwards provider extraBody to generation kwargs extra_body', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          'test-provider': {
            type: 'openai-completions',
            apiKey: 'test-key',
            baseUrl: 'https://api.example/v1',
            extraBody: { thinking: { keep: 'all' } },
          },
        },
      },
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      generationKwargs: {
        extra_body: { thinking: { keep: 'all' } },
      },
    });
  });

  it('omits extra_body when provider extraBody is not configured', () => {
    const resolved = resolveRuntimeProvider({
      config: BASE_CONFIG,
    });

    const providerMap = resolved.provider as unknown as Record<string, unknown>;
    const extraBody = (providerMap['generationKwargs'] as Record<string, unknown> | undefined)?.[
      'extra_body'
    ];
    expect(extraBody).toBeUndefined();
  });

  it('forwards provider thinkingEffortKey to openai-completions runtime config', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          'test-provider': {
            type: 'openai-completions',
            apiKey: 'test-key',
            baseUrl: 'https://api.example/v1',
            thinkingEffortKey: 'thinking_effort',
          },
        },
      },
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      thinkingEffortKey: 'thinking_effort',
    });
  });

  it('lets provider customHeaders override byfRequestHeaders', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        ...BASE_CONFIG,
        providers: {
          'test-provider': {
            type: 'openai-completions',
            apiKey: 'test-key',
            baseUrl: 'https://api.example/v1',
            customHeaders: {
              'User-Agent': 'Custom/1',
              'X-Msh-Version': 'override-version',
            },
          },
        },
      },
      byfRequestHeaders: TEST_BYF_HEADERS,
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      defaultHeaders: {
        'User-Agent': 'Custom/1',
        'X-Msh-Platform': 'byf_code_cli',
        'X-Msh-Version': 'override-version',
      },
    });
  });

  it('does not apply byfRequestHeaders to non-Byf providers', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        defaultModel: 'claude-alias',
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-anthropic',
          },
        },
        models: {
          'claude-alias': {
            provider: 'anthropic',
            model: 'claude-runtime',
            maxContextSize: 200000,
          },
        },
      },
      byfRequestHeaders: TEST_BYF_HEADERS,
      promptCacheKey: 'session-test',
    });

    expect(resolved.provider).toMatchObject({
      type: 'anthropic',
      model: 'claude-runtime',
      apiKey: 'sk-anthropic',
    });
    expect('defaultHeaders' in resolved.provider).toBe(false);
    expect('generationKwargs' in resolved.provider).toBe(false);
  });
});

describe('resolveRuntimeProvider customHeaders propagation', () => {
  it('forwards customHeaders to an anthropic provider', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        defaultModel: 'claude-alias',
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-anthropic',
            customHeaders: { 'X-Custom': 'value' },
          },
        },
        models: {
          'claude-alias': {
            provider: 'anthropic',
            model: 'claude-runtime',
            maxContextSize: 200000,
          },
        },
      },
    });

    expect(resolved.provider).toMatchObject({
      type: 'anthropic',
      defaultHeaders: { 'X-Custom': 'value' },
    });
  });

  it('forwards customHeaders to an openai-completions provider', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        defaultModel: 'gpt-alias',
        providers: {
          custom: {
            type: 'openai-completions',
            apiKey: 'sk-custom',
            customHeaders: { 'X-Custom': 'value' },
          },
        },
        models: {
          'gpt-alias': { provider: 'custom', model: 'gpt-runtime', maxContextSize: 200000 },
        },
      },
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai-completions',
      defaultHeaders: { 'X-Custom': 'value' },
    });
  });

  it('forwards customHeaders to an openai_responses provider', () => {
    const resolved = resolveRuntimeProvider({
      config: {
        defaultModel: 'resp-alias',
        providers: {
          openai_responses: {
            type: 'openai_responses',
            apiKey: 'sk-openai',
            customHeaders: { 'X-Custom': 'value' },
          },
        },
        models: {
          'resp-alias': {
            provider: 'openai_responses',
            model: 'gpt-runtime',
            maxContextSize: 200000,
          },
        },
      },
    });

    expect(resolved.provider).toMatchObject({
      type: 'openai_responses',
      defaultHeaders: { 'X-Custom': 'value' },
    });
  });

  it('keeps customHeaders isolated between resolved provider instances', () => {
    const config: ByfConfig = {
      defaultModel: 'gpt-alias',
      providers: {
        custom: {
          type: 'openai-completions',
          apiKey: 'sk-custom',
          customHeaders: { 'X-Custom': 'original' },
        },
      },
      models: {
        'gpt-alias': { provider: 'custom', model: 'gpt-runtime', maxContextSize: 200000 },
      },
    };

    const first = resolveRuntimeProvider({ config });
    const second = resolveRuntimeProvider({ config });
    const firstHeaders = (first.provider as { defaultHeaders?: Record<string, string> })
      .defaultHeaders;
    expect(firstHeaders).toEqual({ 'X-Custom': 'original' });

    firstHeaders!['X-Custom'] = 'mutated';

    expect((second.provider as { defaultHeaders?: Record<string, string> }).defaultHeaders).toEqual(
      { 'X-Custom': 'original' },
    );
    expect(config.providers['custom']?.customHeaders).toEqual({ 'X-Custom': 'original' });
  });
});

describe('ProviderManager prompt cache key', () => {
  it('applies a prompt cache key to Byf providers', () => {
    const manager = new ProviderManager({ config: BASE_CONFIG }).withPromptCacheKey('session-test');
    const resolved = manager.resolveProviderConfigForModel('byf/byf-for-coding');

    expect(resolved?.provider).toMatchObject({
      type: 'openai-completions',
      generationKwargs: {
        prompt_cache_key: 'session-test',
      },
    });
  });

  it('does not add generation kwargs to non-Byf providers', () => {
    const manager = new ProviderManager({
      config: {
        defaultModel: 'claude-alias',
        providers: {
          anthropic: {
            type: 'anthropic',
            apiKey: 'sk-anthropic',
          },
        },
        models: {
          'claude-alias': {
            provider: 'anthropic',
            model: 'claude-runtime',
            maxContextSize: 200000,
          },
        },
      },
    }).withPromptCacheKey('session-test');
    const resolved = manager.resolveProviderConfigForModel('claude-alias');

    expect(resolved?.provider).toMatchObject({
      type: 'anthropic',
      model: 'claude-runtime',
    });
    expect('generationKwargs' in resolved!.provider).toBe(false);
  });

  it('keeps derived managers on the latest shared config', () => {
    const manager = new ProviderManager({ config: { providers: {} } });
    const derived = manager.withPromptCacheKey('session-test');

    manager.updateConfig(BASE_CONFIG);

    const resolved = derived.resolveProviderConfigForModel(undefined);
    expect(resolved?.provider).toMatchObject({
      type: 'openai-completions',
      generationKwargs: {
        prompt_cache_key: 'session-test',
      },
    });
  });
});

describe('ProviderManager thinking level', () => {
  it('normalizes requested thinking into a concrete effort', () => {
    const manager = new ProviderManager({
      config: {
        providers: {},
        defaultThinking: false,
        thinking: { effort: 'medium', mode: 'auto' },
      },
    });
    expect(manager.resolveThinkingLevel('on')).toBe('medium');
    expect(manager.resolveThinkingLevel('off')).toBe('off');
    expect(manager.resolveThinkingLevel('low')).toBe('low');
    expect(manager.resolveThinkingLevel()).toBe('off');
    expect(manager.resolveThinkingLevel('')).toBe('off');
    expect(manager.resolveThinkingLevel('   ')).toBe('off');

    const managerOnByDefault = new ProviderManager({
      config: {
        providers: {},
        defaultThinking: true,
        thinking: { effort: 'medium', mode: 'auto' },
      },
    });
    expect(managerOnByDefault.resolveThinkingLevel()).toBe('medium');
    expect(managerOnByDefault.resolveThinkingLevel('   ')).toBe('medium');

    const managerWithoutEffort = new ProviderManager({
      config: { providers: {}, defaultThinking: true, thinking: { mode: 'auto' } },
    });
    expect(managerWithoutEffort.resolveThinkingLevel('on')).toBe('high');
    expect(managerWithoutEffort.resolveThinkingLevel()).toBe('high');

    const managerOffByDefault = new ProviderManager({
      config: { providers: {}, thinking: { mode: 'off' } },
    });
    expect(managerOffByDefault.resolveThinkingLevel()).toBe('off');

    const managerWithModeOffAndDefaultThinking = new ProviderManager({
      config: {
        providers: {},
        defaultThinking: true,
        thinking: { effort: 'medium', mode: 'off' },
      },
    });
    expect(managerWithModeOffAndDefaultThinking.resolveThinkingLevel()).toBe('off');
    expect(managerWithModeOffAndDefaultThinking.resolveThinkingLevel('   ')).toBe('off');

    const managerWithoutThinking = new ProviderManager({ config: { providers: {} } });
    expect(managerWithoutThinking.resolveThinkingLevel()).toBe('high');
  });
});
