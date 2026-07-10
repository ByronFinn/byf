import type {
  CompactionStartedEvent,
  CompactionCompletedEvent,
  CompactionCancelledEvent,
  CompactionResult,
} from '@byfriends/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CompactionHandler,
  type CompactionCallbacks,
  type CompactionState,
} from '#/tui/events/compaction-handler';
import type { AppState, QueuedMessage } from '#/tui/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    goalSnapshot: null,
    ...overrides,
  };
}

function makeCompactionState(overrides: Partial<CompactionState> = {}): CompactionState {
  return {
    appState: makeAppState(),
    queuedMessages: [],
    ...overrides,
  };
}

type CallbackCalls = {
  finalizeLiveTextBuffers: string[];
  setAppState: Partial<AppState>[];
  resetLivePane: number;
  beginCompactionBlock: Array<string | undefined>;
  endCompactionBlock: Array<{ tokensBefore?: number; tokensAfter?: number }>;
  cancelCompactionBlock: number;
};

function makeCallbacks(): { callbacks: CompactionCallbacks; calls: CallbackCalls } {
  const calls: CallbackCalls = {
    finalizeLiveTextBuffers: [],
    setAppState: [],
    resetLivePane: 0,
    beginCompactionBlock: [],
    endCompactionBlock: [],
    cancelCompactionBlock: 0,
  };
  const callbacks: CompactionCallbacks = {
    finalizeLiveTextBuffers: (mode) => calls.finalizeLiveTextBuffers.push(mode),
    setAppState: (patch) => calls.setAppState.push(patch),
    resetLivePane: () => {
      calls.resetLivePane++;
    },
    beginCompactionBlock: (instruction) => calls.beginCompactionBlock.push(instruction),
    endCompactionBlock: (tokensBefore, tokensAfter) =>
      calls.endCompactionBlock.push({ tokensBefore, tokensAfter }),
    cancelCompactionBlock: () => {
      calls.cancelCompactionBlock++;
    },
  };
  return { callbacks, calls };
}

function makeHandler(stateOverrides: Partial<CompactionState> = {}): {
  handler: CompactionHandler;
  state: CompactionState;
  calls: CallbackCalls;
} {
  const state = makeCompactionState(stateOverrides);
  const { callbacks, calls } = makeCallbacks();
  const handler = new CompactionHandler(state, callbacks);
  return { handler, state, calls };
}

// ---------------------------------------------------------------------------
// Event factories
// ---------------------------------------------------------------------------

function compactionStarted(
  overrides: Partial<CompactionStartedEvent> = {},
): CompactionStartedEvent {
  return {
    type: 'compaction.started',
    trigger: 'auto',
    instruction: undefined,
    ...overrides,
  } as unknown as CompactionStartedEvent;
}

function compactionCompleted(result: Partial<CompactionResult> = {}): CompactionCompletedEvent {
  return {
    type: 'compaction.completed',
    result: result as unknown as CompactionResult,
  } as unknown as CompactionCompletedEvent;
}

function compactionCancelled(): CompactionCancelledEvent {
  return {
    type: 'compaction.cancelled',
  } as unknown as CompactionCancelledEvent;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CompactionHandler', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // handleBegin
  // =========================================================================

  describe('handleBegin', () => {
    it('finalizes live text buffers, sets compacting state, and begins compaction block when instruction is provided', () => {
      const { handler, calls } = makeHandler();

      handler.handleBegin(
        compactionStarted({
          instruction: 'Summarizing old turns',
          trigger: 'auto',
        }),
      );

      expect(calls.finalizeLiveTextBuffers).toEqual(['waiting']);
      expect(calls.setAppState[0]).toEqual(
        expect.objectContaining({
          isCompacting: true,
          streamingPhase: 'waiting',
          streamingStartTime: expect.any(Number),
        }),
      );
      expect(calls.beginCompactionBlock).toEqual(['Summarizing old turns']);
    });

    it('calls beginCompactionBlock with undefined when instruction is not provided', () => {
      const { handler, calls } = makeHandler();

      handler.handleBegin(
        compactionStarted({
          instruction: undefined,
          trigger: 'manual',
        }),
      );

      expect(calls.finalizeLiveTextBuffers).toEqual(['waiting']);
      expect(calls.setAppState[0]).toEqual(
        expect.objectContaining({
          isCompacting: true,
          streamingPhase: 'waiting',
          streamingStartTime: expect.any(Number),
        }),
      );
      expect(calls.beginCompactionBlock).toEqual([undefined]);
    });

    it('sets streamingStartTime to the current timestamp (within 100ms tolerance)', () => {
      const { handler, calls } = makeHandler();
      const before = Date.now();

      handler.handleBegin(
        compactionStarted({
          instruction: 'test',
          trigger: 'auto',
        }),
      );

      const after = Date.now();
      const patch = calls.setAppState[0];
      expect(patch.streamingStartTime).toBeGreaterThanOrEqual(before);
      expect(patch.streamingStartTime).toBeLessThanOrEqual(after + 100);
    });
  });

  // =========================================================================
  // handleEnd
  // =========================================================================

  describe('handleEnd', () => {
    it('calls endCompactionBlock with tokens from the event and runs finishCompaction', () => {
      const { handler, calls } = makeHandler({
        appState: makeAppState({ isCompacting: true }),
      });
      const sendQueued = vi.fn();

      handler.handleEnd(compactionCompleted({ tokensBefore: 100, tokensAfter: 50 }), sendQueued);

      expect(calls.endCompactionBlock).toEqual([{ tokensBefore: 100, tokensAfter: 50 }]);
      // finishCompaction: isStreaming=false, no queue → cleanup only
      expect(calls.setAppState).toEqual([{ isCompacting: false, streamingPhase: 'idle' }]);
      expect(calls.resetLivePane).toBe(1);
      expect(sendQueued).not.toHaveBeenCalled();
    });

    it('calls endCompactionBlock with undefined tokens when event has no result fields', () => {
      const { handler, calls } = makeHandler({
        appState: makeAppState({ isCompacting: true }),
      });
      const sendQueued = vi.fn();

      handler.handleEnd(compactionCompleted(), sendQueued);

      expect(calls.endCompactionBlock).toEqual([
        { tokensBefore: undefined, tokensAfter: undefined },
      ]);
    });
  });

  // =========================================================================
  // handleCancel
  // =========================================================================

  describe('handleCancel', () => {
    it('calls cancelCompactionBlock and runs finishCompaction', () => {
      const { handler, calls } = makeHandler({
        appState: makeAppState({ isCompacting: true }),
      });
      const sendQueued = vi.fn();

      handler.handleCancel(compactionCancelled(), sendQueued);

      expect(calls.cancelCompactionBlock).toBe(1);
      // finishCompaction: isStreaming=false, no queue → cleanup only
      expect(calls.setAppState).toEqual([{ isCompacting: false, streamingPhase: 'idle' }]);
      expect(calls.resetLivePane).toBe(1);
      expect(sendQueued).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // finishCompaction (tested through handleEnd / handleCancel)
  // =========================================================================

  describe('finishCompaction', () => {
    it('only clears isCompacting when isStreaming is true', () => {
      const { handler, calls } = makeHandler({
        appState: makeAppState({ isCompacting: true, isStreaming: true }),
        queuedMessages: [{ text: 'hello' }],
      });
      const sendQueued = vi.fn();

      handler.handleEnd(compactionCompleted(), sendQueued);

      expect(calls.setAppState).toEqual([{ isCompacting: false }]);
      expect(calls.resetLivePane).toBe(0);
      expect(sendQueued).not.toHaveBeenCalled();
    });

    it('dequeues and dispatches the next message after timeout when not streaming and queue is non-empty', () => {
      vi.useFakeTimers();
      const { handler, calls, state } = makeHandler({
        appState: makeAppState({ isCompacting: true, isStreaming: false }),
        queuedMessages: [{ text: 'hello' }],
      });
      const sendQueued = vi.fn();

      handler.handleEnd(compactionCompleted(), sendQueued);

      expect(calls.setAppState).toEqual([{ isCompacting: false, streamingPhase: 'idle' }]);
      expect(calls.resetLivePane).toBe(1);
      expect(state.queuedMessages).toEqual([]);
      expect(sendQueued).not.toHaveBeenCalled();

      vi.advanceTimersByTime(0);
      expect(sendQueued).toHaveBeenCalledTimes(1);
      expect(sendQueued).toHaveBeenCalledWith({ text: 'hello' });
    });

    it('cleans up without dispatching when not streaming and queue is empty', () => {
      const { handler, calls } = makeHandler({
        appState: makeAppState({ isCompacting: true, isStreaming: false }),
        queuedMessages: [],
      });
      const sendQueued = vi.fn();

      handler.handleEnd(compactionCompleted(), sendQueued);

      expect(calls.setAppState).toEqual([{ isCompacting: false, streamingPhase: 'idle' }]);
      expect(calls.resetLivePane).toBe(1);
      expect(sendQueued).not.toHaveBeenCalled();
    });
  });
});
