/**
 * `wire/ops/usage` —— usage 子系统的 Op 定义（纯 reducer）。
 *
 * usage 是 8 个子系统里最简单的（PRD 迁移难度「低」）：reducer 状态 = `{ byModel }`。
 * **session 硬编码语义**（PRD R2 Open Question #6 / grill 代码核查）：apply 只更新
 * `byModel`，**忽略 payload 的 `usageScope`**，从不重建 `currentTurn`（currentTurn 是
 * 每轮 beginTurn/endTurn 重置的瞬态，不进 reducer）。这与 usage/index.ts:84 的
 * `this.record(model, usage, 'session')` restore 覆写一致。
 */

import { addUsage, type TokenUsage } from '@byfriends/kosong';
import { z } from 'zod';

import { defineModel } from '#/agent/wire';

// —— zod schema ——

export const tokenUsageSchema = z.object({
  inputOther: z.number(),
  output: z.number(),
  inputCacheRead: z.number(),
  inputCacheCreation: z.number(),
}) satisfies z.ZodType<TokenUsage>;

// —— Model ——

/** usage reducer 状态：仅 byModel（currentTurn 瞬态，不进 reducer）。 */
export interface UsageModelState {
  readonly byModel: Readonly<Record<string, TokenUsage>>;
}

export const usageModel = defineModel('usage', (): UsageModelState => ({ byModel: {} }));

// —— Op（纯 reducer，对标 usage/index.ts:36-37 的 byModel 累加 + session 覆写） ——

export const usageRecord = usageModel.defineOp('usage.record', {
  schema: z.object({
    model: z.string(),
    usage: tokenUsageSchema,
    // payload 仍声明 usageScope（落盘字段），但 apply 硬编码忽略它（session 语义）。
    usageScope: z.enum(['session', 'turn']).optional(),
  }),
  apply: (state, payload) => {
    const current = state.byModel[payload.model];
    const next: TokenUsage =
      current === undefined ? { ...payload.usage } : addUsage(current, payload.usage);
    return { byModel: { ...state.byModel, [payload.model]: next } };
  },
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'usage.record': typeof usageRecord;
  }
}
