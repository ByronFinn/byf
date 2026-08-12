/**
 * `wire/ops/full-compaction` —— full_compaction 子系统的 Op 定义（纯 reducer）。
 *
 * reducer 状态 = `{ compactionCountInTurn }`：begin 更新（manual 重置 0、auto +1，
 * 对标 compaction/full.ts:176-179）；cancel / complete 对计数 no-op。
 * `_compactedHistory` 的**文本**快照（依赖活的 context 历史，apply 纯函数无法读）
 * 由 Agent 的 onReplayRecord 在 complete 记录重放后生成（此时 context 已恢复到该
 * 点，时序与 legacy 路径等价）；complete 的结构化结果仅用于 schema 校验，不进 reducer。
 *
 * **已知精度边界**：begin 的 `if (compacting) return` 早返回在 restore 期不触发
 * （restore 期 compacting 恒 null），故「begin 时已有 compaction 在跑」的重叠场景下
 * reducer 会比 live 多计一次。正常序列（begin↔complete/cancel 不重叠）不受影响。
 * worker 启动是 service 层 effect（restore 不启动），不在 apply 里。
 */

import { z } from 'zod';

import type { CompactionResult } from '#/agent/compaction';
import { defineModel } from '#/agent/wire';

const compactionBeginSchema = z.object({
  source: z.enum(['manual', 'auto']),
  instruction: z.string().optional(),
});

const compactionResultSchema = z.object({
  summary: z.string(),
  compactedCount: z.number(),
  tokensBefore: z.number(),
  tokensAfter: z.number(),
}) satisfies z.ZodType<CompactionResult>;

// —— Model ——

export interface FullCompactionModelState {
  readonly compactionCountInTurn: number;
}

export const fullCompactionModel = defineModel(
  'full_compaction',
  (): FullCompactionModelState => ({ compactionCountInTurn: 0 }),
);

// —— Ops ——

export const fullCompactionBegin = fullCompactionModel.defineOp('full_compaction.begin', {
  schema: compactionBeginSchema,
  apply: (state, payload) => ({
    ...state,
    compactionCountInTurn: payload.source === 'manual' ? 0 : state.compactionCountInTurn + 1,
  }),
});

export const fullCompactionCancel = fullCompactionModel.defineOp('full_compaction.cancel', {
  schema: z.object({}),
  apply: (state) => state,
});

export const fullCompactionComplete = fullCompactionModel.defineOp('full_compaction.complete', {
  schema: compactionResultSchema,
  apply: (state) => state,
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'full_compaction.begin': typeof fullCompactionBegin;
    'full_compaction.cancel': typeof fullCompactionCancel;
    'full_compaction.complete': typeof fullCompactionComplete;
  }
}
