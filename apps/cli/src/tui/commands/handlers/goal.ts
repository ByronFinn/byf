// /goal — calls actions/goal.ts directly (PRD-0021 AC15).

import { handleGoalCommand as runGoalAction } from '#/tui/actions/goal';
import { parseGoalCommand } from '#/tui/commands/goal';
import { NO_ACTIVE_SESSION_MESSAGE } from '#/tui/constant/byf-tui';

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

export function createGoalHandlers(host: SlashCommandHost): Record<'goal', SlashCommandHandler> {
  return {
    goal: async (args) => {
      const session = host.getSession();
      if (session === undefined) {
        host.showError(NO_ACTIVE_SESSION_MESSAGE);
        return;
      }

      const command = parseGoalCommand(args);
      await runGoalAction(session, command, {
        showStatus: (msg) => {
          host.showStatus(msg);
        },
        showError: (msg) => {
          host.showError(msg);
        },
        abortActiveTurn: () => {
          host.cancelCurrentStream();
        },
        appendTranscriptLine: (msg) => {
          host.appendTranscriptStatus(msg);
        },
      });
      // PRD-0019 R5: creating a goal must start the first user turn.
      if (command.kind === 'create') {
        host.sendNormalUserInput(command.objective);
      }
      host.requestRender();
    },
  };
}
