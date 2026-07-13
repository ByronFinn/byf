import { join } from 'node:path';

import { type ContentPart, type Message } from '@byfriends/kosong';

import type { Agent } from '..';
import type { LoopRecordedEvent } from '../../loop';
import { estimateTokensForMessages } from '../../utils/tokens';
import type { CompactionResult } from '../compaction';
import { isAgentRecordOfPrefix, type AgentRecord } from '../records/types';
import type { RecordRestoreHandler } from '../restore-handler';
import {
  applyObservationMasking,
  DEFAULT_MASKING_CONFIG,
  type MaskingConfig,
  type MaskingResult,
} from './observation-masking';
import { DEFAULT_OFFLOADING_CONFIG, offloadOutput } from './output-offloading';
import {
  degradeOlderMediaParts,
  MEDIA_DEGRADE_KEEP_RECENT,
  MEDIA_STRIPPED_PLACEHOLDERS,
  project,
  type EphemeralInjection,
} from './projector';
import { ScratchManager } from './scratch-manager';
import {
  USER_PROMPT_ORIGIN,
  type AgentContextData,
  type ContextMessage,
  type PromptOrigin,
} from './types';
import {
  foldAppendMessage,
  foldApplyCompaction,
  foldLoopEvent,
  resetWireFoldState,
  type WireFoldHandlers,
} from './wire-fold';

export * from './types';
export * from './observation-masking';
export * from './output-offloading';
export * from './scratch-manager';
export * from './wire-fold';

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
    resetWireFoldState(this.foldState());
    this._tokenCount = 0;
    this.tokenCountCoveredMessageCount = 0;
    void this.scratchManager?.cleanup();
    this.agent.injection.onContextClear();
    this.agent.emitStatusUpdated();
  }

  applyCompaction(summary: CompactionResult): void {
    this.agent.records.logRecord({
      type: 'context.apply_compaction',
      ...summary,
    });
    foldApplyCompaction(
      this.foldState(),
      { summary: summary.summary, compactedCount: summary.compactedCount },
      this.foldHandlers,
    );
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
    return this.getMessages();
  }

  /**
   * Media-degraded projection of the current messages: all but the most
   * recent {@link MEDIA_DEGRADE_KEEP_RECENT} media parts are replaced by
   * text markers. Used for the one-shot resend after the provider rejects
   * the request body as too large (HTTP 413 body-size). Read-side only —
   * the underlying history is left untouched.
   *
   * Accepts the same optional ephemeral injections as {@link getMessages}
   * so the degraded projection includes the same per-request dynamic
   * content (timestamp, permission mode) as the normal projection.
   */
  getMediaDegradedMessages(ephemeral?: readonly EphemeralInjection[]): Message[] {
    return degradeOlderMediaParts(this.getMessages(ephemeral), MEDIA_DEGRADE_KEEP_RECENT);
  }

  /**
   * Media-stripped projection: ALL media parts replaced by text markers.
   * Used for the one-shot resend after the provider rejects an image's
   * format/data (the poisoned image could be anywhere, so only a full
   * strip guarantees a clean request). Read-side only.
   */
  getMediaStrippedMessages(ephemeral?: readonly EphemeralInjection[]): Message[] {
    return degradeOlderMediaParts(this.getMessages(ephemeral), 0, MEDIA_STRIPPED_PLACEHOLDERS);
  }

  /**
   * Project history into provider-ready messages, optionally with
   * ephemeral injections (e.g. timestamp, permission mode) appended
   * at the `'before_user'` position.
   */
  getMessages(ephemeral?: readonly EphemeralInjection[]): Message[] {
    return project(this.history, ephemeral);
  }

  /**
   * Provider-ready snapshot of the conversation history safe to feed into a
   * detached, read-only LLM call (e.g. a `/btw` side query).
   *
   * Unlike {@link getMessages}, this trims the trailing assistant message
   * (and anything after it) when the main turn is mid-tool-call. A message
   * sequence containing a `tool_call` without its paired `tool_result` is
   * illegal and would be rejected by providers, so the snapshot rolls back
   * to the last fully-complete step boundary. Ephemeral injections are
   * excluded — a side query appends its own user message and the
   * `before_user`-positioned injections would otherwise land between the
   * main history and that question.
   */
  getStableSnapshot(): Message[] {
    const messages = this.getMessages();
    if (this.pendingToolResultIds.size === 0) return messages;

    const cutIndex = findLastAssistantWithPendingToolCall(messages, this.pendingToolResultIds);
    if (cutIndex === -1) return messages;
    return messages.slice(0, cutIndex);
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
    await foldLoopEvent(this.foldState(), event, this.foldHandlers);
  }

  appendMessage(message: ContextMessage): void {
    this.agent.records.logRecord({
      type: 'context.append_message',
      message,
    });
    foldAppendMessage(this.foldState(), message, this.foldHandlers);
  }

  /** Expose ContextMemory's fold-relevant fields as a WireFoldState view.
   *  The returned object shares storage with this instance — foldLoopEvent /
   *  foldAppendMessage mutate the same maps/arrays in place. */
  private foldState() {
    return {
      history: this._history,
      openSteps: this.openSteps,
      pendingToolResultIds: this.pendingToolResultIds,
      toolCallInfo: this.toolCallInfo,
      deferredMessages: this.deferredMessages,
    };
  }

  private foldHandlers: WireFoldHandlers = {
    onMessage: (message) => {
      this.pushHistorySideEffects(message);
    },
    onStepEnd: (_uuid, openStepIndex, usage) => {
      if (usage !== undefined) {
        this._tokenCount =
          usage.inputCacheRead + usage.inputCacheCreation + usage.inputOther + usage.output;
        this.tokenCountCoveredMessageCount =
          openStepIndex === -1 ? this._history.length : openStepIndex + 1;
      }
    },
    offloadToolOutput: (toolCallId, toolName, result) => {
      // Offloading requires a scratch manager and is suppressed during restore
      // (the scratch file is ephemeral; the live agent recompresses on the
      // next turn via beforeStep). See ADR-0031 / CONTEXT.md. Return
      // synchronously in those cases so the fold stays synchronous and
      // restoreRecord feeds messages into history before the caller reads it.
      if (
        this.agent.records.restoring ||
        this.scratchManager === undefined ||
        typeof result.output !== 'string'
      ) {
        return undefined;
      }
      return offloadOutput(
        toolCallId,
        toolName,
        result,
        this.scratchManager,
        DEFAULT_OFFLOADING_CONFIG,
      ).then((offloaded) => {
        if (!offloaded.offloaded) return undefined;
        this.agent.records.logRecord({
          type: 'context.output_offloaded',
          toolCallId,
          filePath: offloaded.filePath,
        });
        return { output: offloaded.output! };
      });
    },
  };

  /** Apply the live-agent side-effects for a message that the fold logic has
   *  already pushed onto `_history`: notify background-task delivery and feed
   *  the replay builder. The pure fold function owns the actual `_history`
   *  mutation; this runs alongside it via the `onMessage` handler. */
  private pushHistorySideEffects(message: ContextMessage): void {
    if (message.origin?.kind === 'background_task') {
      this.agent.background.markDeliveredNotification(message.origin);
    }
    this.agent.replayBuilder.push({
      type: 'message',
      message,
    });
  }

  restoreRecord(record: AgentRecord): void {
    // AgentRecords routes by prefix; only context.* records reach this handler.
    // Narrow so the switch is exhaustive over the owned subset (PRD-0025 R4).
    if (!isAgentRecordOfPrefix(record, 'context')) return;
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
      case 'context.output_offloaded':
      case 'context.pruning':
        // Live-only debugging records — no-op on restore. Offload/pruning are
        // recomputed on the next turn during restore (see ADR-0031 /
        // CONTEXT.md「输出卸载」). Listed explicitly so they are not mistaken
        // for a forgotten case; see restore-coverage test for the guarantee.
        break;
    }
  }

  private restoreClear(): void {
    resetWireFoldState(this.foldState());
    this._tokenCount = 0;
    this.tokenCountCoveredMessageCount = 0;
    this.agent.injection.onContextClear();
    this.agent.emitStatusUpdated();
  }

  private restoreApplyCompaction(
    record: Extract<AgentRecord, { type: 'context.apply_compaction' }>,
  ): void {
    foldApplyCompaction(
      this.foldState(),
      { summary: record.summary, compactedCount: record.compactedCount },
      this.foldHandlers,
    );
    this._tokenCount = record.tokensAfter;
    this.tokenCountCoveredMessageCount = this._history.length;
    this.agent.injection.onContextCompacted(record.compactedCount);
    this.agent.emitStatusUpdated();
  }

  private restoreMarkLastUserPromptBlocked(
    record: Extract<AgentRecord, { type: 'context.mark_last_user_prompt_blocked' }>,
  ): void {
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

  private async restoreAppendLoopEvent(
    record: Extract<AgentRecord, { type: 'context.append_loop_event' }>,
  ): Promise<void> {
    // During restore, we call the normal appendLoopEvent but it should not log
    // The restoring flag prevents logging
    await this.appendLoopEvent(record.event);
  }

  private restoreObservationMasking(): void {
    const maxContextSize = this.agent.config.modelCapabilities.max_context_tokens;
    const { history } = applyObservationMasking(this._history, maxContextSize, this.toolCallInfo);
    this._history = history;
    this.agent.emitStatusUpdated();
  }
}

/**
 * Find the index of the last assistant message whose `tool_calls` include any
 * id still pending a `tool_result`. Returns -1 when no such message exists.
 *
 * The caller slices everything from this index onward to roll back to the
 * last step boundary where every tool call already has its result — the only
 * shape providers accept for a fresh, tool-call-free generation.
 */
function findLastAssistantWithPendingToolCall(
  messages: readonly Message[],
  pendingToolResultIds: ReadonlySet<string>,
): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message === undefined || message.role !== 'assistant') continue;
    if (message.toolCalls.some((call) => pendingToolResultIds.has(call.id))) {
      return i;
    }
  }
  return -1;
}
