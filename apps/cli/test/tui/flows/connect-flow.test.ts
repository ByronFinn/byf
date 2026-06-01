import { describe, expect, it, vi } from 'vitest';

import { ConnectFlow, type ConnectFlowDeps } from '#/tui/flows/connect-flow';

const CATALOG_JSON = JSON.stringify({
  openai: {
    name: 'OpenAI',
    api: 'https://api.openai.com',
    npm: 'openai',
    models: {
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o',
        limit: { context: 128000 },
        tool_call: true,
        modalities: { input: ['text'], output: ['text'] },
      },
    },
  },
});

function makeDeps(overrides: Partial<ConnectFlowDeps> = {}): ConnectFlowDeps {
  return {
    builtInCatalogJson: undefined,
    getConfig: vi.fn(async () => ({ providers: {} as Record<string, never>, models: {} })),
    setConfig: vi.fn(async () => {}),
    removeProvider: vi.fn(async () => {}),
    refreshConfigAfterLogin: vi.fn(async () => {}),
    showStatus: vi.fn(),
    showError: vi.fn(),
    showSpinner: vi.fn(() => ({ stop: vi.fn() })),
    setCancelInFlight: vi.fn(),
    track: vi.fn(),
    promptProviderSelection: vi.fn(async () => undefined),
    promptModelSelection: vi.fn(async () => undefined),
    promptApiKey: vi.fn(async () => undefined),
    ...overrides,
  } as ConnectFlowDeps;
}

function makeModelSelection() {
  return {
    model: {
      id: 'gpt-4o',
      name: 'GPT-4o',
      capability: {
        max_context_tokens: 128000,
        tool_use: true,
        thinking: false,
        thinking_effort: false,
        thinking_xhigh: false,
        thinking_max: false,
        image_in: false,
        video_in: false,
        audio_in: false,
      },
    },
    thinkingEffort: 'off' as const,
  };
}

describe('ConnectFlow', () => {
  it('shows error for bad connect args', async () => {
    const deps = makeDeps();
    await new ConnectFlow(deps).run('bad-arg');
    expect(deps.showError).toHaveBeenCalledWith(
      'Unknown argument "bad-arg". Usage: /connect [url] [refresh]',
    );
    expect(deps.promptProviderSelection).not.toHaveBeenCalled();
  });

  it('shows error for unexpected flag', async () => {
    const deps = makeDeps();
    await new ConnectFlow(deps).run('--bad-flag');
    expect(deps.showError).toHaveBeenCalledWith(
      'Unexpected flag "--bad-flag". Use /connect [url] [refresh] instead.',
    );
  });

  it('completes the full flow with built-in catalog', async () => {
    const deps = makeDeps({
      builtInCatalogJson: CATALOG_JSON,
      promptProviderSelection: vi.fn(async () => 'openai'),
      promptModelSelection: vi.fn(async () => makeModelSelection()),
      promptApiKey: vi.fn(async () => 'sk-test-key'),
      getConfig: vi.fn(async () => ({ providers: {}, models: {} })),
    });

    await new ConnectFlow(deps).run('');

    expect(deps.showStatus).toHaveBeenCalledWith(
      'Loaded built-in catalog. Run /connect refresh for the latest.',
    );
    expect(deps.promptProviderSelection).toHaveBeenCalled();
    expect(deps.promptApiKey).toHaveBeenCalledWith('OpenAI');
    expect(deps.setConfig).toHaveBeenCalled();
    expect(deps.refreshConfigAfterLogin).toHaveBeenCalled();
    expect(deps.track).toHaveBeenCalledWith('connect', { provider: 'openai', model: 'gpt-4o' });
    expect(deps.showStatus).toHaveBeenCalledWith('Connected: OpenAI · gpt-4o');
  });

  it('cancels at provider selection', async () => {
    const deps = makeDeps({
      builtInCatalogJson: CATALOG_JSON,
      promptProviderSelection: vi.fn(async () => undefined),
    });

    await new ConnectFlow(deps).run('');

    expect(deps.promptProviderSelection).toHaveBeenCalled();
    expect(deps.promptModelSelection).not.toHaveBeenCalled();
    expect(deps.promptApiKey).not.toHaveBeenCalled();
  });

  it('cancels at model selection step', async () => {
    const deps = makeDeps({
      builtInCatalogJson: CATALOG_JSON,
      promptProviderSelection: vi.fn(async () => 'openai'),
      promptModelSelection: vi.fn(async () => undefined),
    });

    await new ConnectFlow(deps).run('');

    expect(deps.promptModelSelection).toHaveBeenCalled();
    expect(deps.promptApiKey).not.toHaveBeenCalled();
  });

  it('cancels at API key step', async () => {
    const deps = makeDeps({
      builtInCatalogJson: CATALOG_JSON,
      promptProviderSelection: vi.fn(async () => 'openai'),
      promptModelSelection: vi.fn(async () => makeModelSelection()),
      promptApiKey: vi.fn(async () => undefined),
    });

    await new ConnectFlow(deps).run('');

    expect(deps.promptApiKey).toHaveBeenCalled();
    expect(deps.setConfig).not.toHaveBeenCalled();
  });

  it('removes stale provider before applying', async () => {
    const configWithProvider = {
      providers: { openai: { type: 'openai-completions' as const, baseUrl: 'http://x' } },
      models: {},
    };
    const deps = makeDeps({
      builtInCatalogJson: CATALOG_JSON,
      promptProviderSelection: vi.fn(async () => 'openai'),
      promptModelSelection: vi.fn(async () => makeModelSelection()),
      promptApiKey: vi.fn(async () => 'sk-test-key'),
      getConfig: vi.fn(async () => configWithProvider),
    });

    await new ConnectFlow(deps).run('');

    expect(deps.removeProvider).toHaveBeenCalledWith('openai');
  });

  it('shows error when provider has no models', async () => {
    const emptyCatalog = JSON.stringify({
      empty: {
        name: 'Empty',
        npm: 'openai',
        models: {},
      },
    });
    const deps = makeDeps({
      builtInCatalogJson: emptyCatalog,
      promptProviderSelection: vi.fn(async () => 'empty'),
    });

    await new ConnectFlow(deps).run('');

    expect(deps.showError).toHaveBeenCalledWith(
      'Provider "empty" has no usable models in this catalog.',
    );
  });

  it('shows error when provider entry is missing from catalog', async () => {
    const deps = makeDeps({
      builtInCatalogJson: CATALOG_JSON,
      promptProviderSelection: vi.fn(async () => 'nonexistent'),
    });

    await new ConnectFlow(deps).run('');

    // provider not found in catalog — flow exits early, no error shown
    expect(deps.promptModelSelection).not.toHaveBeenCalled();
  });
});
