import type { ContentPart, Message, ToolCall } from '@byfriends/kosong';

import type { LoopRecordedEvent } from '../loop/events';
import type { ExecutableToolResult } from '../loop/types';
import type { StoredMessage } from './storage/types';

/**
 * transcript 桥（PRD-0037 #323）：LoopRecordedEvent → 会话树 entries。
 *
 * 对齐旧 wire-fold 的折叠语义：
 * - content.part / tool.call 累积到当前 step 的 assistant 缓冲；
 * - 首个 tool.result 到来时（该批全部 tool.call 已派发）刷出 assistant 消息
 *   entry，随后写 tool 结果消息 entry——保证对话顺序；
 * - step.end 无工具结果时刷出缓冲。
 * toolCall arguments 按 wire-fold 约定从解析态重新序列化（JSON.stringify）。
 */
export interface TranscriptSink {
  /** 追加消息 entry（lane 由调用方绑定）。 */
  appendMessage(message: StoredMessage): Promise<void>;
}

interface OpenStepBuffer {
  content: ContentPart[];
  toolCalls: ToolCall[];
  flushed: boolean;
}

export class TranscriptBridge {
  private openStep: OpenStepBuffer | undefined;

  constructor(private readonly sink: TranscriptSink) {}

  /** createLoopEventDispatcher 的 appendTranscriptRecord 接线点。 */
  async handle(event: LoopRecordedEvent): Promise<void> {
    switch (event.type) {
      case 'step.begin':
        this.openStep = { content: [], toolCalls: [], flushed: false };
        break;
      case 'content.part':
        this.openStep?.content.push(event.part);
        break;
      case 'tool.call':
        if (this.openStep) {
          this.openStep.toolCalls.push({
            type: 'function',
            id: event.toolCallId,
            name: event.name,
            arguments: event.args === undefined ? null : JSON.stringify(event.args),
          });
        }
        break;
      case 'tool.result':
        await this.flushAssistant();
        await this.sink.appendMessage(toolResultMessage(event.toolCallId, event.result));
        break;
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
    await this.sink.appendMessage({
      role: 'assistant',
      content: buffer.content,
      toolCalls: buffer.toolCalls.length > 0 ? buffer.toolCalls : undefined,
    });
  }
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
