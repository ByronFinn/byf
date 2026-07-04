import type { EphemeralInjection } from '../context/projector';
import type { GoalSnapshot } from '../goal/types';
import { DynamicInjector } from './injector';

const ACTIVE_HEADER = 'You are pursuing an active goal.';
const PAUSED_HEADER = 'The goal is paused; do not take goal-directed action until resumed.';
const COMPLETE_HEADER = 'The goal has been completed; finish any in-flight work cleanly.';

/**
 * Ephemeral injector for goal mode state (PRD-0019 R6 / ADR-0022).
 *
 * Renders a `before_user` reminder reflecting the current goal tier:
 * - active: full reminder with objective + budget guidance + completion instruction.
 * - blocked: light reminder naming the blocked reason.
 * - paused: guard reminder (no goal-directed action).
 * - complete (transient): completion-tier reminder.
 * - no goal: empty.
 *
 * Ephemeral: not stored in history, regenerated each step, does not pollute the
 * cached prefix. Persistence/replay comes from the goal.* records, not from here.
 */
export class GoalInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'goal';

  protected override getInjection(): undefined {
    // Goal reminder is purely ephemeral (before_user). No persistent injection.
    return undefined;
  }

  override getEphemeral(): readonly EphemeralInjection[] {
    const snapshot = this.agent.goal.getSnapshot();
    if (snapshot === null) return [];
    const content = this.render(snapshot);
    if (content === undefined) return [];
    return [
      {
        kind: 'system_reminder' as const,
        content,
        position: 'before_user' as const,
      },
    ];
  }

  private render(snapshot: GoalSnapshot): string | undefined {
    switch (snapshot.status) {
      case 'active':
        return this.renderActive(snapshot);
      case 'blocked':
        return this.renderBlocked(snapshot);
      case 'paused':
        return this.renderPaused(snapshot);
      case 'complete':
        return this.renderComplete(snapshot);
    }
  }

  private renderActive(snapshot: GoalSnapshot): string {
    const lines: string[] = [ACTIVE_HEADER, `Objective: ${snapshot.objective}`];
    const report = this.agent.goal.computeBudgetReport();
    const remaining: string[] = [];
    if (snapshot.budget.turnBudget !== undefined) {
      const left = snapshot.budget.turnBudget - report.usage.turns;
      remaining.push(`${left} turns remaining`);
    }
    if (snapshot.budget.tokenBudget !== undefined) {
      const left = snapshot.budget.tokenBudget - report.usage.tokens;
      remaining.push(`${left} tokens remaining`);
    }
    if (snapshot.budget.wallClockBudgetMs !== undefined) {
      const leftMs = snapshot.budget.wallClockBudgetMs - report.usage.wallClockMs;
      remaining.push(`${Math.max(0, Math.floor(leftMs / 1000))}s remaining`);
    }
    if (remaining.length > 0) {
      lines.push(`Budget: ${remaining.join(', ')}.`);
    }
    lines.push(
      'When the objective is fully met, call UpdateGoal with status "complete". ' +
        'If you are blocked and cannot proceed, call UpdateGoal with status "blocked" and a reason.',
    );
    return lines.join('\n');
  }

  private renderBlocked(snapshot: GoalSnapshot): string {
    const reason = snapshot.blockedReason ?? 'unknown';
    return `${ACTIVE_HEADER}\nObjective: ${snapshot.objective}\nThe goal is BLOCKED: ${reason}. Pause goal-directed action until the user resumes or the blocker is resolved.`;
  }

  private renderPaused(snapshot: GoalSnapshot): string {
    return `${PAUSED_HEADER}\nObjective: ${snapshot.objective}`;
  }

  private renderComplete(snapshot: GoalSnapshot): string {
    return `${COMPLETE_HEADER}\nObjective: ${snapshot.objective}`;
  }
}
