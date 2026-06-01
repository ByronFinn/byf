import { describe, expect, it, vi } from 'vitest';

import { LoginFlow, type LoginFlowDeps } from '#/tui/flows/login-flow';

function makeDeps(overrides: Partial<LoginFlowDeps> = {}): LoginFlowDeps {
  return {
    colors: {
      primary: '#ffffff',
      success: '#00ff00',
      error: '#ff0000',
      warning: '#ffff00',
      text: '#cccccc',
      muted: '#666666',
    } as any,
    getConfig: vi.fn(async () => ({ providers: {} as Record<string, never>, models: {} })),
    setConfig: vi.fn(async () => {}),
    fetchModels: vi.fn(async () => []),
    applyProviderConfig: vi.fn() as any,
    refreshConfigAfterLogin: vi.fn(async () => {}),
    showStatus: vi.fn(),
    showError: vi.fn(),
    showLoginProgressSpinner: vi.fn(() => ({ stop: vi.fn() })),
    track: vi.fn(),
    promptTextInput: vi.fn(async () => undefined),
    promptApiKey: vi.fn(async () => undefined),
    runModelSelector: vi.fn(async () => undefined),
    ...overrides,
  } as LoginFlowDeps;
}

describe('LoginFlow', () => {
  it('completes the full flow with model selection', async () => {
    const models = [
      { id: 'gpt-4o', contextLength: 128000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false, displayName: 'GPT-4o' },
    ];

    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')  // provider name
        .mockResolvedValueOnce('https://api.example.com/v1'), // base URL
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => models),
      runModelSelector: vi.fn(async () => ({ alias: 'myprovider/gpt-4o', thinkingEffort: 'off' as const })),
    });

    const flow = new LoginFlow(deps);
    await flow.run();

    expect(deps.promptTextInput).toHaveBeenCalledTimes(2);
    expect(deps.promptApiKey).toHaveBeenCalledWith('myprovider');
    expect(deps.fetchModels).toHaveBeenCalledWith('https://api.example.com/v1', 'sk-test-key');
    expect(deps.runModelSelector).toHaveBeenCalled();
    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'myprovider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-key',
        selectedModel: expect.objectContaining({ id: 'gpt-4o' }),
      }),
    );
    expect(deps.setConfig).toHaveBeenCalled();
    expect(deps.refreshConfigAfterLogin).toHaveBeenCalled();
    expect(deps.track).toHaveBeenCalledWith('login', { provider: 'myprovider', model: 'gpt-4o' });
    expect(deps.showStatus).toHaveBeenCalledWith('Connected: myprovider · gpt-4o');
  });

  it('rejects invalid provider names', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn().mockResolvedValue('bad name!'),
    });

    await new LoginFlow(deps).run();

    expect(deps.showError).toHaveBeenCalledWith(
      'Provider name must contain only letters, numbers, hyphens, and underscores.',
    );
    expect(deps.promptApiKey).not.toHaveBeenCalled();
  });

  it('rejects duplicate provider names', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn().mockResolvedValue('existing'),
      getConfig: vi.fn(async () => ({
        providers: { existing: { type: 'openai-completions' as const, baseUrl: 'http://x' } },
        models: {},
      })),
    });

    await new LoginFlow(deps).run();

    expect(deps.showError).toHaveBeenCalledWith(
      'Provider "existing" already exists. Use a different name or /logout existing first.',
    );
  });

  it('cancels at provider name step', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn().mockResolvedValue(undefined),
    });

    await new LoginFlow(deps).run();

    expect(deps.promptApiKey).not.toHaveBeenCalled();
    expect(deps.showStatus).not.toHaveBeenCalled();
  });

  it('cancels at base URL step', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce(undefined),
    });

    await new LoginFlow(deps).run();

    expect(deps.promptApiKey).not.toHaveBeenCalled();
  });

  it('cancels at API key step', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1'),
      promptApiKey: vi.fn().mockResolvedValue(undefined),
    });

    await new LoginFlow(deps).run();

    expect(deps.fetchModels).not.toHaveBeenCalled();
  });

  it('falls back to manual model entry when fetch fails', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1')
        .mockResolvedValueOnce('gpt-4o-manual') // manual model ID
        .mockResolvedValueOnce('64000'), // context size
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => {
        throw new Error('Network error');
      }),
      runModelSelector: vi.fn(async () => undefined),
    });

    await new LoginFlow(deps).run();

    expect(deps.showError).toHaveBeenCalledWith('Failed to fetch models: Network error');
    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'myprovider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-key',
      }),
    );
    expect(deps.track).toHaveBeenCalledWith('login', { provider: 'myprovider', model: 'gpt-4o-manual' });
  });

  it('falls back to manual model entry when no models found', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1')
        .mockResolvedValueOnce('manual-model')
        .mockResolvedValueOnce('128000'),
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => []),
      runModelSelector: vi.fn(async () => undefined),
    });

    await new LoginFlow(deps).run();

    expect(deps.showStatus).toHaveBeenCalledWith('No models found at this endpoint. Enter model ID manually.');
    expect(deps.applyProviderConfig).toHaveBeenCalled();
    expect(deps.track).toHaveBeenCalledWith('login', { provider: 'myprovider', model: 'manual-model' });
  });

  it('ends login flow when fetched model selector is cancelled', async () => {
    const models = [
      { id: 'gpt-4o', contextLength: 128000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];
    const promptTextInput = vi.fn()
      .mockResolvedValueOnce('myprovider')
      .mockResolvedValueOnce('https://api.example.com/v1');
    const deps = makeDeps({
      promptTextInput,
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => models),
      runModelSelector: vi.fn(async () => undefined),
    });

    await new LoginFlow(deps).run();

    expect(promptTextInput).toHaveBeenCalledTimes(2);
    expect(promptTextInput).not.toHaveBeenCalledWith(expect.objectContaining({
      title: 'Enter model ID manually',
    }));
    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
    expect(deps.setConfig).not.toHaveBeenCalled();
    expect(deps.refreshConfigAfterLogin).not.toHaveBeenCalled();
  });

  it('cancels at manual model ID step', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1')
        .mockResolvedValueOnce(undefined), // cancel manual model entry
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => { throw new Error('fail'); }),
    });

    await new LoginFlow(deps).run();

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('cancels at manual context size step', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1')
        .mockResolvedValueOnce('manual-model')
        .mockResolvedValueOnce(undefined), // cancel context size
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => { throw new Error('fail'); }),
    });

    await new LoginFlow(deps).run();

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('rejects invalid context size in manual entry', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1')
        .mockResolvedValueOnce('manual-model')
        .mockResolvedValueOnce('not-a-number'),
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => { throw new Error('fail'); }),
    });

    await new LoginFlow(deps).run();

    expect(deps.showError).toHaveBeenCalledWith('Invalid context size. Must be a positive number.');
    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('handles ProviderApiError with HTTP status', async () => {
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1')
        .mockResolvedValueOnce('manual-model')
        .mockResolvedValueOnce('128000'),
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => {
        const err = new Error('Unauthorized') as any;
        err.status = 401;
        err.message = 'Unauthorized';
        throw err;
      }),
    });

    await new LoginFlow(deps).run();

    expect(deps.showError).toHaveBeenCalledWith(
      'Failed to fetch models (HTTP 401): Unauthorized',
    );
    expect(deps.applyProviderConfig).toHaveBeenCalled();
  });

  it('cancels at model selector step (with fetched models)', async () => {
    const models = [
      { id: 'gpt-4o', contextLength: 128000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];
    const deps = makeDeps({
      promptTextInput: vi.fn()
        .mockResolvedValueOnce('myprovider')
        .mockResolvedValueOnce('https://api.example.com/v1'),
      promptApiKey: vi.fn().mockResolvedValue('sk-test-key'),
      fetchModels: vi.fn(async () => models),
      runModelSelector: vi.fn(async () => undefined),
    });

    await new LoginFlow(deps).run();

    // Selector cancellation ends the login flow without applying config.
    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });
});
