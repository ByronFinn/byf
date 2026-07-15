/**
 * SubagentActivityStore — standalone state container for a foreground sub-agent's
 * activity trail.
 *
 * Holds all subagent lifecycle state (spawning → running → done/failed),
 * sub-tool call tracking (ongoing + finished), accumulated text/thinking text,
 * timer management, and snapshot listener notification.
 *
 * `ToolCallComponent` composes this store and delegates subagent mutations to
 * it, while retaining rendering (header, body, chip formatting) as its own
 * responsibility. External consumers (`AgentGroupComponent`, `ReadGroupComponent`,
 * `SubagentLiveViewer`) subscribe to snapshot change notifications through the
 * store.
 */

import { isAbsolute, relative, sep } from 'node:path';

import type { TUI } from '@earendil-works/pi-tui';

import {
  STREAMING_ARGS_FIELD_RE,
  STREAMING_ARGS_PREVIEW_MAX_CHARS,
} from '#/tui/constant/streaming';
import type { SubagentTokenUsage, ToolCallBlockData, ToolResultBlockData } from '#/tui/types';
import { appendStreamingArgsPreview } from '#/tui/utils/event-payload';
import { computeCacheHitRate, formatCacheHitRate } from '#/utils/usage/usage-format';

// ── Internal types ─────────────────────────────────────────────────────

export type SubagentTextKind = 'thinking' | 'text';

export interface FinishedSubCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly output: string;
  readonly isError: boolean;
}

export interface OngoingSubCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly streamingArguments?: string;
}

export interface SubToolActivity {
  readonly id: string;
  name: string;
  args: Record<string, unknown>;
  phase: 'ongoing' | 'done' | 'failed';
  readonly orderSeq: number;
  output?: string;
  isError?: boolean;
}

// ── Exported snapshot types ────────────────────────────────────────────

/**
 * Immutable subagent state snapshot. `AgentGroupComponent` reads one-time
 * views via `ToolCallComponent.getSubagentSnapshot()`; `onSnapshotChange`
 * notifies it when state changes.
 *
 * `latestActivity` priority, used only while running:
 *   1. latest ongoing sub-tool (`Using {name} ({keyArg})`)
 *   2. latest finished sub-tool (`Used {name} ({keyArg})`)
 *   3. last non-empty line from accumulated subagent text
 */
export interface ToolCallSubagentSnapshot {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly toolCallDescription: string;
  readonly agentName: string | undefined;
  readonly phase: 'spawning' | 'running' | 'done' | 'failed' | 'backgrounded' | undefined;
  readonly toolCount: number;
  readonly tokens: number;
  readonly isError: boolean;
  readonly errorText: string | undefined;
  readonly latestActivity: string | undefined;
  readonly elapsedSeconds: number | undefined;
}

/**
 * Full subagent activity detail for the live viewer.
 * Contains the complete tool-call sequence (not truncated), all text output,
 * and thinking text.
 */
export interface SubagentActivityLine {
  readonly orderSeq: number;
  readonly name: string;
  readonly args: Record<string, unknown>;
  readonly phase: 'ongoing' | 'done' | 'failed';
  readonly output?: string;
  readonly isError?: boolean;
}

export interface SubagentActivityDetail {
  readonly toolCallId: string;
  readonly agentName: string | undefined;
  readonly phase: ToolCallSubagentSnapshot['phase'];
  readonly toolCount: number;
  readonly tokens: number;
  readonly elapsedSeconds: number | undefined;
  readonly activities: readonly SubagentActivityLine[];
  readonly text: string;
  readonly thinkingText: string;
  readonly resultSummary: string | undefined;
  readonly errorText: string | undefined;
}

// ── Snapshot / data helpers ───────────────────────────────────────────

const MAX_SUB_TOOL_CALLS_SHOWN = 4;
const MAX_SINGLE_SUBAGENT_TOOL_ROWS = 4;
const SUBAGENT_ELAPSED_INTERVAL_MS = 1000;

function usageInputTotal(usage: SubagentTokenUsage): number {
  return (
    usage.input ??
    (usage.inputOther ?? 0) + (usage.inputCacheRead ?? 0) + (usage.inputCacheCreation ?? 0)
  );
}

export function formatSubagentTokens(usage: SubagentTokenUsage | undefined): string | undefined {
  if (usage === undefined) return undefined;
  const total = usageInputTotal(usage) + usage.output;
  if (total <= 0) return undefined;
  const formatted = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total);

  // Cache hit-rate suffix — use breakdown fields from SubagentTokenUsage.
  // When legacy `input` is present, skip (denominator mismatch).
  let cacheSuffix = '';
  if (usage.input === undefined || usage.input === 0) {
    const hitRate = computeCacheHitRate(
      usage.inputOther ?? 0,
      usage.inputCacheRead ?? 0,
      usage.inputCacheCreation ?? 0,
    );
    const hitRateStr = formatCacheHitRate(hitRate);
    if (hitRateStr !== undefined) {
      cacheSuffix = ` (${hitRateStr})`;
    }
  }
  return `${formatted} tok${cacheSuffix}`;
}

// ── Key-argument extraction helpers (shared with rendering code) ───────

const MAX_ARG_LENGTH = 60;
const PATH_KEYS = new Set(['path', 'file_path']);

export function makeWorkspaceRelativePath(
  filePath: string,
  workspaceDir: string | undefined,
): string {
  if (workspaceDir === undefined || workspaceDir.length === 0 || !isAbsolute(filePath)) {
    return filePath;
  }
  const relativePath = relative(workspaceDir, filePath);
  if (
    relativePath.length === 0 ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    return filePath;
  }
  return relativePath;
}

function truncateArgValue(key: string, value: string): string {
  if (value.length <= MAX_ARG_LENGTH) return value;
  if (PATH_KEYS.has(key)) {
    // Preserve the tail (filename) — drop the prefix so the user can
    // still tell which file is being touched.
    return '…' + value.slice(value.length - (MAX_ARG_LENGTH - 1));
  }
  return value.slice(0, MAX_ARG_LENGTH - 3) + '...';
}

function formatKeyArgument(
  toolName: string,
  key: string,
  value: string,
  workspaceDir: string | undefined,
): string {
  const displayValue =
    toolName === 'Read' && PATH_KEYS.has(key)
      ? makeWorkspaceRelativePath(value, workspaceDir)
      : value;
  return truncateArgValue(key, displayValue);
}

export function extractKeyArgument(
  toolName: string,
  args: Record<string, unknown>,
  workspaceDir?: string,
): string | null {
  const keyMap: Record<string, string[]> = {
    Bash: ['command'],
    Read: ['path', 'file_path'],
    Write: ['path', 'file_path'],
    Edit: ['path', 'file_path'],
    Grep: ['pattern'],
    Glob: ['pattern'],
    FetchURL: ['url'],
    WebSearch: ['query'],
    // Prefer the short `description` so the header preview never spills a
    // multi-line `prompt` into the TUI chrome.
    Agent: ['description', 'prompt'],
  };

  const candidates = keyMap[toolName] ?? Object.keys(args);
  for (const key of candidates) {
    const val = args[key];
    if (typeof val === 'string' && val.length > 0) {
      const firstLine = val.split('\n')[0] ?? val;
      return formatKeyArgument(toolName, key, firstLine, workspaceDir);
    }
  }
  return null;
}

// ── Snapshot helpers ───────────────────────────────────────────────────

/**
 * Computes the second-level "latest activity" line for group rows:
 *   1. latest ongoing sub-tool (`Using {name} ({keyArg})`)
 *   2. latest finished sub-tool (`Used {name} ({keyArg})`)
 *   3. last non-empty line from accumulated subagent text
 */
function computeLatestActivity(
  ongoing: ReadonlyMap<string, OngoingSubCall>,
  finished: readonly FinishedSubCall[],
  text: string,
  workspaceDir?: string,
): string | undefined {
  if (ongoing.size > 0) {
    const lastOngoing = [...ongoing.values()].at(-1);
    if (lastOngoing !== undefined) {
      return formatActivityLine('Using', lastOngoing.name, lastOngoing.args, workspaceDir);
    }
  }
  if (finished.length > 0) {
    const last = finished.at(-1);
    if (last !== undefined) {
      return formatActivityLine('Used', last.name, last.args, workspaceDir);
    }
  }
  if (text.length > 0) {
    const tail = text
      .split('\n')
      .toReversed()
      .find((l) => l.trim().length > 0);
    if (tail !== undefined) return tail.trim();
  }
  return undefined;
}

function formatActivityLine(
  verb: string,
  toolName: string,
  args: Record<string, unknown>,
  workspaceDir?: string,
): string {
  const keyArg = extractKeyArgument(toolName, args, workspaceDir);
  return keyArg ? `${verb} ${toolName} (${keyArg})` : `${verb} ${toolName}`;
}

// ── SubagentActivityStore ─────────────────────────────────────────────

export class SubagentActivityStore {
  // ── State ─────────────────────────────────────────────────────────
  private subagentAgentId: string | undefined;
  private subagentAgentName: string | undefined;
  readonly ongoingSubCalls = new Map<string, OngoingSubCall>();
  readonly finishedSubCalls: FinishedSubCall[] = [];
  readonly subToolActivities = new Map<string, SubToolActivity>();
  private subToolOrderSeq = 0;
  hiddenSubCallCount = 0;
  subagentText = '';
  subagentThinkingText = '';
  subagentPhase: 'spawning' | 'running' | 'done' | 'failed' | 'backgrounded' | undefined;
  private subagentUsage: SubagentTokenUsage | undefined;
  subagentResultSummary: string | undefined;
  subagentError: string | undefined;
  private subagentStartedAtMs: number | undefined;
  private subagentEndedAtMs: number | undefined;

  // ── Elapsed timer ─────────────────────────────────────────────────
  private subagentElapsedTimer: ReturnType<typeof setInterval> | undefined;

  // ── Change listeners ──────────────────────────────────────────────
  private readonly snapshotListeners = new Set<() => void>();

  constructor(subagent?: ToolCallBlockData['subagent']) {
    if (subagent !== undefined) this.applySubagentReplay(subagent);
  }

  // ── Replay ────────────────────────────────────────────────────────

  private applySubagentReplay(subagent: NonNullable<ToolCallBlockData['subagent']>): void {
    this.subagentAgentId = subagent.id;
    this.subagentAgentName = subagent.name;
    this.subagentText = subagent.text ?? '';
    if (subagent.usage !== undefined) {
      this.subagentUsage = subagent.usage;
    }
    for (const call of subagent.toolCalls ?? []) {
      if (call.result === undefined) {
        this.ongoingSubCalls.set(call.id, { name: call.name, args: call.args });
        this.upsertSubToolActivity(call.id, call.name, call.args, 'ongoing');
        continue;
      }
      this.finishedSubCalls.push({
        name: call.name,
        args: call.args,
        output: call.result.output,
        isError: call.result.is_error ?? false,
      });
      this.upsertSubToolActivity(
        call.id,
        call.name,
        call.args,
        call.result.is_error === true ? 'failed' : 'done',
      );
    }
    while (this.finishedSubCalls.length > MAX_SUB_TOOL_CALLS_SHOWN) {
      this.finishedSubCalls.shift();
      this.hiddenSubCallCount += 1;
    }
  }

  // ── Subagent lifecycle ────────────────────────────────────────────

  private upsertSubToolActivity(
    id: string,
    name: string,
    args: Record<string, unknown>,
    phase: SubToolActivity['phase'],
  ): void {
    const existing = this.subToolActivities.get(id);
    if (existing !== undefined) {
      existing.name = name;
      existing.args = args;
      existing.phase = phase;
      return;
    }
    this.subToolActivities.set(id, {
      id,
      name,
      args,
      phase,
      orderSeq: ++this.subToolOrderSeq,
    });
  }

  setSubagentMeta(agentId: string, agentName?: string): void {
    if (this.subagentAgentId === agentId && this.subagentAgentName === agentName) return;
    this.subagentAgentId = agentId;
    this.subagentAgentName = agentName;
    this.notifySnapshotChange();
  }

  onSubagentSpawned(meta: { agentId: string; agentName?: string; runInBackground: boolean }): void {
    this.subagentAgentId = meta.agentId;
    this.subagentAgentName = meta.agentName;
    this.subagentPhase = meta.runInBackground ? 'backgrounded' : 'spawning';
    this.subagentStartedAtMs = Date.now();
    this.subagentEndedAtMs = undefined;
    this.notifySnapshotChange();
  }

  onSubagentCompleted(payload: { usage?: SubagentTokenUsage; resultSummary: string }): void {
    this.subagentPhase = 'done';
    this.subagentEndedAtMs ??= Date.now();
    this.subagentUsage = payload.usage;
    this.subagentResultSummary =
      payload.resultSummary.length > 0 ? payload.resultSummary : undefined;
    if (this.subagentText.trim().length === 0 && this.subagentResultSummary !== undefined) {
      this.subagentText = this.subagentResultSummary;
    }
    this.notifySnapshotChange();
  }

  onSubagentFailed(payload: { error: string }): void {
    this.subagentPhase = 'failed';
    this.subagentEndedAtMs ??= Date.now();
    this.subagentError = payload.error;
    this.notifySnapshotChange();
  }

  updateSubagentLiveUsage(usage: SubagentTokenUsage | undefined): void {
    if (usage === undefined) return;
    if (this.subagentPhase !== 'spawning' && this.subagentPhase !== 'running') return;
    this.subagentUsage = usage;
    this.notifySnapshotChange();
  }

  // ── Text ──────────────────────────────────────────────────────────

  appendSubagentText(text: string, kind: SubagentTextKind = 'text'): void {
    if (kind === 'thinking') {
      this.subagentThinkingText += text;
    } else {
      this.subagentText += text;
    }
    // Child-agent activity means it is running unless already terminal/backgrounded.
    if (this.subagentPhase === undefined || this.subagentPhase === 'spawning') {
      this.subagentPhase = 'running';
    }
    this.notifySnapshotChange();
  }

  // ── Sub-tool calls ────────────────────────────────────────────────

  appendSubToolCall(call: { id: string; name: string; args: Record<string, unknown> }): void {
    const existing = this.ongoingSubCalls.get(call.id);
    this.ongoingSubCalls.set(call.id, {
      name: call.name,
      args: call.args,
      streamingArguments: existing?.streamingArguments,
    });
    this.upsertSubToolActivity(call.id, call.name, call.args, 'ongoing');
    if (this.subagentPhase === undefined || this.subagentPhase === 'spawning') {
      this.subagentPhase = 'running';
    }
    this.notifySnapshotChange();
  }

  appendSubToolCallDelta(delta: { id: string; name?: string; argumentsPart: string | null }): void {
    const existing = this.ongoingSubCalls.get(delta.id);
    const nextArgsText = appendStreamingArgsPreview(
      existing?.streamingArguments,
      delta.argumentsPart,
    );
    const parsed = parseArgsPreview(nextArgsText);
    this.ongoingSubCalls.set(delta.id, {
      name: delta.name ?? existing?.name ?? 'Tool',
      args: parsed,
      streamingArguments: nextArgsText,
    });
    this.upsertSubToolActivity(delta.id, delta.name ?? existing?.name ?? 'Tool', parsed, 'ongoing');
    this.notifySnapshotChange();
  }

  finishSubToolCall(result: { tool_call_id: string; output: string; is_error?: boolean }): void {
    const ongoing = this.ongoingSubCalls.get(result.tool_call_id);
    if (ongoing === undefined) return;
    this.ongoingSubCalls.delete(result.tool_call_id);
    this.finishedSubCalls.push({
      name: ongoing.name,
      args: ongoing.args,
      output: result.output,
      isError: result.is_error ?? false,
    });
    this.upsertSubToolActivity(
      result.tool_call_id,
      ongoing.name,
      ongoing.args,
      result.is_error === true ? 'failed' : 'done',
    );
    // Store output in the activity for the live viewer
    const activity = this.subToolActivities.get(result.tool_call_id);
    if (activity !== undefined) {
      activity.output = result.output;
      activity.isError = result.is_error === true;
    }
    while (this.finishedSubCalls.length > MAX_SUB_TOOL_CALLS_SHOWN) {
      this.finishedSubCalls.shift();
      this.hiddenSubCallCount += 1;
    }
    this.notifySnapshotChange();
  }

  // ── Timer management ──────────────────────────────────────────────

  get agentStartedAtMs(): number | undefined {
    return this.subagentStartedAtMs;
  }

  get agentEndedAtMs(): number | undefined {
    return this.subagentEndedAtMs;
  }

  get agentUsage(): SubagentTokenUsage | undefined {
    return this.subagentUsage;
  }

  finalizeElapsedIfNeeded(result?: ToolResultBlockData): void {
    if (
      this.subagentStartedAtMs !== undefined &&
      this.subagentEndedAtMs === undefined &&
      result !== undefined
    ) {
      this.subagentEndedAtMs = Date.now();
    }
  }

  syncElapsedTimer(result?: ToolResultBlockData, ui?: TUI, onTick?: () => void): void {
    const phase = this.getDerivedPhase(result);
    const shouldTick =
      this.isRunning() &&
      this.subagentStartedAtMs !== undefined &&
      (phase === 'spawning' || phase === 'running');
    if (!shouldTick) {
      this.stopElapsedTimer();
      return;
    }
    if (ui === undefined || this.subagentElapsedTimer !== undefined) return;
    this.subagentElapsedTimer = setInterval(() => {
      const latestPhase = this.getDerivedPhase(result);
      if (latestPhase !== 'spawning' && latestPhase !== 'running') {
        this.stopElapsedTimer();
        return;
      }
      onTick?.();
      ui.requestRender();
    }, SUBAGENT_ELAPSED_INTERVAL_MS);
  }

  stopElapsedTimer(): void {
    if (this.subagentElapsedTimer === undefined) return;
    clearInterval(this.subagentElapsedTimer);
    this.subagentElapsedTimer = undefined;
  }

  // ── Listener management ───────────────────────────────────────────

  /**
   * Lets group containers (AgentGroup or ReadGroup) subscribe to this store's
   * state changes. Registration immediately calls back so the group receives
   * the current snapshot without separately calling getSubagentSnapshot or
   * getReadSnapshot. Pass `undefined` to unsubscribe all listeners.
   *
   * @deprecated Prefer `addSnapshotListener` when multiple observers may be
   * interested in the same component (e.g., a grouped sub-agent inspected by
   * the live viewer).
   */
  setSnapshotListener(cb: (() => void) | undefined): void {
    this.snapshotListeners.clear();
    if (cb !== undefined) this.addSnapshotListener(cb);
  }

  /**
   * Adds a snapshot-change listener. Returns an unsubscribe function.
   * Registration immediately calls back so the observer receives the current
   * snapshot without separately calling getSubagentSnapshot/getReadSnapshot.
   */
  addSnapshotListener(cb: () => void): () => void {
    this.snapshotListeners.add(cb);
    cb();
    return () => {
      this.snapshotListeners.delete(cb);
    };
  }

  /** Notifies all listeners when internal state changes. */
  notifySnapshotChange(): void {
    for (const cb of this.snapshotListeners) {
      cb();
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  get agentId(): string | undefined {
    return this.subagentAgentId;
  }

  get agentName(): string | undefined {
    return this.subagentAgentName;
  }

  get usageTokens(): number {
    return this.subagentUsage === undefined
      ? 0
      : usageInputTotal(this.subagentUsage) + this.subagentUsage.output;
  }

  hasSubagentState(): boolean {
    return (
      this.subagentAgentId !== undefined ||
      this.ongoingSubCalls.size > 0 ||
      this.finishedSubCalls.length > 0 ||
      this.subToolActivities.size > 0 ||
      this.subagentText.length > 0 ||
      this.subagentThinkingText.length > 0 ||
      this.subagentPhase !== undefined
    );
  }

  isSingleSubagentView(toolName: string): boolean {
    return toolName === 'Agent' && this.hasSubagentState();
  }

  getDerivedPhase(
    result?: ToolResultBlockData,
  ): 'spawning' | 'running' | 'done' | 'failed' | 'backgrounded' | undefined {
    if (result !== undefined) return result.is_error ? 'failed' : 'done';
    return this.subagentPhase;
  }

  getCombinedText(): string {
    return [this.subagentThinkingText, this.subagentText].filter((s) => s.length > 0).join('\n');
  }

  getElapsedSeconds(): number | undefined {
    if (this.subagentStartedAtMs === undefined) return undefined;
    const end = this.subagentEndedAtMs ?? Date.now();
    return Math.max(0, Math.floor((end - this.subagentStartedAtMs) / 1000));
  }

  getRecentSubToolActivities(): SubToolActivity[] {
    return [...this.subToolActivities.values()]
      .toSorted((a, b) => a.orderSeq - b.orderSeq)
      .slice(-MAX_SINGLE_SUBAGENT_TOOL_ROWS);
  }

  /**
   * Short agent ID (max 10 chars + ellipsis) for inline display.
   */
  formatAgentId(): string {
    const id = this.subagentAgentId ?? '';
    return id.length > 10 ? id.slice(0, 10) + '…' : id;
  }

  /**
   * Checks whether this store's agent is running (not done/failed/backgrounded).
   */
  isRunning(): boolean {
    return this.subagentPhase === 'spawning' || this.subagentPhase === 'running';
  }

  // ── Snapshot production ───────────────────────────────────────────

  getSubagentSnapshot(
    toolCallId: string,
    toolName: string,
    description: string,
    result?: ToolResultBlockData,
    workspaceDir?: string,
  ): ToolCallSubagentSnapshot {
    const finished = this.finishedSubCalls.length + this.hiddenSubCallCount;
    const latestActivity = computeLatestActivity(
      this.ongoingSubCalls,
      this.finishedSubCalls,
      this.getCombinedText(),
      workspaceDir,
    );
    // Terminal-state priority: SDK `tool.result` is authoritative for Agent
    // tool calls. Once it arrives, force done/failed over intermediate
    // spawning/running states for two reasons:
    //   1. Replay does not replay spawned/completed/failed events, so
    //      `subagentPhase` stays undefined and result must be used.
    //   2. Live type-validation failures may skip `subagent.failed`, or
    //      `tool.result` may arrive first; otherwise the UI can stay stuck at
    //      'spawning' and keep showing `Initializing...`.
    // Intermediate states without a result still use `subagentPhase`.
    // `backgrounded` has no result because background agents do not enter the
    // transcript.
    const derivedPhase: ToolCallSubagentSnapshot['phase'] =
      result !== undefined ? (result.is_error ? 'failed' : 'done') : this.subagentPhase;

    return {
      toolCallId,
      toolName,
      toolCallDescription: description,
      agentName: this.subagentAgentName,
      phase: derivedPhase,
      toolCount: finished,
      tokens: this.usageTokens,
      isError: derivedPhase === 'failed',
      errorText: this.subagentError ?? (derivedPhase === 'failed' ? result?.output : undefined),
      latestActivity,
      elapsedSeconds: this.getElapsedSeconds(),
    };
  }

  /**
   * Returns the full subagent activity detail for the live viewer.
   * Contains all tool-call activities (not truncated), all text, and thinking.
   */
  getSubagentActivityDetail(
    toolCallId: string,
    description: string,
    result?: ToolResultBlockData,
    workspaceDir?: string,
  ): SubagentActivityDetail {
    const snap = this.getSubagentSnapshot(toolCallId, 'Agent', description, result, workspaceDir);
    const activities: SubagentActivityLine[] = [...this.subToolActivities.values()]
      .toSorted((a, b) => a.orderSeq - b.orderSeq)
      .map((act) => ({
        orderSeq: act.orderSeq,
        name: act.name,
        args: act.args,
        phase: act.phase,
        output: act.output,
        isError: act.isError,
      }));

    return {
      toolCallId: snap.toolCallId,
      agentName: snap.agentName,
      phase: snap.phase,
      toolCount: snap.toolCount,
      tokens: snap.tokens,
      elapsedSeconds: snap.elapsedSeconds,
      activities,
      text: this.subagentText,
      thinkingText: this.subagentThinkingText,
      resultSummary: this.subagentResultSummary,
      errorText: snap.errorText,
    };
  }
}

// ── Streaming args helpers (used by appendSubToolCallDelta) ────────────

function unescapeJsonString(s: string): string {
  return s.replaceAll(/\\(["\\/bfnrt])/g, (_, ch: string) => {
    switch (ch) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case 'b':
        return '\b';
      case 'f':
        return '\f';
      case '"':
        return '"';
      case '\\':
        return '\\';
      case '/':
        return '/';
      default:
        return ch;
    }
  });
}

function parseArgsPreview(value: string): Record<string, unknown> {
  const previewText = value.slice(0, STREAMING_ARGS_PREVIEW_MAX_CHARS);
  if (previewText.trim().length === 0) return {};
  if (value.length <= STREAMING_ARGS_PREVIEW_MAX_CHARS && previewText.trimEnd().endsWith('}')) {
    try {
      const parsed = JSON.parse(previewText) as unknown;
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through to partial scan
    }
  }
  const result: Record<string, unknown> = {};
  for (const match of previewText.matchAll(STREAMING_ARGS_FIELD_RE)) {
    const key = match[1];
    const rawValue = match[2];
    if (key === undefined || rawValue === undefined) continue;
    if (!(key in result)) result[key] = unescapeJsonString(rawValue);
  }
  return result;
}
