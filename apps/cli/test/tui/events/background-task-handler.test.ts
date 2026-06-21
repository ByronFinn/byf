import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BackgroundTaskInfo,
  BackgroundTaskStartedEvent,
  BackgroundTaskTerminatedEvent,
  BackgroundTaskUpdatedEvent,
} from '@byfriends/sdk';

import type { BackgroundAgentMetadata, TranscriptEntry } from '#/tui/types';

import {
  BackgroundTaskHandler,
  type BackgroundTaskCallbacks,
  type BackgroundTaskState,
} from '#/tui/events/background-task-handler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<BackgroundTaskState> = {}): BackgroundTaskState {
  return {
    backgroundTasks: new Map(),
    backgroundTaskTranscriptedTerminal: new Set(),
    currentTurnId: 'turn-1',
    ...overrides,
  };
}

type CallbackCalls = {
  appendTranscriptEntry: TranscriptEntry[];
  requestRender: number;
  setBackgroundCounts: Array<{ bashTasks: number; agentTasks: number }>;
  repaintTasksBrowser: number;
};

function makeCallbacks(): { callbacks: BackgroundTaskCallbacks; calls: CallbackCalls } {
  const calls: CallbackCalls = {
    appendTranscriptEntry: [],
    requestRender: 0,
    setBackgroundCounts: [],
    repaintTasksBrowser: 0,
  };
  const callbacks: BackgroundTaskCallbacks = {
    appendTranscriptEntry: (entry) => calls.appendTranscriptEntry.push(entry),
    requestRender: () => { calls.requestRender++; },
    setBackgroundCounts: (counts) => calls.setBackgroundCounts.push(counts),
    repaintTasksBrowser: () => { calls.repaintTasksBrowser++; },
  };
  return { callbacks, calls };
}

function makeHandler(stateOverrides: Partial<BackgroundTaskState> = {}): {
  handler: BackgroundTaskHandler;
  state: BackgroundTaskState;
  calls: CallbackCalls;
} {
  const state = makeState(stateOverrides);
  const { callbacks, calls } = makeCallbacks();
  const handler = new BackgroundTaskHandler(state, callbacks);
  return { handler, state, calls };
}

// ---------------------------------------------------------------------------
// Event factories
// ---------------------------------------------------------------------------

function backgroundTaskInfo(overrides: Partial<BackgroundTaskInfo> = {}): BackgroundTaskInfo {
  return {
    taskId: 'bash-123',
    description: 'npm install',
    status: 'running',
    exitCode: null,
    stopReason: undefined,
    timedOut: false,
    approvalReason: undefined,
    ...overrides,
  } as BackgroundTaskInfo;
}

function startedEvent(taskInfoOverrides: Partial<BackgroundTaskInfo> = {}): BackgroundTaskStartedEvent {
  return {
    type: 'background.task.started',
    info: backgroundTaskInfo(taskInfoOverrides),
  } as BackgroundTaskStartedEvent;
}

function terminatedEvent(taskInfoOverrides: Partial<BackgroundTaskInfo> = {}): BackgroundTaskTerminatedEvent {
  return {
    type: 'background.task.terminated',
    info: backgroundTaskInfo(taskInfoOverrides),
  } as BackgroundTaskTerminatedEvent;
}

function updatedEvent(
  status: 'running' | 'awaiting_approval',
  taskInfoOverrides: Partial<BackgroundTaskInfo> = {},
): BackgroundTaskUpdatedEvent {
  return {
    type: 'background.task.updated',
    info: backgroundTaskInfo({ status, ...taskInfoOverrides }),
  } as BackgroundTaskUpdatedEvent;
}

function makeAgentMeta(overrides: Partial<BackgroundAgentMetadata> = {}): BackgroundAgentMetadata {
  return {
    agentId: 'agent-1',
    parentToolCallId: 'call-1',
    agentName: 'explorer',
    description: 'Exploring the codebase',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BackgroundTaskHandler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // handleEvent — background.task.started
  // =========================================================================

  describe('handleEvent (background.task.started)', () => {
    it('skips transcript entry and syncs badge for agent- prefix tasks', () => {
      const { handler, calls } = makeHandler();

      handler.handleEvent(startedEvent({ taskId: 'agent-42', description: 'Code review' }));

      // No transcript entry appended
      expect(calls.appendTranscriptEntry).toHaveLength(0);
      // Badge was synced + browser repainted
      expect(calls.repaintTasksBrowser).toBe(1);
      expect(calls.setBackgroundCounts).toHaveLength(1);
      expect(calls.requestRender).toBe(1);
      // State is tracked
      expect(calls.setBackgroundCounts[0]).toEqual({ bashTasks: 0, agentTasks: 1 });
    });

    it('appends transcript entry and syncs badge for bash- prefix tasks', () => {
      const { handler, calls } = makeHandler();

      handler.handleEvent(startedEvent({ taskId: 'bash-1', description: 'npm install' }));

      // Transcript entry appended
      expect(calls.appendTranscriptEntry).toHaveLength(1);
      const entry = calls.appendTranscriptEntry[0]!;
      expect(entry.kind).toBe('status');
      expect(entry.turnId).toBe('turn-1');
      expect(entry.renderMode).toBe('plain');
      expect(entry.content).toContain('bash task');
      expect(entry.content).toContain('started');
      // Badge synced
      expect(calls.setBackgroundCounts).toHaveLength(1);
      expect(calls.setBackgroundCounts[0]).toEqual({ bashTasks: 1, agentTasks: 0 });
      expect(calls.repaintTasksBrowser).toBe(1);
    });

    it('does not add terminal dedupe marker for started events', () => {
      const { handler, state } = makeHandler();

      handler.handleEvent(startedEvent({ taskId: 'bash-1' }));
      handler.handleEvent(startedEvent({ taskId: 'bash-2' }));

      expect(state.backgroundTaskTranscriptedTerminal.size).toBe(0);
    });
  });

  // =========================================================================
  // handleEvent — background.task.terminated
  // =========================================================================

  describe('handleEvent (background.task.terminated)', () => {
    it('appends terminal entry and records dedupe marker for bash- prefix when not already recorded', () => {
      const { handler, calls, state } = makeHandler();
      // Pre-register the task so state is consistent
      handler.handleEvent(startedEvent({ taskId: 'bash-1', description: 'npm install' }));

      handler.handleEvent(terminatedEvent({ taskId: 'bash-1', status: 'completed', exitCode: 0 }));

      // Terminal entry appended
      expect(calls.appendTranscriptEntry).toHaveLength(2); // started + terminated
      const terminalEntry = calls.appendTranscriptEntry[1]!;
      expect(terminalEntry.kind).toBe('status');
      expect(terminalEntry.content).toContain('completed');
      expect(terminalEntry.detail).toContain('exit 0');
      // Dedupe marker recorded
      expect(state.backgroundTaskTranscriptedTerminal.has('bash-1')).toBe(true);
      // Badge synced (no active tasks → both counts 0)
      expect(calls.setBackgroundCounts).toHaveLength(2);
      expect(calls.setBackgroundCounts[1]).toEqual({ bashTasks: 0, agentTasks: 0 });
    });

    it('skips transcript entry for agent- prefix terminated tasks', () => {
      const { handler, calls, state } = makeHandler();
      handler.handleEvent(startedEvent({ taskId: 'agent-99', description: 'Code review' }));

      handler.handleEvent(terminatedEvent({ taskId: 'agent-99', status: 'completed' }));

      // No terminal entry for agent tasks
      expect(calls.appendTranscriptEntry).toHaveLength(0);
      // But dedupe marker is still recorded
      expect(state.backgroundTaskTranscriptedTerminal.has('agent-99')).toBe(true);
      // Badge synced
      expect(calls.setBackgroundCounts).toHaveLength(2);
      expect(calls.setBackgroundCounts[1]).toEqual({ bashTasks: 0, agentTasks: 0 });
    });

    it('skips transcript entry when terminal dedupe marker already exists', () => {
      const { handler, calls } = makeHandler({
        backgroundTaskTranscriptedTerminal: new Set(['bash-1']),
      });
      handler.handleEvent(startedEvent({ taskId: 'bash-1' }));

      handler.handleEvent(terminatedEvent({ taskId: 'bash-1', status: 'completed' }));

      // Only the started entry, no terminal entry
      expect(calls.appendTranscriptEntry).toHaveLength(1);
    });

    it('still syncs badge for already-deduplicated terminal events', () => {
      const { handler, calls } = makeHandler({
        backgroundTaskTranscriptedTerminal: new Set(['bash-1']),
      });

      handler.handleEvent(terminatedEvent({ taskId: 'bash-1', status: 'completed' }));

      // Badge synced even though entry was skipped
      expect(calls.setBackgroundCounts).toHaveLength(1);
      expect(calls.repaintTasksBrowser).toBe(1);
    });
  });

  // =========================================================================
  // handleEvent — background.task.updated
  // =========================================================================

  describe('handleEvent (background.task.updated)', () => {
    it('syncs badge when status changes from running to awaiting_approval', () => {
      const { handler, calls } = makeHandler();
      handler.handleEvent(startedEvent({ taskId: 'bash-1', status: 'running' }));

      handler.handleEvent(updatedEvent('awaiting_approval', { taskId: 'bash-1' }));

      // Badge synced (running → awaiting_approval still counts as active)
      expect(calls.setBackgroundCounts).toHaveLength(2);
      expect(calls.repaintTasksBrowser).toBe(2);
    });

    it('does not sync badge when status is the same as previous', () => {
      const { handler, calls } = makeHandler();
      handler.handleEvent(startedEvent({ taskId: 'bash-1', status: 'running' }));

      handler.handleEvent(updatedEvent('running', { taskId: 'bash-1' }));

      // No extra setBackgroundCounts call (status unchanged)
      // but repaintTasksBrowser is still called
      expect(calls.setBackgroundCounts).toHaveLength(1);
      expect(calls.repaintTasksBrowser).toBe(2);
    });

    it('handles update for unknown task (no previous status) as if status changed', () => {
      const { handler, calls } = makeHandler();

      handler.handleEvent(updatedEvent('running', { taskId: 'unknown-1' }));

      // Badge synced because `previous` was undefined
      expect(calls.setBackgroundCounts).toHaveLength(1);
      expect(calls.repaintTasksBrowser).toBe(1);
    });
  });

  // =========================================================================
  // appendBackgroundAgentEntry
  // =========================================================================

  describe('appendBackgroundAgentEntry', () => {
    function expectEntry(
      calls: CallbackCalls,
      index: number,
      contentMatcher: RegExp,
      detailMatcher: RegExp | null,
    ) {
      const entry = calls.appendTranscriptEntry[index]!;
      expect(entry.kind).toBe('status');
      expect(entry.turnId).toBe('turn-1');
      expect(entry.renderMode).toBe('plain');
      expect(entry.content).toMatch(contentMatcher);
      if (detailMatcher === null) {
        expect(entry.detail).toBeUndefined();
      } else {
        expect(entry.detail).toMatch(detailMatcher);
      }
      expect(entry.backgroundAgentStatus).toBeDefined();
    }

    it('appends "started" entry', () => {
      const { handler, calls } = makeHandler();

      handler.appendBackgroundAgentEntry('started', makeAgentMeta());

      expect(calls.appendTranscriptEntry).toHaveLength(1);
      expectEntry(calls, 0, /started in background/, /Exploring the codebase/);
      expect(calls.appendTranscriptEntry[0]!.backgroundAgentStatus!.phase).toBe('started');
    });

    it('appends "completed" entry (detail from meta.description, not resultSummary)', () => {
      const { handler, calls } = makeHandler();

      handler.appendBackgroundAgentEntry(
        'completed',
        makeAgentMeta({ agentName: 'coder', description: 'All tests pass' }),
      );

      expect(calls.appendTranscriptEntry).toHaveLength(1);
      expectEntry(calls, 0, /completed in background/, /All tests pass/);
      expect(calls.appendTranscriptEntry[0]!.backgroundAgentStatus!.phase).toBe('completed');
    });

    it('appends "failed" entry with error detail', () => {
      const { handler, calls } = makeHandler();

      handler.appendBackgroundAgentEntry(
        'failed',
        makeAgentMeta({ agentName: 'reviewer', description: 'Reviewing PR' }),
        { error: 'Timeout after 30s' },
      );

      expect(calls.appendTranscriptEntry).toHaveLength(1);
      expectEntry(calls, 0, /failed in background/, /Reviewing PR · Timeout after 30s/);
      expect(calls.appendTranscriptEntry[0]!.backgroundAgentStatus!.phase).toBe('failed');
    });

    it('uses generic "agent" subject when agentName is undefined', () => {
      const { handler, calls } = makeHandler();

      handler.appendBackgroundAgentEntry('started', makeAgentMeta({ agentName: undefined }));

      expect(calls.appendTranscriptEntry[0]!.content).toBe('agent started in background');
    });

    it('uses undefined turnId when currentTurnId is not set', () => {
      const { handler, calls } = makeHandler({ currentTurnId: undefined });

      handler.appendBackgroundAgentEntry('started', makeAgentMeta());

      expect(calls.appendTranscriptEntry[0]!.turnId).toBeUndefined();
    });
  });

  // =========================================================================
  // syncBackgroundAgentBadge
  // =========================================================================

  describe('syncBackgroundAgentBadge', () => {
    it('triggers badge sync via setBackgroundCounts and requestRender', () => {
      const { handler, calls } = makeHandler();

      handler.syncBackgroundAgentBadge();

      expect(calls.setBackgroundCounts).toHaveLength(1);
      expect(calls.requestRender).toBe(1);
    });
  });

  // =========================================================================
  // State tracking
  // =========================================================================

  describe('state tracking', () => {
    it('updates backgroundTasks map for every handleEvent call', () => {
      const { handler, state } = makeHandler();

      handler.handleEvent(startedEvent({ taskId: 'bash-1', status: 'running', description: 'test' }));
      expect(state.backgroundTasks.get('bash-1')?.status).toBe('running');

      handler.handleEvent(updatedEvent('awaiting_approval', { taskId: 'bash-1' }));
      expect(state.backgroundTasks.get('bash-1')?.status).toBe('awaiting_approval');

      handler.handleEvent(terminatedEvent({ taskId: 'bash-1', status: 'completed' }));
      expect(state.backgroundTasks.get('bash-1')?.status).toBe('completed');
    });
  });
});