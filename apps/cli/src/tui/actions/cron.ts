/**
 * /cron command actions (PRD-0024).
 *
 * List writes a transcript block; delete uses a status toast.
 * Host-path delete does not go through CronDelete tool permission (ADR-0030).
 */

import type { CronTaskSnapshot, Session } from '@byfriends/sdk';

import type { CronCommand } from '#/tui/commands/cron';

export type CronSession = Pick<Session, 'getCronTasks' | 'deleteCronTask'>;

export interface CronActionCallbacks {
  showStatus(message: string): void;
  showError(message: string): void;
  appendTranscriptLine(message: string): void;
}

const PROMPT_PREVIEW_MAX = 80;

export async function handleCronCommand(
  session: CronSession,
  command: CronCommand,
  callbacks: CronActionCallbacks,
): Promise<void> {
  switch (command.kind) {
    case 'list': {
      const { tasks } = await session.getCronTasks();
      callbacks.appendTranscriptLine(formatCronList(tasks));
      return;
    }
    case 'delete': {
      const { deleted } = await session.deleteCronTask(command.id);
      if (deleted) {
        callbacks.showStatus(`Deleted cron job ${command.id}.`);
      } else {
        callbacks.showError(`No cron job with id ${command.id}.`);
      }
      return;
    }
    case 'error': {
      callbacks.showError(command.message);
      return;
    }
    default: {
      const _exhaustive: never = command;
      callbacks.showError(`Unknown /cron command: ${String(_exhaustive)}`);
    }
  }
}

/** Pure formatter for unit tests + live list. */
export function formatCronList(tasks: readonly CronTaskSnapshot[]): string {
  if (tasks.length === 0) {
    return 'cron_jobs: 0\nNo cron jobs scheduled.';
  }
  const blocks = tasks.map((t) => formatCronTaskBlock(t));
  return `cron_jobs: ${String(tasks.length)}\n${blocks.join('\n---\n')}`;
}

export function formatCronTaskBlock(task: CronTaskSnapshot): string {
  const next =
    task.nextFireAt === null || task.nextFireAt === undefined
      ? 'none'
      : formatLocalIsoWithOffset(task.nextFireAt);
  const prompt = truncatePrompt(task.prompt);
  return [
    `id: ${task.id}`,
    `cron: ${task.cron}`,
    `humanSchedule: ${task.humanSchedule}`,
    `prompt: ${JSON.stringify(prompt)}`,
    `nextFireAt: ${next}`,
    `recurring: ${String(task.recurring)}`,
  ].join('\n');
}

export function truncatePrompt(prompt: string, max = PROMPT_PREVIEW_MAX): string {
  if (prompt.length <= max) return prompt;
  return `${prompt.slice(0, max)}…`;
}

/** Local wall time with offset (CLI-side; avoids depending on agent-core). */
export function formatLocalIsoWithOffset(ms: number): string {
  const d = new Date(ms);
  if (!Number.isFinite(ms) || Number.isNaN(d.getTime())) {
    return 'none';
  }
  const pad = (n: number, w = 2): string => String(n).padStart(w, '0');
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const abs = Math.abs(offMin);
  return (
    `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
