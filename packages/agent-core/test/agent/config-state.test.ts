import { UNKNOWN_CAPABILITY } from '@byf/kosong';
import { describe, expect, it } from 'vitest';

import { ProviderManager } from '../../src/providers/provider-manager';
import { testAgent } from './harness';

describe('ConfigState model capabilities', () => {
  it('computes provider and model capabilities from ProviderManager metadata', () => {
    const ctx = testAgent({
      providerManager: new ProviderManager({
        config: {
          providers: {
            byf: {
              type: 'openai-compat',
              apiKey: 'test-key',
            },
          },
          models: {
            'byf/byf-for-coding': {
              provider: 'byf',
              model: 'byf-for-coding',
              maxContextSize: 1_000_000,
              capabilities: ['image_in', 'video_in', 'thinking', 'tool_use'],
            },
          },
        },
      }),
    });
    const config = ctx.agent.config;

    config.update({ modelAlias: 'byf/byf-for-coding' });

    expect(config.model).toBe('byf/byf-for-coding');
    expect(config.providerConfig.model).toBe('byf-for-coding');
    expect(config.modelCapabilities).toMatchObject({
      image_in: true,
      video_in: true,
      audio_in: false,
      thinking: true,
      tool_use: true,
      max_context_tokens: 1_000_000,
    });
  });

  it('does not infer Byf capabilities from the provider catalogue', () => {
    const ctx = testAgent({
      providerManager: new ProviderManager({
        config: {
          providers: {
            byf: {
              type: 'openai-compat',
              apiKey: 'test-key',
            },
          },
          models: {
            'byf': {
              provider: 'byf',
              model: 'byf',
              maxContextSize: 128_000,
            },
          },
        },
      }),
    });
    const config = ctx.agent.config;

    config.update({ modelAlias: 'byf' });

    expect(config.modelCapabilities).toMatchObject({
      image_in: false,
      video_in: false,
      audio_in: false,
      max_context_tokens: 128_000,
    });
  });

  it('clears the selected model when modelAlias is cleared', () => {
    const ctx = testAgent();
    ctx.configure();
    const config = ctx.agent.config;

    config.update({ modelAlias: undefined });

    expect(() => config.model).toThrow('Model not set');
    expect(config.data().provider).toBeUndefined();
    expect(config.modelCapabilities).toEqual(UNKNOWN_CAPABILITY);
  });

  it('uses session id as a provider prompt cache hint without storing it on Agent', () => {
    const ctx = testAgent({
      sessionId: 'session-test',
      providerManager: new ProviderManager({
        config: {
          providers: {
            byf: {
              type: 'openai-compat',
              apiKey: 'test-key',
            },
          },
          models: {
            'byf': {
              provider: 'byf',
              model: 'byf',
              maxContextSize: 128_000,
            },
          },
        },
      }),
    });
    const config = ctx.agent.config;

    config.update({ modelAlias: 'byf' });

    expect(config.providerConfig).toMatchObject({
      type: 'openai-compat',
      generationKwargs: {
        prompt_cache_key: 'session-test',
      },
    });
    expect('sessionId' in ctx.agent).toBe(false);
  });
});
