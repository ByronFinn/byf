// Dialog / panel slash commands that mostly open an existing controller.

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

export function createDialogHandlers(
  host: SlashCommandHost,
): Record<
  'tasks' | 'agent' | 'mcp' | 'permission' | 'settings' | 'usage' | 'status' | 'btw',
  SlashCommandHandler
> {
  return {
    tasks: async () => {
      if (host.getSession() === undefined) {
        host.showError('No active session.');
        return;
      }
      host.showTasksBrowser();
    },
    agent: async () => {
      if (host.getSession() === undefined) {
        host.showError('No active session.');
        return;
      }
      host.showSubagentsViewer();
    },
    mcp: async () => {
      await host.dialogManager.showMcpServers();
    },
    permission: async () => {
      host.dialogManager.showPermissionPicker();
    },
    settings: async () => {
      host.dialogManager.showSettingsSelector();
    },
    usage: async () => {
      await host.dialogManager.showUsage();
    },
    status: async () => {
      await host.dialogManager.showStatusReport();
    },
    btw: async (args) => {
      await host.showBtw(args);
    },
  };
}
