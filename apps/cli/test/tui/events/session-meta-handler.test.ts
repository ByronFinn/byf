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

  it('applies planMode patch', () => {
    const setAppState = vi.fn();
    const event: AgentStatusUpdatedEvent = {
      type: 'agent.status.updated',
      planMode: true,
    };
    handleStatusUpdate(event, setAppState);
    expect(setAppState).toHaveBeenCalledOnce();
    expect(setAppState.mock.calls[0]![0].planMode).toBe(true);
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
    const showStatus = vi.fn();
    const event: WarningEvent = {
      type: 'warning',
      message: 'deprecated model',
    };
    handleSessionWarning(event, state, showStatus);
    expect(showStatus).toHaveBeenCalledOnce();
    expect(showStatus.mock.calls[0]![0]).toBe('Warning: deprecated model');
    expect(showStatus.mock.calls[0]![1]).toBe(state.theme.colors.warning);
  });
});
