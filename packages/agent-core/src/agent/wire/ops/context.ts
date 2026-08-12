/**
 * `wire/ops/context` —— context 子系统的 Op 定义（纯 reducer，PRD-0027 Phase 5）。
 *
 * reducer 状态 = `WireFoldState`（history + openSteps + pendingToolResultIds +
 * toolCallInfo + deferredMessages）。live 路径的 ContextMemory 通过
 * `WireService.mountModel` 把自身的 fold 视图挂载为 model 状态（共享嵌套结构，
 * 单次 fold、无内存双份），故这些 apply 既是 replay 时的纯重建，也是 live dispatch
 * 时的唯一状态变更点。
 *
 * apply = wire-fold 的纯 fold 函数（原地变更 + 返回 committed messages，apply 忽略
 * 返回值）。副作用（background 投递 / replayBuilder / token 快照 / offload 写
 * scratch）全部在 service 层：live 走 ContextMemory 方法，restore 走 Agent 的
 * `onReplayRecord`。
 *
 * transient ops（persist:false，PRD「至少 1 个 transient op 落地」）：
 * - `context.output_offloaded`：offload 后把 tool message 内容替换为预览（只改内存
 *   不落盘）。schema 的 `preview` 可选 —— 旧 journal 里的该记录没有 preview 字段，
 *   restore 重放时 apply 无操作（与 v1 restore no-op 语义一致）。
 * - `context.pruning`：把被 observation masking 遮蔽的 tool message 内容替换为
 *   `[pruned]`（只改内存不落盘）。`maskedIndices` 可选 —— 旧 journal 的记录没有该
 *   字段，restore 重放时 apply 无操作（restore 不修剪，下一轮 beforeStep 重做）。
 *
 * `context.observation_masking` **不进** reducer：apply 需要读 config 的
 * maxContextSize（另一个 model 的状态），故保持 legacyRoute（restoreRecord），
 * restore 时重跑 masking。
 */

import { z } from 'zod';

import type { CompactionResult } from '#/agent/compaction';
import type { ContextMessage } from '#/agent/context/types';
import {
  createWireFoldState,
  foldAppendMessage,
  foldApplyCompaction,
  foldLoopEvent,
  resetWireFoldState,
  type WireFoldState,
} from '#/agent/context/wire-fold';
import { defineModel } from '#/agent/wire';
import type { LoopRecordedEvent } from '#/loop';

// —— Schema ——

const contextMessageSchema = z
  .object({
    role: z.string(),
    content: z.unknown(),
  })
  .passthrough() as unknown as z.ZodType<ContextMessage>;

/** 宽松结构校验：只查 fold 真正消费的字段，未知/多余字段放行（replay tolerance）。 */
const loopEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('step.begin'), uuid: z.string() }).passthrough(),
  z.object({ type: z.literal('step.end'), uuid: z.string() }).passthrough(),
  z
    .object({ type: z.literal('content.part'), stepUuid: z.string(), part: z.unknown() })
    .passthrough(),
  z
    .object({
      type: z.literal('tool.call'),
      stepUuid: z.string(),
      toolCallId: z.string(),
    })
    .passthrough(),
  z
    .object({
      type: z.literal('tool.result'),
      toolCallId: z.string(),
      result: z.object({ output: z.unknown() }).passthrough(),
    })
    .passthrough(),
]) as unknown as z.ZodType<LoopRecordedEvent>;

const compactionResultSchema = z.object({
  summary: z.string(),
  compactedCount: z.number(),
  tokensBefore: z.number(),
  tokensAfter: z.number(),
}) satisfies z.ZodType<CompactionResult>;

// —— Model ——

export const contextModel = defineModel('context', (): WireFoldState => createWireFoldState());

// —— Ops ——

export const contextAppendMessage = contextModel.defineOp('context.append_message', {
  schema: z.object({ message: contextMessageSchema }),
  apply: (state, payload) => {
    foldAppendMessage(state, payload.message as never);
    return state;
  },
});

export const contextAppendLoopEvent = contextModel.defineOp('context.append_loop_event', {
  schema: z.object({ event: loopEventSchema }),
  apply: (state, payload) => {
    foldLoopEvent(state, payload.event as never);
    return state;
  },
});

export const contextClear = contextModel.defineOp('context.clear', {
  schema: z.object({}),
  apply: (state) => {
    resetWireFoldState(state);
    return state;
  },
});

export const contextApplyCompaction = contextModel.defineOp('context.apply_compaction', {
  schema: compactionResultSchema,
  apply: (state, payload) => {
    foldApplyCompaction(state, {
      summary: payload.summary,
      compactedCount: payload.compactedCount,
    });
    return state;
  },
});

export const contextMarkLastUserPromptBlocked = contextModel.defineOp(
  'context.mark_last_user_prompt_blocked',
  {
    schema: z.object({ hookEvent: z.string() }),
    apply: (state, payload) => {
      for (let i = state.history.length - 1; i >= 0; i--) {
        const message = state.history[i];
        if (message?.role !== 'user' || message.origin?.kind !== 'user') continue;
        state.history[i] = {
          ...message,
          origin: { ...message.origin, blockedByHook: payload.hookEvent },
        };
        return state;
      }
      return state;
    },
  },
);

/** transient：offload 后把 tool message 内容替换为预览，只改内存不落盘。 */
export const contextOutputOffloaded = contextModel.defineOp('context.output_offloaded', {
  persist: false,
  schema: z.object({
    toolCallId: z.string(),
    filePath: z.string(),
    // 可选：旧 journal 的记录无 preview，restore 重放时无操作（v1 no-op 语义）。
    preview: z.string().optional(),
  }),
  apply: (state, payload) => {
    if (payload.preview === undefined) return state;
    for (let i = state.history.length - 1; i >= 0; i--) {
      const message = state.history[i];
      if (message?.role !== 'tool' || message.toolCallId !== payload.toolCallId) continue;
      // 历史里的 tool message content 是 ContentPart[]（createToolMessage 包装）。
      state.history[i] = {
        ...message,
        content: [{ type: 'text', text: payload.preview }],
      };
      return state;
    }
    return state;
  },
});

/** transient：把被 masking 遮蔽的 tool message 内容替换为 `[pruned]`，只改内存不落盘。 */
export const contextPruning = contextModel.defineOp('context.pruning', {
  persist: false,
  schema: z.object({
    prunedCount: z.number(),
    // 可选：旧 journal 的记录无 maskedIndices，restore 重放时无操作（restore 不修剪）。
    maskedIndices: z.array(z.number()).optional(),
  }),
  apply: (state, payload) => {
    if (payload.maskedIndices === undefined) return state;
    for (const index of payload.maskedIndices) {
      const message = state.history[index];
      if (message === undefined) continue;
      state.history[index] = {
        ...message,
        content: [{ type: 'text', text: '[pruned]' }],
      };
    }
    return state;
  },
});

declare module '#/agent/wire/types' {
  interface PersistedOpMap {
    'context.append_message': typeof contextAppendMessage;
    'context.append_loop_event': typeof contextAppendLoopEvent;
    'context.clear': typeof contextClear;
    'context.apply_compaction': typeof contextApplyCompaction;
    'context.mark_last_user_prompt_blocked': typeof contextMarkLastUserPromptBlocked;
  }

  interface TransientOpMap {
    'context.output_offloaded': typeof contextOutputOffloaded;
    'context.pruning': typeof contextPruning;
  }
}
