import { createToolMessage, type ContentPart, type Message } from '@byfriends/kosong';
import { join } from 'node:path';

import type { Agent } from '..';
import type { ExecutableToolResult, LoopRecordedEvent } from '../../loop';
import { estimateTokens, estimateTokensForMessages } from '../../utils/tokens';
import type { CompactionResult } from '../compaction';
import type { RecordRestoreHandler } from '../restore-handler';
import {
  applyObservationMasking,
  DEFAULT_MASKING_CONFIG,
  type MaskingConfig,
  type MaskingResult,
} from './observation-masking';
import {
  DEFAULT_OFFLOADING_CONFIG,
  offloadOutput,
} from './output-offloading';
import { project } from './projector';
import { ScratchManager } from './scratch-manager';
import {
  USER_PROMPT_ORIGIN,
  type AgentContextData,
  type ContextMessage,
  type PromptOrigin,
} from './types';

export * from './types';
export * from './observation-masking';
export * from './output-offloading';
export * from './scratch-manager';

const TOOL_ERROR_STATUS = '<system>ERROR: Tool execution failed.</system>';
const TOOL_EMPTY_STATUS = '<system>Tool output is empty.</system>';
const TOOL_EMPTY_ERROR_STATUS =
  '<system>ERROR: Tool execution failed. Tool output is empty.</system>';
const TOOL_OUTPUT_EMPTY_TEXT = 'Tool output is empty.';

export class ContextMemory implements RecordRestoreHandler {
  private _history: ContextMessage[] = [];
  private _tokenCount = 0;
  private tokenCountCoveredMessageCount = 0;
  private openSteps: Map<string, ContextMessage> = new Map();
  private pendingToolResultIds = new Set<string>();
  private deferredMessages: ContextMessage[] = [];
  private toolCallInfo = new Map<string, { name: string; args: unknown }>();
  readonly scratchManager: ScratchManager | undefined;

  constructor(
    protected readonly agent: Agent,
    sessionId?: string,
  ) {
    if (agent.homedir !== undefined && sessionId !== undefined) {
      this.scratchManager = new ScratchManager(agent.runtime.kaos, {
        scratchDir: join(agent.homedir, 'sessions', sessionId, 'scratch'),
        maxSessionSize: 50_000_000,
        maxFileCount: 100,
      });
    }
  }

  appendUserMessage(
    content: readonly ContentPart[],
    origin: PromptOrigin = USER_PROMPT_ORIGIN,
  ): void {
    this.appendMessage({
      role: 'user',
      content: [...content],
      toolCalls: [],
      origin,
    });
  }

  appendSystemReminder(content: string, origin: PromptOrigin): void {
    const text = `<system-reminder>\n${content}\n</system-reminder>`;
    this.appendMessage({
      role: 'user',
      content: [{ type: 'text', text }],
      toolCalls: [],
      origin,
    });
  }

  markLastUserPromptBlocked(hookEvent: string): void {
    this.agent.records.logRecord({
      type: 'context.mark_last_user_prompt_blocked',
      hookEvent,
    });
    for (let i = this._history.length - 1; i >= 0; i--) {
      const message = this._history[i];
      if (message?.role !== 'user' || message.origin?.kind !== 'user') continue;
      this._history[i] = {
        ...message,
        origin: { ...message.origin, blockedByHook: hookEvent },
      };
      return;
    }
  }

  clear(): void {
    this.agent.records.logRecord({ type: 'context.clear' });
    this._history = [];
    this._tokenCount = 0;
    this.tokenCountCoveredMessageCount = 0;
    this.openSteps.clear();
    this.pendingToolResultIds.clear();
    this.deferredMessages = [];
    this.toolCallInfo.clear();
    void this.scratchManager?.cleanup();
    this.agent.injection.onContextClear();
    this.agent.emitStatusUpdated();
  }

  applyCompaction(summary: CompactionResult): void {
    this.agent.records.logRecord({
      type: 'context.apply_compaction',
      ...summary,
    });
    this._history = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: summary.summary }],
        toolCalls: [],
        origin: { kind: 'compaction_summary' },
      },
      ...this._history.slice(summary.compactedCount),
    ];
    this.openSteps.clear();
    this.flushDeferredMessagesIfToolExchangeClosed();
    this._tokenCount = summary.tokensAfter;
    this.tokenCountCoveredMessageCount = this._history.length;
    this.agent.injection.onContextCompacted(summary.compactedCount);
    this.agent.emitStatusUpdated();
  }

  data(): AgentContextData {
    return {
      history: this.history,
      tokenCount: this.tokenCount,
    };
  }

  get tokenCount(): number {
    return this._tokenCount;
  }

  get tokenCountWithPending(): number {
    const pendingMessages = this._history.slice(this.tokenCountCoveredMessageCount);
    return this._tokenCount + estimateTokensForMessages(project(pendingMessages));
  }

  get history(): readonly ContextMessage[] {
    return this._history;
  }

  get messages(): Message[] {
    return project(this.history);
  }

  applyObservationMasking(config?: MaskingConfig): MaskingResult {
    const effectiveConfig = config ?? DEFAULT_MASKING_CONFIG;
    const maxContextSize = this.agent.config.modelCapabilities.max_context_tokens;
    const { history, result } = applyObservationMasking(
      this._history,
      maxContextSize,
      this.toolCallInfo,
      effectiveConfig,
    );
    if (result.masked) {
      this.agent.records.logRecord({
        type: 'context.observation_masking',
        maskedCount: result.maskedCount,
        tokensBefore: result.tokensBefore,
        tokensAfter: result.tokensAfter,
      });
      this._history = history;
      this.agent.emitStatusUpdated();
    }
    return result;
  }

  applyPruning(config?: { effectiveCapacityRatio?: number; pruningThreshold?: number }): {
    pruned: boolean;
    prunedCount: number;
  } {
    const maxContextSize = this.agent.config.modelCapabilities.max_context_tokens;
    if (maxContextSize <= 0) {
      return { pruned: false, prunedCount: 0 };
    }
    const effectiveCapacity = maxContextSize * (config?.effectiveCapacityRatio ?? 0.6);
    const currentTokens = this.tokenCountWithPending;
    const threshold = effectiveCapacity * (config?.pruningThreshold ?? 0.85);

    if (currentTokens < threshold) {
      return { pruned: false, prunedCount: 0 };
    }

    // Find masked tool results (identified by content starting with `[ToolName:`)
    const maskedIndices: number[] = [];
    for (let i = 0; i < this._history.length; i++) {
      const message = this._history[i];
      if (message?.role !== 'tool' || message.toolCallId === undefined) continue;
      const info = this.toolCallInfo.get(message.toolCallId);
      if (info === undefined) continue;
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
              .map((part) => part.text)
              .join('');
      if (text.startsWith(`[${info.name}:`)) {
        maskedIndices.push(i);
      }
    }

    let prunedCount = 0;
    let tokensAfter = currentTokens;
    for (const index of maskedIndices) {
      if (tokensAfter < threshold) break;
      const message = this._history[index];
      if (message === undefined) continue;
      const tokensBeforeMessage = estimateTokensForMessages([message]);
      this._history[index] = {
        ...message,
        content: [{ type: 'text', text: '[pruned]' }],
      };
      tokensAfter -= tokensBeforeMessage;
      prunedCount++;
    }

    if (prunedCount > 0) {
      this.agent.records.logRecord({
        type: 'context.pruning',
        prunedCount,
      });
      this.agent.emitStatusUpdated();
    }

    return { pruned: prunedCount > 0, prunedCount };
  }

  async appendLoopEvent(event: LoopRecordedEvent): Promise<void> {
    this.agent.records.logRecord({
      type: 'context.append_loop_event',
      event,
    });
    switch (event.type) {
      case 'step.begin': {
        const message: ContextMessage = {
          role: 'assistant',
          content: [],
          toolCalls: [],
        };
        this.pushHistory(message);
        this.openSteps.set(event.uuid, message);
        return;
      }
      case 'step.end': {
        const openStep = this.openSteps.get(event.uuid);
        this.openSteps.delete(event.uuid);
        if (event.usage !== undefined) {
          const openStepIndex = openStep === undefined ? -1 : this._history.indexOf(openStep);
          this._tokenCount =
            event.usage.inputCacheRead +
            event.usage.inputCacheCreation +
            event.usage.inputOther +
            event.usage.output;
          this.tokenCountCoveredMessageCount =
            openStepIndex === -1 ? this._history.length : openStepIndex + 1;
        }
        this.flushDeferredMessagesIfToolExchangeClosed();
        return;
      }
      case 'content.part': {
        const openStep = this.openSteps.get(event.stepUuid);
        if (openStep === undefined) {
          throw new Error(
            `Received content_part for unknown step_uuid '${event.stepUuid}' (no open step_begin)`,
          );
        }
        openStep.content.push(event.part);
        return;
      }
      case 'tool.call': {
        const openStep = this.openSteps.get(event.stepUuid);
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
        this.pendingToolResultIds.add(event.toolCallId);
        this.toolCallInfo.set(event.toolCallId, { name: event.name, args: event.args });
        return;
      }
      case 'tool.result': {
        let result = event.result;

        // Attempt output offloading for large string outputs
        if (
          !this.agent.records.restoring &&
          this.scratchManager !== undefined &&
          typeof result.output === 'string'
        ) {
          const offloadResult = await offloadOutput(
            event.toolCallId,
            this.toolCallInfo.get(event.toolCallId)?.name ?? 'unknown',
            result,
            this.scratchManager,
            DEFAULT_OFFLOADING_CONFIG,
          );
          if (offloadResult.offloaded) {
            result = { ...result, output: offloadResult.output! };
            this.agent.records.logRecord({
              type: 'context.output_offloaded',
              toolCallId: event.toolCallId,
              filePath: offloadResult.filePath,
            });
          }
        }

        const message = createToolMessage(event.toolCallId, toolResultOutputForModel(result));
        this.pushHistory({
          ...message,
          role: 'tool',
          isError: result.isError,
        });
        this.pendingToolResultIds.delete(event.toolCallId);
        this.flushDeferredMessagesIfToolExchangeClosed();
        return;
      }
    }
  }

  appendMessage(message: ContextMessage): void {
    this.agent.records.logRecord({
      type: 'context.append_message',
      message,
    });
    if (this.hasOpenToolExchange()) {
      this.deferredMessages.push(message);
      return;
    }
    this.pushHistory(message);
  }

  private flushDeferredMessagesIfToolExchangeClosed(): void {
    if (this.pendingToolResultIds.size > 0 || this.deferredMessages.length === 0) {
      return;
    }
    this.pushHistory(...this.deferredMessages);
    this.deferredMessages = [];
  }

  private hasOpenToolExchange(): boolean {
    return this.pendingToolResultIds.size > 0;
  }

  private pushHistory(...messages: ContextMessage[]): void {
    this._history.push(...messages);
    for (const message of messages) {
      if (message.origin?.kind === 'background_task') {
        this.agent.background.markDeliveredNotification(message.origin);
      }
      this.agent.replayBuilder.push({
        type: 'message',
        message,
      });
    }
  }

  restoreRecord(record: import('../records/types').AgentRecord): void {
    switch (record.type) {
      case 'context.append_message':
        this.appendMessage(record.message);
        break;
      case 'context.clear':
        this.restoreClear();
        break;
      case 'context.apply_compaction':
        this.restoreApplyCompaction(record);
        break;
      case 'context.mark_last_user_prompt_blocked':
        this.restoreMarkLastUserPromptBlocked(record);
        break;
      case 'context.append_loop_event':
        // This is handled asynchronously, but restoreRecord must be synchronous
        // We'll handle this in the next implementation step
        void this.restoreAppendLoopEvent(record);
        break;
      case 'context.observation_masking':
        this.restoreObservationMasking();
        break;
    }
  }

  private restoreClear(): void {
    this._history = [];
    this._tokenCount = 0;
    this.tokenCountCoveredMessageCount = 0;
    this.openSteps.clear();
    this.pendingToolResultIds.clear();
    this.deferredMessages = [];
    this.toolCallInfo.clear();
    this.agent.injection.onContextClear();
    this.agent.emitStatusUpdated();
  }

  private restoreApplyCompaction(record: Extract<import('../records/types').AgentRecord, { type: 'context.apply_compaction' }>): void {
    const compactedCount = record.compactedCount;
    const summary = record.summary;
    const tokensAfter = record.tokensAfter;

    this._history = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: summary }],
        toolCalls: [],
        origin: { kind: 'compaction_summary' },
      },
      ...this._history.slice(compactedCount),
    ];
    this.openSteps.clear();
    this.flushDeferredMessagesIfToolExchangeClosed();
    this._tokenCount = tokensAfter;
    this.tokenCountCoveredMessageCount = this._history.length;
    this.agent.injection.onContextCompacted(compactedCount);
    this.agent.emitStatusUpdated();
  }

  private restoreMarkLastUserPromptBlocked(record: Extract<import('../records/types').AgentRecord, { type: 'context.mark_last_user_prompt_blocked' }>): void {
    const hookEvent = record.hookEvent;
    for (let i = this._history.length - 1; i >= 0; i--) {
      const message = this._history[i];
      if (message?.role !== 'user' || message.origin?.kind !== 'user') continue;
      this._history[i] = {
        ...message,
        origin: { ...message.origin, blockedByHook: hookEvent },
      };
      return;
    }
  }

  private async restoreAppendLoopEvent(record: Extract<import('../records/types').AgentRecord, { type: 'context.append_loop_event' }>): Promise<void> {
    // During restore, we call the normal appendLoopEvent but it should not log
    // The restoring flag prevents logging
    await this.appendLoopEvent(record.event);
  }

  private restoreObservationMasking(): void {
    const maxContextSize = this.agent.config.modelCapabilities.max_context_tokens;
    const { history } = applyObservationMasking(
      this._history,
      maxContextSize,
      this.toolCallInfo,
    );
    this._history = history;
    this.agent.emitStatusUpdated();
  }
}

function toolResultOutputForModel(result: ExecutableToolResult): string | ContentPart[] {
  const output = result.output;
  if (typeof output === 'string') {
    if (result.isError === true) {
      if (output.length === 0) return TOOL_EMPTY_ERROR_STATUS;
      if (output.trimStart().startsWith('<system>ERROR:')) return output;
      return `${TOOL_ERROR_STATUS}\n${output}`;
    }
    return isEmptyOutputText(output) ? TOOL_EMPTY_STATUS : output;
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
