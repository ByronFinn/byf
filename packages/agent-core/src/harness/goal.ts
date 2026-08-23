import type { WireSession } from './session/session';
import type { LaneId } from './storage/types';

/**
 * goal 域映射（PRD-0037 #331，grill Q7 裁决）：
 *
 * - goal 状态（create/update/clear）→ lane 路径 custom entries
 *   （customType `goal.state`，点查询还原——读到路径上最新一条即状态）；
 * - goal 续跑 → before_run_end 缝隙读 goal 状态返回 followUp——同一 run
 *   （同一 opId）内继续推进；50 轮上限与预算检查保留为 driver 逻辑；
 * - fork 点之前的 goal custom entries 不被复制（WireSession.forkTo 按
 *   `goal.` 前缀剔除——"fork 清空 goal"（ADR-0023）自动满足）；
 * - goal 域语义不变：状态机 active/paused/blocked/complete（absent = 无），
 *   三权分立（slash 命令 setGoal/clearGoal、模型工具 updateGoal、
 *   runtime 预算检查）。
 */

export type GoalStatus2 = 'active' | 'paused' | 'blocked' | 'complete';

export interface GoalBudget2 {
  readonly maxTurns?: number;
  readonly maxTokens?: number;
}

export interface GoalSnapshot2 {
  readonly status: GoalStatus2;
  readonly objective: string;
  readonly budget?: GoalBudget2;
  readonly turnsUsed: number;
  readonly tokensUsed: number;
  readonly createdAt: number;
  readonly blockedReason?: string;
}

export const GOAL_CUSTOM_TYPE = 'goal.state';

/** absent 语义：路径上无 goal.state custom entry，或最新一条为 clear。 */
export interface GoalAbsent {
  readonly status: 'absent';
}

export type GoalView = GoalAbsent | GoalSnapshot2;

interface GoalEntryData {
  readonly status: GoalStatus2 | 'clear';
  readonly objective: string;
  readonly budget?: GoalBudget2;
  readonly turnsUsed?: number;
  readonly tokensUsed?: number;
  readonly createdAt?: number;
  readonly blockedReason?: string;
}

/** 点查询：lane 路径上最新 goal.state custom entry。 */
export async function readGoal(session: WireSession, laneId: LaneId): Promise<GoalView> {
  const branch = await session.branchOf(laneId, {
    direction: 'newestFirst',
    types: ['custom'],
    limit: 50,
  });
  for (const entry of branch.entries) {
    if (entry.kind !== 'custom' || entry.customType !== GOAL_CUSTOM_TYPE) continue;
    const data = entry.data as GoalEntryData;
    if (data.status === 'clear') return { status: 'absent' };
    return {
      status: data.status,
      objective: data.objective,
      ...(data.budget !== undefined ? { budget: data.budget } : {}),
      turnsUsed: data.turnsUsed ?? 0,
      tokensUsed: data.tokensUsed ?? 0,
      createdAt: data.createdAt ?? 0,
      ...(data.blockedReason !== undefined ? { blockedReason: data.blockedReason } : {}),
    };
  }
  return { status: 'absent' };
}

/** 写 goal 状态（追加 custom entry——append-only，历史保留）。 */
export async function writeGoal(
  session: WireSession,
  laneId: LaneId,
  data: GoalEntryData,
): Promise<void> {
  await session.append({
    laneId,
    kind: 'custom',
    customType: GOAL_CUSTOM_TYPE,
    data,
  });
}

/** slash 命令面：创建/替换 goal（active）。 */
export async function setGoal(
  session: WireSession,
  laneId: LaneId,
  input: { readonly objective: string; readonly budget?: GoalBudget2 },
): Promise<void> {
  await writeGoal(session, laneId, {
    status: 'active',
    objective: input.objective,
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
    turnsUsed: 0,
    tokensUsed: 0,
    createdAt: Date.now(),
  });
}

/** slash 命令面：清除 goal（absent）。 */
export async function clearGoal(session: WireSession, laneId: LaneId): Promise<void> {
  await writeGoal(session, laneId, { status: 'clear', objective: '' });
}

/** 模型工具面：更新状态/计步（三权分立的工具权）。 */
export async function updateGoal(
  session: WireSession,
  laneId: LaneId,
  current: GoalSnapshot2,
  patch: { readonly status?: GoalStatus2; readonly blockedReason?: string },
): Promise<void> {
  await writeGoal(session, laneId, {
    status: patch.status ?? current.status,
    objective: current.objective,
    ...(current.budget !== undefined ? { budget: current.budget } : {}),
    turnsUsed: current.turnsUsed,
    tokensUsed: current.tokensUsed,
    createdAt: current.createdAt,
    ...(patch.blockedReason !== undefined ? { blockedReason: patch.blockedReason } : {}),
  });
}

/** driver 计步（silent：只推进计数，不改状态机）。 */
export async function recordGoalTurn(
  session: WireSession,
  laneId: LaneId,
  current: GoalSnapshot2,
  tokens: number,
): Promise<void> {
  await writeGoal(session, laneId, {
    status: current.status,
    objective: current.objective,
    ...(current.budget !== undefined ? { budget: current.budget } : {}),
    turnsUsed: current.turnsUsed + 1,
    tokensUsed: current.tokensUsed + tokens,
    createdAt: current.createdAt,
  });
}

/** 预算检查（runtime 权）：overBudget → blocked。 */
export function isGoalOverBudget(goal: GoalSnapshot2): string | undefined {
  if (goal.budget?.maxTurns !== undefined && goal.turnsUsed >= goal.budget.maxTurns) {
    return `goal 轮次预算耗尽（${goal.turnsUsed}/${goal.budget.maxTurns}）`;
  }
  if (goal.budget?.maxTokens !== undefined && goal.tokensUsed >= goal.budget.maxTokens) {
    return `goal token 预算耗尽（${goal.tokensUsed}/${goal.budget.maxTokens}）`;
  }
  return undefined;
}

/** driver 上限（ADR 对齐旧引擎 50 轮硬上限）。 */
export const MAX_GOAL_ROUNDS = 50;
