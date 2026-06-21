import { describe, expect, it, vi } from 'vitest';

import type {
  AgentStatusUpdatedEvent,
  ErrorEvent,
  SessionMetaUpdatedEvent,
  WarningEvent,
} from '@byfriends/sdk';

import type { AppState } from '#/tui/types';

import {
  handleSessionError,
  handleSessionMetaChanged,
  handleSessionWarning,
  handleStatusUpdate,
  type SessionMetaCallbacks,
  type SessionMetaState,
} from '#/tui/events/session-meta-handler';
import { computeCacheHitRate } from '#/utils/usage/usage-format';

const OAUTH_LOGIN_REQUIRED_CODE = 'auth.login_required';

function makeCallbacks(): {
  callbacks: SessionMetaCallbacks;
  calls: {
    flushStreamingUiUpdatesNow: number;
    resetLiveToolUiState: number;
    finalizeLiveTextBuffers: string[];
    showError: string[];
    showStatus: Array<{ message: string; color?: string }>;
    setAppState: Partial<AppState>[];
  };
} {
  const calls = {
    flushStreamingUiUpdatesNow: 0,
    resetLiveToolUiState: 0,
    finalizeLiveTextBuffers: [] as string[],
    showError: [] as string[],
    showStatus: [] as Array<{ message: string; color?: string }>,
    setAppState: [] as Partial<AppState>[],
  };
  const callbacks: SessionMetaCallbacks = {
    flushStreamingUiUpdatesNow: () => {
      calls.flushStreamingUiUpdatesNow++;
    },
    resetLiveToolUiState: () => {
      calls.resetLiveToolUiState++;
    },
    finalizeLiveTextBuffers: (mode) => {
      calls.finalizeLiveTextBuffers.push(mode);
    },
    showError: (msg) => {
      calls.showError.push(msg);
    },
    showStatus: (msg, color) => {
      calls.showStatus.push({ message: msg, color });
    },
    setAppState: (patch) => {
      calls.setAppState.push(patch);
    },
  };
  return { callbacks, calls };
}

function makeState(overrides: Partial<SessionMetaState> = {}): SessionMetaState {
  return {
    sessionId: 'ses-123',
    theme: { colors: { warning: '#ffcc00' } },
    ...overrides,
  };
}

describe('handleStatusUpdate', () => {
  it('applies context usage patch', () => {
    const { calls } = makeCallbacks();
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      contextUsage: 0.75,
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    expect(setAppState.mock.calls[0]![0]).toEqual({ contextUsage: 0.75 });
  });

  it('applies model and permission patches together', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      model: 'k2',
      permission: 'yolo',
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch.model).toBe('k2');
    expect(patch.permissionMode).toBe('yolo');
    expect(patch.yolo).toBe(true);
  });

  it('does not call setAppState for empty patch', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).not.toHaveBeenCalled();
  });

  // ── cache hit-rate: data plumbing from event.usage.currentTurn ──

  it('A1: computes cacheHitRate from currentTurn with cache reads', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      usage: {
        currentTurn: { inputOther: 500, inputCacheRead: 8700, inputCacheCreation: 0 } as never,
      },
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch).toHaveProperty('cacheHitRate');
    expect(patch.cacheHitRate).toBeCloseTo(0.9457, 4);
  });

  it('A2: computes cacheHitRate = 0 when no reads (first turn)', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      usage: {
        currentTurn: { inputOther: 10000, inputCacheRead: 0, inputCacheCreation: 2000 } as never,
      },
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch).toHaveProperty('cacheHitRate');
    expect(patch.cacheHitRate).toBe(0);
  });

  it('A3: returns cacheHitRate = undefined when denominator is zero', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      usage: {
        currentTurn: { inputOther: 0, inputCacheRead: 0, inputCacheCreation: 0 } as never,
      },
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch).toHaveProperty('cacheHitRate');
    expect(patch.cacheHitRate).toBeUndefined();
  });

  it('A4: does not include cacheHitRate when usage is undefined', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      usage: undefined,
    };
    handleStatusUpdate(event, setAppState);
    // No other fields, so patch is empty → no setAppState call
    expect(setAppState).not.toHaveBeenCalled();
  });

  it('A5: does not include cacheHitRate when currentTurn is undefined', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      usage: { currentTurn: undefined },
    };
    handleStatusUpdate(event, setAppState);
    // No other fields, so patch is empty → no setAppState call
    expect(setAppState).not.toHaveBeenCalled();
  });

  it('A6: all fields coexist with cacheHitRate: 0.7', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      contextUsage: 0.42,
      contextTokens: 4200,
      maxContextTokens: 10000,
      permission: 'auto',
      model: 'claude-sonnet',
      usage: {
        currentTurn: { inputOther: 300, inputCacheRead: 700, inputCacheCreation: 0 } as never,
      },
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch.contextUsage).toBe(0.42);
    expect(patch.contextTokens).toBe(4200);
    expect(patch.maxContextTokens).toBe(10000);
    expect(patch.permissionMode).toBe('auto');
    expect(patch.yolo).toBe(false);
    expect(patch.model).toBe('claude-sonnet');
    expect(patch).toHaveProperty('cacheHitRate');
    expect(patch.cacheHitRate).toBe(0.7);
  });

  it('A7: only old fields, no usage — patch identical to pre-change behavior', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      contextUsage: 0.65,
      permission: 'auto',
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch.contextUsage).toBe(0.65);
    expect(patch.permissionMode).toBe('auto');
    expect(patch.yolo).toBe(false);
    expect(patch).not.toHaveProperty('cacheHitRate');
  });

  it('A8: 100% cache hit rate', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      usage: {
        currentTurn: { inputOther: 0, inputCacheRead: 5000, inputCacheCreation: 0 } as never,
      },
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch).toHaveProperty('cacheHitRate');
    expect(patch.cacheHitRate).toBe(1.0);
  });

  it('A9: 1% hit rate', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      usage: {
        currentTurn: { inputOther: 9900, inputCacheRead: 100, inputCacheCreation: 0 } as never,
      },
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch).toHaveProperty('cacheHitRate');
    expect(patch.cacheHitRate).toBeCloseTo(0.01, 4);
  });

  it('A10: no usage key — existing fields extracted, no cacheHitRate', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      contextTokens: 12345,
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    const patch = setAppState.mock.calls[0]![0];
    expect(patch.contextTokens).toBe(12345);
    expect(patch).not.toHaveProperty('cacheHitRate');
  });

});

describe('handleSessionMetaChanged', () => {
  it('sets sessionTitle from event.title', () => {
    const setAppState = vi.fn();
    const event: SessionMetaUpdatedEvent = {
      type: 'session.meta.updated',
      title: 'My Session',
    };
    handleSessionMetaChanged(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    expect(setAppState.mock.calls[0]![0]).toEqual({ sessionTitle: 'My Session' });
  });

  it('sets sessionTitle from patch.title when event.title is undefined', () => {
    const setAppState = vi.fn();
    const event: SessionMetaUpdatedEvent = {
      type: 'session.meta.updated',
      patch: { title: 'Patched Title' },
    };
    handleSessionMetaChanged(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    expect(setAppState.mock.calls[0]![0]).toEqual({ sessionTitle: 'Patched Title' });
  });

  it('does nothing when neither title nor patch.title is present', () => {
    const setAppState = vi.fn();
    const event: SessionMetaUpdatedEvent = {
      type: 'session.meta.updated',
    };
    handleSessionMetaChanged(event, setAppState);
    expect(setAppState).not.toHaveBeenCalled();
  });
});

describe('handleSessionError', () => {
  it('flushes streaming UI and shows error with code', () => {
    const { callbacks, calls } = makeCallbacks();
    const event: ErrorEvent = {
      type: 'error',
      code: 'SOME_ERROR' as ErrorEvent['code'],
      message: 'Something broke',
      retryable: false,
    };
    handleSessionError(event, makeState(), callbacks);
    expect(calls.flushStreamingUiUpdatesNow).toBe(1);
    expect(calls.resetLiveToolUiState).toBe(1);
    expect(calls.finalizeLiveTextBuffers).toEqual(['idle']);
    expect(calls.showError).toEqual(['[SOME_ERROR] Something broke']);
  });

  it('shows error report hint when sessionId is present', () => {
    const { callbacks, calls } = makeCallbacks();
    const event: ErrorEvent = {
      type: 'error',
      code: 'GENERIC' as ErrorEvent['code'],
      message: 'fail',
      retryable: false,
    };
    handleSessionError(event, makeState({ sessionId: 'ses-abc' }), callbacks);
    expect(calls.showStatus.length).toBe(1);
    expect(calls.showStatus[0]!.message).toContain('ses-abc');
    expect(calls.showStatus[0]!.message).toContain('byf export');
  });

  it('does not show error report hint when sessionId is empty', () => {
    const { callbacks, calls } = makeCallbacks();
    const event: ErrorEvent = {
      type: 'error',
      code: 'GENERIC' as ErrorEvent['code'],
      message: 'fail',
      retryable: false,
    };
    handleSessionError(event, makeState({ sessionId: '' }), callbacks);
    expect(calls.showStatus).toHaveLength(0);
  });

  it('shows login required notice for OAUTH_LOGIN_REQUIRED_CODE', () => {
    const { callbacks, calls } = makeCallbacks();
    const event: ErrorEvent = {
      type: 'error',
      code: OAUTH_LOGIN_REQUIRED_CODE as ErrorEvent['code'],
      message: 'auth needed',
      retryable: false,
    };
    handleSessionError(event, makeState(), callbacks);
    expect(calls.showError).toEqual([expect.stringContaining('/login')]);
    expect(calls.showStatus).toHaveLength(0);
  });
});

describe('handleSessionWarning', () => {
  it('shows warning status with warning color', () => {
    const state = makeState();
    const { callbacks, calls } = makeCallbacks();
    const event: WarningEvent = {
      type: 'warning',
      message: 'deprecated model',
    };
    handleSessionWarning(event, state, callbacks);
    expect(calls.showStatus).toHaveLength(1);
    expect(calls.showStatus[0]!.message).toBe('Warning: deprecated model');
    expect(calls.showStatus[0]!.color).toBe(state.theme.colors.warning);
  });
});
