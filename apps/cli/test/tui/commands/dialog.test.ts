import { describe, expect, it } from 'vitest';

import { SlashCommandHandlerRegistry } from '#/tui/commands/handler-registry';
import { registerBuiltinSlashHandlers } from '#/tui/commands/handlers';
import type { SlashCommandHost } from '#/tui/commands/handlers';

import { createMockHost } from './helpers';

function registryFor(host = createMockHost()) {
  const registry = new SlashCommandHandlerRegistry();
  registerBuiltinSlashHandlers(registry, host);
  return { registry, host };
}

// Build a host then apply overrides on top, so partial overrides keep the
// rest of the stubbed surface intact.
function registryWith(overrides: Partial<SlashCommandHost>) {
  return registryFor(createMockHost(overrides));
}

describe('createDialogHandlers', () => {
  describe('/tasks and /agent session guard', () => {
    it('shows an error and skips the browser when no session', async () => {
      const { registry, host } = registryFor(); // default host: no session
      await registry.get('tasks')?.('');
      expect(host.showError).toHaveBeenCalledWith('No active session.');
      expect(host.showTasksBrowser).not.toHaveBeenCalled();
    });

    it('opens the tasks browser when a session is active', async () => {
      const { registry, host } = registryWith({ getSession: () => ({ id: 's1' }) as never });
      await registry.get('tasks')?.('');
      expect(host.showError).not.toHaveBeenCalled();
      expect(host.showTasksBrowser).toHaveBeenCalledTimes(1);
    });

    it('shows an error and skips the viewer when no session', async () => {
      const { registry, host } = registryFor();
      await registry.get('agent')?.('');
      expect(host.showError).toHaveBeenCalledWith('No active session.');
      expect(host.showSubagentsViewer).not.toHaveBeenCalled();
    });

    it('opens the subagents viewer when a session is active', async () => {
      const { registry, host } = registryWith({ getSession: () => ({ id: 's1' }) as never });
      await registry.get('agent')?.('');
      expect(host.showSubagentsViewer).toHaveBeenCalledTimes(1);
    });
  });

  it('/mcp routes to dialogManager.showMcpServers', async () => {
    const { registry, host } = registryFor();
    await registry.get('mcp')?.('');
    expect(host.dialogManager.showMcpServers).toHaveBeenCalledTimes(1);
  });

  it('/permission opens the permission picker', async () => {
    const { registry, host } = registryFor();
    await registry.get('permission')?.('');
    expect(host.dialogManager.showPermissionPicker).toHaveBeenCalledTimes(1);
  });

  it('/settings opens the settings selector', async () => {
    const { registry, host } = registryFor();
    await registry.get('settings')?.('');
    expect(host.dialogManager.showSettingsSelector).toHaveBeenCalledTimes(1);
  });

  it('/usage routes to dialogManager.showUsage', async () => {
    const { registry, host } = registryFor();
    await registry.get('usage')?.('');
    expect(host.dialogManager.showUsage).toHaveBeenCalledTimes(1);
  });

  it('/status routes to dialogManager.showStatusReport', async () => {
    const { registry, host } = registryFor();
    await registry.get('status')?.('');
    expect(host.dialogManager.showStatusReport).toHaveBeenCalledTimes(1);
  });

  it('/btw forwards args to the btw controller', async () => {
    const { registry, host } = registryFor();
    await registry.get('btw')?.('remember this');
    expect(host.showBtw).toHaveBeenCalledWith('remember this');
    expect(host.showBtw).toHaveBeenCalledTimes(1);
  });

  it('/btw forwards empty args unchanged', async () => {
    const { registry, host } = registryFor();
    await registry.get('btw')?.('');
    expect(host.showBtw).toHaveBeenCalledWith('');
  });
});
