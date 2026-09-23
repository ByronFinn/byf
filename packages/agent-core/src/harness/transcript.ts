import type { ContentPart, Message, ToolCall } from '@byfriends/kosong';

import type { LoopRecordedEvent } from '../loop/events';
import type { ExecutableToolResult } from '../loop/types';
import type { ToolReplaySafety, ToolStartedPayload } from './records';
import type { StoredMessage } from './storage/types';

/**
 * transcript 桥（PRD-0037 #323/#324）：LoopRecordedEvent → 会话树 entries +
 * tool_started 执行记录。
 *
 * 对齐旧 wire-fold 的折叠语义，并叠加 v2 意图先行：
 * - 每个 step 的 assistant entry id 预分配（`entry:<opId>:a<attempt>:<step>`，
 *   跨 resume 稳定——attempt 为持久 run-attempt 计数）；
 * - tool.call 到达即写 tool_started 记录（先于工具结果），result entry id
 *   同步预分配；replay 安全标记由调用方分类；
 * - 首个 tool.result 前刷出 assistant 消息 entry（该批全部 tool.call 已派发），
 *   随后写 tool 结果消息 entry——保证对话顺序与身份可关联；
 * - step.end 无工具结果时刷出缓冲。
 * toolCall arguments 按 wire-fold 约定从解析态重新序列化（JSON.stringify）。
 */
export interface TranscriptSink {
  /** 追加消息 entry（lane 由调用方绑定）；provisionedId 为预分配 entry id。 */
  appendMessage(message: StoredMessage, provisionedId?: string): Promise<void>;
  /** 追加 tool_started 执行记录（意图先行）。 */
  appendToolStarted?(payload: ToolStartedPayload): Promise<void>;
}

interface OpenStepBuffer {
  readonly assistantEntryId: string;
  content: ContentPart[];
  toolCalls: ToolCall[];
  flushed: boolean;
}

export class TranscriptBridge {
  private openStep: OpenStepBuffer | undefined;
  /** toolCallId → 预分配 result entry id（tool.result 以它落盘）。 */
  private readonly resultEntryIds = new Map<string, string>();

  constructor(
    private readonly sink: TranscriptSink,
    private readonly idScope: { readonly opId: string; readonly attempt: number },
    private readonly replaySafetyOf: (toolName: string) => ToolReplaySafety,
  ) {}

  /** createLoopEventDispatcher 的 appendTranscriptRecord 接线点。 */
  async handle(event: LoopRecordedEvent): Promise<void> {
    switch (event.type) {
      case 'step.begin':
        this.openStep = {
          assistantEntryId: assistantEntryIdFor(this.idScope, event.step),
          content: [],
          toolCalls: [],
          flushed: false,
        };
        break;
      case 'content.part':
        this.openStep?.content.push(event.part);
        break;
      case 'tool.call': {
        const buffer = this.openStep;
        if (!buffer) break;
        const toolIndex = buffer.toolCalls.length;
        const resultEntryId = resultEntryIdFor(buffer.assistantEntryId, toolIndex);
        this.resultEntryIds.set(event.toolCallId, resultEntryId);
        buffer.toolCalls.push({
          type: 'function',
          id: event.toolCallId,
          name: event.name,
          arguments: event.args === undefined ? null : JSON.stringify(event.args),
        });
        await this.sink.appendToolStarted?.({
          assistantEntryId: buffer.assistantEntryId,
          toolIndex,
          toolCallId: event.toolCallId,
          name: event.name,
          args: event.args,
          replay: this.replaySafetyOf(event.name),
          resultEntryId,
          opId: this.idScope.opId,
          startedAt: event.startedAt ?? Date.now(),
        });
        break;
      }
      case 'tool.result': {
        await this.flushAssistant();
        await this.sink.appendMessage(
          toolResultMessage(event.toolCallId, event.result),
          this.resultEntryIds.get(event.toolCallId),
        );
        break;
      }
      case 'step.end':
        await this.flushAssistant();
        this.openStep = undefined;
        break;
    }
  }

  /** 收尾兜底：操作结束时若仍有未刷出的缓冲（异常路径）。 */
  async flushAll(): Promise<void> {
    await this.flushAssistant();
    this.openStep = undefined;
  }

  private async flushAssistant(): Promise<void> {
    const buffer = this.openStep;
    if (!buffer || buffer.flushed) return;
    buffer.flushed = true;
    if (buffer.content.length === 0 && buffer.toolCalls.length === 0) return;
    await this.sink.appendMessage(
      {
        role: 'assistant',
        content: buffer.content,
        toolCalls: buffer.toolCalls.length > 0 ? buffer.toolCalls : undefined,
      },
      buffer.assistantEntryId,
    );
  }
}

/** assistant entry 的预分配 id（跨 resume 稳定：含持久 attempt 序号）。 */
export function assistantEntryIdFor(
  scope: { readonly opId: string; readonly attempt: number },
  stepNumber: number,
): string {
  return `entry:${scope.opId}:a${scope.attempt}:${stepNumber}`;
}

/** tool 结果 entry 的预分配 id。 */
export function resultEntryIdFor(assistantEntryId: string, toolIndex: number): string {
  return `${assistantEntryId}:r${toolIndex}`;
}

/** ExecutableToolResult → 存储消息形状。 */
export function toolResultMessage(toolCallId: string, result: ExecutableToolResult): StoredMessage {
  return {
    role: 'tool',
    toolCallId,
    content: resultContentParts(result),
    isError: result.isError === true || undefined,
  };
}

function resultContentParts(result: ExecutableToolResult): ContentPart[] {
  const output = result.output;
  if (typeof output === 'string') {
    return [{ type: 'text', text: output }];
  }
  if (Array.isArray(output)) {
    return output as ContentPart[];
  }
  return [{ type: 'text', text: JSON.stringify(output) }];
}

/**
 * entries → provider 消息投影：剥掉 origin/isError（会话所存 ≠ 模型所见），
 * message entry 之外的 entry 类型被过滤。#329 的压缩窗口 / #332 的
 * transform_context 都在此投影之上叠加。
 */
export function projectEntryMessage(message: StoredMessage): Message {
  const projected: Message = {
    role: message.role,
    content: [...message.content],
    toolCalls: message.toolCalls !== undefined ? [...message.toolCalls] : [],
  };
  if (message.name !== undefined) projected.name = message.name;
  if (message.toolCallId !== undefined) projected.toolCallId = message.toolCallId;
  if (message.partial !== undefined) projected.partial = message.partial;
  return projected;
}

/**
 * 请求投影层：为孤儿 tool call 合成空结果（fork 自工具批中途后仍可 prompt）。
 * 只改 provider 所见，不改会话所存（transform_context 同族语义）。
 */
export function synthesizeOrphanToolResults(messages: readonly Message[]): Message[] {
  const out: Message[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    out.push(message);
    if (message.role !== 'assistant' || message.toolCalls.length === 0) continue;
    // 收集紧随其后的 tool 结果 id
    const answered = new Set<string>();
    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j]!;
      if (next.role !== 'tool') break;
      if (next.toolCallId !== undefined) answered.add(next.toolCallId);
    }
    // 为未应答的 toolCall 合成空结果（紧跟 assistant，保持消息序合法）
    const synth: Message[] = [];
    for (const call of message.toolCalls) {
      if (answered.has(call.id)) continue;
      synth.push({
        role: 'tool',
        content: [{ type: 'text', text: '[no result — branched before completion]' }],
        toolCalls: [],
        toolCallId: call.id,
      });
    }
    if (synth.length > 0) {
      out.push(...synth);
    }
  }
  return out;
}
