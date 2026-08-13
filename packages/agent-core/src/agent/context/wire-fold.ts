/**
 * Wire-fold 逻辑,自 `ContextMemory.appendLoopEvent` 抽取。
 *
 * 本模块把一串 `LoopRecordedEvent` 与显式 `context.append_message` 记录折叠为
 * `ContextMessage[]` 时间线。它是 wire 记录如何重建会话历史的唯一事实源——
 * 同时被 live agent(经 `ContextMemory`)与外部读者(如 apps/vis)消费,
 * 消除了此前在两者间漂移的重复 fold 逻辑。
 *
 * 纯函数契约(PRD-0027 Phase 5):本模块内无磁盘 I/O、记录日志、事件发出、
 * 注入钩子或调用方提供的 effect 端口。每个 fold 函数原地变更 `state`,
 * 并**返回提交到时间线的消息**(含工具交换关闭时刷出的延迟消息)——调用方在
 * service 层针对返回的消息运行自己的副作用(后台投递、replay builder、
 * token 快照、输出 offload)。
 */

import { createToolMessage, type ContentPart } from '@byfriends/kosong';

import type { ExecutableToolResult, LoopRecordedEvent } from '../../loop';
import type { ContextMessage } from './types';

const TOOL_ERROR_STATUS = '<system>ERROR: Tool execution failed.</system>';
const TOOL_EMPTY_STATUS = '<system>Tool output is empty.</system>';
const TOOL_EMPTY_ERROR_STATUS =
  '<system>ERROR: Tool execution failed. Tool output is empty.</system>';
const TOOL_OUTPUT_EMPTY_TEXT = 'Tool output is empty.';

/**
 * 在工具结果进入历史前应用 agent-core 的输出归一化:空 / 错误输出会被加上
 * 显式 `<system>` 标记,使模型能区分「工具运行了但没有产出」与「工具失败」。
 *
 * 导出供 vis(及任何外部读者)复现 live agent 施加的完全相同变换——
 * 此前 vis 显示原始输出,在空 / 错误工具结果上会静默偏离。
 */
export function toolResultOutputForModel(result: ExecutableToolResult): string | ContentPart[] {
  const output = result.output;
  if (typeof output === 'string') {
    if (result.isError === true) {
      if (output.length === 0) return TOOL_EMPTY_ERROR_STATUS;
      if (output.trimStart().startsWith('<system>ERROR:')) return output;
      return `${TOOL_ERROR_STATUS}\n${output}`;
    }
    return isEmptyOutputText(output) ? TOOL_EMPTY_STATUS : output;
  }

  // 结构化对象输出（PRD-0031 2c）：序列化为 JSON 文本供模型阅读
  if (!Array.isArray(output)) {
    const text = JSON.stringify(output, null, 2);
    return [
      {
        type: 'text',
        text: result.isError === true ? `${TOOL_ERROR_STATUS}\n${text}` : text,
      },
    ];
  }
  if (output.length === 0) {
    return [
      {
        type: 'text',
        text: result.isError === true ? TOOL_EMPTY_ERROR_STATUS : TOOL_EMPTY_STATUS,
      },
    ];
  }
  if (result.isError === true) {
    return [{ type: 'text', text: TOOL_ERROR_STATUS }, ...output];
  }
  return output;
}

function isEmptyOutputText(output: string): boolean {
  return output.length === 0 || output.trim() === TOOL_OUTPUT_EMPTY_TEXT;
}

/**
 * 可变 fold 状态。live `ContextMemory` 与 vis 各持一个实例,经
 * {@link foldLoopEvent} / {@link foldAppendMessage} 喂入记录。live agent 将其
 * 实例与 `context` wire model 共享(`WireService.mountModel`),因此 fold 函数
 * 同时充当 model 的 `apply` 实现。
 */
export interface WireFoldState {
  history: ContextMessage[];
  /** step.uuid → 正在填充中的 assistant ContextMessage。 */
  openSteps: Map<string, ContextMessage>;
  /** 结果尚未到达的 tool-call id。非空表示正处于工具交换中,显式
   *  `appendMessage` 必须延迟到交换关闭(否则 user / background 消息会插入
   *  assistant 的工具调用运行中,使模型困惑)。 */
  pendingToolResultIds: Set<string>;
  /** tool-call id → {name, args};observation masking / pruning 及 service 层的
   *  输出 offload 决策会查阅(Agent 工具的子 agent 摘要永不 offload)。 */
  toolCallInfo: Map<string, { name: string; args: unknown }>;
  /** 工具交换打开期间排队的消息;最后一个待决工具结果落地、交换关闭时刷出。 */
  deferredMessages: ContextMessage[];
}

export function createWireFoldState(): WireFoldState {
  return {
    history: [],
    openSteps: new Map(),
    pendingToolResultIds: new Set(),
    toolCallInfo: new Map(),
    deferredMessages: [],
  };
}

/**
 * 把消息推入 state,遵循工具交换延迟规则:若交换打开(仍有工具调用等待结果),
 * 则排队消息;交换关闭时刷出。返回提交到历史的消息(延迟时为空)。
 */
export function foldAppendMessage(state: WireFoldState, message: ContextMessage): ContextMessage[] {
  if (state.pendingToolResultIds.size > 0) {
    state.deferredMessages.push(message);
    return [];
  }
  commitMessage(state, message);
  return [message];
}

/**
 * 把一个 loop 事件折叠进 state。纯且同步:无副作用、无 async(工具输出完整进入
 * 时间线;输出 offload 是 dispatch 之后的 service 层 effect,见 PRD-0027 R3)。
 * 返回提交到历史的消息(可能包含工具交换关闭时刷出的延迟消息)。
 */
export function foldLoopEvent(state: WireFoldState, event: LoopRecordedEvent): ContextMessage[] {
  switch (event.type) {
    case 'step.begin': {
      const message: ContextMessage = {
        role: 'assistant',
        content: [],
        toolCalls: [],
      };
      commitMessage(state, message);
      state.openSteps.set(event.uuid, message);
      return [message];
    }
    case 'step.end': {
      state.openSteps.delete(event.uuid);
      return flushDeferredIfToolExchangeClosed(state);
    }
    case 'content.part': {
      const openStep = state.openSteps.get(event.stepUuid);
      if (openStep === undefined) {
        throw new Error(
          `Received content_part for unknown step_uuid '${event.stepUuid}' (no open step_begin)`,
        );
      }
      openStep.content.push(event.part);
      return [];
    }
    case 'tool.call': {
      const openStep = state.openSteps.get(event.stepUuid);
      if (openStep === undefined) {
        throw new Error(
          `Received tool_call for unknown step_uuid '${event.stepUuid}' (no open step_begin)`,
        );
      }
      openStep.toolCalls.push({
        type: 'function',
        id: event.toolCallId,
        name: event.name,
        arguments: event.args === undefined ? null : JSON.stringify(event.args),
      });
      state.pendingToolResultIds.add(event.toolCallId);
      state.toolCallInfo.set(event.toolCallId, { name: event.name, args: event.args });
      return [];
    }
    case 'tool.result': {
      const message = createToolMessage(event.toolCallId, toolResultOutputForModel(event.result));
      const toolMessage: ContextMessage = {
        ...message,
        role: 'tool',
        isError: event.result.isError,
      };
      commitMessage(state, toolMessage);
      state.pendingToolResultIds.delete(event.toolCallId);
      return [toolMessage, ...flushDeferredIfToolExchangeClosed(state)];
    }
  }
}

/**
 * 原地把 fold 状态重置为空(例如 `context.clear` 时)。变更既有数组 / 映射而非
 * 替换它们,使 state 是其自身字段视图的调用方(如 `ContextMemory.foldState()`)
 * 能看到重置。持有展示元数据的调用方应并行清空自己的结构。
 */
export function resetWireFoldState(state: WireFoldState): void {
  state.history.length = 0;
  state.openSteps.clear();
  state.pendingToolResultIds.clear();
  state.toolCallInfo.clear();
  state.deferredMessages.length = 0;
}

/**
 * 原地应用压缩摘要:把前 `compactedCount` 条消息替换为一条 summary assistant
 * 消息,保留未压缩的尾部(`history.slice(compactedCount)`)。清空打开的 step,
 * 并在工具交换闸门允许时刷出任何延迟消息。
 *
 * 由 `ContextMemory` 与外部读者(vis)共享,使部分压缩尾部不再漂移。
 */
export function foldApplyCompaction(
  state: WireFoldState,
  input: { summary: string; compactedCount: number },
): { summary: ContextMessage; committed: ContextMessage[] } {
  const summaryMessage: ContextMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: input.summary }],
    toolCalls: [],
    origin: { kind: 'compaction_summary' },
  };
  const tail = state.history.slice(input.compactedCount);
  // Mutate in place so callers that hold a field-view (ContextMemory) see the
  // rebuild without reassigning their `_history` reference.
  state.history.length = 0;
  state.history.push(summaryMessage, ...tail);
  state.openSteps.clear();
  return { summary: summaryMessage, committed: flushDeferredIfToolExchangeClosed(state) };
}

function commitMessage(state: WireFoldState, message: ContextMessage): void {
  state.history.push(message);
}

/**
 * 在无工具交换打开时刷出任何延迟消息。公开使带外状态变更(例如 `applyCompaction`
 * 重建历史)无需经过 `foldLoopEvent` 即可重新检查延迟规则。
 */
export function flushDeferred(state: WireFoldState): ContextMessage[] {
  return flushDeferredIfToolExchangeClosed(state);
}

function flushDeferredIfToolExchangeClosed(state: WireFoldState): ContextMessage[] {
  if (state.pendingToolResultIds.size > 0 || state.deferredMessages.length === 0) {
    return [];
  }
  // Drain in place so a state view (e.g. ContextMemory's field references)
  // sees the clear — reassigning the field would break the view.
  const deferred = state.deferredMessages.splice(0);
  for (const message of deferred) {
    commitMessage(state, message);
  }
  return deferred;
}

/**
 * 查找内容以 `[ToolName:` 掩码前缀开头的工具消息的历史索引(observation
 * masking 会留下此签名)。纯辅助函数,由 `context.pruning` 的 apply 与 service
 * 层的修剪计数共享(PRD-0027 Phase 5)。
 */
export function findMaskedToolResultIndices(state: WireFoldState): number[] {
  const indices: number[] = [];
  for (let i = 0; i < state.history.length; i++) {
    const message = state.history[i];
    if (message?.role !== 'tool' || message.toolCallId === undefined) continue;
    const info = state.toolCallInfo.get(message.toolCallId);
    if (info === undefined) continue;
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join('');
    if (text.startsWith(`[${info.name}:`)) {
      indices.push(i);
    }
  }
  return indices;
}
