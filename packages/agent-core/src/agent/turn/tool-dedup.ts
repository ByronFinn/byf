import type { ContentPart } from '@byfriends/kosong';

import type { ExecutableToolResult } from '../../loop/types';
import { canonicalTelemetryArgs } from './canonical-args';

const REMINDER_TEXT_1 =
  '\n\n<system-reminder>\n' +
  'You are repeating the exact same tool call with identical parameters.' +
  ' Please carefully analyze the previous result. If the task is not yet complete,' +
  ' try a different method or parameters instead of repeating the same call.' +
  '\n</system-reminder>';

function makeReminderText2(toolName: string, repeatCount: number, args: unknown): string {
  const argsStr = canonicalTelemetryArgs(args);
  return (
    '\n\n<system-reminder>\n' +
    'You have repeatedly called the same tool with identical parameters many times.\n' +
    'Repeated tool call detected:\n' +
    `- tool: ${toolName}\n` +
    `- repeated_times: ${String(repeatCount)}\n` +
    `- arguments: ${argsStr}\n` +
    'The previous repeated calls did not make progress. Do not call this exact same tool with the exact same arguments again.\n' +
    'Carefully inspect the latest tool result and choose a different next action, different parameters, or finish the task if enough evidence has been gathered.' +
    '\n</system-reminder>'
  );
}

/** PRD-0031 1a：跨 step 连续重复达该阈值时强制停止（不再执行该调用）。
 *  参考 kimi-cli 的 3/5/8/12 阶梯：3/5/8 为 advisory 提醒，12 为 force-stop。 */
export const FORCE_STOP_STREAK = 12;

function makeForceStopMessage(toolName: string, repeatCount: number, args: unknown): string {
  const argsStr = canonicalTelemetryArgs(args);
  return (
    `Tool "${toolName}" was force-stopped because the exact same call was repeated ` +
    `${String(repeatCount)} times across steps without progress.\n` +
    'The repeated calls were not executed. Repeated tool call detected:\n' +
    `- tool: ${toolName}\n` +
    `- repeated_times: ${String(repeatCount)}\n` +
    `- arguments: ${argsStr}\n` +
    'This is a force-stop, not a tool failure: the loop is likely stuck. Do NOT retry this ' +
    'exact call. Inspect the latest tool results, choose a genuinely different approach, or ' +
    'finish the task and report the blocker.'
  );
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function makeDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeKey(toolName: string, args: unknown): string {
  return `${toolName} ${canonicalTelemetryArgs(args)}`;
}

function appendReminder(result: ExecutableToolResult, reminderText: string): ExecutableToolResult {
  const output = result.output;
  let newOutput: string | ContentPart[];
  if (typeof output === 'string') {
    newOutput = output + reminderText;
  } else {
    const arr: ContentPart[] = [...output];
    const last = arr.at(-1);
    if (last !== undefined && last.type === 'text') {
      arr[arr.length - 1] = { type: 'text', text: last.text + reminderText };
    } else {
      arr.push({ type: 'text', text: reminderText });
    }
    newOutput = arr;
  }
  return result.isError === true
    ? { ...result, output: newOutput, isError: true }
    : { ...result, output: newOutput };
}

/**
 * Placeholder result returned from `checkSameStep` for a duplicate call. Never
 * reaches the model — it is replaced in `finalizeResult` by awaiting the
 * original's deferred result. The loop dispatches `tool.result` events using
 * the finalized value, so this content is purely internal bookkeeping.
 *
 * It must be a non-error result so `toolResultStopsTurn` in tool-call.ts does
 * not short-circuit the batch on the dup's behalf.
 */
const DEDUP_PLACEHOLDER_RESULT: ExecutableToolResult = { output: '' };

/**
 * 检测并抑制单个 turn 内重复的工具调用。
 *
 * 两层行为叠加:
 * - 同 step 去重:同一 LLM step 内发出的重复 `(toolName, args)` 复用原调用
 *   的结果,而不是执行两次工具。
 * - 跨 step 去重:同一调用连续跨 step 重复时,返回给模型的结果会在特定
 *   连续阈值(3、5、8)处追加系统提醒,引导模型尝试不同方法;连续重复达
 *   `FORCE_STOP_STREAK`(12)时**强制停止**——调用不再执行,直接回传
 *   结构化错误(公理 A:模型可区分「被强制停止」与「执行失败」)。
 */
export class ToolCallDeduplicator {
  private stepDeferreds = new Map<string, Deferred<ExecutableToolResult>>();
  private stepCalls: string[] = [];
  private originalCallIndex = new Map<string, number>();
  private syntheticCallIds = new Set<string>();
  /**
   * 达到 force-stop 阈值的调用 id:prepare 阶段返回结构化错误且不执行,
   * finalize 阶段原样返回该错误(不 resolve deferred、不追加提醒)。
   */
  private forceStoppedCallIds = new Set<string>();
  /**
   * Records the dedup key used at `checkSameStep` time, keyed by `toolCallId`.
   * The loop is allowed to rewrite args between `prepareToolExecution` and
   * `finalizeToolResult` via `PrepareToolExecutionResult.updatedArgs`, so the
   * `(toolName, args)` pair available at finalize may differ from what was
   * registered. We pin the key at registration time and look it up by call id
   * during finalize.
   */
  private callKeyByCallId = new Map<string, string>();
  private consecutiveKey: string | null = null;
  private consecutiveCount = 0;

  beginStep(): void {
    for (const deferred of this.stepDeferreds.values()) {
      deferred.resolve({
        output: 'Tool call deduplicated but original result was lost',
        isError: true,
      });
    }
    this.stepDeferreds.clear();
    this.stepCalls = [];
    this.originalCallIndex.clear();
    this.syntheticCallIds.clear();
    this.forceStoppedCallIds.clear();
    this.callKeyByCallId.clear();
  }

  endStep(): void {
    for (const key of this.stepCalls) {
      if (key === this.consecutiveKey) {
        this.consecutiveCount += 1;
      } else {
        this.consecutiveKey = key;
        this.consecutiveCount = 1;
      }
    }
  }

  /**
   * 从 `prepareToolExecution` 调用。若此 `(toolName, args)` 在当前 step 中
   * 已出现过,返回占位结果,使 loop 跳过再次执行工具;真实结果在
   * `finalizeResult` 期间补入。首次出现返回 `null`,走正常执行路径。
   *
   * 此方法刻意保持同步,避免 prepare 循环在仅于 finalize 阶段 resolve 的
   * deferred 上死锁。
   */
  checkSameStep(toolCallId: string, toolName: string, args: unknown): ExecutableToolResult | null {
    const key = makeKey(toolName, args);
    const index = this.stepCalls.length;
    this.stepCalls.push(key);
    this.callKeyByCallId.set(toolCallId, key);

    // PRD-0031 1a：跨 step 连续重复达阈值 → 强制停止（不再执行该调用）。
    // streak 语义与 finalizeResult 完全一致（含本次调用）。
    if (this.computeStreak() >= FORCE_STOP_STREAK) {
      this.forceStoppedCallIds.add(toolCallId);
      return { output: makeForceStopMessage(toolName, FORCE_STOP_STREAK, args), isError: true };
    }

    const existing = this.stepDeferreds.get(key);
    if (existing !== undefined) {
      this.syntheticCallIds.add(toolCallId);
      return DEDUP_PLACEHOLDER_RESULT;
    }
    this.stepDeferreds.set(key, makeDeferred<ExecutableToolResult>());
    this.originalCallIndex.set(toolCallId, index);
    return null;
  }

  /**
   * 计算 stepCalls 末尾调用的连续重复次数——与 `finalizeResult` 的 streak
   * 推导逻辑逐行一致（consecutiveKey/count 承接上一 step 的尾部连续段，
   * 当前 step 的调用序列按序延续或重置）。
   */
  private computeStreak(): number {
    let lastKey = this.consecutiveKey;
    let streak = this.consecutiveCount;
    for (const k of this.stepCalls) {
      if (k === lastKey) {
        streak += 1;
      } else {
        lastKey = k;
        streak = 1;
      }
    }
    return streak;
  }

  /**
   * 从 `finalizeToolResult` 调用,按 provider 顺序。对首次出现的调用,
   * 计算止于此调用的连续重复次数,达到阈值时追加系统提醒,然后 resolve
   * deferred,使后续同 step 重复调用可取到真实结果。对合成重复调用,
   * 等待原调用的 deferred 并返回其值,丢弃占位结果。
   */
  async finalizeResult(
    toolCallId: string,
    toolName: string,
    args: unknown,
    result: ExecutableToolResult,
  ): Promise<ExecutableToolResult> {
    // Use the key recorded at registration time, NOT a fresh key from the args
    // passed here — the loop may have rewritten args via updatedArgs.
    const key = this.callKeyByCallId.get(toolCallId);
    if (key === undefined) return result;
    this.callKeyByCallId.delete(toolCallId);

    // Force-stopped calls: keep the structured error as-is (no deferred await,
    // no advisory reminder — the call never executed).
    if (this.forceStoppedCallIds.delete(toolCallId)) {
      return result;
    }

    if (this.syntheticCallIds.delete(toolCallId)) {
      const deferred = this.stepDeferreds.get(key);
      if (deferred === undefined) return result;
      return deferred.promise;
    }
    const index = this.originalCallIndex.get(toolCallId);
    if (index === undefined) return result;
    this.originalCallIndex.delete(toolCallId);

    let lastKey = this.consecutiveKey;
    let streak = this.consecutiveCount;
    for (let i = 0; i <= index; i += 1) {
      const k = this.stepCalls[i]!;
      if (k === lastKey) {
        streak += 1;
      } else {
        lastKey = k;
        streak = 1;
      }
    }

    let finalResult = result;
    if (streak === 3) {
      finalResult = appendReminder(result, REMINDER_TEXT_1);
    } else if (streak === 5 || streak === 8) {
      finalResult = appendReminder(result, makeReminderText2(toolName, streak, args));
    }

    this.stepDeferreds.get(key)?.resolve(finalResult);
    return finalResult;
  }
}

export const __testing = {
  REMINDER_TEXT_1,
  makeReminderText2,
  makeForceStopMessage,
};
