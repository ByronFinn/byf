import { mock as bunMock } from 'bun:test';

import { DEFAULT_CATALOG_URL, fetchCatalog, type Catalog } from '@byfriends/sdk';
import type { Component, Focusable } from '@earendil-works/pi-tui';
import { describe, expect, it, vi, afterAll, afterEach } from 'vitest';

import { LoginFlow, type LoginFlowDeps } from '#/tui/flows/login-flow';

// fetchCatalog makes a real HTTP request to DEFAULT_CATALOG_URL. Mock it to
// throw so fetchCatalogWithFallback falls through to loadBuiltInCatalog
// (which returns undefined when no builtInCatalogJson is provided).
const __mockActual__byfriends_sdk = await import('@byfriends/sdk');
vi.mock('@byfriends/sdk', () => {
  const actual = __mockActual__byfriends_sdk as Record<string, unknown>;
  return {
    ...actual,
    fetchCatalog: vi.fn().mockRejectedValue(new Error('test: no network')),
  };
});

/** A dialog component that is guaranteed to have handleInput. */
interface TestablePanel extends Component, Focusable {
  handleInput(data: string): void;
}

/** Captures the currently shown panel so tests can drive it via handleInput. */
class FakeDialogHost {
  panel: TestablePanel | null = null;

  show(panel: Component & Focusable): void {
    this.panel = panel as TestablePanel;
  }

  close(): void {
    this.panel = null;
  }
}

const COLORS = {
  primary: '#ffffff',
  success: '#00ff00',
  error: '#ff0000',
  warning: '#ffff00',
  text: '#cccccc',
  textStrong: '#ffffff',
  textDim: '#888888',
  textMuted: '#666666',
  muted: '#666666',
  accent: '#aaaaaa',
  border: '#444444',
  borderFocus: '#555555',
  diffAdded: '#00ff00',
  diffRemoved: '#ff0000',
  diffAddedStrong: '#00ff00',
  diffRemovedStrong: '#ff0000',
  diffGutter: '#333333',
  diffMeta: '#666666',
  roleUser: '#cccccc',
  roleAssistant: '#ffffff',
} as const;

function getHost(deps: LoginFlowDeps): FakeDialogHost {
  return deps.dialogHost as FakeDialogHost;
}

/** Get the currently-shown panel, throwing if none is mounted. */
function activePanel(host: FakeDialogHost): TestablePanel {
  if (host.panel === null) throw new Error('No dialog panel is active');
  return host.panel;
}

/** Clear the current input, type text, then press Enter. */
async function clearTypeAndEnter(host: FakeDialogHost, text: string): Promise<void> {
  const p = activePanel(host);
  p.handleInput('\u0015'); // Ctrl+U: delete to line start
  for (const ch of text) {
    p.handleInput(ch);
  }
  p.handleInput('\r');
}

/** Type the text into the active dialog, then press Enter. */
async function typeAndEnter(host: FakeDialogHost, text: string): Promise<void> {
  const p = activePanel(host);
  for (const ch of text) {
    p.handleInput(ch);
  }
  p.handleInput('\r');
}

/** Press Escape on the active dialog. */
function pressEscape(host: FakeDialogHost): void {
  activePanel(host).handleInput('\u001B');
}

/** Select the currently-highlighted option (first by default) in a ChoicePicker. */
function selectHighlighted(host: FakeDialogHost): void {
  activePanel(host).handleInput('\r');
}

/** Move the ChoicePicker highlight down `n` items, then select. */
function selectNth(host: FakeDialogHost, n: number): void {
  const panel = activePanel(host);
  for (let i = 0; i < n; i += 1) panel.handleInput('\u001B[B'); // Down arrow
  panel.handleInput('\r');
}

function makeDeps(overrides: Partial<LoginFlowDeps> = {}): LoginFlowDeps {
  return {
    colors: COLORS as any,
    dialogHost: new FakeDialogHost(),
    getConfig: vi.fn(async () => ({ providers: {} as Record<string, never>, models: {} })),
    setConfig: vi.fn(async () => {}),
    fetchModels: vi.fn(async () => []),
    applyProviderConfig: vi.fn() as any,
    refreshConfigAfterLogin: vi.fn(async () => {}),
    showStatus: vi.fn(),
    showError: vi.fn(),
    showLoginProgressSpinner: vi.fn(() => ({ stop: vi.fn() })),
    setCancelInFlight: vi.fn(),
    clearCancelInFlight: vi.fn(),
    track: vi.fn(),
    ...overrides,
  } as LoginFlowDeps;
}

/**
 * A fetchCatalog that never settles until its signal aborts — models a network
 * that TCP-connects but never responds. Called with no signal (the pre-fix
 * call) nothing can ever abort it, so the promise hangs forever.
 */
function hangingCatalogFetch(_url: string, signal?: AbortSignal): Promise<Catalog> {
  return new Promise<Catalog>((_resolve, reject) => {
    if (signal === undefined) return;
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    signal.addEventListener(
      'abort',
      () => {
        reject(new Error('aborted'));
      },
      { once: true },
    );
  });
}

const SINGLE_MODEL = {
  id: 'gpt-4o',
  contextLength: 128000,
  supportsReasoning: false,
  supportsImageIn: false,
  supportsVideoIn: false,
} as const;

describe('LoginFlow', () => {
  // The catalog-fetch tests below override the module-level fetchCatalog mock
  // (hang / resolve). Restore the default rejecting behavior after each test so
  // every test keeps exercising the built-in fallback path.
  afterEach(() => {
    vi.mocked(fetchCatalog).mockReset();
    vi.mocked(fetchCatalog).mockRejectedValue(new Error('test: no network'));
  });

  it('completes the full flow with model selection', async () => {
    const models = [
      {
        id: 'gpt-4o',
        contextLength: 128000,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
        displayName: 'GPT-4o',
      },
    ];

    const deps = makeDeps({
      fetchModels: vi.fn(async () => models),
    });
    const host = getHost(deps);

    // Run flow in background since each prompt step is async
    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select API type (first option = openai-completions)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Step 2: type provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Step 3: type base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // Step 4: type API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Step 5: select model (first item is already highlighted, press Enter)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    expect(deps.fetchModels).toHaveBeenCalledWith(
      'openai-completions',
      'https://api.example.com/v1',
      'sk-test-key',
    );
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

  it('completes the full flow with openai_responses type', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => [
        {
          id: 'gpt-5.5',
          contextLength: 128000,
          supportsReasoning: true,
          supportsImageIn: true,
          supportsVideoIn: false,
        },
      ]),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select openai_responses (2nd option → down 1)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectNth(host, 1);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'responses');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.openai.com/v1');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    expect(deps.fetchModels).toHaveBeenCalledWith(
      'openai_responses',
      'https://api.openai.com/v1',
      'sk-test',
    );
    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'openai_responses' }),
    );
  });

  it('completes the full flow when the anthropic type is selected', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => [
        {
          id: 'claude-opus-4-7',
          contextLength: 200000,
          supportsReasoning: true,
          supportsImageIn: true,
          supportsVideoIn: false,
          displayName: 'Claude Opus 4.7',
        },
      ]),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select anthropic (3rd option → down x2)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectNth(host, 2);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'anthropic');

    // Base URL left empty → anthropic default
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-ant-test');

    // Model select
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    // Empty base URL fell back to the anthropic official default.
    expect(deps.fetchModels).toHaveBeenCalledWith(
      'anthropic',
      'https://api.anthropic.com/v1',
      'sk-ant-test',
    );
    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'anthropic',
        type: 'anthropic',
        baseUrl: 'https://api.anthropic.com/v1',
      }),
    );
  });

  it('uses the type default base URL when left empty', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => [
        {
          id: 'gpt-4o',
          contextLength: 128000,
          supportsReasoning: false,
          supportsImageIn: false,
          supportsVideoIn: false,
        },
      ]),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions (first option)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'openai');

    // Base URL: leave empty (press Enter on empty text input)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test');

    // Model select
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    // Empty base URL falls back to the openai-completions official default.
    expect(deps.fetchModels).toHaveBeenCalledWith(
      'openai-completions',
      'https://api.openai.com/v1',
      'sk-test',
    );
    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ baseUrl: 'https://api.openai.com/v1' }),
    );
  });

  it('passes the selected type to applyProviderConfig', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => [
        {
          id: 'gpt-4o',
          contextLength: 128000,
          supportsReasoning: false,
          supportsImageIn: false,
          supportsVideoIn: false,
        },
      ]),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions (first option)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: 'openai-completions' }),
    );
  });

  it('cancels at the API type selection step', async () => {
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;

    expect(deps.showStatus).not.toHaveBeenCalled();
    expect(deps.fetchModels).not.toHaveBeenCalled();
  });

  it('rejects invalid provider names', async () => {
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'bad name!');

    await flowPromise;

    expect(deps.showError).toHaveBeenCalledWith(
      'Provider name must contain only letters, numbers, hyphens, and underscores.',
    );
  });

  it('rejects duplicate provider names', async () => {
    const deps = makeDeps({
      getConfig: vi.fn(async () => ({
        providers: { existing: { type: 'openai-completions' as const, baseUrl: 'http://x' } },
        models: {},
      })),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'existing');

    await flowPromise;

    expect(deps.showError).toHaveBeenCalledWith(
      'Provider "existing" already exists. Use a different name or /logout existing first.',
    );
  });

  it('cancels at provider name step', async () => {
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;

    expect(deps.showStatus).not.toHaveBeenCalled();
  });

  it('cancels at base URL step', async () => {
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Type provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Cancel at base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;
  });

  it('cancels at API key step', async () => {
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // Cancel at API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;

    expect(deps.fetchModels).not.toHaveBeenCalled();
  });

  it('falls back to manual model entry when fetch fails', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => {
        throw new Error('Network error');
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'gpt-4o-manual');

    // Context size
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await clearTypeAndEnter(host, '64000');

    await flowPromise;

    expect(deps.showError).toHaveBeenCalledWith('Failed to fetch models: Network error');
    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'myprovider',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-key',
      }),
    );
    expect(deps.track).toHaveBeenCalledWith('login', {
      provider: 'myprovider',
      model: 'gpt-4o-manual',
    });
  });

  it('falls back to manual model entry when no models found', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => []),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'manual-model');

    // Context size
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await clearTypeAndEnter(host, '128000');

    await flowPromise;

    expect(deps.showStatus).toHaveBeenCalledWith(
      'No models found at this endpoint. Enter model ID manually.',
    );
    expect(deps.applyProviderConfig).toHaveBeenCalled();
    expect(deps.track).toHaveBeenCalledWith('login', {
      provider: 'myprovider',
      model: 'manual-model',
    });
  });

  it('ends login flow when fetched model selector is cancelled', async () => {
    const models = [
      {
        id: 'gpt-4o',
        contextLength: 128000,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];
    const deps = makeDeps({
      fetchModels: vi.fn(async () => models),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Cancel model selector
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
    expect(deps.setConfig).not.toHaveBeenCalled();
    expect(deps.refreshConfigAfterLogin).not.toHaveBeenCalled();
  });

  it('cancels at manual model ID step', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => {
        throw new Error('fail');
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Cancel manual model entry
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('cancels at manual context size step', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => {
        throw new Error('fail');
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'manual-model');

    // Cancel context size
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('rejects invalid context size in manual entry', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => {
        throw new Error('fail');
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'manual-model');

    // Invalid context size
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await clearTypeAndEnter(host, 'not-a-number');

    await flowPromise;

    expect(deps.showError).toHaveBeenCalledWith('Invalid context size. Must be a positive number.');
    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('handles ProviderApiError with HTTP status', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => {
        const err = new Error('Unauthorized') as any;
        err.status = 401;
        err.message = 'Unauthorized';
        throw err;
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'manual-model');

    // Context size
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await clearTypeAndEnter(host, '128000');

    await flowPromise;

    expect(deps.showError).toHaveBeenCalledWith('Failed to fetch models (HTTP 401): Unauthorized');
    expect(deps.applyProviderConfig).toHaveBeenCalled();
  });

  it('cancels at model selector step (with fetched models)', async () => {
    const models = [
      {
        id: 'gpt-4o',
        contextLength: 128000,
        supportsReasoning: false,
        supportsImageIn: false,
        supportsVideoIn: false,
      },
    ];
    const deps = makeDeps({
      fetchModels: vi.fn(async () => models),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select openai-completions type
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Cancel model selector
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('manual entry preserves the anthropic type after fetch fails', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => {
        throw new Error('fail');
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Select anthropic (3rd option)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectNth(host, 2);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'antprovider');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.anthropic.com/v1');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-ant-test');
    // manual model ID
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'claude-manual');
    // context size
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await clearTypeAndEnter(host, '200000');

    await flowPromise;

    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'antprovider',
        type: 'anthropic',
      }),
    );
  });

  it('manual entry preserves the openai_responses type after fetch fails', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => {
        throw new Error('fail');
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // openai_responses (2nd)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectNth(host, 1);

    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'resp');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.openai.com/v1');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'gpt-manual');
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await clearTypeAndEnter(host, '128000');

    await flowPromise;

    expect(deps.applyProviderConfig).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'resp',
        type: 'openai_responses',
      }),
    );
  });

  it('registers all loginProviderRegistry types as selectable options', async () => {
    const { getLoginProviderOptions, loginProviderRegistry } = await import('@byfriends/sdk');
    const registryOptions = getLoginProviderOptions();
    const model = {
      id: 'test-model',
      contextLength: 128000,
      supportsReasoning: false,
      supportsImageIn: false,
      supportsVideoIn: false,
    };

    for (let i = 0; i < registryOptions.length; i++) {
      const expectedType = registryOptions[i].value;
      const expectedBaseUrl = loginProviderRegistry[expectedType].defaultBaseUrl;

      const deps = makeDeps({
        fetchModels: vi.fn(async () => [model]),
      });
      const host = getHost(deps);

      const flowPromise = new LoginFlow(deps).run();

      // Step 1: select the i-th type option
      await vi.waitFor(() => {
        expect(host.panel).not.toBeNull();
      });
      if (i === 0) {
        selectHighlighted(host);
      } else {
        selectNth(host, i);
      }

      // Step 2: enter provider name
      await vi.waitFor(() => {
        expect(host.panel).not.toBeNull();
      });
      await typeAndEnter(host, `provider-${i}`);

      // Step 3: leave base URL empty → default base URL fallback
      await vi.waitFor(() => {
        expect(host.panel).not.toBeNull();
      });
      activePanel(host).handleInput('\r');

      // Step 4: enter API key
      await vi.waitFor(() => {
        expect(host.panel).not.toBeNull();
      });
      await typeAndEnter(host, 'sk-test-key');

      // Step 5: select the model
      await vi.waitFor(() => {
        expect(host.panel).not.toBeNull();
      });
      activePanel(host).handleInput('\r');

      await flowPromise;

      expect(deps.fetchModels).toHaveBeenCalledWith(expectedType, expectedBaseUrl, 'sk-test-key');
      expect(deps.applyProviderConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ type: expectedType }),
      );
    }
  });

  // ── Catalog fetch bounding (bug: hanging catalog fetch froze /login) ──

  it('times out a hanging catalog fetch and still completes the login', async () => {
    vi.mocked(fetchCatalog).mockImplementation(hangingCatalogFetch);

    let activeCancel: (() => void) | undefined;
    const deps = makeDeps({
      fetchModels: vi.fn(async () => [SINGLE_MODEL]),
      catalogFetchTimeoutMs: 50,
      setCancelInFlight: vi.fn((cancel) => {
        activeCancel = cancel;
      }),
      clearCancelInFlight: vi.fn(),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select API type (first option = openai-completions)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Step 2: type provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Step 3: type base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // Step 4: type API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // The catalog fetch hangs; the timeout must bound it and the model
    // selector must still appear (catalog is best-effort, ADR 0012).
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    expect(deps.applyProviderConfig).toHaveBeenCalled();
    expect(deps.setConfig).toHaveBeenCalled();
    expect(deps.showError).not.toHaveBeenCalled();

    // Catalog fetch was bounded: a cancel handler was registered and cleared.
    expect(activeCancel).toBeTypeOf('function');
    expect(deps.clearCancelInFlight).toHaveBeenCalledWith(activeCancel);

    // Second spinner = catalog fetch, stopped with the failure label since
    // there is no built-in catalog to fall back to.
    const spinnerResults = vi.mocked(deps.showLoginProgressSpinner).mock.results;
    expect(spinnerResults).toHaveLength(2);
    expect(deps.showLoginProgressSpinner).toHaveBeenNthCalledWith(
      2,
      `Fetching catalog from ${DEFAULT_CATALOG_URL}`,
    );
    expect(spinnerResults[1].value.stop).toHaveBeenCalledWith({
      ok: false,
      label: 'Failed to load catalog.',
    });
  });

  it('falls back to the built-in catalog when a hanging fetch times out', async () => {
    vi.mocked(fetchCatalog).mockImplementation(hangingCatalogFetch);

    const deps = makeDeps({
      fetchModels: vi.fn(async () => [SINGLE_MODEL]),
      catalogFetchTimeoutMs: 50,
      builtInCatalogJson: JSON.stringify({
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
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select API type (first option = openai-completions)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Step 2: type provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Step 3: type base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // Step 4: type API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // The catalog fetch hangs; the timeout must fall back to the built-in
    // catalog (ADR 0012) and the login still completes.
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    expect(deps.showError).not.toHaveBeenCalled();
    expect(deps.applyProviderConfig).toHaveBeenCalled();
    expect(deps.setConfig).toHaveBeenCalled();
    expect(
      vi.mocked(deps.showLoginProgressSpinner).mock.results[1].value.stop,
    ).toHaveBeenCalledWith({ ok: true, label: 'Using built-in catalog (offline mode).' });
  });

  it('aborts the whole login when the user cancels during the catalog fetch', async () => {
    vi.mocked(fetchCatalog).mockImplementation(hangingCatalogFetch);

    let activeCancel: (() => void) | undefined;
    const deps = makeDeps({
      fetchModels: vi.fn(async () => [SINGLE_MODEL]),
      // Generous so the user cancel always wins the race against the timeout.
      catalogFetchTimeoutMs: 1000,
      setCancelInFlight: vi.fn((cancel) => {
        activeCancel = cancel;
      }),
      clearCancelInFlight: vi.fn((cancel) => {
        if (activeCancel === cancel) activeCancel = undefined;
      }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select API type (first option = openai-completions)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Step 2: type provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Step 3: type base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // Step 4: type API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // The catalog fetch registers a cancel handler; invoking it must abort the
    // entire login before any config is written.
    await vi.waitFor(() => {
      expect(activeCancel).toBeTypeOf('function');
    });
    const cancel = activeCancel!;
    cancel();

    await flowPromise;

    expect(deps.setConfig).not.toHaveBeenCalled();
    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
    expect(deps.track).not.toHaveBeenCalled();
    expect(host.panel).toBeNull();
    expect(deps.clearCancelInFlight).toHaveBeenCalledWith(cancel);
    expect(
      vi.mocked(deps.showLoginProgressSpinner).mock.results[1].value.stop,
    ).toHaveBeenCalledWith({ ok: false, label: 'Aborted.' });
  });

  // ── Catalog regression guards ──

  it('continues silently when the catalog fetch fails with no built-in catalog', async () => {
    // Module-level fetchCatalog mock rejects by default; no builtInCatalogJson.
    const deps = makeDeps({
      fetchModels: vi.fn(async () => [SINGLE_MODEL]),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select API type (first option = openai-completions)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Step 2: type provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Step 3: type base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // Step 4: type API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Model selector still appears; /login must not surface the catalog error.
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    expect(deps.showError).not.toHaveBeenCalled();
    expect(deps.applyProviderConfig).toHaveBeenCalled();
    expect(deps.setConfig).toHaveBeenCalled();
    expect(deps.setCancelInFlight).toHaveBeenCalled();
    expect(deps.clearCancelInFlight).toHaveBeenCalled();
    expect(
      vi.mocked(deps.showLoginProgressSpinner).mock.results[1].value.stop,
    ).toHaveBeenCalledWith({ ok: false, label: 'Failed to load catalog.' });
  });

  it('enriches models from a successfully fetched catalog (happy path)', async () => {
    const catalog: Catalog = {
      openai: {
        name: 'OpenAI',
        api: 'https://api.openai.com',
        npm: 'openai',
        models: {
          'gpt-4o': {
            id: 'gpt-4o',
            name: 'GPT-4o',
            limit: { context: 200000 },
            tool_call: true,
            modalities: { input: ['text'], output: ['text'] },
          },
        },
      },
    };
    vi.mocked(fetchCatalog).mockResolvedValue(catalog);

    const deps = makeDeps({
      fetchModels: vi.fn(async () => [SINGLE_MODEL]),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Step 1: select API type (first option = openai-completions)
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    selectHighlighted(host);

    // Step 2: type provider name
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'myprovider');

    // Step 3: type base URL
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'https://api.example.com/v1');

    // Step 4: type API key
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    await typeAndEnter(host, 'sk-test-key');

    // Step 5: select model
    await vi.waitFor(() => {
      expect(host.panel).not.toBeNull();
    });
    activePanel(host).handleInput('\r');

    await flowPromise;

    // Catalog enrichment overrides the provider-reported context length.
    expect(deps.setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        models: expect.objectContaining({
          'myprovider/gpt-4o': expect.objectContaining({ maxContextSize: 200000 }),
        }),
      }),
    );
    expect(
      vi.mocked(deps.showLoginProgressSpinner).mock.results[1].value.stop,
    ).toHaveBeenCalledWith({ ok: true, label: 'Catalog loaded.' });
  });
});

// Bun keeps mock.module across files; restore so later suites see real modules (#215).
afterAll(() => {
  bunMock.restore();
});
