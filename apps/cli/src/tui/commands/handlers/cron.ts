// /cron — list/delete session cron tasks (PRD-0024).

import { handleCronCommand as runCronAction } from '#/tui/actions/cron';
import { parseCronCommand } from '#/tui/commands/cron';
import { NO_ACTIVE_SESSION_MESSAGE } from '#/tui/constant/byf-tui';

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

export function createCronHandlers(host: SlashCommandHost): Record<'cron', SlashCommandHandler> {
  return {
    cron: async (args) => {
      const session = host.getSession();
      if (session === undefined) {
        host.showError(NO_ACTIVE_SESSION_MESSAGE);
        return;
      }

      const command = parseCronCommand(args);
      await runCronAction(session, command, {
        showStatus: (msg) => {
          host.showStatus(msg);
        },
        showError: (msg) => {
          host.showError(msg);
        },
        appendTranscriptLine: (msg) => {
          host.appendTranscriptStatus(msg);
        },
      });
      host.requestRender();
    },
  };
}
