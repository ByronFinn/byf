import { describe, expect, it } from 'vitest';

import { SlashCommandHandlerRegistry } from '#/tui/commands/handler-registry';
import { registerBuiltinSlashHandlers } from '#/tui/commands/handlers';

import { createMockHost } from './helpers';

function registryFor(host = createMockHost()) {
  const registry = new SlashCommandHandlerRegistry();
  registerBuiltinSlashHandlers(registry, host);
  return { registry, host };
}

describe('createEditorHandlers', () => {
  describe('/editor', () => {
    it('opens the picker when args are empty', async () => {
      const { registry, host } = registryFor();
      await registry.get('editor')?.('   ');
      expect(host.dialogManager.showEditorPicker).toHaveBeenCalledTimes(1);
      expect(host.applyEditorChoice).not.toHaveBeenCalled();
    });

    it('applies the command when args are present', async () => {
      const { registry, host } = registryFor();
      await registry.get('editor')?.('code --wait');
      expect(host.applyEditorChoice).toHaveBeenCalledWith('code --wait');
      expect(host.dialogManager.showEditorPicker).not.toHaveBeenCalled();
    });
  });

  describe('/theme', () => {
    it('opens the picker when args are empty', async () => {
      const { registry, host } = registryFor();
      await registry.get('theme')?.('');
      expect(host.dialogManager.showThemePicker).toHaveBeenCalledTimes(1);
      expect(host.applyThemeChoice).not.toHaveBeenCalled();
    });

    it('shows an error for an unknown theme and does not apply it', async () => {
      const { registry, host } = registryFor();
      await registry.get('theme')?.('neon');
      expect(host.showError).toHaveBeenCalledWith('Unknown theme: neon');
      expect(host.applyThemeChoice).not.toHaveBeenCalled();
    });

    it.each(['dark', 'light', 'auto'] as const)('applies a known theme (%s)', async (theme) => {
      const { registry, host } = registryFor();
      await registry.get('theme')?.(theme);
      expect(host.applyThemeChoice).toHaveBeenCalledWith(theme);
      expect(host.showError).not.toHaveBeenCalled();
    });
  });

  describe('/model', () => {
    it('opens the picker when args are empty', async () => {
      const { registry, host } = registryFor();
      await registry.get('model')?.('');
      expect(host.dialogManager.showModelPicker).toHaveBeenCalledTimes(1);
    });

    it('shows an error for an unknown model alias', async () => {
      const { registry, host } = registryFor();
      await registry.get('model')?.('nope');
      expect(host.showError).toHaveBeenCalledWith('Unknown model alias: nope');
      expect(host.dialogManager.showModelPicker).not.toHaveBeenCalled();
    });

    it('opens the picker seeded with a known alias', async () => {
      const host = createMockHost({
        getAppState: () =>
          ({
            availableModels: { 'gpt-4': { provider: 'p', model: 'gpt-4' } as never },
            sessionTitle: null,
            sessionId: 'sess-1',
            yolo: false,
            model: '',
            permissionMode: 'manual',
            maxContextTokens: 0,
          }) as never,
      });
      const { registry } = registryFor(host);
      await registry.get('model')?.('gpt-4');
      expect(host.dialogManager.showModelPicker).toHaveBeenCalledWith('gpt-4');
      expect(host.showError).not.toHaveBeenCalled();
    });
  });
});
