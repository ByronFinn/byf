import type {
  AssistantDeltaEvent,
  HookResultEvent,
  ThinkingDeltaEvent,
  ToolCallDeltaEvent,
  ToolCallStartedEvent,
  ToolProgressEvent,
  ToolResultEvent,
  TurnEndedEvent,
  TurnStartedEvent,
  TurnStepCompletedEvent,
  TurnStepInterruptedEvent,
  TurnStepStartedEvent,
} from '@byfriends/sdk';

import type { ToolCallComponent } from '#/tui/components/messages/tool-call';
import { STREAMING_UI_FLUSH_MS } from '#/tui/constant/streaming';
import type { ByfTuiThemeBundle } from '#/tui/theme/bundle';
import type {
  AppState,
  LivePaneState,
  QueuedMessage,
  ToolCallBlockData,
  ToolResultBlockData,
  TranscriptEntry,
} from '#/tui/types';
import {
  appendStreamingArgsPreview,
  argsRecord,
  isTodoItemShape,
  parseStreamingArgs,
  serializeToolResultOutput,
} from '#/tui/utils/event-payload';
import { nextTranscriptId } from '#/tui/utils/transcript-id';

// ---------------------------------------------------------------------------
// Streaming argument entry stored per in-flight tool call
// ---------------------------------------------------------------------------

export interface StreamingToolCallArgs {
  name?: string;
  argumentsText: string;
  startedAtMs: number;
}

// ---------------------------------------------------------------------------
// Turn event state — the subset of TUIState the handler reads/mutates
// ---------------------------------------------------------------------------

export interface TurnEventState {
  appState: AppState;
  theme: ByfTuiThemeBundle;
  currentTurnId: string | undefined;
  currentStep: number;
  assistantDraft: string;
  assistantStreamActive: boolean;
  thinkingDraft: string;
  activeToolCalls: Map<string, ToolCallBlockData>;
  streamingToolCallArguments: Map<string, StreamingToolCallArgs>;
  pendingToolComponents: Map<string, ToolCallComponent>;
  transcriptEntries: TranscriptEntry[];
  queuedMessages: QueuedMessage[];
}

// ---------------------------------------------------------------------------
// Callbacks — TUI methods the handler delegates to
// ---------------------------------------------------------------------------

export interface TurnEventCallbacks {
  setAppState(patch: Partial<AppState>): void;
  patchLivePane(patch: Partial<LivePaneState>): void;
  resetLivePane(): void;
  showStatus(message: string, color?: string): void;
  showError(message: string): void;
  showNotice(title: string, detail?: string): void;
  requestRender(): void;

  // Live render hooks
  onStreamingTextStart(): void;
  onStreamingTextUpdate(fullText: string): void;
  onStreamingTextEnd(): void;
  onThinkingUpdate(fullText: string): void;
  onThinkingEnd(): void;
  onToolCallStart(toolCall: ToolCallBlockData): void;
  onToolCallEnd(toolCallId: string, result: ToolResultBlockData): void;

  // Transcript
  appendTranscriptEntry(entry: TranscriptEntry): void;
  updateActivityPane(): void;

  // Cleanup helpers
  disposeActiveThinkingComponent(): void;
  disposeAndClearPendingToolComponents(): void;

  // Todo
  setTodoList(
    todos: readonly { title: string; status: 'pending' | 'in_progress' | 'done' }[],
  ): void;

  // Agent check for stepCompleted
  isAnthropicSessionActive(): boolean;

  // Session metadata for turn completion notification
  notifyTurnComplete(completedTurnKey: string): void;
}

// ---------------------------------------------------------------------------
// TurnEventHandler
// ---------------------------------------------------------------------------

export class TurnEventHandler {
  private readonly state: TurnEventState;
  private readonly callbacks: TurnEventCallbacks;

  // Streaming flush state
  private streamingUiFlushTimer: ReturnType<typeof setTimeout> | undefined;
  private lastStreamingUiFlushAt: number | undefined;
  private pendingAssistantFlush = false;
  private pendingThinkingFlush = false;
  private readonly pendingToolCallFlushIds = new Set<string>();

  constructor(state: TurnEventState, callbacks: TurnEventCallbacks) {
    this.state = state;
    this.callbacks = callbacks;
  }

  // -----------------------------------------------------------------------
  // Turn lifecycle
  // -----------------------------------------------------------------------

  handleTurnBegin(_event: TurnStartedEvent): void {
    void _event;
    this.resetLiveToolUiState();
    this.state.currentStep = 0;
    this.callbacks.patchLivePane({
      mode: 'waiting',
      pendingApproval: null,
      pendingQuestion: null,
    });
    this.callbacks.setAppState({
      isStreaming: true,
      streamingPhase: 'waiting',
      streamingStartTime: Date.now(),
    });
  }

  handleTurnEnd(_event: TurnEndedEvent, sendQueued: (item: QueuedMessage) => void): void {
    void _event;
    // Self-orchestrate flush+reset, mirroring handleStepBegin/handleStepInterrupted,
    // so callers (the dispatch switch) stay single-line delegations.
    this.flushStreamingUiUpdatesNow();
    this.resetLiveToolUiState();
    const completedTurnKey =
      this.state.currentTurnId ?? `local:${String(this.state.appState.streamingStartTime)}`;
    this.finalizeInternal(sendQueued, completedTurnKey);
  }

  // Public entry for paths without a real turn.ended event (e.g. /init).
  // Avoids forcing callers to synthesize a fake TurnEndedEvent.
  finalizeTurn(sendQueued: (item: QueuedMessage) => void): void {
    const completedTurnKey =
      this.state.currentTurnId ?? `local:${String(this.state.appState.streamingStartTime)}`;
    this.finalizeInternal(sendQueued, completedTurnKey);
  }

  handleStepBegin(event: TurnStepStartedEvent): void {
    this.flushStreamingUiUpdatesNow();
    this.state.currentStep = event.step;
    this.resetLiveToolUiState();
    this.finalizeLiveTextBuffers('waiting');
    this.callbacks.patchLivePane({
      mode: 'waiting',
      pendingApproval: null,
      pendingQuestion: null,
    });
    this.callbacks.setAppState({
      streamingPhase: 'waiting',
      streamingStartTime: Date.now(),
    });
  }

  handleStepCompleted(event: TurnStepCompletedEvent): void {
    this.flushStreamingUiUpdatesNow();
    if (event.finishReason !== 'max_tokens') return;

    const eventTurnId = String(event.turnId);
    let truncatedCount = 0;
    for (const toolCall of this.state.activeToolCalls.values()) {
      if (toolCall.result !== undefined) continue;
      if (toolCall.streamingArguments === undefined) continue;
      if (toolCall.turnId !== eventTurnId) continue;
      if (toolCall.step !== event.step) continue;
      toolCall.truncated = true;
      const component = this.state.pendingToolComponents.get(toolCall.id);
      if (component !== undefined) {
        component.updateToolCall(toolCall);
      }
      truncatedCount += 1;
    }
    this.state.streamingToolCallArguments.clear();

    const title =
      truncatedCount > 0
        ? 'Model hit max_tokens — tool call was truncated before it could run.'
        : 'Model hit max_tokens — no tool call was emitted.';
    const detail = this.callbacks.isAnthropicSessionActive()
      ? 'If this limit is wrong for your model, set `max_output_size` on the model alias in your byf config.'
      : undefined;
    this.callbacks.showNotice(title, detail);
  }

  handleStepInterrupted(event: TurnStepInterruptedEvent): void {
    this.flushStreamingUiUpdatesNow();
    this.resetLiveToolUiState();
    this.finalizeLiveTextBuffers('idle');
    const reason = event.reason;
    if (reason === 'error') return;
    if (reason === 'aborted' || reason === undefined || reason === '') {
      this.callbacks.showStatus('Interrupted by user', this.state.theme.colors.error);
      return;
    }
    this.callbacks.showError(
      reason === 'max_steps'
        ? 'reached per-turn step limit (max_steps)'
        : `step interrupted (${reason})`,
    );
  }

  // -----------------------------------------------------------------------
  // Streaming deltas
  // -----------------------------------------------------------------------

  handleThinkingDelta(event: ThinkingDeltaEvent): void {
    this.state.thinkingDraft += event.delta;
    this.pendingThinkingFlush = true;
    this.callbacks.patchLivePane({ mode: 'idle' });
    if (this.state.appState.streamingPhase !== 'thinking') {
      this.callbacks.setAppState({ streamingPhase: 'thinking', streamingStartTime: Date.now() });
    }
    this.scheduleStreamingUiFlush();
  }

  handleAssistantDelta(event: AssistantDeltaEvent): void {
    if (this.state.thinkingDraft.length > 0) {
      this.flushThinkingToTranscript('idle');
    }

    if (!this.state.assistantStreamActive) {
      this.state.assistantStreamActive = true;
      this.callbacks.onStreamingTextStart();
    }

    this.state.assistantDraft += event.delta;
    this.pendingAssistantFlush = true;

    this.callbacks.patchLivePane({
      mode: 'idle',
      pendingApproval: null,
      pendingQuestion: null,
    });
    if (this.state.appState.streamingPhase !== 'composing') {
      this.callbacks.setAppState({ streamingPhase: 'composing', streamingStartTime: Date.now() });
    }
    this.scheduleStreamingUiFlush();
  }

  handleHookResult(event: HookResultEvent): void {
    this.flushStreamingUiUpdatesNow();
    if (this.state.thinkingDraft.length > 0) {
      this.flushThinkingToTranscript('idle');
    }
    this.finalizeAssistantStream();
    this.callbacks.appendTranscriptEntry({
      id: nextTranscriptId(),
      kind: 'assistant',
      turnId: String(event.turnId),
      renderMode: 'markdown',
      content: formatHookResultMarkdown(event),
    });
    this.callbacks.patchLivePane({
      mode: 'idle',
      pendingApproval: null,
      pendingQuestion: null,
    });
  }

  // -----------------------------------------------------------------------
  // Tool calls
  // -----------------------------------------------------------------------

  handleToolCall(event: ToolCallStartedEvent): void {
    this.flushStreamingUiUpdatesNow();
    const toolCall: ToolCallBlockData = {
      id: event.toolCallId,
      name: event.name,
      args: argsRecord(event.args),
      description: event.description,
      display: event.display,
      step: this.state.currentStep,
      turnId: this.state.currentTurnId,
    };
    const existing = this.state.activeToolCalls.get(event.toolCallId);
    this.state.activeToolCalls.set(event.toolCallId, toolCall);
    this.pendingToolCallFlushIds.delete(event.toolCallId);
    this.state.streamingToolCallArguments.delete(event.toolCallId);
    const existingComponent = this.state.pendingToolComponents.get(event.toolCallId);
    if (existingComponent !== undefined) {
      existingComponent.updateToolCall(toolCall);
    } else if (existing === undefined) {
      this.finalizeLiveTextBuffers('tool');
      if (event.name !== 'Agent') {
        this.callbacks.onToolCallStart(toolCall);
      }
    }
    this.callbacks.patchLivePane({
      mode: 'tool',
      pendingApproval: null,
      pendingQuestion: null,
    });
  }

  handleToolCallDelta(event: ToolCallDeltaEvent): void {
    if (event.toolCallId.length === 0) return;
    const id = event.toolCallId;
    const existing = this.state.streamingToolCallArguments.get(id);
    const argumentsText = appendStreamingArgsPreview(existing?.argumentsText, event.argumentsPart);
    const name = event.name ?? existing?.name ?? this.state.activeToolCalls.get(id)?.name ?? 'Tool';
    const startedAtMs = existing?.startedAtMs ?? Date.now();
    this.state.streamingToolCallArguments.set(id, { name, argumentsText, startedAtMs });
    this.pendingToolCallFlushIds.add(id);

    this.callbacks.patchLivePane({
      mode: 'tool',
      pendingApproval: null,
      pendingQuestion: null,
    });
    if (this.state.appState.streamingPhase !== 'composing') {
      this.callbacks.setAppState({ streamingPhase: 'composing', streamingStartTime: Date.now() });
    }
    this.scheduleStreamingUiFlush();
  }

  handleToolProgress(event: ToolProgressEvent): void {
    if (event.update.kind !== 'status') return;
    const text = event.update.text;
    if (text === undefined || text.length === 0) return;
    const tc = this.state.pendingToolComponents.get(event.toolCallId);
    if (tc === undefined) return;
    tc.appendProgress(text);
  }

  handleToolResult(event: ToolResultEvent): void {
    this.flushStreamingUiUpdatesNow();
    const matchedCall = this.state.activeToolCalls.get(event.toolCallId);
    const resultData: ToolResultBlockData = {
      tool_call_id: event.toolCallId,
      output: serializeToolResultOutput(event.output),
      is_error: event.isError,
      synthetic: event.synthetic,
      blockedReason: event.blockedReason,
    };
    if (matchedCall !== undefined) {
      this.callbacks.onToolCallEnd(event.toolCallId, resultData);
      if (matchedCall.name === 'TodoList' && !event.isError) {
        const rawTodos = (matchedCall.args as { todos?: unknown }).todos;
        if (Array.isArray(rawTodos)) {
          const sanitized = rawTodos
            .filter((todo): todo is { title: string; status: 'pending' | 'in_progress' | 'done' } =>
              isTodoItemShape(todo),
            )
            .map((t) => ({ title: t.title, status: t.status }));
          this.callbacks.setTodoList(sanitized);
        }
      }
    }
    this.state.activeToolCalls.delete(event.toolCallId);
    this.state.streamingToolCallArguments.delete(event.toolCallId);
    this.callbacks.patchLivePane({ mode: 'waiting' });
  }

  // -----------------------------------------------------------------------
  // Streaming flush / coalescence
  // -----------------------------------------------------------------------

  resetLiveToolUiState(): void {
    this.pendingToolCallFlushIds.clear();
    this.clearStreamingUiFlushTimerIfIdle();
    this.state.streamingToolCallArguments.clear();
    this.callbacks.disposeAndClearPendingToolComponents();
  }

  resetToolCallState(): void {
    this.state.activeToolCalls.clear();
  }

  discardPendingStreamingUiUpdates(): void {
    this.clearStreamingUiFlushTimer();
    this.pendingAssistantFlush = false;
    this.pendingThinkingFlush = false;
    this.pendingToolCallFlushIds.clear();
  }

  resetLiveTextRuntime(): void {
    this.pendingAssistantFlush = false;
    this.pendingThinkingFlush = false;
    this.clearStreamingUiFlushTimerIfIdle();
    this.state.assistantDraft = '';
    this.state.assistantStreamActive = false;
    this.state.thinkingDraft = '';
    this.callbacks.disposeActiveThinkingComponent();
  }

  flushStreamingUiUpdatesNow(): void {
    this.clearStreamingUiFlushTimer();
    this.flushStreamingUiUpdates();
  }

  finalizeLiveTextBuffers(nextMode: LivePaneState['mode'] = 'idle'): void {
    this.flushThinkingToTranscript(nextMode);
    this.finalizeAssistantStream();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private hasPendingStreamingUiUpdates(): boolean {
    return (
      this.pendingAssistantFlush ||
      this.pendingThinkingFlush ||
      this.pendingToolCallFlushIds.size > 0
    );
  }

  private clearStreamingUiFlushTimer(): void {
    if (this.streamingUiFlushTimer === undefined) return;
    clearTimeout(this.streamingUiFlushTimer);
    this.streamingUiFlushTimer = undefined;
  }

  private clearStreamingUiFlushTimerIfIdle(): void {
    if (this.hasPendingStreamingUiUpdates()) return;
    this.clearStreamingUiFlushTimer();
  }

  private scheduleStreamingUiFlush(): void {
    if (!this.hasPendingStreamingUiUpdates()) return;
    if (this.streamingUiFlushTimer !== undefined) return;
    const delay =
      this.lastStreamingUiFlushAt === undefined
        ? 0
        : Math.max(0, STREAMING_UI_FLUSH_MS - (Date.now() - this.lastStreamingUiFlushAt));
    this.streamingUiFlushTimer = setTimeout(() => {
      this.streamingUiFlushTimer = undefined;
      this.flushStreamingUiUpdates();
    }, delay);
  }

  private flushStreamingUiUpdates(): void {
    if (!this.hasPendingStreamingUiUpdates()) return;
    this.lastStreamingUiFlushAt = Date.now();
    const shouldFlushThinking = this.pendingThinkingFlush;
    const shouldFlushAssistant = this.pendingAssistantFlush;
    const toolCallIds = [...this.pendingToolCallFlushIds];
    this.pendingThinkingFlush = false;
    this.pendingAssistantFlush = false;
    this.pendingToolCallFlushIds.clear();

    if (shouldFlushThinking && this.state.thinkingDraft.length > 0) {
      this.callbacks.onThinkingUpdate(this.state.thinkingDraft);
    }
    if (shouldFlushAssistant) {
      this.callbacks.onStreamingTextUpdate(this.state.assistantDraft);
    }
    for (const id of toolCallIds) {
      this.flushStreamingToolCallPreview(id);
    }
  }

  private flushStreamingToolCallPreview(id: string): void {
    const streaming = this.state.streamingToolCallArguments.get(id);
    if (streaming === undefined) return;
    const toolCall: ToolCallBlockData = {
      id,
      name: streaming.name ?? this.state.activeToolCalls.get(id)?.name ?? 'Tool',
      args: parseStreamingArgs(streaming.argumentsText),
      streamingArguments: streaming.argumentsText,
      streamingStartedAtMs: streaming.startedAtMs,
      step: this.state.currentStep,
      turnId: this.state.currentTurnId,
    };
    this.state.activeToolCalls.set(id, toolCall);

    if (this.state.thinkingDraft.length > 0 || this.state.assistantStreamActive) {
      this.finalizeLiveTextBuffers('tool');
    }

    const existingComponent = this.state.pendingToolComponents.get(id);
    if (existingComponent !== undefined) {
      existingComponent.updateToolCall(toolCall);
    } else if (toolCall.name !== 'Agent') {
      this.callbacks.onToolCallStart(toolCall);
    }
  }

  private flushThinkingToTranscript(nextMode: LivePaneState['mode'] = 'idle'): void {
    this.flushStreamingUiUpdatesNow();
    if (this.state.thinkingDraft.length === 0) {
      this.callbacks.patchLivePane({ mode: nextMode });
      return;
    }
    this.state.thinkingDraft = '';
    this.callbacks.onThinkingEnd();
    this.callbacks.patchLivePane({ mode: nextMode });
  }

  private finalizeAssistantStream(): void {
    this.flushStreamingUiUpdatesNow();
    if (this.state.assistantStreamActive) {
      this.callbacks.onStreamingTextEnd();
      this.state.assistantStreamActive = false;
    }
    this.state.assistantDraft = '';
    this.callbacks.updateActivityPane();
    this.callbacks.requestRender();
  }

  private finalizeInternal(
    sendQueued: (item: QueuedMessage) => void,
    completedTurnKey: string,
  ): void {
    if (!this.state.appState.isStreaming) return;
    this.finalizeLiveTextBuffers('idle');
    this.resetToolCallState();
    this.state.currentTurnId = undefined;

    if (this.state.queuedMessages.length > 0) {
      const [next, ...rest] = this.state.queuedMessages;
      this.state.queuedMessages = rest;
      this.callbacks.setAppState({ isStreaming: false, streamingPhase: 'idle' });
      this.callbacks.resetLivePane();
      if (next !== undefined) {
        setTimeout(() => {
          sendQueued(next);
        }, 0);
      }
      return;
    }

    this.callbacks.setAppState({ isStreaming: false, streamingPhase: 'idle' });
    this.callbacks.resetLivePane();
    this.callbacks.notifyTurnComplete(completedTurnKey);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatHookResultMarkdown(event: HookResultEvent): string {
  return `*${formatHookResultTitle(event)}*\n\n${formatHookResultBody(event)}`;
}

function formatHookResultTitle(event: HookResultEvent): string {
  return `${event.hookEvent} hook${event.blocked === true ? ' blocked' : ''}`;
}

function formatHookResultBody(event: HookResultEvent): string {
  const content = event.content.trim();
  return content.length === 0 ? '(empty)' : content;
}
