/**
 * Pure functions that render goal lifecycle transitions into user-facing
 * prose (PRD-0019 R14). They run from the `goal.updated` event snapshot in
 * both live and replay paths, so any change here automatically stays
 * consistent across both rendering modes.
 *
 * Kept dependency-free on purpose: the CLI (#205) imports these so the
 * wording is shared instead of duplicated.
 */

import type { GoalSnapshot } from '../../../agent/goal/types';

/** Render the completion summary line for a finished goal. */
export function renderCompletionSummary(snapshot: GoalSnapshot, reason?: string): string {
  const usageLine = formatUsage(snapshot);
  const tail = reason && reason.trim().length > 0 ? ` — ${reason.trim()}` : '';
  return `Goal complete: ${snapshot.objective}${tail}\n${usageLine}`;
}

/** Render the blocked-reason line for a goal that hit a blocker. */
export function renderBlockedReason(snapshot: GoalSnapshot): string {
  const usageLine = formatUsage(snapshot);
  const reason = snapshot.blockedReason ?? 'unknown blocker';
  return `Goal blocked: ${snapshot.objective} — ${reason}\n${usageLine}`;
}

/** Render a single-line snapshot for `/goal status`. */
export function renderStatusLine(snapshot: GoalSnapshot): string {
  const budgetLine = formatBudgetRemaining(snapshot);
  const parts = [
    `Goal [${snapshot.status}]: ${snapshot.objective}`,
    budgetLine,
    formatUsage(snapshot),
  ].filter((line) => line.length > 0);
  return parts.join(' · ');
}

/** Format accumulated usage as `turns=N tokens=M elapsed=Xs`. */
function formatUsage(snapshot: GoalSnapshot): string {
  const { turns, tokens, wallClockMs } = snapshot.usage;
  return `turns=${turns} tokens=${tokens} elapsed=${Math.max(0, Math.round(wallClockMs / 1000))}s`;
}

/** Format remaining budget per dimension; empty string when no budget set. */
function formatBudgetRemaining(snapshot: GoalSnapshot): string {
  const { budget, usage } = snapshot;
  const remaining: string[] = [];
  if (budget.turnBudget !== undefined) {
    remaining.push(
      `turns left ${Math.max(0, budget.turnBudget - usage.turns)}/${budget.turnBudget}`,
    );
  }
  if (budget.tokenBudget !== undefined) {
    remaining.push(
      `tokens left ${Math.max(0, budget.tokenBudget - usage.tokens)}/${budget.tokenBudget}`,
    );
  }
  if (budget.wallClockBudgetMs !== undefined) {
    const left = Math.max(0, budget.wallClockBudgetMs - usage.wallClockMs);
    remaining.push(
      `time left ${Math.round(left / 1000)}s/${Math.round(budget.wallClockBudgetMs / 1000)}s`,
    );
  }
  return remaining.length > 0 ? `budget: ${remaining.join(', ')}` : '';
}
