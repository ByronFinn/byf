import { describe, expect, it, vi } from 'vitest';

import {
  fetchModels,
  fetchModelsByType,
  ProviderApiError,
  applyProviderConfig,
  removeProviderConfig,
  filterModelsByPrefix,
  capabilitiesForModel,
  type ConfigShape,
  type ModelInfo,
} from '../src/provider-config';

function makeModelsResponse(models: unknown[] = []): Response {
  return new Response(JSON.stringify({ data: models }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
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
    supports_reasoning_effort: true,
    reasoning_effort_key: 'thinking_effort',
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
      supportsReasoningEffort: true,
      reasoningEffortKey: 'thinking_effort',
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
    ).catch((error: unknown) => error);

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
        {
          id: 'deepseek-chat',
          context_length: 65536,
          supports_reasoning: false,
          supports_image_in: false,
          supports_video_in: false,
        },
        { id: 'gpt-image-2' },
        { id: 'embedding-3', context_length: 'not-a-number' },
        {
          id: 'deepseek-reasoner',
          context_length: 65536,
          supports_reasoning: true,
          supports_image_in: false,
          supports_video_in: false,
        },
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
      {
        id: 'deepseek-chat',
        contextLength: 65536,
        supportsReasoning: false,
        supportsReasoningEffort: true,
        reasoningEffortKey: 'thinking_effort',
        supportsImageIn: false,
        supportsVideoIn: false,
        displayName: 'DeepSeek Chat',
      },
      {
        id: 'deepseek-reasoner',
        contextLength: 65536,
        supportsReasoning: true,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
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
      type: 'openai-completions',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      thinkingEffortKey: 'thinking_effort',
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
        deepseek: {
          type: 'openai-completions',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-old',
        },
      },
      models: {
        'deepseek/stale': { provider: 'deepseek', model: 'stale', maxContextSize: 1000 },
        'other/model': { provider: 'other', model: 'other-model', maxContextSize: 1000 },
      },
    };
    const models: ModelInfo[] = [
      {
        id: 'deepseek-chat',
        contextLength: 65536,
        supportsReasoning: true,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
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

  it('writes the provider type from the `type` option when provided', () => {
    const config: ConfigShape = { providers: {} };
    const models: ModelInfo[] = [
      {
        id: 'claude-opus-4-7',
        contextLength: 200000,
        supportsReasoning: true,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    applyProviderConfig(config, {
      name: 'anthropic',
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      models,
      selectedModel: models[0]!,
      thinking: false,
    });

    expect(config.providers['anthropic']).toMatchObject({
      type: 'anthropic',
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
    });
  });

  it('defaults the provider type to openai-completions when `type` is omitted', () => {
    const config: ConfigShape = { providers: {} };
    const models: ModelInfo[] = [
      {
        id: 'gpt-4o',
        contextLength: 128000,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    applyProviderConfig(config, {
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      models,
      selectedModel: models[0]!,
      thinking: false,
    });

    expect(config.providers['openai']?.type).toBe('openai-completions');
  });
});

describe('fetchModelsByType', () => {
  it('dispatches openai-completions to the OpenAI-compatible fetcher', async () => {
    const fetchMock = vi.fn(async () => makeModelsResponse(SAMPLE_MODELS));

    const models = await fetchModelsByType(
      'openai-completions',
      'https://api.deepseek.com/v1',
      'sk-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  it('dispatches openai_responses to the OpenAI-compatible fetcher', async () => {
    const fetchMock = vi.fn(async () => makeModelsResponse(SAMPLE_MODELS));

    const models = await fetchModelsByType(
      'openai_responses',
      'https://api.openai.com/v1',
      'sk-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(3);
  });

  it('fetches anthropic models with x-api-key + anthropic-version headers', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 'claude-opus-4-7', type: 'model', display_name: 'Claude Opus 4.7' },
              { id: 'claude-sonnet-4-5', type: 'model', display_name: 'Claude Sonnet 4.5' },
            ],
            has_more: false,
            last_id: 'claude-sonnet-4-5',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const models = await fetchModelsByType(
      'anthropic',
      'https://api.anthropic.com/v1',
      'sk-ant-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({
      id: 'claude-opus-4-7',
      displayName: 'Claude Opus 4.7',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    // Must NOT use Bearer auth.
    const firstCallHeaders = (
      fetchMock.mock.calls as unknown as Array<[string, { headers: Record<string, string> }]>
    )[0]![1].headers;
    expect(firstCallHeaders['Authorization']).toBeUndefined();
  });

  it('follows anthropic pagination via has_more + after_id', async () => {
    const page1 = {
      data: [{ id: 'claude-opus-4-7', type: 'model', display_name: 'Claude Opus 4.7' }],
      has_more: true,
      last_id: 'claude-opus-4-7',
    };
    const page2 = {
      data: [{ id: 'claude-sonnet-4-5', type: 'model', display_name: 'Claude Sonnet 4.5' }],
      has_more: false,
      last_id: 'claude-sonnet-4-5',
    };
    const responses = [page1, page2];
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(responses.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );

    const models = await fetchModelsByType(
      'anthropic',
      'https://api.anthropic.com/v1',
      'sk-ant-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Second request carries after_id from the first page's last_id.
    expect((fetchMock.mock.calls as unknown as Array<[string, unknown]>)[1]![0]).toBe(
      'https://api.anthropic.com/v1/models?after_id=claude-opus-4-7',
    );
  });

  it('throws for an unsupported provider type', async () => {
    await expect(
      fetchModelsByType('google-genai', 'https://api.google.com/v1', 'sk-test'),
    ).rejects.toThrow(/unsupported provider type "google-genai"/);
  });

  it('stops pagination when has_more is true but last_id is missing (defensive)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [{ id: 'claude-opus-4-7', type: 'model', display_name: 'Claude Opus 4.7' }],
            has_more: true,
            // last_id missing — must not loop forever
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    );

    const models = await fetchModelsByType(
      'anthropic',
      'https://api.anthropic.com/v1',
      'sk-ant-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops pagination at the MAX_PAGES hard cap', async () => {
    const makePage = (id: string) => ({
      data: [{ id, type: 'model', display_name: `Model ${id}` }],
      has_more: true,
      last_id: id,
    });
    // Generate exactly 10 pages — all claim has_more so the loop must
    // terminate on the upper-bound without requesting an 11th page.
    const pages = Array.from({ length: 10 }, (_, i) => makePage(`m${i}`));
    const fetchMock = vi.fn(async () => {
      const page = pages.shift();
      return new Response(JSON.stringify(page ?? { data: [], has_more: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const models = await fetchModelsByType(
      'anthropic',
      'https://api.anthropic.com/v1',
      'sk-ant-test',
      fetchMock as unknown as typeof fetch,
    );

    expect(models).toHaveLength(10);
    // The loop bound is MAX_PAGES = 10, so 10 fetches, not 11.
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

describe('capabilitiesForModel', () => {
  it('returns undefined for a model with no capabilities', () => {
    const model: ModelInfo = {
      id: 'plain',
      contextLength: 1000,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
      supportsToolUse: false,
    };
    expect(capabilitiesForModel(model)).toBeUndefined();
  });

  it('returns all caps for a full-featured model', () => {
    const model: ModelInfo = {
      id: 'full',
      contextLength: 1000,
      supportsReasoning: true,
      supportsReasoningEffort: true,
      supportsImageIn: true,
      supportsVideoIn: true,
      supportsToolUse: true,
    };
    expect(capabilitiesForModel(model)).toEqual([
      'thinking',
      'thinking_effort',
      'image_in',
      'video_in',
      'tool_use',
    ]);
  });
});

describe('removeProviderConfig', () => {
  it('removes provider, its models, and defaultModel when matched', () => {
    const config: ConfigShape = {
      providers: {
        deepseek: {
          type: 'openai-completions',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-test',
        },
        other: { type: 'openai-completions', baseUrl: 'https://other.test/v1', apiKey: 'sk-other' },
      },
      models: {
        'deepseek/deepseek-chat': {
          provider: 'deepseek',
          model: 'deepseek-chat',
          maxContextSize: 65536,
        },
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
        deepseek: {
          type: 'openai-completions',
          baseUrl: 'https://api.deepseek.com/v1',
          apiKey: 'sk-test',
        },
      },
      models: {
        'deepseek/deepseek-chat': {
          provider: 'deepseek',
          model: 'deepseek-chat',
          maxContextSize: 65536,
        },
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
      {
        id: 'deepseek-chat',
        contextLength: 65536,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
      {
        id: 'gpt-4o',
        contextLength: 128000,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    const filtered = filterModelsByPrefix(models, ['deepseek']);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('deepseek-chat');
  });

  it('returns all models when prefixes is empty', () => {
    const models: ModelInfo[] = [
      {
        id: 'model-a',
        contextLength: 1000,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
      {
        id: 'model-b',
        contextLength: 2000,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];

    const filtered = filterModelsByPrefix(models);
    expect(filtered).toHaveLength(2);
  });
});
