import type {
  Event,
  SubagentCompletedEvent,
  SubagentFailedEvent,
  SubagentSpawnedEvent,
} from '@byfriends/sdk';
import { describe, expect, it, vi } from 'vitest';

import {
  buildBackgroundAgentMetadata,
  handleSubagentCompleted,
  handleSubagentFailed,
  handleSubagentSpawned,
  routeSubagentEvent,
  type SubagentCallbacks,
  type SubagentEventState,
  type SubagentToolCall,
} from '#/tui/events/subagent-event-handler';
import type { BackgroundAgentMetadata, ToolCallBlockData } from '#/tui/types';

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
    updateSubagentLiveUsage: vi.fn(),
  };
}

// Internal mutable storage behind the SubagentEventState adapter.
interface AdapterStore {
  subagentParentToolCallIds: Map<string, string>;
  subagentNames: Map<string, string>;
  backgroundAgentMetadata: Map<string, BackgroundAgentMetadata>;
  backgroundAgents: Set<string>;
  backgroundTasks: Map<string, { taskId: string; description: string }>;
  backgroundTaskTranscriptedTerminal: Set<string>;
  pendingToolComponents: Map<string, SubagentToolCall>;
  activeToolCalls: Map<string, ToolCallBlockData>;
  currentStep: number;
  currentTurnId: string | undefined;
}

function makeStore(overrides: Partial<AdapterStore> = {}): AdapterStore {
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

function makeState(store: AdapterStore = makeStore()): SubagentEventState {
  return {
    getSubagentParentToolCallId: (id) => store.subagentParentToolCallIds.get(id),
    setSubagentParentToolCallId: (id, parent) => {
      store.subagentParentToolCallIds.set(id, parent);
    },
    getSubagentName: (id) => store.subagentNames.get(id),
    setSubagentName: (id, name) => {
      store.subagentNames.set(id, name);
    },
    hasBackgroundAgent: (id) => store.backgroundAgents.has(id),
    addBackgroundAgent: (id) => {
      store.backgroundAgents.add(id);
    },
    deleteBackgroundAgent: (id) => store.backgroundAgents.delete(id),
    getBackgroundAgentMetadata: (id) => store.backgroundAgentMetadata.get(id),
    setBackgroundAgentMetadata: (id, meta) => {
      store.backgroundAgentMetadata.set(id, meta);
    },
    deleteBackgroundAgentMetadata: (id) => {
      store.backgroundAgentMetadata.delete(id);
    },
    getPendingToolCall: (id) => store.pendingToolComponents.get(id),
    deletePendingToolCall: (id) => {
      store.pendingToolComponents.delete(id);
    },
    getActiveToolCall: (id) => store.activeToolCalls.get(id),
    hasActiveToolCall: (id) => store.activeToolCalls.has(id),
    hasTranscriptedTask: (taskId) => store.backgroundTaskTranscriptedTerminal.has(taskId),
    addTranscriptedTask: (taskId) => {
      store.backgroundTaskTranscriptedTerminal.add(taskId);
    },
    findAgentTaskIdByDescription: (description) => {
      let match: string | undefined;
      for (const info of store.backgroundTasks.values()) {
        if (!info.taskId.startsWith('agent-')) continue;
        if (info.description !== description) continue;
        if (match !== undefined) return undefined; // ambiguous
        match = info.taskId;
      }
      return match;
    },
    get currentStep() {
      return store.currentStep;
    },
    get currentTurnId() {
      return store.currentTurnId;
    },
  };
}

// Convenience: build an (adapter, store) pair so tests can read the
// underlying maps/sets after running a handler.
function makeAdapter(overrides: Partial<AdapterStore> = {}): {
  state: SubagentEventState;
  store: AdapterStore;
} {
  const store = makeStore(overrides);
  return { state: makeState(store), store };
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

function makeSpawnedEvent(overrides: Partial<SubagentSpawnedEvent> = {}): SubagentSpawnedEvent {
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
    const { state } = makeAdapter();
    const result = routeSubagentEvent(
      { type: 'assistant.delta', agentId: 'main', delta: 'hi' } as Event,
      state,
    );
    expect(result).toBe(false);
  });

  it('returns true and routes assistant.delta to parent tool call', () => {
    const tc = makeToolCall();
    const { state } = makeAdapter({
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
    const { state } = makeAdapter({
      subagentParentToolCallIds: new Map([['sub-1', '']]),
    });
    const result = routeSubagentEvent(
      { type: 'assistant.delta', agentId: 'sub-1', delta: 'hi' } as Event,
      state,
    );
    expect(result).toBe(true);
  });

  it('returns true for subagent event with unknown parent tool call', () => {
    const { state } = makeAdapter({
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
    const { state } = makeAdapter({
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
    const { state } = makeAdapter({
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
    const { state } = makeAdapter({
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
    const { state } = makeAdapter({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', makeToolCall()]]),
    });
    for (const type of ['subagent.spawned', 'subagent.completed', 'subagent.failed'] as const) {
      const event = { type, agentId: 'sub-1' } as Event;
      expect(routeSubagentEvent(event, state)).toBe(true);
    }
  });

  it('routes agent.status.updated with usage.total to tool call', () => {
    const tc = makeToolCall();
    const { state } = makeAdapter({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    const usage = { inputOther: 100, output: 50, inputCacheRead: 200, inputCacheCreation: 0 };
    routeSubagentEvent(
      {
        type: 'agent.status.updated',
        agentId: 'sub-1',
        usage: { total: usage },
      } as Event,
      state,
    );
    expect(tc.updateSubagentLiveUsage).toHaveBeenCalledWith(usage);
  });

  it('does not call updateSubagentLiveUsage when usage.total is undefined', () => {
    const tc = makeToolCall();
    const { state } = makeAdapter({
      subagentParentToolCallIds: new Map([['sub-1', 'tc-1']]),
      subagentNames: new Map([['sub-1', 'coder']]),
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    routeSubagentEvent(
      {
        type: 'agent.status.updated',
        agentId: 'sub-1',
        usage: {},
      } as Event,
      state,
    );
    expect(tc.updateSubagentLiveUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSubagentSpawned — foreground
// ---------------------------------------------------------------------------

describe('handleSubagentSpawned (foreground)', () => {
  it('registers subagent maps and delegates to existing tool call', () => {
    const tc = makeToolCall();
    const { state, store } = makeAdapter({
      pendingToolComponents: new Map([['tc-1', tc]]),
    });
    const callbacks = makeCallbacks();
    const event = makeSpawnedEvent();

    handleSubagentSpawned(event, state, callbacks);

    expect(store.subagentParentToolCallIds.get('sub-1')).toBe('tc-1');
    expect(store.subagentNames.get('sub-1')).toBe('coder');
    expect(tc.onSubagentSpawned).toHaveBeenCalledWith({
      agentId: 'sub-1',
      agentName: 'coder',
      runInBackground: false,
    });
    expect(callbacks.appendBackgroundAgentEntry).not.toHaveBeenCalled();
  });

  it('creates standalone tool call when none exists', () => {
    const { state, store } = makeAdapter();
    const tc = makeToolCall();
    const onToolCallStart = vi.fn((_toolCall: ToolCallBlockData) => {
      store.pendingToolComponents.set('tc-1', tc);
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
    const { state, store } = makeAdapter();
    const callbacks = makeCallbacks({
      onToolCallStart: () => {
        // intentionally does not add to pendingToolComponents
      },
    });
    const event = makeSpawnedEvent({ parentToolCallId: 'tc-missing' });

    handleSubagentSpawned(event, state, callbacks);
    expect(store.subagentParentToolCallIds.get('tc-missing-agent')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// handleSubagentSpawned — background
// ---------------------------------------------------------------------------

describe('handleSubagentSpawned (background)', () => {
  it('stores metadata and appends background entry', () => {
    const { state, store } = makeAdapter();
    const callbacks = makeCallbacks();
    const event = makeSpawnedEvent({ runInBackground: true });

    handleSubagentSpawned(event, state, callbacks);

    expect(store.backgroundAgents.has('sub-1')).toBe(true);
    expect(store.backgroundAgentMetadata.has('sub-1')).toBe(true);
    expect(callbacks.appendBackgroundAgentEntry).toHaveBeenCalledWith('started', expect.anything());
    expect(callbacks.syncBackgroundAgentBadge).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSubagentCompleted — foreground
// ---------------------------------------------------------------------------

describe('handleSubagentCompleted (foreground)', () => {
  it('delegates to tool call component', () => {
    const tc = makeToolCall();
    const { state } = makeAdapter({
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
    const { state, store } = makeAdapter({
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

    expect(store.pendingToolComponents.has('tc-1')).toBe(false);
  });

  it('keeps pending component if still in activeToolCalls', () => {
    const tc = makeToolCall();
    const { state, store } = makeAdapter({
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

    expect(store.pendingToolComponents.has('tc-1')).toBe(true);
  });

  it('does nothing when tool call not found', () => {
    const { state } = makeAdapter();
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
    const { state, store } = makeAdapter({
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

    expect(store.backgroundAgents.has('sub-1')).toBe(false);
    expect(store.backgroundAgentMetadata.has('sub-1')).toBe(false);
    expect(callbacks.syncBackgroundAgentBadge).toHaveBeenCalled();
    expect(callbacks.appendBackgroundAgentEntry).toHaveBeenCalledWith('completed', meta, {
      resultSummary: 'all done',
    });
  });

  it('skips transcript when matching agent-* task is already transcripted', () => {
    const meta: BackgroundAgentMetadata = {
      agentId: 'sub-1',
      parentToolCallId: 'tc-1',
      description: 'test',
    };
    const { state } = makeAdapter({
      backgroundAgents: new Set(['sub-1']),
      backgroundAgentMetadata: new Map([['sub-1', meta]]),
      backgroundTasks: new Map([['agent-task-1', { taskId: 'agent-task-1', description: 'test' }]]),
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
    const { state } = makeAdapter({
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
    const { state, store } = makeAdapter({
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

    expect(store.pendingToolComponents.has('tc-1')).toBe(false);
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
    const { state, store } = makeAdapter({
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

    expect(callbacks.appendBackgroundAgentEntry).toHaveBeenCalledWith('failed', meta, {
      error: 'timeout',
    });
    expect(store.backgroundAgents.has('sub-1')).toBe(false);
  });

  it('skips transcript when matching agent-* task is already transcripted', () => {
    const meta: BackgroundAgentMetadata = {
      agentId: 'sub-1',
      parentToolCallId: 'tc-1',
      description: 'test',
    };
    const { state } = makeAdapter({
      backgroundAgents: new Set(['sub-1']),
      backgroundAgentMetadata: new Map([['sub-1', meta]]),
      backgroundTasks: new Map([['agent-task-1', { taskId: 'agent-task-1', description: 'test' }]]),
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
    const { state } = makeAdapter({
      activeToolCalls: new Map([
        [
          'tc-1',
          {
            id: 'tc-1',
            name: 'Agent',
            args: { description: 'refactor module' },
          } as unknown as ToolCallBlockData,
        ],
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
    const { state } = makeAdapter();

    const meta = buildBackgroundAgentMetadata(event, state);

    expect(meta.description).toBe('event desc');
  });
});

// ---------------------------------------------------------------------------
// Adapter boundary — guard against SubagentState leak
// ---------------------------------------------------------------------------

describe('SubagentEventState adapter boundary', () => {
  it('does not expose raw maps/sets (only methods)', () => {
    const { state } = makeAdapter();
    const probe = state as unknown as Record<string, unknown>;
    // The adapter must not expose SubagentState-shaped fields like
    // subagentParentToolCallIds, backgroundAgents, etc.
    expect(probe['subagentParentToolCallIds']).toBeUndefined();
    expect(probe['backgroundAgents']).toBeUndefined();
    expect(probe['backgroundAgentMetadata']).toBeUndefined();
    expect(probe['pendingToolComponents']).toBeUndefined();
  });

  it('routes setSubagentParentToolCallId through the adapter', () => {
    const { state, store } = makeAdapter();
    state.setSubagentParentToolCallId('sub-x', 'tc-x');
    expect(store.subagentParentToolCallIds.get('sub-x')).toBe('tc-x');
    expect(state.getSubagentParentToolCallId('sub-x')).toBe('tc-x');
  });

  it('addBackgroundAgent / hasBackgroundAgent / deleteBackgroundAgent round-trip', () => {
    const { state } = makeAdapter();
    expect(state.hasBackgroundAgent('sub-1')).toBe(false);
    state.addBackgroundAgent('sub-1');
    expect(state.hasBackgroundAgent('sub-1')).toBe(true);
    expect(state.deleteBackgroundAgent('sub-1')).toBe(true);
    expect(state.hasBackgroundAgent('sub-1')).toBe(false);
  });
});
