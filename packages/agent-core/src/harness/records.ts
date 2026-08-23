import type { ContentPart } from '@byfriends/kosong';

import type { EntryId, LaneId, StoredPromptOrigin } from './storage/types';

/**
 * wire 2.0 执行记录载荷目录（v2 §5，PRD-0037 #323/#324）。
 *
 * 存储对这些形状零知识（payload 不透明）；本模块是 harness 侧的唯一事实源。
 * live 与 restore 共用同一套形状——状态 = 记录的归约。
 */

// ===== 操作生命周期 =====

export type OperationKind = 'prompt' | 'resume' | 'followUp' | 'nextRun' | 'compaction';

export interface OperationStartedPayload {
  /** 预分配操作 id（= record id，幂等重放的关键）。 */
  readonly opId: string;
  readonly kind: OperationKind;
  /** prompt 类操作的输入与来源（resume 物化输入消息用）。 */
  readonly input?: readonly ContentPart[];
  readonly origin?: StoredPromptOrigin;
  /** 预分配的输入消息 entry id（意图先行：记录先于任何效果）。 */
  readonly inputEntryId?: EntryId;
  readonly startedAt: number;
}

export interface OperationFinishedPayload {
  readonly opId: string;
  readonly outcome: 'completed' | 'aborted' | 'failed';
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly usage?: Readonly<Record<string, number>>;
  readonly finishedAt: number;
}

export interface AbortRequestedPayload {
  readonly opId: string;
  readonly requestedAt: number;
}

// ===== 工具执行 =====

/**
 * replay 安全性标记：崩溃恢复时悬空 tool_started 的处置分类。
 * - never：不可重放（有副作用），restore 合成 interrupted 结果
 * - safe：幂等只读，restore 可安全重放
 */
export type ToolReplaySafety = 'never' | 'safe';

export interface ToolStartedPayload {
  /** 持久调用身份：(assistantEntryId, toolIndex)。 */
  readonly assistantEntryId: EntryId;
  readonly toolIndex: number;
  readonly toolCallId: string;
  readonly name: string;
  /** effective args（hook 改写后实际执行参数）。 */
  readonly args: unknown;
  readonly replay: ToolReplaySafety;
  /** 预分配结果消息 entry id（abort reconcile / 悬空处理写入合成结果用）。 */
  readonly resultEntryId: EntryId;
  readonly opId: string;
  readonly startedAt: number;
}

// ===== 任务重试 =====

export interface TaskAttemptPayload {
  readonly opId: string;
  /** 1-based 持久重试计数（跨崩溃-重启循环不可重置）。 */
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly errorMessage?: string;
  readonly at: number;
}

// ===== 队列 =====

export type QueueName = 'steer' | 'followUp' | 'nextRun';

export interface QueueEnqueuedPayload {
  readonly queue: QueueName;
  /** 完整 payload（abort 时 steer/followUp 死亡并归还调用方）。 */
  readonly input: readonly ContentPart[];
  readonly origin?: StoredPromptOrigin;
  /** 预分配消费 entry id：消费点写树用；entry 存在 = 已消费（恢复判定）。 */
  readonly entryId: string;
  readonly enqueuedAt: number;
}

// ===== deferred writes =====

export interface WriteDeferredPayload {
  /** checkpoint 尾部应用的追加（R4：mid-step 写入延迟，保护 KV 缓存）。 */
  readonly append: Readonly<Record<string, unknown>>;
  readonly deferredAt: number;
}

// ===== 载荷窄化 =====

export function asOperationStarted(payload: unknown): OperationStartedPayload | undefined {
  return hasShape<OperationStartedPayload>(payload, ['opId', 'kind', 'startedAt'])
    ? payload
    : undefined;
}

export function asOperationFinished(payload: unknown): OperationFinishedPayload | undefined {
  return hasShape<OperationFinishedPayload>(payload, ['opId', 'outcome', 'finishedAt'])
    ? payload
    : undefined;
}

export function asAbortRequested(payload: unknown): AbortRequestedPayload | undefined {
  return hasShape<AbortRequestedPayload>(payload, ['opId', 'requestedAt']) ? payload : undefined;
}

export function asToolStarted(payload: unknown): ToolStartedPayload | undefined {
  return hasShape<ToolStartedPayload>(payload, [
    'assistantEntryId',
    'toolIndex',
    'toolCallId',
    'name',
    'replay',
    'resultEntryId',
    'opId',
  ])
    ? payload
    : undefined;
}

export function asTaskAttempt(payload: unknown): TaskAttemptPayload | undefined {
  return hasShape<TaskAttemptPayload>(payload, ['opId', 'attempt', 'maxAttempts'])
    ? payload
    : undefined;
}

export function asQueueEnqueued(payload: unknown): QueueEnqueuedPayload | undefined {
  return hasShape<QueueEnqueuedPayload>(payload, ['queue', 'input', 'enqueuedAt'])
    ? payload
    : undefined;
}

export function asWriteDeferred(payload: unknown): WriteDeferredPayload | undefined {
  return hasShape<WriteDeferredPayload>(payload, ['append', 'deferredAt']) ? payload : undefined;
}

function hasShape<T>(payload: unknown, keys: readonly string[]): payload is T {
  if (typeof payload !== 'object' || payload === null) return false;
  const record = payload as Record<string, unknown>;
  return keys.every((key) => record[key] !== undefined);
}

// ===== 记录 id 约定 =====

/** operation_started 的 record id（= opId，幂等重放的天然键）。 */
export function operationRecordId(opId: string): string {
  return `op:${opId}`;
}

/** tool_started 的 record id（持久调用身份的字符串化）。 */
export function toolStartedRecordId(assistantEntryId: EntryId, toolIndex: number): string {
  return `tool:${assistantEntryId}:${toolIndex}`;
}

export type { ContentPart, LaneId };
