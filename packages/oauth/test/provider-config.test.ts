import { describe, expect, it, vi } from 'vitest';

import {
  fetchModels,
  ProviderApiError,
  applyProviderConfig,
  removeProviderConfig,
  filterModelsByPrefix,
  capabilitiesForModel,
  type ConfigShape,
  type ModelInfo,
} from '../src/provider-config';

function makeModelsResponse(models: unknown[] = []): Response {
  return new Response(
    JSON.stringify({ data: models }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const SAMPLE_MODELS = [
  {
    id: 'deepseek-chat',
    context_length: 65536,
    supports_reasoning: false,
    supports_image_in: false,
    supports_video_in: false,
  },
  {
    id: 'deepseek-reasoner',
    context_length: 65536,
    supports_reasoning: true,
    supports_image_in: false,
    supports_video_in: false,
    display_name: 'DeepSeek Reasoner',
  },
  {
    id: 'gpt-4o',
    context_length: 128000,
    supports_reasoning: true,
    supports_image_in: true,
    supports_video_in: true,
    supports_tool_use: false,
  },
];

describe('fetchModels', () => {
  it('fetches and parses models from an OpenAI-compatible endpoint', async () => {
    const fetchMock = vi.fn(async () => makeModelsResponse(SAMPLE_MODELS));

    const models = await fetchModels(
      'https://api.deepseek.com/v1',
      'sk-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(3);
    expect(models[0]).toMatchObject({
      id: 'deepseek-chat',
      contextLength: 65536,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
    });
    expect(models[1]).toMatchObject({
      id: 'deepseek-reasoner',
      contextLength: 65536,
      supportsReasoning: true,
      displayName: 'DeepSeek Reasoner',
    });
    expect(models[2]?.supportsToolUse).toBe(false);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test',
          Accept: 'application/json',
        }),
      }),
    );
  });

  it('surfaces API error messages and status on HTTP error', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'invalid API key' } }), { status: 401 }),
    );

    const error = await fetchModels(
      'https://api.example.com/v1',
      'sk-bad',
      fetchMock as unknown as typeof fetch,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderApiError);
    expect((error as ProviderApiError).status).toBe(401);
    expect((error as Error).message).toBe('invalid API key');
  });

  it('throws on unexpected response shape', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));

    await expect(
      fetchModels('https://api.example.com/v1', 'sk-test', fetchMock as unknown as typeof fetch),
    ).rejects.toThrow(/Unexpected models response/);
  });

  it('uses default context_length for models without one', async () => {
    const fetchMock = vi.fn(async () =>
      makeModelsResponse([
        { id: 'deepseek-chat', context_length: 65536, supports_reasoning: false, supports_image_in: false, supports_video_in: false },
        { id: 'gpt-image-2' },
        { id: 'embedding-3', context_length: 'not-a-number' },
        { id: 'deepseek-reasoner', context_length: 65536, supports_reasoning: true, supports_image_in: false, supports_video_in: false },
      ]),
    );

    const models = await fetchModels(
      'https://api.example.com/v1',
      'sk-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(4);
    expect(models[0]?.contextLength).toBe(65536);
    expect(models[1]?.id).toBe('gpt-image-2');
    expect(models[1]?.contextLength).toBe(200_000);
    expect(models[2]?.contextLength).toBe(200_000);
    expect(models[3]?.contextLength).toBe(65536);
  });
});

describe('applyProviderConfig', () => {
  it('writes provider, models, and defaults', () => {
    const config: ConfigShape = { providers: {} };
    const models: ModelInfo[] = [
      { id: 'deepseek-chat', contextLength: 65536, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false, displayName: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', contextLength: 65536, supportsReasoning: true, supportsImageIn: false, supportsVideoIn: false },
    ];

    const result = applyProviderConfig(config, {
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      models,
      selectedModel: models[0]!,
      thinking: true,
    });

    expect(result).toEqual({
      defaultModel: 'deepseek/deepseek-chat',
      defaultThinking: true,
    });

    expect(config.providers['deepseek']).toMatchObject({
      type: 'openai-compat',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
    });
    expect(config.models?.['deepseek/deepseek-chat']).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-chat',
      maxContextSize: 65536,
      displayName: 'DeepSeek Chat',
    });
    expect(config.defaultModel).toBe('deepseek/deepseek-chat');
    expect(config.defaultThinking).toBe(true);
  });

  it('clears stale models for the same provider but preserves others', () => {
    const config: ConfigShape = {
      providers: {
        deepseek: { type: 'openai-compat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-old' },
      },
      models: {
        'deepseek/stale': { provider: 'deepseek', model: 'stale', maxContextSize: 1000 },
        'other/model': { provider: 'other', model: 'other-model', maxContextSize: 1000 },
      },
    };
    const models: ModelInfo[] = [
      { id: 'deepseek-chat', contextLength: 65536, supportsReasoning: true, supportsImageIn: false, supportsVideoIn: false },
    ];

    applyProviderConfig(config, {
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-new',
      models,
      selectedModel: models[0]!,
      thinking: false,
    });

    expect(config.models?.['deepseek/stale']).toBeUndefined();
    expect(config.models?.['other/model']).toBeDefined();
  });
});

describe('capabilitiesForModel', () => {
  it('returns undefined for a model with no capabilities', () => {
    const model: ModelInfo = {
      id: 'plain', contextLength: 1000,
      supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false, supportsToolUse: false,
    };
    expect(capabilitiesForModel(model)).toBeUndefined();
  });

  it('returns all caps for a full-featured model', () => {
    const model: ModelInfo = {
      id: 'full', contextLength: 1000,
      supportsReasoning: true, supportsImageIn: true, supportsVideoIn: true, supportsToolUse: true,
    };
    expect(capabilitiesForModel(model)).toEqual(['thinking', 'image_in', 'video_in', 'tool_use']);
  });
});

describe('removeProviderConfig', () => {
  it('removes provider, its models, and defaultModel when matched', () => {
    const config: ConfigShape = {
      providers: {
        deepseek: { type: 'openai-compat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test' },
        other: { type: 'openai-compat', baseUrl: 'https://other.test/v1', apiKey: 'sk-other' },
      },
      models: {
        'deepseek/deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 65536 },
        'other/model': { provider: 'other', model: 'other-model', maxContextSize: 1000 },
      },
      defaultModel: 'deepseek/deepseek-chat',
    };

    removeProviderConfig(config, 'deepseek');

    expect(config.providers['deepseek']).toBeUndefined();
    expect(config.providers['other']).toBeDefined();
    expect(config.models?.['deepseek/deepseek-chat']).toBeUndefined();
    expect(config.models?.['other/model']).toBeDefined();
    expect(config.defaultModel).toBeUndefined();
  });

  it('leaves defaultModel intact when it belongs to another provider', () => {
    const config: ConfigShape = {
      providers: {
        deepseek: { type: 'openai-compat', baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test' },
      },
      models: {
        'deepseek/deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 65536 },
      },
      defaultModel: 'other/model',
    };

    removeProviderConfig(config, 'deepseek');

    expect(config.defaultModel).toBe('other/model');
  });
});

describe('filterModelsByPrefix', () => {
  it('filters by prefixes', () => {
    const models: ModelInfo[] = [
      { id: 'deepseek-chat', contextLength: 65536, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
      { id: 'gpt-4o', contextLength: 128000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];

    const filtered = filterModelsByPrefix(models, ['deepseek']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('deepseek-chat');
  });

  it('returns all models when prefixes is empty', () => {
    const models: ModelInfo[] = [
      { id: 'model-a', contextLength: 1000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
      { id: 'model-b', contextLength: 2000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];

    const filtered = filterModelsByPrefix(models);
    expect(filtered).toHaveLength(2);
  });
});
