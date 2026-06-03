import { describe, expect, it, vi } from 'vitest';

import { LoginFlow, type LoginFlowDeps } from '#/tui/flows/login-flow';

import type { Component, Focusable } from '@earendil-works/pi-tui';

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

const COLORS = {  primary: '#ffffff',
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
    track: vi.fn(),
    ...overrides,
  } as LoginFlowDeps;
}

describe('LoginFlow', () => {
  it('completes the full flow with model selection', async () => {
    const models = [
      { id: 'gpt-4o', contextLength: 128000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false, displayName: 'GPT-4o' },
    ];

    const deps = makeDeps({
      fetchModels: vi.fn(async () => models),
    });
    const host = getHost(deps);

    // Run flow in background since each prompt step is async
    const flowPromise = new LoginFlow(deps).run();

    // Step 1: type provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Step 2: type base URL (has initialValue, must clear first)
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // Step 3: type API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Step 4: select model (first item is already highlighted, press Enter)
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    activePanel(host).handleInput('\r');

    await flowPromise;

    expect(deps.fetchModels).toHaveBeenCalledWith('https://api.example.com/v1', 'sk-test-key');
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
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
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

    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
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

    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    pressEscape(host);

    await flowPromise;

    expect(deps.showStatus).not.toHaveBeenCalled();
  });

  it('cancels at base URL step', async () => {
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Type provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Cancel at base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    pressEscape(host);

    await flowPromise;
  });

  it('cancels at API key step', async () => {
    const deps = makeDeps();
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // Cancel at API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
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

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'gpt-4o-manual');

    // Context size
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
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
    expect(deps.track).toHaveBeenCalledWith('login', { provider: 'myprovider', model: 'gpt-4o-manual' });
  });

  it('falls back to manual model entry when no models found', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => []),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'manual-model');

    // Context size
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, '128000');

    await flowPromise;

    expect(deps.showStatus).toHaveBeenCalledWith('No models found at this endpoint. Enter model ID manually.');
    expect(deps.applyProviderConfig).toHaveBeenCalled();
    expect(deps.track).toHaveBeenCalledWith('login', { provider: 'myprovider', model: 'manual-model' });
  });

  it('ends login flow when fetched model selector is cancelled', async () => {
    const models = [
      { id: 'gpt-4o', contextLength: 128000, supportsReasoning: false, supportsImageIn: false, supportsVideoIn: false },
    ];
    const deps = makeDeps({
      fetchModels: vi.fn(async () => models),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Cancel model selector
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
    expect(deps.setConfig).not.toHaveBeenCalled();
    expect(deps.refreshConfigAfterLogin).not.toHaveBeenCalled();
  });

  it('cancels at manual model ID step', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => { throw new Error('fail'); }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Cancel manual model entry
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('cancels at manual context size step', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => { throw new Error('fail'); }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'manual-model');

    // Cancel context size
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });

  it('rejects invalid context size in manual entry', async () => {
    const deps = makeDeps({
      fetchModels: vi.fn(async () => { throw new Error('fail'); }),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'manual-model');

    // Invalid context size
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
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

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Manual model ID
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'manual-model');

    // Context size
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, '128000');

    await flowPromise;

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
      fetchModels: vi.fn(async () => models),
    });
    const host = getHost(deps);

    const flowPromise = new LoginFlow(deps).run();

    // Provider name
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'myprovider');

    // Base URL
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await clearTypeAndEnter(host, 'https://api.example.com/v1');

    // API key
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    await typeAndEnter(host, 'sk-test-key');

    // Cancel model selector
    await vi.waitFor(() =>{  expect(host.panel).not.toBeNull(); });
    pressEscape(host);

    await flowPromise;

    expect(deps.applyProviderConfig).not.toHaveBeenCalled();
  });
});
