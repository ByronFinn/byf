import { afterEach, describe, expect, it, vi } from 'vitest';

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

import type { ColorPalette } from '#/tui/theme/colors';
import type { AppState, LivePaneState, QueuedMessage, ToolCallBlockData, ToolResultBlockData, TranscriptEntry } from '#/tui/types';

import {
  TurnEventHandler,
  type TurnEventCallbacks,
  type TurnEventState,
} from '#/tui/events/turn-event-handler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeColors(): ColorPalette {
  return {
    error: '#ff0000',
    success: '#00ff00',
    warning: '#ffcc00',
    textMuted: '#888888',
    primary: '#0000ff',
  } as unknown as ColorPalette;
}

function makeAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    model: 'test-model',
    workDir: '/tmp',
    sessionId: 'ses-1',
    yolo: false,
    permissionMode: 'manual',
    thinkingEffort: 'off',
    contextUsage: 0,
    contextTokens: 0,
    maxContextTokens: 0,
    isStreaming: false,
    isCompacting: false,
    isReplaying: false,
    streamingPhase: 'idle',
    streamingStartTime: 0,
    theme: 'dark',
    version: '0.0.0',
    editorCommand: null,
    notifications: { enabled: false, condition: 'unfocused' },
    availableModels: {},
    availableProviders: {},
    sessionTitle: null,
    ...overrides,
  };
}

function makeState(overrides: Partial<TurnEventState> = {}): TurnEventState {
  return {
    appState: makeAppState(),
    colors: makeColors(),
    currentTurnId: undefined,
    currentStep: 0,
    assistantDraft: '',
    assistantStreamActive: false,
    thinkingDraft: '',
    activeToolCalls: new Map(),
    streamingToolCallArguments: new Map(),
    pendingToolComponents: new Map(),
    transcriptEntries: [],
    queuedMessages: [],
    ...overrides,
  };
}

type CallbackCalls = {
  setAppState: Partial<AppState>[];
  patchLivePane: Partial<LivePaneState>[];
  resetLivePane: number;
  showStatus: Array<{ message: string; color?: string }>;
  showError: string[];
  showNotice: Array<{ title: string; detail?: string }>;
  requestRender: number;
  onStreamingTextStart: number;
  onStreamingTextUpdate: string[];
  onStreamingTextEnd: number;
  onThinkingUpdate: string[];
  onThinkingEnd: number;
  onToolCallStart: ToolCallBlockData[];
  onToolCallEnd: Array<{ toolCallId: string; result: ToolResultBlockData }>;
  appendTranscriptEntry: TranscriptEntry[];
  updateActivityPane: number;
  disposeActiveThinkingComponent: number;
  disposeAndClearPendingToolComponents: number;
  setTodoList: Array<readonly { title: string; status: 'pending' | 'in_progress' | 'done' }[]>;
  isAnthropicSessionActive: boolean;
  notifyTurnComplete: string[];
};

function makeCallbacks(): { callbacks: TurnEventCallbacks; calls: CallbackCalls } {
  const calls: CallbackCalls = {
    setAppState: [],
    patchLivePane: [],
    resetLivePane: 0,
    showStatus: [],
    showError: [],
    showNotice: [],
    requestRender: 0,
    onStreamingTextStart: 0,
    onStreamingTextUpdate: [],
    onStreamingTextEnd: 0,
    onThinkingUpdate: [],
    onThinkingEnd: 0,
    onToolCallStart: [],
    onToolCallEnd: [],
    appendTranscriptEntry: [],
    updateActivityPane: 0,
    disposeActiveThinkingComponent: 0,
    disposeAndClearPendingToolComponents: 0,
    setTodoList: [],
    isAnthropicSessionActive: false,
    notifyTurnComplete: [],
  };
  const callbacks: TurnEventCallbacks = {
    setAppState: (patch) => calls.setAppState.push(patch),
    patchLivePane: (patch) => calls.patchLivePane.push(patch),
    resetLivePane: () => { calls.resetLivePane++; },
    showStatus: (message, color) => calls.showStatus.push({ message, color }),
    showError: (msg) => calls.showError.push(msg),
    showNotice: (title, detail) => calls.showNotice.push({ title, detail }),
    requestRender: () => { calls.requestRender++; },
    onStreamingTextStart: () => { calls.onStreamingTextStart++; },
    onStreamingTextUpdate: (text) => calls.onStreamingTextUpdate.push(text),
    onStreamingTextEnd: () => { calls.onStreamingTextEnd++; },
    onThinkingUpdate: (text) => calls.onThinkingUpdate.push(text),
    onThinkingEnd: () => { calls.onThinkingEnd++; },
    onToolCallStart: (tc) => calls.onToolCallStart.push(tc),
    onToolCallEnd: (id, result) => calls.onToolCallEnd.push({ toolCallId: id, result }),
    appendTranscriptEntry: (entry) => calls.appendTranscriptEntry.push(entry),
    updateActivityPane: () => { calls.updateActivityPane++; },
    disposeActiveThinkingComponent: () => { calls.disposeActiveThinkingComponent++; },
    disposeAndClearPendingToolComponents: () => { calls.disposeAndClearPendingToolComponents++; },
    setTodoList: (todos) => calls.setTodoList.push(todos),
    isAnthropicSessionActive: () => calls.isAnthropicSessionActive,
    notifyTurnComplete: (key) => calls.notifyTurnComplete.push(key),
  };
  return { callbacks, calls };
}

function makeHandler(stateOverrides: Partial<TurnEventState> = {}): {
  handler: TurnEventHandler;
  state: TurnEventState;
  calls: CallbackCalls;
} {
  const state = makeState(stateOverrides);
  const { callbacks, calls } = makeCallbacks();
  const handler = new TurnEventHandler(state, callbacks);
  return { handler, state, calls };
}

// Minimal event factories with all required fields.

function turnStarted(turnId = 1): TurnStartedEvent {
  return { type: 'turn.started', turnId, origin: 'user' } as unknown as TurnStartedEvent;
}

function turnEnded(turnId = 1): TurnEndedEvent {
  return { type: 'turn.ended', turnId, reason: 'completed' } as unknown as TurnEndedEvent;
}

function stepStarted(turnId = 1, step = 0): TurnStepStartedEvent {
  return { type: 'turn.step.started', turnId, step } as unknown as TurnStepStartedEvent;
}

function stepCompleted(turnId = 1, step = 0, finishReason: string = 'end_turn'): TurnStepCompletedEvent {
  return { type: 'turn.step.completed', turnId, step, finishReason } as unknown as TurnStepCompletedEvent;
}

function stepInterrupted(turnId = 1, step = 0, reason?: string): TurnStepInterruptedEvent {
  return { type: 'turn.step.interrupted', turnId, step, reason } as unknown as TurnStepInterruptedEvent;
}

function thinkingDelta(delta: string): ThinkingDeltaEvent {
  return { type: 'thinking.delta', turnId: 1, delta } as unknown as ThinkingDeltaEvent;
}

function assistantDelta(delta: string): AssistantDeltaEvent {
  return { type: 'assistant.delta', turnId: 1, delta } as unknown as AssistantDeltaEvent;
}

function hookResult(overrides: Partial<HookResultEvent> = {}): HookResultEvent {
  return {
    type: 'hook.result',
    turnId: 1,
    hookEvent: 'PreToolUse',
    content: '',
    blocked: false,
    ...overrides,
  } as unknown as HookResultEvent;
}

function toolCallStarted(id: string, name: string, args: unknown = {}): ToolCallStartedEvent {
  return { type: 'tool.call.started', turnId: 1, toolCallId: id, name, args } as unknown as ToolCallStartedEvent;
}

function toolCallDelta(id: string, name?: string, argumentsPart?: string): ToolCallDeltaEvent {
  return { type: 'tool.call.delta', turnId: 1, toolCallId: id, name, argumentsPart } as unknown as ToolCallDeltaEvent;
}

function toolProgress(toolCallId: string, kind: string, text?: string): ToolProgressEvent {
  return { type: 'tool.progress', turnId: 1, toolCallId, update: { kind, text } } as unknown as ToolProgressEvent;
}

function toolResult(toolCallId: string, output: unknown, isError = false): ToolResultEvent {
  return { type: 'tool.result', turnId: 1, toolCallId, output, isError } as unknown as ToolResultEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TurnEventHandler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // handleTurnBegin
  // =========================================================================

  describe('handleTurnBegin', () => {
    it('resets tool UI state and sets streaming phase to waiting', () => {
      const { handler, state, calls } = makeHandler();
      handler.handleTurnBegin(turnStarted());
      expect(state.currentStep).toBe(0);
      expect(calls.patchLivePane[0]).toEqual({
        mode: 'waiting',
        pendingApproval: null,
        pendingQuestion: null,
      });
      expect(calls.setAppState[0]).toEqual(
        expect.objectContaining({ isStreaming: true, streamingPhase: 'waiting' }),
      );
    });
  });

  // =========================================================================
  // handleTurnEnd
  // =========================================================================

  describe('handleTurnEnd', () => {
    it('finalizes turn and notifies completion', () => {
      const { handler, calls } = makeHandler({
        appState: makeAppState({ isStreaming: true }),
        currentTurnId: 'turn-42',
      });
      handler.handleTurnEnd(turnEnded(), vi.fn());
      expect(calls.notifyTurnComplete).toEqual(['turn-42']);
      expect(calls.setAppState).toContainEqual({ isStreaming: false, streamingPhase: 'idle' });
      expect(calls.resetLivePane).toBe(1);
    });

    it('sends queued message when available', () => {
      const queuedMsg: QueuedMessage = { text: 'next message' };
      const { handler, state } = makeHandler({
        appState: makeAppState({ isStreaming: true }),
        currentTurnId: 'turn-1',
        queuedMessages: [queuedMsg],
      });
      const sendQueued = vi.fn();
      handler.handleTurnEnd(turnEnded(), sendQueued);
      expect(state.queuedMessages).toHaveLength(0);
      expect(sendQueued).not.toHaveBeenCalled();
    });

    it('does nothing if not streaming', () => {
      const { handler, calls } = makeHandler();
      handler.handleTurnEnd(turnEnded(), vi.fn());
      expect(calls.notifyTurnComplete).toHaveLength(0);
    });
  });

  // =========================================================================
  // finalizeTurn
  // =========================================================================

  describe('finalizeTurn', () => {
    // finalizeTurn is the /init path entry — it skips the flush+reset that
    // handleTurnEnd does (those already ran in beginSessionRequest), so it
    // must NOT touch streamingToolCallArguments or pending tool components.
    it('finalizes turn without flushing or resetting live tool UI', () => {
      const { handler, state, calls } = makeHandler({
        appState: makeAppState({ isStreaming: true }),
        currentTurnId: 'turn-42',
      });
      state.streamingToolCallArguments.set('tc-1', {
        name: 'Bash',
        argumentsText: '{"cmd": "ls"}',
        startedAtMs: Date.now(),
      });
      handler.finalizeTurn(vi.fn());
      expect(calls.notifyTurnComplete).toEqual(['turn-42']);
      expect(calls.setAppState).toContainEqual({ isStreaming: false, streamingPhase: 'idle' });
      // Key distinction from handleTurnEnd: live tool UI state is left untouched.
      expect(state.streamingToolCallArguments.size).toBe(1);
      expect(calls.disposeAndClearPendingToolComponents).toBe(0);
    });

    it('sends queued message when available', () => {
      const queuedMsg: QueuedMessage = { text: 'next message' };
      const { handler, state } = makeHandler({
        appState: makeAppState({ isStreaming: true }),
        currentTurnId: 'turn-1',
        queuedMessages: [queuedMsg],
      });
      const sendQueued = vi.fn();
      handler.finalizeTurn(sendQueued);
      expect(state.queuedMessages).toHaveLength(0);
      expect(sendQueued).not.toHaveBeenCalled();
    });

    it('does nothing if not streaming', () => {
      const { handler, calls } = makeHandler();
      handler.finalizeTurn(vi.fn());
      expect(calls.notifyTurnComplete).toHaveLength(0);
    });
  });

  // =========================================================================
  // handleStepBegin
  // =========================================================================

  describe('handleStepBegin', () => {
    it('updates current step and resets tool UI', () => {
      const { handler, state, calls } = makeHandler();
      handler.handleStepBegin(stepStarted(1, 3));
      expect(state.currentStep).toBe(3);
      const lastPaneCall = calls.patchLivePane.at(-1);
      expect(lastPaneCall).toEqual({
        mode: 'waiting',
        pendingApproval: null,
        pendingQuestion: null,
      });
      expect(calls.setAppState[0]).toEqual(
        expect.objectContaining({ streamingPhase: 'waiting' }),
      );
    });
  });

  // =========================================================================
  // handleStepCompleted
  // =========================================================================

  describe('handleStepCompleted', () => {
    it('does nothing for non-max_tokens finish reason', () => {
      const { handler, calls } = makeHandler();
      handler.handleStepCompleted(stepCompleted(1, 0, 'end_turn'));
      expect(calls.showNotice).toHaveLength(0);
    });

    it('shows notice with truncation info for max_tokens with streaming tool calls', () => {
      const { handler, state, calls } = makeHandler();
      calls.isAnthropicSessionActive = true;

      const toolCall: ToolCallBlockData = {
        id: 'tc-1',
        name: 'Read',
        args: { path: '/foo' },
        step: 2,
        turnId: '1',
        streamingArguments: '{"path": "/foo"}',
      };
      state.activeToolCalls.set('tc-1', toolCall);

      handler.handleStepCompleted(stepCompleted(1, 2, 'max_tokens'));

      expect(calls.showNotice).toHaveLength(1);
      expect(calls.showNotice[0]!.title).toContain('truncated');
      expect(calls.showNotice[0]!.detail).toContain('max_output_size');
      expect(toolCall.truncated).toBe(true);
    });

    it('shows no-config-knob detail for non-Anthropic providers', () => {
      const { handler, calls } = makeHandler();
      calls.isAnthropicSessionActive = false;

      handler.handleStepCompleted(stepCompleted(1, 0, 'max_tokens'));

      expect(calls.showNotice[0]!.detail).toBeUndefined();
    });
  });

  // =========================================================================
  // handleStepInterrupted
  // =========================================================================

  describe('handleStepInterrupted', () => {
    it('shows user interrupted status for aborted reason', () => {
      const { handler, calls } = makeHandler();
      handler.handleStepInterrupted(stepInterrupted(1, 0, 'aborted'));
      expect(calls.showStatus[0]!.message).toBe('Interrupted by user');
    });

    it('shows error for max_steps', () => {
      const { handler, calls } = makeHandler();
      handler.handleStepInterrupted(stepInterrupted(1, 0, 'max_steps'));
      expect(calls.showError[0]).toContain('max_steps');
    });

    it('does nothing for error reason', () => {
      const { handler, calls } = makeHandler();
      handler.handleStepInterrupted(stepInterrupted(1, 0, 'error'));
      expect(calls.showStatus).toHaveLength(0);
      expect(calls.showError).toHaveLength(0);
    });
  });

  // =========================================================================
  // handleThinkingDelta
  // =========================================================================

  describe('handleThinkingDelta', () => {
    it('accumulates thinking text and schedules flush', () => {
      vi.useFakeTimers();
      const { handler, state, calls } = makeHandler();
      handler.handleThinkingDelta(thinkingDelta('Hello '));
      handler.handleThinkingDelta(thinkingDelta('World'));
      expect(state.thinkingDraft).toBe('Hello World');
      expect(calls.onThinkingUpdate).toHaveLength(0);
      vi.advanceTimersByTime(100);
      expect(calls.onThinkingUpdate).toEqual(['Hello World']);
    });

    it('sets streamingPhase to thinking', () => {
      const { handler, calls } = makeHandler();
      handler.handleThinkingDelta(thinkingDelta('Hmm'));
      expect(calls.setAppState[0]).toEqual(
        expect.objectContaining({ streamingPhase: 'thinking' }),
      );
    });
  });

  // =========================================================================
  // handleAssistantDelta
  // =========================================================================

  describe('handleAssistantDelta', () => {
    it('starts streaming and accumulates text', () => {
      vi.useFakeTimers();
      const { handler, state, calls } = makeHandler();

      handler.handleAssistantDelta(assistantDelta('Hello '));
      expect(calls.onStreamingTextStart).toBe(1);
      expect(state.assistantDraft).toBe('Hello ');

      handler.handleAssistantDelta(assistantDelta('World'));
      expect(state.assistantDraft).toBe('Hello World');

      vi.advanceTimersByTime(100);
      expect(calls.onStreamingTextUpdate).toEqual(['Hello World']);
    });

    it('flushes thinking before starting assistant stream', () => {
      const { handler, state, calls } = makeHandler();
      state.thinkingDraft = 'Some thinking';
      handler.handleAssistantDelta(assistantDelta('Text'));
      expect(calls.onThinkingEnd).toBe(1);
    });
  });

  // =========================================================================
  // handleHookResult
  // =========================================================================

  describe('handleHookResult', () => {
    it('appends transcript entry with formatted hook result', () => {
      const { handler, calls } = makeHandler();
      handler.handleHookResult(hookResult({
        hookEvent: 'PreToolUse',
        content: 'Hook output',
        blocked: false,
      }));
      expect(calls.appendTranscriptEntry).toHaveLength(1);
      const entry = calls.appendTranscriptEntry[0]!;
      expect(entry.kind).toBe('assistant');
      expect(entry.renderMode).toBe('markdown');
      expect(entry.content).toContain('PreToolUse hook');
      expect(entry.content).toContain('Hook output');
    });

    it('includes blocked in title when blocked is true', () => {
      const { handler, calls } = makeHandler();
      handler.handleHookResult(hookResult({
        hookEvent: 'PostToolUse',
        content: 'blocked it',
        blocked: true,
      }));
      expect(calls.appendTranscriptEntry[0]!.content).toContain('blocked');
    });
  });

  // =========================================================================
  // handleToolCall
  // =========================================================================

  describe('handleToolCall', () => {
    it('registers tool call and starts component for new calls', () => {
      const { handler, state, calls } = makeHandler();
      handler.handleToolCall(toolCallStarted('tc-1', 'Read', { path: '/foo.txt' }));
      expect(state.activeToolCalls.has('tc-1')).toBe(true);
      const tc = state.activeToolCalls.get('tc-1')!;
      expect(tc.name).toBe('Read');
      expect(calls.onToolCallStart).toHaveLength(1);
      expect(calls.onToolCallStart[0]!.name).toBe('Read');
    });

    it('does not start component for Agent tool calls', () => {
      const { handler, calls } = makeHandler();
      handler.handleToolCall(toolCallStarted('tc-agent', 'Agent'));
      expect(calls.onToolCallStart).toHaveLength(0);
    });

    it('updates existing component instead of starting new one', () => {
      const { handler, state, calls } = makeHandler();
      const mockComponent = { updateToolCall: vi.fn() };
      state.pendingToolComponents.set('tc-1', mockComponent as never);

      handler.handleToolCall(toolCallStarted('tc-1', 'Read', { path: '/bar.txt' }));
      expect(mockComponent.updateToolCall).toHaveBeenCalled();
      expect(calls.onToolCallStart).toHaveLength(0);
    });
  });

  // =========================================================================
  // handleToolCallDelta
  // =========================================================================

  describe('handleToolCallDelta', () => {
    it('accumulates streaming args and schedules flush', () => {
      vi.useFakeTimers();
      const { handler, state, calls } = makeHandler();
      handler.handleToolCallDelta(toolCallDelta('tc-1', 'Bash', '{"comma'));
      expect(state.streamingToolCallArguments.has('tc-1')).toBe(true);
      expect(state.streamingToolCallArguments.get('tc-1')!.name).toBe('Bash');
      vi.advanceTimersByTime(100);
      expect(calls.onToolCallStart).toHaveLength(1);
    });

    it('ignores empty tool call IDs', () => {
      const { handler, state } = makeHandler();
      handler.handleToolCallDelta(toolCallDelta('', 'Bash', 'data'));
      expect(state.streamingToolCallArguments.size).toBe(0);
    });
  });

  // =========================================================================
  // handleToolProgress
  // =========================================================================

  describe('handleToolProgress', () => {
    it('forwards status text to pending tool component', () => {
      const { handler, state } = makeHandler();
      const mockComponent = { appendProgress: vi.fn() };
      state.pendingToolComponents.set('tc-1', mockComponent as never);

      handler.handleToolProgress(toolProgress('tc-1', 'status', 'Authenticating...'));
      expect(mockComponent.appendProgress).toHaveBeenCalledWith('Authenticating...');
    });

    it('ignores non-status updates', () => {
      const { handler, state } = makeHandler();
      const mockComponent = { appendProgress: vi.fn() };
      state.pendingToolComponents.set('tc-1', mockComponent as never);

      handler.handleToolProgress(toolProgress('tc-1', 'stdout', 'data'));
      expect(mockComponent.appendProgress).not.toHaveBeenCalled();
    });

    it('ignores unknown tool call IDs', () => {
      const { handler } = makeHandler();
      expect(() => {
        handler.handleToolProgress(toolProgress('unknown-tc', 'status', 'Working...'));
      }).not.toThrow();
    });
  });

  // =========================================================================
  // handleToolResult
  // =========================================================================

  describe('handleToolResult', () => {
    it('applies result to matched tool call and cleans up', () => {
      const { handler, state, calls } = makeHandler();
      state.activeToolCalls.set('tc-1', {
        id: 'tc-1',
        name: 'Read',
        args: { path: '/foo' },
        step: 0,
        turnId: '1',
      });

      handler.handleToolResult(toolResult('tc-1', 'file contents'));
      expect(calls.onToolCallEnd).toHaveLength(1);
      expect(calls.onToolCallEnd[0]!.toolCallId).toBe('tc-1');
      expect(state.activeToolCalls.has('tc-1')).toBe(false);
    });

    it('handles TodoList results by updating todo panel', () => {
      const { handler, state, calls } = makeHandler();
      state.activeToolCalls.set('tc-todo', {
        id: 'tc-todo',
        name: 'TodoList',
        args: {
          todos: [
            { title: 'Task 1', status: 'pending' },
            { title: 'Task 2', status: 'done' },
          ],
        },
        step: 0,
        turnId: '1',
      });

      handler.handleToolResult(toolResult('tc-todo', 'updated'));
      expect(calls.setTodoList).toHaveLength(1);
      expect(calls.setTodoList[0]).toEqual([
        { title: 'Task 1', status: 'pending' },
        { title: 'Task 2', status: 'done' },
      ]);
    });

    it('handles TodoList error results without updating todo panel', () => {
      const { handler, state, calls } = makeHandler();
      state.activeToolCalls.set('tc-todo', {
        id: 'tc-todo',
        name: 'TodoList',
        args: { todos: [{ title: 'Task', status: 'pending' }] },
        step: 0,
        turnId: '1',
      });

      handler.handleToolResult(toolResult('tc-todo', 'error', true));
      expect(calls.setTodoList).toHaveLength(0);
    });
  });

  // =========================================================================
  // Streaming flush / coalescence
  // =========================================================================

  describe('flushStreamingUiUpdatesNow', () => {
    it('flushes pending assistant updates immediately', () => {
      const { handler, state, calls } = makeHandler();
      state.assistantDraft = 'Hello world';
      handler.handleAssistantDelta(assistantDelta('!'));
      expect(state.assistantDraft).toBe('Hello world!');
      handler.flushStreamingUiUpdatesNow();
      expect(calls.onStreamingTextUpdate).toEqual(['Hello world!']);
    });
  });

  describe('resetLiveToolUiState', () => {
    it('clears streaming tool call arguments and disposes components', () => {
      const { handler, state, calls } = makeHandler();
      state.streamingToolCallArguments.set('tc-1', {
        name: 'Bash',
        argumentsText: '{"cmd": "ls"}',
        startedAtMs: Date.now(),
      });
      handler.resetLiveToolUiState();
      expect(state.streamingToolCallArguments.size).toBe(0);
      expect(calls.disposeAndClearPendingToolComponents).toBe(1);
    });
  });

  describe('resetLiveTextRuntime', () => {
    it('clears draft text and disposes thinking component', () => {
      const { handler, state, calls } = makeHandler();
      state.assistantDraft = 'text';
      state.thinkingDraft = 'thinking';
      state.assistantStreamActive = true;
      handler.resetLiveTextRuntime();
      expect(state.assistantDraft).toBe('');
      expect(state.thinkingDraft).toBe('');
      expect(state.assistantStreamActive).toBe(false);
      expect(calls.disposeActiveThinkingComponent).toBe(1);
    });
  });

  describe('discardPendingStreamingUiUpdates', () => {
    it('clears all pending flags', () => {
      const { handler } = makeHandler();
      handler.handleAssistantDelta(assistantDelta('x'));
      handler.handleThinkingDelta(thinkingDelta('y'));
      handler.discardPendingStreamingUiUpdates();
      expect(() => {
        handler.flushStreamingUiUpdatesNow();
      }).not.toThrow();
    });
  });

  describe('finalizeLiveTextBuffers', () => {
    it('flushes thinking and assistant streams', () => {
      const { handler, state, calls } = makeHandler();
      state.thinkingDraft = 'Some thinking';
      state.assistantDraft = 'Some text';
      state.assistantStreamActive = true;
      handler.finalizeLiveTextBuffers('idle');
      expect(calls.onThinkingEnd).toBe(1);
      expect(calls.onStreamingTextEnd).toBe(1);
    });
  });

  // =========================================================================
  // Full turn lifecycle integration
  // =========================================================================

  describe('full turn lifecycle', () => {
    it('turn.started → assistant.delta → turn.ended', () => {
      vi.useFakeTimers();
      const { handler, state, calls } = makeHandler();

      handler.handleTurnBegin(turnStarted());
      state.currentTurnId = '1';
      state.appState.isStreaming = true;
      expect(calls.setAppState[0]).toEqual(
        expect.objectContaining({ isStreaming: true }),
      );

      handler.handleAssistantDelta(assistantDelta('Hello '));
      handler.handleAssistantDelta(assistantDelta('World'));

      handler.handleTurnEnd(turnEnded(), vi.fn());
      expect(calls.onStreamingTextEnd).toBe(1);
      expect(state.assistantDraft).toBe('');
      expect(calls.notifyTurnComplete).toEqual(['1']);
    });

    it('turn.started → thinking → assistant → tool.call → tool.result → turn.ended', () => {
      const { handler, state, calls } = makeHandler();

      handler.handleTurnBegin(turnStarted(5));
      state.currentTurnId = '5';
      state.appState.isStreaming = true;

      handler.handleThinkingDelta(thinkingDelta('Let me think...'));
      expect(state.thinkingDraft).toBe('Let me think...');

      handler.handleAssistantDelta(assistantDelta('Result'));
      expect(calls.onThinkingEnd).toBe(1);
      expect(state.thinkingDraft).toBe('');
      expect(state.assistantStreamActive).toBe(true);

      handler.handleToolCall(toolCallStarted('tc-10', 'Bash', { command: 'ls' }));
      expect(state.activeToolCalls.has('tc-10')).toBe(true);

      handler.handleToolResult(toolResult('tc-10', 'file1.txt\nfile2.txt'));
      expect(state.activeToolCalls.has('tc-10')).toBe(false);

      handler.handleTurnEnd(turnEnded(5), vi.fn());
      expect(calls.notifyTurnComplete).toEqual(['5']);
      expect(calls.setAppState).toContainEqual({ isStreaming: false, streamingPhase: 'idle' });
    });
  });
});
