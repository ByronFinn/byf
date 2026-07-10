import { describe, expect, it, vi } from 'vitest';

import { SlashCommandHandlerRegistry } from '#/tui/commands/handler-registry';
import { registerBuiltinSlashHandlers } from '#/tui/commands/handlers';
import { NO_ACTIVE_SESSION_MESSAGE } from '#/tui/constant/byf-tui';
import { FEEDBACK_ISSUE_URL } from '#/tui/constant/feedback';

import { createMockHost, createMockSession } from './helpers';

// Module mock for open-url so /feedback doesn't actually open a browser.
vi.mock('#/tui/utils/open-url', () => ({ openUrl: vi.fn() }));

// Imported after the mock so we can assert against the stubbed function.
const { openUrl } = await import('#/tui/utils/open-url');

function registryFor(host = createMockHost()) {
  const registry = new SlashCommandHandlerRegistry();
  registerBuiltinSlashHandlers(registry, host);
  return { registry, host };
}

describe('createConfigHandlers', () => {
  describe('/title', () => {
    it('shows the current title when args are empty', async () => {
      const host = createMockHost({
        getAppState: () =>
          ({
            availableModels: {},
            sessionTitle: 'My Session',
            sessionId: 'sess-1',
            yolo: false,
            model: '',
            permissionMode: 'manual',
            maxContextTokens: 0,
          }) as never,
      });
      const { registry } = registryFor(host);
      await registry.get('title')?.('   ');
      expect(host.showStatus).toHaveBeenCalledWith('Session title: My Session');
    });

    it('shows the session id when no title is set', async () => {
      const { registry, host } = registryFor();
      await registry.get('title')?.('');
      expect(host.showStatus).toHaveBeenCalledWith('Session title: (not set) — id: sess-1');
    });

    it('renames the session and caps to 200 chars', async () => {
      const session = createMockSession();
      const host = createMockHost({ getSession: () => session });
      const { registry } = registryFor(host);
      const long = 'x'.repeat(250);
      await registry.get('title')?.(long);
      expect(host.renameSession).toHaveBeenCalledWith({ id: 'sess-1', title: 'x'.repeat(200) });
      expect(host.showStatus).toHaveBeenCalledWith(`Session title set to: ${'x'.repeat(200)}`);
    });

    it('errors when no session', async () => {
      const { registry, host } = registryFor();
      await registry.get('title')?.('New Title');
      expect(host.showError).toHaveBeenCalledWith(NO_ACTIVE_SESSION_MESSAGE);
      expect(host.renameSession).not.toHaveBeenCalled();
    });
  });

  describe('/yolo', () => {
    it('errors when no session', async () => {
      const { registry, host } = registryFor();
      await registry.get('yolo')?.('on');
      expect(host.showError).toHaveBeenCalledWith(NO_ACTIVE_SESSION_MESSAGE);
    });

    it('turns yolo on explicitly', async () => {
      const session = createMockSession();
      const host = createMockHost({ getSession: () => session });
      const { registry } = registryFor(host);
      await registry.get('yolo')?.('on');
      expect(session.setPermission).toHaveBeenCalledWith('yolo');
      expect(host.setAppState).toHaveBeenCalledWith({ yolo: true, permissionMode: 'yolo' });
      expect(host.showNotice).toHaveBeenCalledWith(
        'YOLO mode: ON',
        'All actions will be approved automatically. Use with caution.',
      );
    });

    it('turns yolo off explicitly', async () => {
      const session = createMockSession();
      const host = createMockHost({ getSession: () => session });
      const { registry } = registryFor(host);
      await registry.get('yolo')?.('off');
      expect(session.setPermission).toHaveBeenCalledWith('manual');
      expect(host.setAppState).toHaveBeenCalledWith({ yolo: false, permissionMode: 'manual' });
      expect(host.showNotice).toHaveBeenCalledWith('YOLO mode: OFF');
    });

    it('toggles off when currently on', async () => {
      const session = createMockSession();
      const host = createMockHost({
        getSession: () => session,
        getAppState: () =>
          ({
            availableModels: {},
            sessionTitle: null,
            sessionId: 'sess-1',
            yolo: true,
            model: '',
            permissionMode: 'yolo',
            maxContextTokens: 0,
          }) as never,
      });
      const { registry } = registryFor(host);
      await registry.get('yolo')?.('');
      expect(session.setPermission).toHaveBeenCalledWith('manual');
    });

    it('toggles on when currently off', async () => {
      const session = createMockSession();
      const host = createMockHost({ getSession: () => session });
      const { registry } = registryFor(host);
      await registry.get('yolo')?.('garbage');
      expect(session.setPermission).toHaveBeenCalledWith('yolo');
    });
  });

  describe('/compact', () => {
    it('errors when no session', async () => {
      const { registry, host } = registryFor();
      await registry.get('compact')?.('');
      expect(host.showError).toHaveBeenCalledWith(NO_ACTIVE_SESSION_MESSAGE);
    });

    it('passes a trimmed instruction', async () => {
      const session = createMockSession();
      const host = createMockHost({ getSession: () => session });
      const { registry } = registryFor(host);
      await registry.get('compact')?.('  keep the API design  ');
      expect(session.compact).toHaveBeenCalledWith({ instruction: 'keep the API design' });
    });

    it('passes undefined when args are blank', async () => {
      const session = createMockSession();
      const host = createMockHost({ getSession: () => session });
      const { registry } = registryFor(host);
      await registry.get('compact')?.('   ');
      expect(session.compact).toHaveBeenCalledWith({ instruction: undefined });
    });
  });

  describe('/fork', () => {
    it('errors when no session', async () => {
      const { registry, host } = registryFor();
      await registry.get('fork')?.('');
      expect(host.showError).toHaveBeenCalledWith(NO_ACTIVE_SESSION_MESSAGE);
    });

    it('errors when there are no user messages', async () => {
      const session = createMockSession();
      const host = createMockHost({ getSession: () => session });
      const { registry } = registryFor(host);
      await registry.get('fork')?.('');
      expect(host.showError).toHaveBeenCalledWith('No user messages to fork from in this session.');
      expect(host.dialogManager.showForkRewindPicker).not.toHaveBeenCalled();
    });

    it('builds picker options including the full-copy entry and wires select', async () => {
      const session = createMockSession();
      const host = createMockHost({
        getSession: () => session,
        getUserMessageContents: () => ['first message', 'second message'],
      });
      const { registry } = registryFor(host);
      await registry.get('fork')?.('');

      const call = host.dialogManager.showForkRewindPicker.mock.calls[0];
      expect(call).toBeDefined();
      const [options, onSelect, onCancel] = call!;

      // 2 user messages + 1 full-copy entry
      expect(options).toHaveLength(3);
      expect(options[0]).toMatchObject({ value: '1' });
      expect(options[2]).toMatchObject({ value: '0' });
      expect(options[2].label).toContain('full copy');

      // Selecting an ordinal message triggers a fork rewind up to that point.
      onSelect('1');
      expect(host.performForkRewind).toHaveBeenCalledWith(session, 1);

      // The full-copy sentinel ('0') rewinds everything (undefined upToMessage).
      host.performForkRewind.mockClear();
      onSelect('0');
      expect(host.performForkRewind).toHaveBeenCalledWith(session, undefined);

      // Cancel surfaces a status line.
      onCancel();
      expect(host.showStatus).toHaveBeenCalledWith('Fork cancelled.');
    });
  });

  it('/init delegates to runInitCommand', async () => {
    const { registry, host } = registryFor();
    await registry.get('init')?.('');
    expect(host.runInitCommand).toHaveBeenCalledTimes(1);
  });

  describe('/feedback', () => {
    it('shows the feedback URL as status and opens it in a browser', async () => {
      vi.mocked(openUrl).mockClear();
      const { registry, host } = registryFor();
      await registry.get('feedback')?.('');

      expect(host.showStatus).toHaveBeenCalledWith(FEEDBACK_ISSUE_URL);
      expect(openUrl).toHaveBeenCalledTimes(1);
      expect(openUrl).toHaveBeenCalledWith(FEEDBACK_ISSUE_URL);
    });
  });
});
