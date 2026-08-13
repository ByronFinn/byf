/**
 * 把 goal 生命周期转换渲染为用户可见文案的纯函数(PRD-0019 R14)。
 * 它们在 live 与 replay 两条路径中都基于 `goal.updated` 事件快照运行,
 * 因此这里的任何改动都会自动保持两种渲染模式一致。
 *
 * 刻意保持零依赖:CLI(#205)导入这些函数,使措辞共享而非重复。
 */

import type { GoalSnapshot } from '../../../agent/goal/types';

/** 渲染已完成 goal 的完成摘要行。 */
export function renderCompletionSummary(snapshot: GoalSnapshot, reason?: string): string {
  const usageLine = formatUsage(snapshot);
  const tail = reason && reason.trim().length > 0 ? ` — ${reason.trim()}` : '';
  return `Goal complete: ${snapshot.objective}${tail}\n${usageLine}`;
}

/** 渲染遇到阻塞器的 goal 的阻塞原因行。 */
export function renderBlockedReason(snapshot: GoalSnapshot): string {
  const usageLine = formatUsage(snapshot);
  const reason = snapshot.blockedReason ?? 'unknown blocker';
  return `Goal blocked: ${snapshot.objective} — ${reason}\n${usageLine}`;
}

/** 渲染 `/goal status` 的单行快照。 */
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
