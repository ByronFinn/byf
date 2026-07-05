/**
 * /goal command action handler (PRD-0019 #204).
 *
 * Pure dispatch from a parsed `GoalCommand` onto a Session. UI rendering
 * (footer badge / completion card / transcript marker) lives in #205 — this
 * module only mutates session state and emits the user-facing status line
 * that the transcript shares with the UI layer.
 */

import type { GoalSnapshot, Session } from '@byfriends/sdk';
import { renderStatusLine } from '@byfriends/sdk';

import type { GoalCommand } from '#/tui/commands/goal';

export type GoalSession = Pick<
  Session,
  'createGoal' | 'getGoal' | 'pauseGoal' | 'resumeGoal' | 'cancelGoal'
>;

export interface GoalActionCallbacks {
  /** Show a transient status line (auto-dismisses). */
  showStatus(message: string): void;
  /** Show an error line. */
  showError(message: string): void;
  /** Append a persistent transcript line (e.g. /goal status snapshot). */
  appendTranscriptLine(message: string): void;
}

/**
 * Execute a parsed /goal command against the session. Returns a short status
 * string suitable for a transient toast; transcript persistence is the
 * caller's responsibility (via `appendTranscriptLine` for the `status` sub-
 * command, which writes a one-line snapshot per PRD R13).
 */
export async function handleGoalCommand(
  session: GoalSession,
  command: GoalCommand,
  callbacks: GoalActionCallbacks,
): Promise<void> {
  switch (command.kind) {
    case 'status': {
      const snapshot = await session.getGoal();
      if (snapshot === null) {
        callbacks.showStatus('No active goal.');
        return;
      }
      // /goal status always writes a transcript line per PRD R13 — same
      // information channel as the footer badge, never a floating panel.
      callbacks.appendTranscriptLine(renderStatusLine(snapshot));
      return;
    }
    case 'pause': {
      await session.pauseGoal();
      callbacks.showStatus('Goal paused — current turn finishes, then halts.');
      return;
    }
    case 'resume': {
      await session.resumeGoal();
      callbacks.showStatus('Goal resumed.');
      return;
    }
    case 'cancel': {
      // Cancel is a hard stop — the driver aborts the active turn at the next
      // boundary (ADR-0025). The SDK call clears goal state; the abort signal
      // is wired in byf-tui.ts via the same code path as Esc.
      await session.cancelGoal();
      callbacks.showStatus('Goal cancelled.');
      return;
    }
    case 'create': {
      await session.createGoal(command.objective, {
        replace: command.replace,
        budget: command.budget,
      });
      callbacks.showStatus(
        command.replace ? 'Goal replaced.' : `Goal created: ${command.objective}`,
      );
      return;
    }
    case 'error': {
      if (command.severity === 'warn') callbacks.showStatus(command.message);
      else callbacks.showError(command.message);
      return;
    }
    default: {
      const _exhaustive: never = command;
      callbacks.showError(`Unknown /goal command: ${String(_exhaustive)}`);
    }
  }
}

/** Render a one-line summary of a snapshot for UI surfaces (footer badge). */
export function summarizeGoalSnapshot(snapshot: GoalSnapshot | null): string | null {
  if (snapshot === null) return null;
  return renderStatusLine(snapshot);
}
