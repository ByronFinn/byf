import type { GoalSnapshot } from '@byfriends/sdk';

import { parseGoalCommand } from '#/tui/commands/index';

/**
 * `byf -p "/goal <objective>"` 提示路径的 headless goal 模式支持。
 *
 * goal 驱动使提示词的 turn 运行跨续行保持存活,直到 goal 达到终态,
 * 因此既有的提示 turn 等待器已阻塞到那时。本模块补充进入时的 create
 * 解析、机器可读摘要,以及终态 → 退出码的映射。
 */

export interface HeadlessGoalCreate {
  readonly objective: string;
  readonly replace: boolean;
}

/**
 * 按最终 goal 状态的退出码。生命周期只有一个成功结果(`complete` → 0)
 * 与两个可恢复的停止态:`blocked`(系统停止追求——模型的 UpdateGoal、
 * 预算或错误)与 `paused`(turn 中止 / SIGINT)。两者都非零——goal 未完成。
 * 缺失 goal(create 路径上不应发生)映射为成功。
 */
export const GOAL_EXIT_CODES = {
  complete: 0,
  blocked: 3,
  paused: 6,
} as const;

export function goalExitCode(status: string | undefined): number {
  if (status === 'blocked') return GOAL_EXIT_CODES.blocked;
  if (status === 'paused') return GOAL_EXIT_CODES.paused;
  return GOAL_EXIT_CODES.complete;
}

const GOAL_PREFIX = /^\/goal(\s|$)/;

/**
 * 把 headless 提示词解析为 goal-create 请求;提示词不是 `/goal` create
 * 命令时返回 `undefined`(调用方按普通提示词运行)。非 create 的 goal
 * 子命令在 headless 下不受支持,回退到普通提示词处理。畸形 create 命令
 * 抛出而非回退,使校验错误在向模型发送任何内容前被报告。
 */
export function parseHeadlessGoalCreate(prompt: string): HeadlessGoalCreate | undefined {
  const trimmed = prompt.trim();
  if (!GOAL_PREFIX.test(trimmed)) return undefined;
  const args = trimmed.replace(/^\/goal/, '').trim();
  // Bare `/goal` with no args is a status lookup in interactive mode — not a
  // create. Malformed create (e.g. `/goal replace` with empty objective)
  // must throw so the headless path fails before the model is invoked.
  const parsed = parseGoalCommand(args);
  if (parsed.kind === 'error') {
    throw new Error(parsed.message);
  }
  if (parsed.kind !== 'create') return undefined;
  return { objective: parsed.objective, replace: parsed.replace };
}

export interface GoalSummary {
  readonly type: 'goal.summary';
  readonly status: string | null;
  readonly reason: string | null;
  readonly turnsUsed: number | null;
  readonly tokensUsed: number | null;
  readonly wallClockMs: number | null;
  readonly objective: string | null;
}

export function goalSummaryJson(goal: GoalSnapshot | null): GoalSummary {
  if (goal === null) {
    return {
      type: 'goal.summary',
      status: null,
      reason: null,
      turnsUsed: null,
      tokensUsed: null,
      wallClockMs: null,
      objective: null,
    };
  }
  return {
    type: 'goal.summary',
    status: goal.status,
    reason: goal.blockedReason ?? goal.pausedReason ?? null,
    turnsUsed: goal.usage.turns,
    tokensUsed: goal.usage.tokens,
    wallClockMs: goal.usage.wallClockMs,
    objective: goal.objective,
  };
}

export function formatGoalSummaryText(goal: GoalSnapshot | null): string {
  if (goal === null) return 'Goal: no goal found.';
  const reason = goal.blockedReason ?? goal.pausedReason;
  const parts = [`Goal [${goal.status}]`];
  if (reason !== undefined) parts.push(reason);
  return `${parts.join(': ')} (turns: ${goal.usage.turns}, tokens: ${goal.usage.tokens})`;
}
