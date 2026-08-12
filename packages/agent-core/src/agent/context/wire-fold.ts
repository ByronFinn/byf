/**
 * Wire-fold logic, extracted from `ContextMemory.appendLoopEvent`.
 *
 * This module folds a stream of `LoopRecordedEvent`s and explicit
 * `context.append_message` records into a `ContextMessage[]` timeline. It is
 * the single source of truth for how wire records reconstruct the
 * conversation history — consumed by both the live agent (via
 * `ContextMemory`) and external readers (e.g. apps/vis), eliminating the
 * duplicate fold logic that previously drifted between them.
 *
 * Pure-function contract (PRD-0027 Phase 5): no disk I/O, record logging,
 * event emission, injection hooks, or caller-supplied effect ports inside
 * this module. Each fold function mutates `state` in place and **returns the
 * messages committed to the timeline** (including any deferred messages
 * flushed when a tool exchange closes) — callers run their own side effects
 * (background delivery, replay builder, token snapshots, output offloading)
 * against the returned messages in the service layer.
 */

import { createToolMessage, type ContentPart } from '@byfriends/kosong';

import type { ExecutableToolResult, LoopRecordedEvent } from '../../loop';
import type { ContextMessage } from './types';

const TOOL_ERROR_STATUS = '<system>ERROR: Tool execution failed.</system>';
const TOOL_EMPTY_STATUS = '<system>Tool output is empty.</system>';
const TOOL_EMPTY_ERROR_STATUS =
  '<system>ERROR: Tool execution failed. Tool output is empty.</system>';
const TOOL_OUTPUT_EMPTY_TEXT = 'Tool output is empty.';

/**
 * Apply agent-core's output-normalisation to a tool result before it enters
 * the history: empty/error outputs get an explicit `<system>` marker so the
 * model can distinguish "tool ran, produced nothing" from "tool failed".
 *
 * Exported so vis (and any external reader) can replicate the exact same
 * transformation the live agent applies — previously vis showed the raw
 * output and silently diverged on empty / error tool results.
 */
export function toolResultOutputForModel(result: ExecutableToolResult): string | ContentPart[] {
  const output = result.output;
  if (typeof output === 'string') {
    if (result.isError === true) {
      if (output.length === 0) return TOOL_EMPTY_ERROR_STATUS;
      if (output.trimStart().startsWith('<system>ERROR:')) return output;
      return `${TOOL_ERROR_STATUS}\n${output}`;
    }
    return isEmptyOutputText(output) ? TOOL_EMPTY_STATUS : output;
  }

  if (output.length === 0) {
    return [
      {
        type: 'text',
        text: result.isError === true ? TOOL_EMPTY_ERROR_STATUS : TOOL_EMPTY_STATUS,
      },
    ];
  }
  if (result.isError === true) {
    return [{ type: 'text', text: TOOL_ERROR_STATUS }, ...output];
  }
  return output;
}

function isEmptyOutputText(output: string): boolean {
  return output.length === 0 || output.trim() === TOOL_OUTPUT_EMPTY_TEXT;
}

/**
 * Mutable fold state. The live `ContextMemory` and vis each hold one instance
 * and feed records through {@link foldLoopEvent} / {@link foldAppendMessage}.
 * The live agent shares its instance with the `context` wire model
 * (`WireService.mountModel`), so the fold functions double as the model's
 * `apply` implementations.
 */
export interface WireFoldState {
  history: ContextMessage[];
  /** step.uuid → the assistant ContextMessage currently being filled in. */
  openSteps: Map<string, ContextMessage>;
  /** tool-call ids whose result hasn't arrived yet. Non-empty means we're
   *  inside a tool exchange and explicit `appendMessage`s must be deferred
   *  until the exchange closes (otherwise user/background messages would be
   *  interleaved into the assistant's tool-call run, confusing the model). */
  pendingToolResultIds: Set<string>;
  /** tool-call id → {name, args}; consulted by observation masking / pruning
   *  and by the service layer's output-offload decision (Agent-tool subagent
   *  summaries are never offloaded). */
  toolCallInfo: Map<string, { name: string; args: unknown }>;
  /** Messages queued during an open tool exchange; flushed when the last
   *  pending tool result lands and the exchange closes. */
  deferredMessages: ContextMessage[];
}

export function createWireFoldState(): WireFoldState {
  return {
    history: [],
    openSteps: new Map(),
    pendingToolResultIds: new Set(),
    toolCallInfo: new Map(),
    deferredMessages: [],
  };
}

/**
 * Push a message into state, honouring the tool-exchange deferral rule:
 * if a tool exchange is open (some tool call still awaiting its result),
 * queue the message; it flushes when the exchange closes. Returns the
 * messages committed to history (empty when deferred).
 */
export function foldAppendMessage(state: WireFoldState, message: ContextMessage): ContextMessage[] {
  if (state.pendingToolResultIds.size > 0) {
    state.deferredMessages.push(message);
    return [];
  }
  commitMessage(state, message);
  return [message];
}

/**
 * Fold one loop event into state. Pure and synchronous: no side effects, no
 * async (tool outputs enter the timeline in full; output offloading is a
 * service-layer effect after dispatch, see PRD-0027 R3). Returns the messages
 * committed to history (may include deferred messages flushed when a tool
 * exchange closes).
 */
export function foldLoopEvent(state: WireFoldState, event: LoopRecordedEvent): ContextMessage[] {
  switch (event.type) {
    case 'step.begin': {
      const message: ContextMessage = {
        role: 'assistant',
        content: [],
        toolCalls: [],
      };
      commitMessage(state, message);
      state.openSteps.set(event.uuid, message);
      return [message];
    }
    case 'step.end': {
      state.openSteps.delete(event.uuid);
      return flushDeferredIfToolExchangeClosed(state);
    }
    case 'content.part': {
      const openStep = state.openSteps.get(event.stepUuid);
      if (openStep === undefined) {
        throw new Error(
          `Received content_part for unknown step_uuid '${event.stepUuid}' (no open step_begin)`,
        );
      }
      openStep.content.push(event.part);
      return [];
    }
    case 'tool.call': {
      const openStep = state.openSteps.get(event.stepUuid);
      if (openStep === undefined) {
        throw new Error(
          `Received tool_call for unknown step_uuid '${event.stepUuid}' (no open step_begin)`,
        );
      }
      openStep.toolCalls.push({
        type: 'function',
        id: event.toolCallId,
        name: event.name,
        arguments: event.args === undefined ? null : JSON.stringify(event.args),
      });
      state.pendingToolResultIds.add(event.toolCallId);
      state.toolCallInfo.set(event.toolCallId, { name: event.name, args: event.args });
      return [];
    }
    case 'tool.result': {
      const message = createToolMessage(event.toolCallId, toolResultOutputForModel(event.result));
      const toolMessage: ContextMessage = {
        ...message,
        role: 'tool',
        isError: event.result.isError,
      };
      commitMessage(state, toolMessage);
      state.pendingToolResultIds.delete(event.toolCallId);
      return [toolMessage, ...flushDeferredIfToolExchangeClosed(state)];
    }
  }
}

/**
 * Reset fold state to empty in place (e.g. on `context.clear`). Mutates the
 * existing arrays/maps rather than replacing them, so callers whose state is
 * a view onto their own fields (like `ContextMemory.foldState()`) see the
 * reset. Callers that hold display metadata should clear their own
 * structures in parallel.
 */
export function resetWireFoldState(state: WireFoldState): void {
  state.history.length = 0;
  state.openSteps.clear();
  state.pendingToolResultIds.clear();
  state.toolCallInfo.clear();
  state.deferredMessages.length = 0;
}

/**
 * Apply a compaction summary in place: replace the first `compactedCount`
 * messages with a single summary assistant message and keep the uncompacted
 * tail (`history.slice(compactedCount)`). Clears open steps and flushes any
 * deferred messages once the tool-exchange gate allows.
 *
 * Shared by `ContextMemory` and external readers (vis) so partial-compaction
 * tails cannot drift again.
 */
export function foldApplyCompaction(
  state: WireFoldState,
  input: { summary: string; compactedCount: number },
): { summary: ContextMessage; committed: ContextMessage[] } {
  const summaryMessage: ContextMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: input.summary }],
    toolCalls: [],
    origin: { kind: 'compaction_summary' },
  };
  const tail = state.history.slice(input.compactedCount);
  // Mutate in place so callers that hold a field-view (ContextMemory) see the
  // rebuild without reassigning their `_history` reference.
  state.history.length = 0;
  state.history.push(summaryMessage, ...tail);
  state.openSteps.clear();
  return { summary: summaryMessage, committed: flushDeferredIfToolExchangeClosed(state) };
}

function commitMessage(state: WireFoldState, message: ContextMessage): void {
  state.history.push(message);
}

/**
 * Flush any deferred messages when no tool exchange is open. Public so that
 * out-of-band state changes (e.g. `applyCompaction` rebuilding the history)
 * can re-check the deferral rule without going through `foldLoopEvent`.
 */
export function flushDeferred(state: WireFoldState): ContextMessage[] {
  return flushDeferredIfToolExchangeClosed(state);
}

function flushDeferredIfToolExchangeClosed(state: WireFoldState): ContextMessage[] {
  if (state.pendingToolResultIds.size > 0 || state.deferredMessages.length === 0) {
    return [];
  }
  // Drain in place so a state view (e.g. ContextMemory's field references)
  // sees the clear — reassigning the field would break the view.
  const deferred = state.deferredMessages.splice(0);
  for (const message of deferred) {
    commitMessage(state, message);
  }
  return deferred;
}

/**
 * Find the history indices of tool messages whose content starts with the
 * `[ToolName:` masked prefix (observation masking leaves this signature).
 * Pure helper shared by the `context.pruning` apply and the service layer's
 * prune-counting (PRD-0027 Phase 5).
 */
export function findMaskedToolResultIndices(state: WireFoldState): number[] {
  const indices: number[] = [];
  for (let i = 0; i < state.history.length; i++) {
    const message = state.history[i];
    if (message?.role !== 'tool' || message.toolCallId === undefined) continue;
    const info = state.toolCallInfo.get(message.toolCallId);
    if (info === undefined) continue;
    const text =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map((part) => part.text)
            .join('');
    if (text.startsWith(`[${info.name}:`)) {
      indices.push(i);
    }
  }
  return indices;
}
