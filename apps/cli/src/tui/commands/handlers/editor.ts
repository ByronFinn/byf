// Editor / theme / model slash commands.

import { isTheme } from '#/tui/theme';

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

export function createEditorHandlers(
  host: SlashCommandHost,
): Record<'editor' | 'theme' | 'model', SlashCommandHandler> {
  return {
    editor: async (args) => {
      const command = args.trim();
      if (command.length === 0) {
        host.dialogManager.showEditorPicker();
        return;
      }
      await host.applyEditorChoice(command);
    },
    theme: async (args) => {
      const theme = args.trim();
      if (theme.length === 0) {
        host.dialogManager.showThemePicker();
        return;
      }
      if (!isTheme(theme)) {
        host.showError(`Unknown theme: ${theme}`);
        return;
      }
      await host.applyThemeChoice(theme);
    },
    model: async (args) => {
      const alias = args.trim();
      if (alias.length === 0) {
        host.dialogManager.showModelPicker();
        return;
      }
      if (host.getAppState().availableModels[alias] === undefined) {
        host.showError(`Unknown model alias: ${alias}`);
        return;
      }
      host.dialogManager.showModelPicker(alias);
    },
  };
}
