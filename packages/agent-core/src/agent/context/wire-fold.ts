/**
 * Pure wire-fold logic, extracted from `ContextMemory.appendLoopEvent`.
 *
 * This module folds a stream of `LoopRecordedEvent`s and explicit
 * `context.append_message` records into a `ContextMessage[]` timeline. It is
 * the single source of truth for how wire records reconstruct the
 * conversation history — consumed by both the live agent (via
 * `ContextMemory`) and external readers (e.g. apps/vis), eliminating the
 * duplicate fold logic that previously drifted between them.
 *
 * Purity contract:
 * - No disk I/O, no record logging, no event emission, no injection hooks.
 * - The only side-effectful seam is the optional `offloadToolOutput` handler
 *   (output offloading needs a scratch filesystem). Callers that don't need
 *   offloading (e.g. vis, which synthesises a preview without writing files)
 *   pass their own handler or omit it.
 *
 * The caller owns the message collection via `onMessage` — this lets the live
 * agent apply its side-effects (background notifications, replay builder) and
 * lets vis attach display metadata (lineNo / time / source).
 */

import { createToolMessage, type ContentPart, type TokenUsage } from '@byfriends/kosong';

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
  /** tool-call id → {name, args}; consulted to decide offloading (Agent-tool
   *  subagent summaries are never offloaded) and by observation masking. */
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
 * Caller-supplied seams. Both are optional: vis passes only `onMessage`
 * (and optionally `offloadToolOutput` for preview parity); the live agent
 * passes both.
 */
export interface WireFoldHandlers {
  /** Receive each message as it is committed to the timeline. May carry
   *  side-effects (background delivery, replay builder) or attach display
   *  metadata. Must not mutate the message in a way that breaks fold state. */
  onMessage: (message: ContextMessage) => void;
  /**
   * Called after a `step.end` is folded, with the index of the step's
   *  assistant message in `state.history` (or -1 if the step was unknown)
   *  and the usage delta if the event carried one. The live agent uses this
   *  to refresh its token-count snapshot; external readers can ignore it.
   */
  onStepEnd?: (stepUuid: string, openStepIndex: number, usage?: TokenUsage) => void;
  /**
   * Optionally offload a large tool output to a scratch store and return the
   * replacement output string. Returning `undefined` means "do not offload".
   * May return synchronously or via Promise — when the decision is
   * synchronous (e.g. the live agent during restore, which skips offload), no
   * `await` happens and the fold stays synchronous, preserving the contract
   * that `restoreRecord` feeds messages into history before the caller reads
   * it.
   *
   * The live agent writes the full output to a scratch file and returns a
   * preview + file reference. vis returns a preview with a placeholder path
   * (so its rendered timeline matches what the model actually saw) without
   * writing any file.
   */
  offloadToolOutput?: (
    toolCallId: string,
    toolName: string,
    result: ExecutableToolResult,
  ) => { output: string } | undefined | Promise<{ output: string } | undefined>;
}

/**
 * Push a message into state, honouring the tool-exchange deferral rule:
 * if a tool exchange is open (some tool call still awaiting its result),
 * queue the message; it flushes when the exchange closes.
 */
export function foldAppendMessage(
  state: WireFoldState,
  message: ContextMessage,
  handlers: WireFoldHandlers,
): void {
  if (state.pendingToolResultIds.size > 0) {
    state.deferredMessages.push(message);
    return;
  }
  commitMessage(state, message, handlers);
}

/** Fold one loop event into state. Async because offloading may be async. */
export async function foldLoopEvent(
  state: WireFoldState,
  event: LoopRecordedEvent,
  handlers: WireFoldHandlers,
): Promise<void> {
  switch (event.type) {
    case 'step.begin': {
      const message: ContextMessage = {
        role: 'assistant',
        content: [],
        toolCalls: [],
      };
      commitMessage(state, message, handlers);
      state.openSteps.set(event.uuid, message);
      return;
    }
    case 'step.end': {
      const openStep = state.openSteps.get(event.uuid);
      state.openSteps.delete(event.uuid);
      if (handlers.onStepEnd !== undefined) {
        const openStepIndex = openStep === undefined ? -1 : state.history.indexOf(openStep);
        handlers.onStepEnd(event.uuid, openStepIndex, event.usage);
      }
      flushDeferredIfToolExchangeClosed(state, handlers);
      return;
    }
    case 'content.part': {
      const openStep = state.openSteps.get(event.stepUuid);
      if (openStep === undefined) {
        throw new Error(
          `Received content_part for unknown step_uuid '${event.stepUuid}' (no open step_begin)`,
        );
      }
      openStep.content.push(event.part);
      return;
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
      return;
    }
    case 'tool.result': {
      let result = event.result;

      // Agent-tool subagent summaries are never offloaded — they are already
      // distilled by another LLM (see output-offloading design). The live
      // agent skips offload during restore (the scratch file is ephemeral);
      // external readers skip it when no handler is supplied.
      const toolName = state.toolCallInfo.get(event.toolCallId)?.name ?? 'unknown';
      if (toolName !== 'Agent' && handlers.offloadToolOutput !== undefined) {
        const maybeOffloaded = handlers.offloadToolOutput(event.toolCallId, toolName, result);
        const offloaded = isPromise(maybeOffloaded) ? await maybeOffloaded : maybeOffloaded;
        if (offloaded !== undefined) {
          result = { ...result, output: offloaded.output };
        }
      }

      const message = createToolMessage(event.toolCallId, toolResultOutputForModel(result));
      commitMessage(
        state,
        {
          ...message,
          role: 'tool',
          isError: result.isError,
        },
        handlers,
      );
      state.pendingToolResultIds.delete(event.toolCallId);
      flushDeferredIfToolExchangeClosed(state, handlers);
      return;
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

function commitMessage(
  state: WireFoldState,
  message: ContextMessage,
  handlers: WireFoldHandlers,
): void {
  state.history.push(message);
  handlers.onMessage(message);
}

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === 'object' && value !== null && typeof (value as Promise<T>).then === 'function'
  );
}

/**
 * Flush any deferred messages when no tool exchange is open. Public so that
 * out-of-band state changes (e.g. `applyCompaction` rebuilding the history)
 * can re-check the deferral rule without going through `foldLoopEvent`.
 */
export function flushDeferred(state: WireFoldState, handlers: WireFoldHandlers): void {
  flushDeferredIfToolExchangeClosed(state, handlers);
}

function flushDeferredIfToolExchangeClosed(state: WireFoldState, handlers: WireFoldHandlers): void {
  if (state.pendingToolResultIds.size > 0 || state.deferredMessages.length === 0) {
    return;
  }
  // Drain in place so a state view (e.g. ContextMemory's field references)
  // sees the clear — reassigning the field would break the view.
  const deferred = state.deferredMessages.splice(0);
  for (const message of deferred) {
    commitMessage(state, message, handlers);
  }
}
