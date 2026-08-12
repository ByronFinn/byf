/**
 * `wire/ops/goal` —— goal 子系统的 Op 定义（PRD-0027 Phase 1 的「范本」纯 reducer）。
 *
 * goal 是 8 个 RecordRestoreHandler 里**唯一已经接近声明式**的子系统（restoreRecord
 * 直接赋值 snapshot，见 goal/index.ts:291-314）。本文件把它的 restore 语义提取为纯
 * reducer：Model 状态 = `{ snapshot }`（completeReason / wallClockResumedAt 是瞬态 /
 * restore 期锚点，不进 reducer，由 onDidRestore 同步）。apply 逻辑与 restoreRecord
 * 逐行对应，是 Phase 2-6 其余 7 个子系统纯化的参照范本。
 *
 * Op type 复用现有 record 名（goal.create / goal.update / goal.clear），opToWireRecord
 * 产出的 JSONL 与现有 logRecord 逐字节一致（AC6，零数据迁移）。payload 类型派生自
 * AgentRecordEvents[K]（堵死裸标量/数组入口）。
 */

import { z } from 'zod';

import type { GoalBudgetLimits, GoalSnapshot, GoalStatus, GoalUsage } from '#/agent/goal/types';
import { defineModel } from '#/agent/wire';

// —— zod schema（restore 时 safeParse 校验 + replay tolerance 的唯一事实源） ——

export const goalBudgetSchema = z.object({
  turnBudget: z.number().optional(),
  tokenBudget: z.number().optional(),
  wallClockBudgetMs: z.number().optional(),
}) satisfies z.ZodType<GoalBudgetLimits>;

export const goalUsageSchema = z.object({
  turns: z.number(),
  tokens: z.number(),
  wallClockMs: z.number(),
}) satisfies z.ZodType<GoalUsage>;

const goalStatusSchema = z.enum([
  'active',
  'paused',
  'blocked',
  'complete',
]) satisfies z.ZodType<GoalStatus>;

export const goalSnapshotSchema = z.object({
  objective: z.string(),
  status: goalStatusSchema,
  blockedReason: z.string().optional(),
  pausedReason: z.string().optional(),
  budget: goalBudgetSchema,
  usage: goalUsageSchema,
  createdAt: z.number(),
}) satisfies z.ZodType<GoalSnapshot>;

// —— Model ——

/** goal reducer 状态：仅持久化 snapshot（瞬态 completeReason / wallClock 锚点不进 reducer）。 */
export interface GoalModelState {
  readonly snapshot: GoalSnapshot | null;
}

export const goalModel = defineModel('goal', (): GoalModelState => ({ snapshot: null }));

// —— Ops（纯 reducer，与 goal/index.ts:294-312 restoreRecord 逐行对应） ——

export const goalCreate = goalModel.defineOp('goal.create', {
  schema: z.object({
    objective: z.string(),
    budget: goalBudgetSchema.optional(),
    createdAt: z.number(),
  }),
  apply: (_state, payload) => ({
    snapshot: {
      objective: payload.objective,
      status: 'active',
      budget: payload.budget ?? {},
      usage: { turns: 0, tokens: 0, wallClockMs: 0 },
      createdAt: payload.createdAt,
    },
  }),
});

export const goalUpdate = goalModel.defineOp('goal.update', {
  schema: z.object({ snapshot: goalSnapshotSchema }),
  apply: (_state, payload) => ({ snapshot: payload.snapshot }),
});

export const goalClear = goalModel.defineOp('goal.clear', {
  schema: z.object({}),
  apply: () => ({ snapshot: null }),
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'goal.create': typeof goalCreate;
    'goal.update': typeof goalUpdate;
    'goal.clear': typeof goalClear;
  }
}
