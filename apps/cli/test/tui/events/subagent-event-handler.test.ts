import { describe, expect, it, vi } from 'vitest';

import type {
  Event,
  SubagentCompletedEvent,
  SubagentFailedEvent,
  SubagentSpawnedEvent,
} from '@byfriends/sdk';

import type { BackgroundAgentMetadata, ToolCallBlockData } from '#/tui/types';

import {
  buildBackgroundAgentMetadata,
  handleSubagentCompleted,
  handleSubagentFailed,
  handleSubagentSpawned,
  routeSubagentEvent,
  type SubagentCallbacks,
  type SubagentState,
  type SubagentToolCall,
} from '#/tui/events/subagent-event-handler';

function makeToolCall(): SubagentToolCall {
  return {
    onSubagentSpawned: vi.fn(),
    onSubagentCompleted: vi.fn(),
    onSubagentFailed: vi.fn(),
    setSubagentMeta: vi.fn(),
    appendSubagentText: vi.fn(),
    appendSubToolCall: vi.fn(),
    appendSubToolCallDelta: vi.fn(),
    finishSubToolCall: vi.fn(),
  };
}

function makeState(overrides: Partial<SubagentState> = {}): SubagentState {
  return {
    subagentParentToolCallIds: new Map(),
    subagentNames: new Map(),
    backgroundAgentMetadata: new Map(),
    backgroundAgents: new Set(),
    backgroundTasks: new Map(),
    backgroundTaskTranscriptedTerminal: new Set(),
    pendingToolComponents: new Map(),
    activeToolCalls: new Map(),
    currentStep: 0,
    currentTurnId: 'turn-1',
    ...overrides,
  };
}

function makeCallbacks(overrides: Partial<SubagentCallbacks> = {}): SubagentCallbacks {
  return {
    appendBackgroundAgentEntry: vi.fn(),
    syncBackgroundAgentBadge: vi.fn(),
    appendTranscriptEntry: vi.fn(),
    onToolCallStart: vi.fn(),
    ...overrides,
  };
}

function makeSpawnedEvent(
  overrides: Partial<SubagentSpawnedEvent> = {},
): SubagentSpawnedEvent {
  return {
    type: 'subagent.spawned',
    subagentId: 'sub-1',
    subagentName: 'coder',
    parentToolCallId: 'tc-1',
    runInBackground: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// routeSubagentEvent
// ---------------------------------------------------------------------------

describe('routeSubagentEvent', () => {
  it('returns false for main agent events', () => {
    const state = makeState();
    const result = routeSubagentEvent(
      { type: 'assistant.delta', agentId: 'main', delta: 'hi' } as Event,
      state,
    );
    expect(result).toBe(false);
  });

  it('returns true and routes assistant.delta to parent tool call', () => {
    const tc = makeToolCall();
    const state = makeState({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    const result = routeSubagentEvent(
      { type: 'assistant.delta', agentId: 'sub-1', delta: 'hello' } as Event,
      state,
    );
    expect(result).toBe(true);
    expect(tc.setSubagentMeta).toHaveBeenCalledWith('sub-1', 'coder');
    expect(tc.appendSubagentText).toHaveBeenCalledWith('hello', 'text');
  });

  it('returns true for subagent event without parent tool call id', () => {
    const state = makeState({
      subagentParentToolCallIds: new Map([['sub-1', '']]),
    });
    const result = routeSubagentEvent(
      { type: 'assistant.delta', agentId: 'sub-1', delta: 'hi' } as Event,
      state,
    );
    expect(result).toBe(true);
  });

  it('returns true for subagent event with unknown parent tool call', () => {
    const state = makeState({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-missing']]),
      subagentNames: new Map([['sub-1', 'coder']]),
    });
    const result = routeSubagentEvent(
      { type: 'assistant.delta', agentId: 'sub-1', delta: 'hi' } as Event,
      state,
    );
    expect(result).toBe(true);
  });

  it('routes thinking.delta', () => {
    const tc = makeToolCall();
    const state = makeState({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    routeSubagentEvent(
      { type: 'thinking.delta', agentId: 'sub-1', delta: 'think' } as Event,
      state,
    );
    expect(tc.appendSubagentText).toHaveBeenCalledWith('think', 'thinking');
  });

  it('routes tool.call.started', () => {
    const tc = makeToolCall();
    const state = makeState({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    routeSubagentEvent(
      {
        type: 'tool.call.started',
        agentId: 'sub-1',
        toolCallId: 'inner-1',
        name: 'Bash',
        args: ['ls'],
      } as Event,
      state,
    );
    expect(tc.appendSubToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sub-1:inner-1',
        name: 'Bash',
      }),
    );
  });

  it('routes tool.result', () => {
    const tc = makeToolCall();
    const state = makeState({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    routeSubagentEvent(
      {
        type: 'tool.result',
        agentId: 'sub-1',
        toolCallId: 'inner-1',
        output: 'file.txt',
        isError: false,
      } as Event,
      state,
    );
    expect(tc.finishSubToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_call_id: 'sub-1:inner-1',
      }),
    );
  });

  it('returns true for subagent lifecycle events that bypass routing', () => {
    const state = makeState({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', makeToolCall()]]),
    });
    for (const type of [
      'subagent.spawned',
      'subagent.completed',
      'subagent.failed',
    ] as const) {
      const event = { type, agentId: 'sub-1' } as Event;
      expect(routeSubagentEvent(event, state)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// handleSubagentSpawned — foreground
// ---------------------------------------------------------------------------

describe('handleSubagentSpawned (foreground)', () => {
  it('registers subagent maps and delegates to existing tool call', () => {
    const tc = makeToolCall();
    const state = makeState({
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    const callbacks = makeCallbacks();
    const event = makeSpawnedEvent();

    handleSubagentSpawned(event, state, callbacks);

    expect(state.subagentParentToolCallIds.get('sub-1')).toBe('tc-1');
    expect(state.subagentNames.get('sub-1')).toBe('coder');
    expect(tc.onSubagentSpawned).toHaveBeenCalledWith({
      agentId: 'sub-1',
      agentName: 'coder',
      runInBackground: false,
    });
    expect(callbacks.appendBackgroundAgentEntry).not.toHaveBeenCalled();
  });

  it('creates standalone tool call when none exists', () => {
    const state = makeState();
    const tc = makeToolCall();
    const onToolCallStart = vi.fn((_toolCall: ToolCallBlockData) => {
      state.pendingToolComponents.set('tc-1', tc);
    });
    const callbacks = makeCallbacks({ onToolCallStart });
    const event = makeSpawnedEvent();

    handleSubagentSpawned(event, state, callbacks);

    expect(onToolCallStart).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'tc-1',
        name: 'Agent',
      }),
    );
    expect(tc.onSubagentSpawned).toHaveBeenCalled();
  });

  it('does nothing if standalone creation fails', () => {
    const state = makeState();
    const callbacks = makeCallbacks({
      onToolCallStart: () => {
        // intentionally does not add to pendingToolComponents
      },
    });
    const event = makeSpawnedEvent({ parentToolCallId: 'tc-missing' });

    handleSubagentSpawned(event, state, callbacks);
    expect(state.subagentParentToolCallIds.get('tc-missing-agent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleSubagentSpawned — background
// ---------------------------------------------------------------------------

describe('handleSubagentSpawned (background)', () => {
  it('stores metadata and appends background entry', () => {
    const state = makeState();
    const callbacks = makeCallbacks();
    const event = makeSpawnedEvent({ runInBackground: true });

    handleSubagentSpawned(event, state, callbacks);

    expect(state.backgroundAgents.has('sub-1')).toBe(true);
    expect(state.backgroundAgentMetadata.has('sub-1')).toBe(true);
    expect(callbacks.appendBackgroundAgentEntry).toHaveBeenCalledWith(
      'started',
      expect.anything(),
    );
    expect(callbacks.syncBackgroundAgentBadge).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSubagentCompleted — foreground
// ---------------------------------------------------------------------------

describe('handleSubagentCompleted (foreground)', () => {
  it('delegates to tool call component', () => {
    const tc = makeToolCall();
    const state = makeState({
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    const callbacks = makeCallbacks();
    const event: SubagentCompletedEvent = {
      type: 'subagent.completed',
      subagentId: 'sub-1',
      parentToolCallId: 'tc-1',
      resultSummary: 'done',
    };

    handleSubagentCompleted(event, state, callbacks);

    expect(tc.onSubagentCompleted).toHaveBeenCalledWith({
      usage: undefined,
      resultSummary: 'done',
    });
  });

  it('removes pending component if not in activeToolCalls', () => {
    const tc = makeToolCall();
    const state = makeState({
      pendingToolComponents: new Map([['tc-1', tc]]),
      activeToolCalls: new Map(),
    });
    const callbacks = makeCallbacks();
    const event: SubagentCompletedEvent = {
      type: 'subagent.completed',
      subagentId: 'sub-1',
      parentToolCallId: 'tc-1',
      resultSummary: 'done',
    };

    handleSubagentCompleted(event, state, callbacks);

    expect(state.pendingToolComponents.has('tc-1')).toBe(false);
  });

  it('keeps pending component if still in activeToolCalls', () => {
    const tc = makeToolCall();
    const state = makeState({
      pendingToolComponents: new Map([['tc-1', tc]]),
      activeToolCalls: new Map([['tc-1', { id: 'tc-1' } as ToolCallBlockData]]),
    });
    const callbacks = makeCallbacks();
    const event: SubagentCompletedEvent = {
      type: 'subagent.completed',
      subagentId: 'sub-1',
      parentToolCallId: 'tc-1',
      resultSummary: 'done',
    };

    handleSubagentCompleted(event, state, callbacks);

    expect(state.pendingToolComponents.has('tc-1')).toBe(true);
  });

  it('does nothing when tool call not found', () => {
    const state = makeState();
    const callbacks = makeCallbacks();
    const event: SubagentCompletedEvent = {
      type: 'subagent.completed',
      subagentId: 'sub-1',
      parentToolCallId: 'tc-missing',
      resultSummary: 'done',
    };

    handleSubagentCompleted(event, state, callbacks);
    expect(callbacks.appendBackgroundAgentEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSubagentCompleted — background
// ---------------------------------------------------------------------------

describe('handleSubagentCompleted (background)', () => {
  it('appends background entry and cleans up', () => {
    const meta: BackgroundAgentMetadata = {
      agentId: 'sub-1',
      parentToolCallId: 'tc-1',
      agentName: 'coder',
    };
    const state = makeState({
      backgroundAgents: new Set(['sub-1']),
      backgroundAgentMetadata: new Map([['sub-1', meta]]),
    });
    const callbacks = makeCallbacks();
    const event: SubagentCompletedEvent = {
      type: 'subagent.completed',
      subagentId: 'sub-1',
      parentToolCallId: 'tc-1',
      resultSummary: 'all done',
    };

    handleSubagentCompleted(event, state, callbacks);

    expect(state.backgroundAgents.has('sub-1')).toBe(false);
    expect(state.backgroundAgentMetadata.has('sub-1')).toBe(false);
    expect(callbacks.syncBackgroundAgentBadge).toHaveBeenCalled();
    expect(callbacks.appendBackgroundAgentEntry).toHaveBeenCalledWith(
      'completed',
      meta,
      { resultSummary: 'all done' },
    );
  });

  it('skips transcript when matching agent-* task is already transcripted', () => {
    const meta: BackgroundAgentMetadata = {
      agentId: 'sub-1',
      parentToolCallId: 'tc-1',
      description: 'test',
    };
    const state = makeState({
      backgroundAgents: new Set(['sub-1']),
      backgroundAgentMetadata: new Map([['sub-1', meta]]),
      backgroundTasks: new Map([
        ['agent-task-1', { taskId: 'agent-task-1', description: 'test' }],
      ]),
      backgroundTaskTranscriptedTerminal: new Set(['agent-task-1']),
    });
    const callbacks = makeCallbacks();
    const event: SubagentCompletedEvent = {
      type: 'subagent.completed',
      subagentId: 'sub-1',
      parentToolCallId: 'tc-1',
      resultSummary: 'done',
    };

    handleSubagentCompleted(event, state, callbacks);

    expect(callbacks.appendBackgroundAgentEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSubagentFailed — foreground
// ---------------------------------------------------------------------------

describe('handleSubagentFailed (foreground)', () => {
  it('delegates to tool call component', () => {
    const tc = makeToolCall();
    const state = makeState({
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    const callbacks = makeCallbacks();
    const event: SubagentFailedEvent = {
      type: 'subagent.failed',
      subagentId: 'sub-1',
      parentToolCallId: 'tc-1',
      error: 'boom',
    };

    handleSubagentFailed(event, state, callbacks);

    expect(tc.onSubagentFailed).toHaveBeenCalledWith({ error: 'boom' });
  });

  it('removes pending component if not active', () => {
    const tc = makeToolCall();
    const state = makeState({
      pendingToolComponents: new Map([['tc-1', tc]]),
      activeToolCalls: new Map(),
    });
    const callbacks = makeCallbacks();

    handleSubagentFailed(
      {
        type: 'subagent.failed',
        subagentId: 'sub-1',
        parentToolCallId: 'tc-1',
        error: 'fail',
      },
      state,
      callbacks,
    );

    expect(state.pendingToolComponents.has('tc-1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleSubagentFailed — background
// ---------------------------------------------------------------------------

describe('handleSubagentFailed (background)', () => {
  it('appends failed background entry', () => {
    const meta: BackgroundAgentMetadata = {
      agentId: 'sub-1',
      parentToolCallId: 'tc-1',
      agentName: 'coder',
    };
    const state = makeState({
      backgroundAgents: new Set(['sub-1']),
      backgroundAgentMetadata: new Map([['sub-1', meta]]),
    });
    const callbacks = makeCallbacks();

    handleSubagentFailed(
      {
        type: 'subagent.failed',
        subagentId: 'sub-1',
        parentToolCallId: 'tc-1',
        error: 'timeout',
      },
      state,
      callbacks,
    );

    expect(callbacks.appendBackgroundAgentEntry).toHaveBeenCalledWith(
      'failed',
      meta,
      { error: 'timeout' },
    );
    expect(state.backgroundAgents.has('sub-1')).toBe(false);
  });

  it('skips transcript when matching agent-* task is already transcripted', () => {
    const meta: BackgroundAgentMetadata = {
      agentId: 'sub-1',
      parentToolCallId: 'tc-1',
      description: 'test',
    };
    const state = makeState({
      backgroundAgents: new Set(['sub-1']),
      backgroundAgentMetadata: new Map([['sub-1', meta]]),
      backgroundTasks: new Map([
        ['agent-task-1', { taskId: 'agent-task-1', description: 'test' }],
      ]),
      backgroundTaskTranscriptedTerminal: new Set(['agent-task-1']),
    });
    const callbacks = makeCallbacks();

    handleSubagentFailed(
      {
        type: 'subagent.failed',
        subagentId: 'sub-1',
        parentToolCallId: 'tc-1',
        error: 'timeout',
      },
      state,
      callbacks,
    );

    expect(callbacks.appendBackgroundAgentEntry).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// buildBackgroundAgentMetadata
// ---------------------------------------------------------------------------

describe('buildBackgroundAgentMetadata', () => {
  it('uses active tool call description when available', () => {
    const event = makeSpawnedEvent({ runInBackground: true });
    const state = makeState({
      activeToolCalls: new Map([
        ['tc-1', { id: 'tc-1', name: 'Agent', args: { description: 'refactor module' } } as unknown as ToolCallBlockData],
      ]),
    });

    const meta = buildBackgroundAgentMetadata(event, state);

    expect(meta).toEqual({
      agentId: 'sub-1',
      parentToolCallId: 'tc-1',
      agentName: 'coder',
      description: 'refactor module',
    });
  });

  it('falls back to event description', () => {
    const event = makeSpawnedEvent({
      runInBackground: true,
      description: 'event desc',
    });
    const state = makeState();

    const meta = buildBackgroundAgentMetadata(event, state);

    expect(meta.description).toBe('event desc');
  });
});
