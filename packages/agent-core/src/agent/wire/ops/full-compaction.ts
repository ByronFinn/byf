/**
 * `wire/ops/full-compaction` —— full_compaction 子系统的 Op 定义。
 *
 * **Phase 1 部分纯化**：reducer 状态暂只管 `compactionCountInTurn`（对标
 * compaction/full.ts:176-179 的计数语义：manual 重置 0、auto +1）。begin 影响计数；
 * cancel / complete 对计数 no-op。
 *
 * **尚未进 reducer（Phase 4）**：
 * - `_compactedHistory`：complete 时 `renderMessagesToText(agent.context.history)` 依赖
 *   活的 context 历史，无法从 record 纯重建 —— 须在 service 层于 restore 后重做。
 * - worker 启动（begin 的 startCompactionWorker，现靠 restoring 门控抑制）→ onDidRestore。
 * - **已知精度边界**：begin 的 `if (compacting) return` 早返回在 restore 期不触发
 *   （restore 期 compacting 恒 null），故「begin 时已有 compaction 在跑」的重叠场景下，
 *   reducer 会比 live 多计一次。正常序列（begin↔complete/cancel 不重叠）不受影响，
 *   重叠处理的彻底纯化属 Phase 4。
 */

import { z } from 'zod';

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
});

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
