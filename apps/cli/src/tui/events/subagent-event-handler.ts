import type {
  Event,
  HookResultEvent,
  SubagentCompletedEvent,
  SubagentFailedEvent,
  SubagentSpawnedEvent,
} from '@byfriends/sdk';

import { MAIN_AGENT_ID } from '#/tui/constant/byf-tui';
import type {
  BackgroundAgentMetadata,
  ToolCallBlockData,
  TranscriptEntry,
} from '#/tui/types';
import {
  argsRecord,
  serializeToolResultOutput,
} from '#/tui/utils/event-payload';

export interface SubagentToolCall {
  onSubagentSpawned(meta: {
    agentId: string;
    agentName?: string;
    runInBackground: boolean;
  }): void;
  onSubagentCompleted(payload: {
    usage?: SubagentCompletedEvent['usage'];
    resultSummary: string;
  }): void;
  onSubagentFailed(payload: { error: string }): void;
  setSubagentMeta(agentId: string, agentName?: string): void;
  appendSubagentText(text: string, kind: 'text' | 'thinking'): void;
  appendSubToolCall(call: {
    id: string;
    name: string;
    args: Record<string, unknown>;
  }): void;
  appendSubToolCallDelta(delta: {
    id: string;
    name?: string;
    argumentsPart: string | null;
  }): void;
  finishSubToolCall(result: {
    tool_call_id: string;
    output: string;
    is_error?: boolean;
  }): void;
}

export interface SubagentState {
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

export function routeSubagentEvent(
  event: Event,
  state: SubagentState,
): boolean {
  const subagentId = event.agentId;
  if (subagentId === MAIN_AGENT_ID) return false;

  const parentToolCallId = state.subagentParentToolCallIds.get(subagentId);
  if (parentToolCallId === undefined || parentToolCallId.length === 0) return true;
  const sourceName = state.subagentNames.get(subagentId);
  const toolCall = state.pendingToolComponents.get(parentToolCallId);
  if (toolCall === undefined) return true;
  toolCall.setSubagentMeta(subagentId, sourceName);

  switch (event.type) {
    case 'hook.result': {
      const hookEvent = event as HookResultEvent;
      toolCall.appendSubagentText(
        formatHookResultPlain(hookEvent),
        'text',
      );
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
    default:
      return true;
  }
}

export function handleSubagentSpawned(
  event: SubagentSpawnedEvent,
  state: SubagentState,
  callbacks: SubagentCallbacks,
): void {
  state.subagentParentToolCallIds.set(event.subagentId, event.parentToolCallId);
  state.subagentNames.set(event.subagentId, event.subagentName);

  if (event.runInBackground) {
    const meta = buildBackgroundAgentMetadata(event, state);
    state.backgroundAgentMetadata.set(event.subagentId, meta);
    state.backgroundAgents.add(event.subagentId);
    callbacks.appendBackgroundAgentEntry('started', meta);
    callbacks.syncBackgroundAgentBadge();
    return;
  }

  let tc = state.pendingToolComponents.get(event.parentToolCallId);
  if (tc === undefined) {
    const toolCall = state.activeToolCalls.get(event.parentToolCallId);
    if (toolCall !== undefined) {
      callbacks.onToolCallStart(toolCall);
      tc = state.pendingToolComponents.get(event.parentToolCallId);
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
  state: SubagentState,
  callbacks: SubagentCallbacks,
): void {
  const backgroundMeta = state.backgroundAgentMetadata.get(event.subagentId);
  if (state.backgroundAgents.delete(event.subagentId)) {
    callbacks.syncBackgroundAgentBadge();
  }
  if (backgroundMeta !== undefined) {
    state.backgroundAgentMetadata.delete(event.subagentId);
    const taskId = findAgentTaskId(event.subagentId, state);
    if (taskId !== undefined && state.backgroundTaskTranscriptedTerminal.has(taskId)) {
      return;
    }
    if (taskId !== undefined) {
      state.backgroundTaskTranscriptedTerminal.add(taskId);
    }
    const extras =
      event.resultSummary === undefined ? undefined : { resultSummary: event.resultSummary };
    callbacks.appendBackgroundAgentEntry('completed', backgroundMeta, extras);
    return;
  }
  const tc = state.pendingToolComponents.get(event.parentToolCallId);
  if (tc === undefined) return;
  tc.onSubagentCompleted({
    usage: event.usage,
    resultSummary: event.resultSummary,
  });
  if (!state.activeToolCalls.has(event.parentToolCallId)) {
    state.pendingToolComponents.delete(event.parentToolCallId);
  }
}

export function handleSubagentFailed(
  event: SubagentFailedEvent,
  state: SubagentState,
  callbacks: SubagentCallbacks,
): void {
  const backgroundMeta = state.backgroundAgentMetadata.get(event.subagentId);
  if (state.backgroundAgents.delete(event.subagentId)) {
    callbacks.syncBackgroundAgentBadge();
  }
  if (backgroundMeta !== undefined) {
    state.backgroundAgentMetadata.delete(event.subagentId);
    const taskId = findAgentTaskId(event.subagentId, state);
    if (taskId !== undefined && state.backgroundTaskTranscriptedTerminal.has(taskId)) {
      return;
    }
    if (taskId !== undefined) {
      state.backgroundTaskTranscriptedTerminal.add(taskId);
    }
    callbacks.appendBackgroundAgentEntry('failed', backgroundMeta, { error: event.error });
    return;
  }
  const tc = state.pendingToolComponents.get(event.parentToolCallId);
  if (tc === undefined) return;
  tc.onSubagentFailed({ error: event.error });
  if (!state.activeToolCalls.has(event.parentToolCallId)) {
    state.pendingToolComponents.delete(event.parentToolCallId);
  }
}

export function buildBackgroundAgentMetadata(
  event: SubagentSpawnedEvent,
  state: SubagentState,
): BackgroundAgentMetadata {
  const parent = state.activeToolCalls.get(event.parentToolCallId);
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
  state: SubagentState,
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
  return state.pendingToolComponents.get(event.parentToolCallId);
}

function findAgentTaskId(subagentId: string, state: SubagentState): string | undefined {
  const meta = state.backgroundAgentMetadata.get(subagentId);
  const description = meta?.description ?? meta?.agentName;
  if (description === undefined) return undefined;
  let match: string | undefined;
  for (const info of state.backgroundTasks.values()) {
    if (!info.taskId.startsWith('agent-')) continue;
    if (info.description !== description) continue;
    if (match !== undefined) return undefined; // ambiguous
    match = info.taskId;
  }
  return match;
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
