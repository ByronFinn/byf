/**
 * Pure formatter for session-cron `cron.fired` TUI notice cards (PRD-0023 #244).
 *
 * Kept out of ByfTui so the title/detail rules are unit-testable without
 * spinning up the full interactive host.
 */

export interface CronFiredNoticeOrigin {
  readonly jobId: string;
  readonly stale: boolean;
  readonly coalescedCount: number;
}

export interface CronFiredNotice {
  readonly title: string;
  readonly detail: string;
}

const DETAIL_MAX = 200;

/**
 * Build the notice title + detail for a `cron.fired` wire event.
 * Detail is truncated at 200 characters with an ellipsis when longer.
 */
export function formatCronFiredNotice(
  origin: CronFiredNoticeOrigin,
  prompt: string,
): CronFiredNotice {
  const stale = origin.stale ? ' · stale' : '';
  const coalesce = origin.coalescedCount > 1 ? ` · coalesced×${String(origin.coalescedCount)}` : '';
  return {
    title: `Cron ${origin.jobId} fired${stale}${coalesce}`,
    detail: prompt.length > DETAIL_MAX ? `${prompt.slice(0, DETAIL_MAX)}…` : prompt,
  };
}
