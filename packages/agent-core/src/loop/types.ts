/**
 * Public contracts for the stateless agent loop.
 *
 * This file defines the narrow surfaces that connect a Kosong conversation to
 * tool execution, phase hooks, and turn results. Host-layer metadata, policy,
 * archival limits, and UI concerns stay outside these contracts.
 *
 * Field naming is camelCase unless a reused Kosong type says otherwise.
 */

import type { ContentPart, Message, TokenUsage, Tool, ToolCall } from '@byfriends/kosong';

import type { ToolInputDisplay } from '../tools/display';
import type { LLM } from './llm';
import type { ToolAccesses } from './tool-access';

export type { ToolCall };

export type LoopMessageBuilder = () => Message[] | Promise<Message[]>;

/**
 * Stop reason for one completed model step.
 *
 * `tool_use` is a loop-control signal: the loop executes the requested tools and
 * continues with another step. The other values are terminal for the current
 * turn unless a host hook explicitly asks the loop to continue.
 */
export type LoopStepStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'tool_use'
  | 'filtered'
  | 'paused'
  | 'unknown';

export type LoopTerminalStepStopReason = Exclude<LoopStepStopReason, 'tool_use'>;

/**
 * Stop reasons that can be returned in a normal `TurnResult`.
 *
 * `tool_use` is intentionally absent because it cannot be the final result of a
 * completed turn. Errors and max-step exhaustion are represented by thrown
 * errors, not by this union. Compaction is a host-level retry concern rather
 * than a stop reason.
 */
export type LoopTurnStopReason = LoopTerminalStepStopReason | 'aborted';

/**
 * @deprecated Legacy umbrella union. Use `LoopStepStopReason` for per-step
 * model responses and `LoopTurnStopReason` for `TurnResult`.
 */
export type StopReason = LoopStepStopReason | 'aborted';

export interface TurnResult {
  stopReason: LoopTurnStopReason;
  steps: number;
  usage: TokenUsage;
}

export type ExecutableToolOutput = string | ContentPart[];

export interface ExecutableToolSuccessResult {
  readonly output: ExecutableToolOutput;
  readonly isError?: false;
  /**
   * Optional human-readable side channel for tool-result metadata that
   * should not contaminate the data stream the model sees (e.g. a
   * "Task snapshot retrieved." brief for TaskOutput). Distinct from
   * `output`: callers rendering tool results decide whether to surface
   * this to the user.
   */
  readonly message?: string;
}

export interface ExecutableToolErrorResult {
  readonly output: ExecutableToolOutput;
  readonly isError: true;
  /** See {@link ExecutableToolSuccessResult.message}. */
  readonly message?: string;
  /**
   * Internal loop-control hint. Tool result events strip this field before
   * persistence; it only tells the current turn whether another model step is
   * allowed after this tool batch.
   */
  readonly stopTurn?: boolean;
  /**
   * Set when the tool was not executed because the approval request was
   * rejected or cancelled by the user. Distinguishes "blocked by user" from
   * "tool ran but failed".
   */
  readonly blockedReason?: 'rejected' | 'cancelled';
}

export type ExecutableToolResult = ExecutableToolSuccessResult | ExecutableToolErrorResult;

export interface ToolUpdate {
  kind: 'stdout' | 'stderr' | 'progress' | 'status' | 'custom';
  text?: string;
  percent?: number;
  /** Vendor-defined event identifier when `kind === 'custom'`. */
  customKind?: string;
  /** Opaque payload paired with `customKind`. */
  customData?: unknown;
}

/**
 * Per-call context passed to tool implementations.
 */
export interface ExecutableToolContext {
  readonly turnId: string;
  readonly toolCallId: string;
  readonly metadata?: unknown;
  readonly signal: AbortSignal;
  readonly onUpdate?: (update: ToolUpdate) => void;
}

export interface RunnableToolExecution {
  readonly isError?: false;
  readonly accesses?: ToolAccesses;
  readonly display?: ToolInputDisplay;
  readonly description?: string;
  readonly execute: (ctx: ExecutableToolContext) => Promise<ExecutableToolResult>;
}

export type ToolExecution = RunnableToolExecution | ExecutableToolErrorResult;

export interface ExecutableTool<Input = unknown> extends Tool {
  resolveExecution(input: Input): ToolExecution;
}

/**
 * Step hooks are aligned to recorded phase boundaries: `beforeStep` runs before
 * `step.begin`, while `afterStep` runs after `step.end`.
 */

export interface LoopStepHookContext {
  readonly turnId: string;
  readonly stepNumber: number;
  readonly signal: AbortSignal;
  readonly llm: LLM;
}

export interface ToolExecutionHookContext extends LoopStepHookContext {
  readonly toolCall: ToolCall;
  readonly tool?: ExecutableTool;
  readonly args: unknown;
}

export interface PrepareToolExecutionResult {
  readonly block?: boolean;
  readonly reason?: string;
  readonly updatedArgs?: unknown;
  readonly syntheticResult?: ExecutableToolResult;
  readonly executionMetadata?: unknown;
  readonly blockedReason?: 'rejected' | 'cancelled';
  /**
   * When true, the tool call is a same-step duplicate and was never actually
   * executed. The loop will skip both `tool.call` and `tool.result` events
   * for this call — the original already covers them.
   *
   * This is an internal implementation detail; external hooks need not set it.
   */
  readonly skip?: boolean;
}

export interface FinalizeToolResultContext extends ToolExecutionHookContext {
  readonly result: ExecutableToolResult;
}

export interface LoopAfterStepContext extends LoopStepHookContext {
  readonly usage: TokenUsage;
  readonly stopReason: LoopStepStopReason;
}

export interface LoopStoppedStepContext extends LoopStepHookContext {
  readonly usage: TokenUsage;
  readonly stopReason: LoopTerminalStepStopReason;
}

export interface BeforeStepResult {
  readonly block?: boolean;
  readonly reason?: string;
}

export interface ShouldContinueAfterStopResult {
  readonly continue: boolean;
}

export type BeforeStepHook = (ctx: LoopStepHookContext) => Promise<BeforeStepResult | undefined>;

export type AfterStepHook = (ctx: LoopAfterStepContext) => Promise<void>;

export type PrepareToolExecutionHook = (
  ctx: ToolExecutionHookContext,
) => Promise<PrepareToolExecutionResult | undefined>;

export type FinalizeToolResultHook = (
  ctx: FinalizeToolResultContext,
) => Promise<ExecutableToolResult | undefined>;

export type ShouldContinueAfterStopHook = (
  ctx: LoopStoppedStepContext,
) => Promise<ShouldContinueAfterStopResult | undefined>;

/**
 * Groups every awaited phase hook.
 *
 * Hooks can affect control flow at deterministic transcript points. Event
 * listeners observe output and cannot change turn behavior.
 *
 * Tool hooks run serially in provider tool-call order before the matching
 * durable event is recorded, so preparation and finalization decisions are
 * resolved at stable transcript points.
 */
export interface LoopHooks {
  beforeStep?: BeforeStepHook;
  afterStep?: AfterStepHook;
  prepareToolExecution?: PrepareToolExecutionHook;
  finalizeToolResult?: FinalizeToolResultHook;
  shouldContinueAfterStop?: ShouldContinueAfterStopHook;
}
