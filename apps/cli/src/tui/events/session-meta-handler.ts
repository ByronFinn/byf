import type {
  AgentStatusUpdatedEvent,
  ErrorEvent,
  SessionMetaUpdatedEvent,
  WarningEvent,
} from '@byfriends/sdk';

import { OAUTH_LOGIN_REQUIRED_CODE, OAUTH_LOGIN_REQUIRED_STARTUP_NOTICE } from '#/tui/constant/byf-tui';
import { errorReportHintLine } from '#/tui/constant/feedback';
import type { AppState } from '#/tui/types';
import { stringValue } from '#/tui/utils/event-payload';
import { setProcessTitle } from '#/tui/utils/proctitle';

export interface SessionMetaCallbacks {
  flushStreamingUiUpdatesNow: () => void;
  resetLiveToolUiState: () => void;
  finalizeLiveTextBuffers: (nextMode: 'idle') => void;
  showError: (message: string) => void;
  showStatus: (message: string, color?: string) => void;
  setAppState: (patch: Partial<AppState>) => void;
}

export interface SessionMetaState {
  sessionId: string;
  theme: { colors: { warning: string } };
}

export function handleStatusUpdate(
  event: AgentStatusUpdatedEvent,
  setAppState: SessionMetaCallbacks['setAppState'],
): void {
  const patch: Partial<AppState> = {};
  if (event.contextUsage !== undefined) patch.contextUsage = event.contextUsage;
  if (event.contextTokens !== undefined) patch.contextTokens = event.contextTokens;
  if (event.maxContextTokens !== undefined) patch.maxContextTokens = event.maxContextTokens;
  if (event.permission !== undefined) {
    patch.permissionMode = event.permission;
    patch.yolo = event.permission === 'yolo';
  }
  if (event.model !== undefined) patch.model = event.model;
  if (Object.keys(patch).length > 0) setAppState(patch);
}

export function handleSessionMetaChanged(
  event: SessionMetaUpdatedEvent,
  setAppState: SessionMetaCallbacks['setAppState'],
): void {
  const title = event.title ?? stringValue(event.patch?.['title']);
  if (title !== undefined) {
    setAppState({ sessionTitle: title });
    setProcessTitle(title, '');
  }
}

export function handleSessionError(
  event: ErrorEvent,
  state: SessionMetaState,
  callbacks: SessionMetaCallbacks,
): void {
  callbacks.flushStreamingUiUpdatesNow();
  callbacks.resetLiveToolUiState();
  callbacks.finalizeLiveTextBuffers('idle');
  if (event.code === OAUTH_LOGIN_REQUIRED_CODE) {
    callbacks.showError(OAUTH_LOGIN_REQUIRED_STARTUP_NOTICE);
    return;
  }
  callbacks.showError(`[${event.code}] ${event.message}`);
  const sessionId = state.sessionId;
  if (sessionId.length > 0) {
    callbacks.showStatus(errorReportHintLine(sessionId));
  }
}

export function handleSessionWarning(
  event: WarningEvent,
  state: SessionMetaState,
  showStatus: SessionMetaCallbacks['showStatus'],
): void {
  showStatus(`Warning: ${event.message}`, state.theme.colors.warning);
}
