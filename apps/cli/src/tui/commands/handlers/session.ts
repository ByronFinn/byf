// Session lifecycle slash commands: exit / help / version / new / sessions.

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

export function createSessionHandlers(
  host: SlashCommandHost,
): Record<'exit' | 'help' | 'version' | 'new' | 'sessions', SlashCommandHandler> {
  return {
    exit: async () => {
      host.stop();
    },
    help: async () => {
      host.dialogManager.showHelpPanel();
    },
    version: async () => {
      host.showStatus(`Byf Code v${host.getVersion()}`);
    },
    new: async () => {
      await host.createNewSession();
      host.requestRender();
    },
    sessions: async () => {
      await host.dialogManager.showSessionPicker();
    },
  };
}
