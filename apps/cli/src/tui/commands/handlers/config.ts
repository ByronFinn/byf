// Config / session-ops slash commands: title / yolo / compact / fork / init / feedback.

import { NO_ACTIVE_SESSION_MESSAGE } from '#/tui/constant/byf-tui';
import { FEEDBACK_ISSUE_URL } from '#/tui/constant/feedback';
import { formatErrorMessage } from '#/tui/utils/event-payload';
import { openUrl } from '#/tui/utils/open-url';

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

export function createConfigHandlers(
  host: SlashCommandHost,
): Record<'title' | 'yolo' | 'compact' | 'fork' | 'init' | 'feedback', SlashCommandHandler> {
  return {
    title: async (args) => {
      const title = args.trim();
      if (title.length === 0) {
        const current = host.getAppState().sessionTitle;
        host.showStatus(
          current !== null && current.length > 0
            ? `Session title: ${current}`
            : `Session title: (not set) — id: ${host.getAppState().sessionId}`,
        );
        return;
      }

      const session = host.getSession();
      if (session === undefined) {
        host.showError(NO_ACTIVE_SESSION_MESSAGE);
        return;
      }

      const newTitle = title.slice(0, 200);
      try {
        await host.renameSession({ id: session.id, title: newTitle });
      } catch (error) {
        host.showError(`Failed to set title: ${formatErrorMessage(error)}`);
        return;
      }
      host.showStatus(`Session title set to: ${newTitle}`);
    },

    yolo: async (args) => {
      const session = host.getSession();
      if (session === undefined) {
        host.showError(NO_ACTIVE_SESSION_MESSAGE);
        return;
      }

      let enabled: boolean;
      if (args === 'on') enabled = true;
      else if (args === 'off') enabled = false;
      else enabled = !host.getAppState().yolo;

      await session.setPermission(enabled ? 'yolo' : 'manual');
      host.setAppState({ yolo: enabled, permissionMode: enabled ? 'yolo' : 'manual' });
      if (enabled) {
        host.showNotice(
          'YOLO mode: ON',
          'All actions will be approved automatically. Use with caution.',
        );
        return;
      }
      host.showNotice('YOLO mode: OFF');
    },

    compact: async (args) => {
      const session = host.getSession();
      if (session === undefined) {
        host.showError(NO_ACTIVE_SESSION_MESSAGE);
        return;
      }
      const customInstruction = args.trim() || undefined;
      await session.compact({ instruction: customInstruction });
    },

    fork: async (_args) => {
      const session = host.getSession();
      if (session === undefined) {
        host.showError(NO_ACTIVE_SESSION_MESSAGE);
        return;
      }

      const userMessages = host.getUserMessageContents();
      if (userMessages.length === 0) {
        host.showError('No user messages to fork from in this session.');
        return;
      }

      const options = userMessages.map((content, index) => {
        const ordinal = index + 1;
        return {
          value: String(ordinal),
          label: `${ordinal}. ${summarizeUserMessage(content)}`,
        };
      });
      options.push({
        value: '0',
        label: `${userMessages.length + 1}. After last message (full copy)`,
      });

      host.dialogManager.showForkRewindPicker(
        options,
        (value) => {
          const ordinal = Number.parseInt(value, 10);
          const upToMessage = ordinal > 0 ? ordinal : undefined;
          void host.performForkRewind(session, upToMessage);
        },
        () => {
          host.showStatus('Fork cancelled.');
        },
      );
    },

    init: async () => {
      await host.runInitCommand();
    },

    feedback: async () => {
      host.showStatus(FEEDBACK_ISSUE_URL);
      openUrl(FEEDBACK_ISSUE_URL);
    },
  };
}

/**
 * Builds a short single-line summary of a user message for the fork rewind
 * picker. Collapses whitespace and truncates so the list stays scannable.
 */
function summarizeUserMessage(content: string): string {
  const collapsed = content.replaceAll(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return '(empty message)';
  return collapsed.length > 60 ? `${collapsed.slice(0, 60)}…` : collapsed;
}
