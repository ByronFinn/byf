import { describe, expect, it, vi } from 'vitest';

import { SlashCommandHandlerRegistry } from '#/tui/commands/handler-registry';
import { registerBuiltinSlashHandlers } from '#/tui/commands/handlers';

import { createMockHost } from './helpers';

// Helper: register all handlers against a fresh registry and return it,
// bound to the given host (so each test overrides just the seams it needs).
function registryFor(host = createMockHost()): {
  registry: SlashCommandHandlerRegistry;
  host: ReturnType<typeof createMockHost>;
} {
  const registry = new SlashCommandHandlerRegistry();
  registerBuiltinSlashHandlers(registry, host);
  return { registry, host };
}

describe('createSessionHandlers', () => {
  it('/exit calls host.stop()', async () => {
    const { registry, host } = registryFor();
    await registry.get('exit')?.('');
    expect(host.stop).toHaveBeenCalledTimes(1);
  });

  it('/help opens the help panel via dialogManager', async () => {
    const { registry, host } = registryFor();
    await registry.get('help')?.('');
    expect(host.dialogManager.showHelpPanel).toHaveBeenCalledTimes(1);
  });

  it('/version shows status with the host version', async () => {
    const { registry, host } = registryFor();
    await registry.get('version')?.('');
    expect(host.showStatus).toHaveBeenCalledWith('Byf Code v9.9.9-test');
  });

  it('/new creates a session then requests a render', async () => {
    const { registry, host } = registryFor();
    await registry.get('new')?.('');
    expect(host.createNewSession).toHaveBeenCalledTimes(1);
    expect(host.requestRender).toHaveBeenCalledTimes(1);
    // render happens after session creation (order matters for TUI refresh)
    const renderOrder = vi.mocked(host.requestRender).mock.invocationCallOrder[0];
    const createOrder = vi.mocked(host.createNewSession).mock.invocationCallOrder[0];
    if (renderOrder === undefined || createOrder === undefined) {
      throw new Error('expected both the render and session-creation mocks to run');
    }
    expect(renderOrder).toBeGreaterThan(createOrder);
  });

  it('/sessions opens the session picker via dialogManager', async () => {
    const { registry, host } = registryFor();
    await registry.get('sessions')?.('');
    expect(host.dialogManager.showSessionPicker).toHaveBeenCalledTimes(1);
  });
});
