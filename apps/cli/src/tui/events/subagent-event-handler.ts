import type {
  AgentStatusUpdatedEvent,
  Event,
  HookResultEvent,
  SubagentCompletedEvent,
  SubagentFailedEvent,
  SubagentSpawnedEvent,
} from '@byfriends/sdk';

import { MAIN_AGENT_ID } from '#/tui/constant/byf-tui';
import type { BackgroundAgentMetadata, ToolCallBlockData, TranscriptEntry } from '#/tui/types';
import { argsRecord, serializeToolResultOutput } from '#/tui/utils/event-payload';

export interface SubagentToolCall {
  onSubagentSpawned(meta: { agentId: string; agentName?: string; runInBackground: boolean }): void;
  onSubagentCompleted(payload: {
    usage?: SubagentCompletedEvent['usage'];
    resultSummary: string;
  }): void;
  onSubagentFailed(payload: { error: string }): void;
  setSubagentMeta(agentId: string, agentName?: string): void;
  appendSubagentText(text: string, kind: 'text' | 'thinking'): void;
  appendSubToolCall(call: { id: string; name: string; args: Record<string, unknown> }): void;
  appendSubToolCallDelta(delta: { id: string; name?: string; argumentsPart: string | null }): void;
  finishSubToolCall(result: { tool_call_id: string; output: string; is_error?: boolean }): void;
  updateSubagentLiveUsage(usage: SubagentCompletedEvent['usage']): void;
}

// ---------------------------------------------------------------------------
// SubagentEventState — narrow adapter over TUIState.
// ByfTUI is the sole owner of TUIState; handlers only see a controlled
// getter/setter subset.
// ---------------------------------------------------------------------------

export interface SubagentEventState {
  // Maps
  getSubagentParentToolCallId(subagentId: string): string | undefined;
  setSubagentParentToolCallId(subagentId: string, parentToolCallId: string): void;
  getSubagentName(subagentId: string): string | undefined;
  setSubagentName(subagentId: string, name: string): void;

  // Background agent set + metadata
  hasBackgroundAgent(subagentId: string): boolean;
  addBackgroundAgent(subagentId: string): void;
  deleteBackgroundAgent(subagentId: string): boolean;
  getBackgroundAgentMetadata(subagentId: string): BackgroundAgentMetadata | undefined;
  setBackgroundAgentMetadata(subagentId: string, meta: BackgroundAgentMetadata): void;
  deleteBackgroundAgentMetadata(subagentId: string): void;

  // Pending tool components
  getPendingToolCall(parentToolCallId: string): SubagentToolCall | undefined;
  deletePendingToolCall(parentToolCallId: string): void;

  // Active tool calls
  getActiveToolCall(parentToolCallId: string): ToolCallBlockData | undefined;
  hasActiveToolCall(parentToolCallId: string): boolean;

  // Background task transcripts
  hasTranscriptedTask(taskId: string): boolean;
  addTranscriptedTask(taskId: string): void;

  // Find a background agent-* task id by matching description/agentName
  findAgentTaskIdByDescription(description: string): string | undefined;

  // Turn context
  readonly currentStep: number;
  readonly currentTurnId: string | undefined;
}

export interface SubagentCallbacks {
  appendBackgroundAgentEntry(
    phase: 'started' | 'completed' | 'failed',
    meta: BackgroundAgentMetadata,
    extras?: { resultSummary?: string; error?: string },
  ): void;
  syncBackgroundAgentBadge(): void;
  appendTranscriptEntry(entry: TranscriptEntry): void;
  onToolCallStart(toolCall: ToolCallBlockData): void;
}

export function routeSubagentEvent(event: Event, state: SubagentEventState): boolean {
  const subagentId = event.agentId;
  if (subagentId === MAIN_AGENT_ID) return false;

  const parentToolCallId = state.getSubagentParentToolCallId(subagentId);
  if (parentToolCallId === undefined || parentToolCallId.length === 0) return true;
  const sourceName = state.getSubagentName(subagentId);
  const toolCall = state.getPendingToolCall(parentToolCallId);
  if (toolCall === undefined) return true;
  toolCall.setSubagentMeta(subagentId, sourceName);

  // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- only sub-agent-streamed events are forwarded; others are no-ops via default
  switch (event.type) {
    case 'hook.result': {
      const hookEvent = event as HookResultEvent;
      toolCall.appendSubagentText(formatHookResultPlain(hookEvent), 'text');
      return true;
    }
    case 'assistant.delta':
      toolCall.appendSubagentText((event as { delta: string }).delta, 'text');
      return true;
    case 'thinking.delta':
      toolCall.appendSubagentText((event as { delta: string }).delta, 'thinking');
      return true;
    case 'tool.call.started': {
      const tcEvent = event as { toolCallId: string; name: string; args: unknown };
      toolCall.appendSubToolCall({
        id: `${subagentId}:${tcEvent.toolCallId}`,
        name: tcEvent.name,
        args: argsRecord(tcEvent.args),
      });
      return true;
    }
    case 'tool.call.delta': {
      const tcDelta = event as { toolCallId: string; name: string; argumentsPart?: string | null };
      toolCall.appendSubToolCallDelta({
        id: `${subagentId}:${tcDelta.toolCallId}`,
        name: tcDelta.name,
        argumentsPart: tcDelta.argumentsPart ?? null,
      });
      return true;
    }
    case 'tool.result': {
      const trEvent = event as { toolCallId: string; output: unknown; isError?: boolean };
      toolCall.finishSubToolCall({
        tool_call_id: `${subagentId}:${trEvent.toolCallId}`,
        output: serializeToolResultOutput(trEvent.output),
        is_error: trEvent.isError,
      });
      return true;
    }
    case 'agent.status.updated': {
      const statusEvent = event as AgentStatusUpdatedEvent;
      if (statusEvent.usage?.total !== undefined) {
        toolCall.updateSubagentLiveUsage(statusEvent.usage.total);
      }
      return true;
    }
    default:
      return true;
  }
}

export function handleSubagentSpawned(
  event: SubagentSpawnedEvent,
  state: SubagentEventState,
  callbacks: SubagentCallbacks,
): void {
  state.setSubagentParentToolCallId(event.subagentId, event.parentToolCallId);
  state.setSubagentName(event.subagentId, event.subagentName);

  if (event.runInBackground) {
    const meta = buildBackgroundAgentMetadata(event, state);
    state.setBackgroundAgentMetadata(event.subagentId, meta);
    state.addBackgroundAgent(event.subagentId);
    callbacks.appendBackgroundAgentEntry('started', meta);
    callbacks.syncBackgroundAgentBadge();
    return;
  }

  let tc = state.getPendingToolCall(event.parentToolCallId);
  if (tc === undefined) {
    const toolCall = state.getActiveToolCall(event.parentToolCallId);
    if (toolCall !== undefined) {
      callbacks.onToolCallStart(toolCall);
      tc = state.getPendingToolCall(event.parentToolCallId);
    }
  }
  tc ??= createStandaloneSubagentToolCall(event, state, callbacks);
  if (tc === undefined) return;
  tc.onSubagentSpawned({
    agentId: event.subagentId,
    agentName: event.subagentName,
    runInBackground: event.runInBackground,
  });
}

export function handleSubagentCompleted(
  event: SubagentCompletedEvent,
  state: SubagentEventState,
  callbacks: SubagentCallbacks,
): void {
  const backgroundMeta = state.getBackgroundAgentMetadata(event.subagentId);
  if (state.deleteBackgroundAgent(event.subagentId)) {
    callbacks.syncBackgroundAgentBadge();
  }
  if (backgroundMeta !== undefined) {
    const taskId = findAgentTaskId(event.subagentId, state);
    state.deleteBackgroundAgentMetadata(event.subagentId);
    if (taskId !== undefined && state.hasTranscriptedTask(taskId)) {
      return;
    }
    if (taskId !== undefined) {
      state.addTranscriptedTask(taskId);
    }
    const extras =
      event.resultSummary === undefined ? undefined : { resultSummary: event.resultSummary };
    callbacks.appendBackgroundAgentEntry('completed', backgroundMeta, extras);
    return;
  }
  const tc = state.getPendingToolCall(event.parentToolCallId);
  if (tc === undefined) return;
  tc.onSubagentCompleted({
    usage: event.usage,
    resultSummary: event.resultSummary,
  });
  if (!state.hasActiveToolCall(event.parentToolCallId)) {
    state.deletePendingToolCall(event.parentToolCallId);
  }
}

export function handleSubagentFailed(
  event: SubagentFailedEvent,
  state: SubagentEventState,
  callbacks: SubagentCallbacks,
): void {
  const backgroundMeta = state.getBackgroundAgentMetadata(event.subagentId);
  if (state.deleteBackgroundAgent(event.subagentId)) {
    callbacks.syncBackgroundAgentBadge();
  }
  if (backgroundMeta !== undefined) {
    const taskId = findAgentTaskId(event.subagentId, state);
    state.deleteBackgroundAgentMetadata(event.subagentId);
    if (taskId !== undefined && state.hasTranscriptedTask(taskId)) {
      return;
    }
    if (taskId !== undefined) {
      state.addTranscriptedTask(taskId);
    }
    callbacks.appendBackgroundAgentEntry('failed', backgroundMeta, { error: event.error });
    return;
  }
  const tc = state.getPendingToolCall(event.parentToolCallId);
  if (tc === undefined) return;
  tc.onSubagentFailed({ error: event.error });
  if (!state.hasActiveToolCall(event.parentToolCallId)) {
    state.deletePendingToolCall(event.parentToolCallId);
  }
}

export function buildBackgroundAgentMetadata(
  event: SubagentSpawnedEvent,
  state: SubagentEventState,
): BackgroundAgentMetadata {
  const parent = state.getActiveToolCall(event.parentToolCallId);
  const description = parent?.args['description'] ?? event.description;
  return {
    agentId: event.subagentId,
    parentToolCallId: event.parentToolCallId,
    agentName: event.subagentName,
    description: typeof description === 'string' ? description : undefined,
  };
}

function createStandaloneSubagentToolCall(
  event: SubagentSpawnedEvent,
  state: SubagentEventState,
  callbacks: SubagentCallbacks,
): SubagentToolCall | undefined {
  const description = event.description ?? `Run ${event.subagentName} agent`;
  const toolCall: ToolCallBlockData = {
    id: event.parentToolCallId,
    name: 'Agent',
    args: {
      description,
      subagent_type: event.subagentName,
    },
    description,
    step: state.currentStep,
    turnId: state.currentTurnId,
  };
  callbacks.onToolCallStart(toolCall);
  return state.getPendingToolCall(event.parentToolCallId);
}

function findAgentTaskId(subagentId: string, state: SubagentEventState): string | undefined {
  const meta = state.getBackgroundAgentMetadata(subagentId);
  const description = meta?.description ?? meta?.agentName;
  if (description === undefined) return undefined;
  return state.findAgentTaskIdByDescription(description);
}

function formatHookResultPlain(event: HookResultEvent): string {
  return `${formatHookResultTitle(event)}\n\n${formatHookResultBody(event)}`;
}

function formatHookResultTitle(event: HookResultEvent): string {
  return `${event.hookEvent} hook${event.blocked === true ? ' blocked' : ''}`;
}

function formatHookResultBody(event: HookResultEvent): string {
  const content = event.content.trim();
  return content.length === 0 ? '(empty)' : content;
}
