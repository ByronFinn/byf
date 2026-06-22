/**
 * Renders a tool call entry in the transcript.
 * Supports expand/collapse via Ctrl+O.
 */

import { Container, Text, Spacer, visibleWidth } from '@earendil-works/pi-tui';
import type { Component, MarkdownTheme, TUI } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { highlightLines, langFromPath } from '#/tui/components/media/code-highlight';
import { renderDiffLinesClustered } from '#/tui/components/media/diff-preview';
import { COMMAND_PREVIEW_LINES } from '#/tui/constant/rendering';
import { STREAMING_ARGS_PREVIEW_MAX_CHARS } from '#/tui/constant/streaming';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';
import type { SubagentTokenUsage, ToolCallBlockData, ToolResultBlockData } from '#/tui/types';
import { decodeMcpToolName } from '#/tui/utils/mcp-tool-name';
import { formatBytes, formatElapsed } from '#/utils/format';

import { ShellExecutionComponent } from './shell-execution';
import {
  SubagentActivityStore,
  makeWorkspaceRelativePath,
  extractKeyArgument,
  formatSubagentTokens,
  type ToolCallSubagentSnapshot,
  type SubagentActivityLine,
  type SubagentActivityDetail,
  type SubToolActivity,
  type SubagentTextKind,
} from './subagent-activity-store';
import { countNonEmptyLines, pickChip } from './tool-renderers/chip';
import { pickResultRenderer } from './tool-renderers/registry';

const STREAMING_PROGRESS_INTERVAL_MS = 1000;
const PROGRESS_URL_RE = /https?:\/\/\S+/g;

/**
 * Immutable Read tool state snapshot. `ReadGroupComponent` reads one-time
 * views via `ToolCallComponent.getReadSnapshot()` and sums lines for the group
 * header. `lines` is 0 while pending or failed, and the non-empty result line
 * count when done, matching the single-card chip.
 */
export interface ToolCallReadSnapshot {
  readonly toolCallId: string;
  readonly filePath: string | undefined;
  readonly phase: 'pending' | 'done' | 'failed';
  readonly lines: number;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function formatSubagentLabel(agentName: string | undefined): string {
  const raw = agentName?.trim();
  if (raw === undefined || raw.length === 0) return 'SubAgent';
  const label = raw
    .split(/[-_\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  if (/\bagent$/i.test(label)) return label;
  return `${label} Agent`;
}

function tailNonEmptyLines(text: string, maxLines: number): string[] {
  if (text.length === 0) return [];
  return text
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(-maxLines);
}

class PrefixedWrappedLine implements Component {
  constructor(
    private readonly firstPrefix: string,
    private readonly continuationPrefix: string,
    private readonly text: string,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const prefixWidth = Math.max(
      visibleWidth(this.firstPrefix),
      visibleWidth(this.continuationPrefix),
    );
    const contentWidth = Math.max(1, width - prefixWidth);
    const lines = new Text(this.text, 0, 0).render(contentWidth);
    return lines.map((line, index) =>
      index === 0 ? `${this.firstPrefix}${line}` : `${this.continuationPrefix}${line}`,
    );
  }
}

// ── Streaming args preview in buildStreamingPreview ──────────────────

/**
 * Pull the live value of a JSON string field out of partially-streamed
 * arguments, even if the closing quote hasn't arrived yet.
 */
function extractPartialStringField(text: string, key: string): string | undefined {
  const opener = new RegExp(`"${key}"\\s*:\\s*"`);
  const match = opener.exec(text);
  if (match === null) return undefined;
  const start = match.index + match[0].length;
  let out = '';
  let i = start;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      const next = text[i + 1];
      if (next === undefined) return out;
      switch (next) {
        case 'n':
          out += '\n';
          break;
        case 't':
          out += '\t';
          break;
        case 'r':
          out += '\r';
          break;
        case 'b':
          out += '\b';
          break;
        case 'f':
          out += '\f';
          break;
        case '"':
          out += '"';
          break;
        case '\\':
          out += '\\';
          break;
        case '/':
          out += '/';
          break;
        case 'u': {
          if (i + 5 >= text.length) return out;
          const hex = text.slice(i + 2, i + 6);
          const code = Number.parseInt(hex, 16);
          if (Number.isNaN(code)) return out;
          out += String.fromCodePoint(code);
          i += 6;
          continue;
        }
        default:
          out += next;
      }
      i += 2;
      continue;
    }
    if (ch === '"') return out;
    out += ch;
    i++;
  }
  return out;
}

export class ToolCallComponent extends Container {
  private expanded = false;
  private toolCall: ToolCallBlockData;
  private result: ToolResultBlockData | undefined;
  private colors: ColorPalette;
  private ui: TUI | undefined;
  private markdownTheme: MarkdownTheme | undefined;
  private headerText: Text;
  private callPreviewEndIndex = 0;

  // ── Subagent state ───────────────────────────────────────────────
  //
  // Owned by SubagentActivityStore. Retrieved on construction from
  // toolCall.subagent (replay path) and mutated via delegate methods
  // called by SubagentEventHandler when the SDK streams sub-agent
  // lifecycle events.
  // Owned by SubagentActivityStore. Retrieved on construction from
  // toolCall.subagent (replay path) and mutated via delegate methods
  // called by SubagentEventHandler when the SDK streams sub-agent
  // lifecycle events.

  // ── Live progress lines ──────────────────────────────────────────
  //
  // Populated by `appendProgress` whenever the tool emits an
  // `onUpdate({kind:'status', text})` while still running. Used by
  // long-blocking tools (e.g. the MCP `authenticate` synthetic tool
  // whose 15-minute browser wait would otherwise display only a
  // spinner). Cleared when the result lands — the result is the
  // authoritative final state.
  private progressLines: string[] = [];
  private static readonly MAX_PROGRESS_LINES = 24;

  /**
   * Registered by group containers (`AgentGroupComponent` or
   * `ReadGroupComponent`) and the sub-agent live viewer. Any state change
   * (subagent meta, phase, sub-tool, result, etc.) notifies all listeners.
   * Multiple listeners are supported so a grouped component can still be
   * inspected by the live viewer without breaking group re-renders.
   */
  private readonly subagentStore: SubagentActivityStore;

  private streamingProgressTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    toolCall: ToolCallBlockData,
    result: ToolResultBlockData | undefined,
    colors: ColorPalette,
    ui?: TUI,
    markdownTheme?: MarkdownTheme,
    private readonly workspaceDir?: string,
  ) {
    super();
    this.toolCall = toolCall;
    this.result = result;
    this.colors = colors;
    this.ui = ui;
    this.markdownTheme = markdownTheme;
    this.subagentStore = new SubagentActivityStore(toolCall.subagent);

    this.addChild(new Spacer(1));
    this.headerText = new Text(this.buildHeader(), 0, 0);
    this.addChild(this.headerText);

    // Anchor callPreviewEndIndex BEFORE registering the snapshot listener,
    // because addSnapshotListener calls the callback immediately and
    // rebuildContent removes children from callPreviewEndIndex onward.
    this.callPreviewEndIndex = this.children.length;

    // Re-render when the subagent store notifies of changes.
    this.subagentStore.addSnapshotListener(() => {
      this.headerText.setText(this.buildHeader());
      this.rebuildContent();
      this.ui?.requestRender();
    });
    this.buildCallPreview();
    this.callPreviewEndIndex = this.children.length;
    this.buildProgressBlock();
    this.buildContent();
    this.buildSubagentBlock();
    this.syncStreamingProgressTimer();
    this.syncElapsedTimer();
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    // rebuildBody (not rebuildContent) so the args-driven call preview
    // — which is what carries Write content / Edit diff — re-renders
    // with the new line cap. rebuildContent only touches result-driven
    // children and would leave the call preview stuck at its initial
    // collapsed size.
    this.rebuildBody();
  }

  setResult(result: ToolResultBlockData): void {
    this.result = result;
    // Result supersedes any live progress chatter; the result body is the
    // authoritative final state. Without this clear, a finished tool would
    // show both the streamed status lines and the final output stacked.
    this.progressLines = [];
    this.subagentStore.finalizeElapsedIfNeeded(result);
    this.syncStreamingProgressTimer();
    this.syncElapsedTimer();
    this.headerText.setText(this.buildHeader());
    // rebuildBody (not rebuildContent) so the call preview re-renders
    // with the collapsed cap applied — Write streaming previews and
    // Edit's progress placeholder needs to snap to the final preview on
    // result.
    this.rebuildBody();
    // Final results affect group summaries, especially failed/done counts.
    this.subagentStore.notifySnapshotChange();
  }

  updateToolCall(toolCall: ToolCallBlockData): void {
    this.toolCall = toolCall;
    this.syncStreamingProgressTimer();
    this.headerText.setText(this.buildHeader());
    this.rebuildBody();
    this.subagentStore.notifySnapshotChange();
    this.ui?.requestRender();
  }

  /**
   * Append a live progress line emitted by the tool via
   * `onUpdate({kind:'status', text})`. Splits on newlines so multi-line
   * status payloads render row-by-row. Old lines are dropped once the
   * buffer fills past {@link ToolCallComponent.MAX_PROGRESS_LINES} so a
   * misbehaving tool can't grow the box unboundedly.
   */
  appendProgress(text: string): void {
    if (this.result !== undefined) return;
    for (const line of text.split('\n')) {
      this.progressLines.push(line);
    }
    while (this.progressLines.length > ToolCallComponent.MAX_PROGRESS_LINES) {
      this.progressLines.shift();
    }
    this.rebuildBody();
    this.subagentStore.notifySnapshotChange();
    this.ui?.requestRender();
  }

  dispose(): void {
    this.stopStreamingProgressTimer();
    this.subagentStore.stopElapsedTimer();
  }

  // ── Subagent API (called by ByfTui event routing) ───────────────

  setSubagentMeta(agentId: string, agentName?: string): void {
    this.subagentStore.setSubagentMeta(agentId, agentName);
  }

  /**
   * Lets group containers (AgentGroup or ReadGroup) subscribe to this card's
   * state changes. Registration immediately calls back so the group receives
   * the current snapshot without separately calling getSubagentSnapshot or
   * getReadSnapshot. Pass `undefined` to unsubscribe all listeners.
   *
   * @deprecated Prefer `addSnapshotListener` when multiple observers may be
   * interested in the same component (e.g., a grouped sub-agent inspected by
   * the live viewer).
   */
  setSnapshotListener(cb: (() => void) | undefined): void {
    this.subagentStore.setSnapshotListener(cb);
  }

  /**
   * Adds a snapshot-change listener. Returns an unsubscribe function.
   * Registration immediately calls back so the observer receives the current
   * snapshot without separately calling getSubagentSnapshot/getReadSnapshot.
   */
  addSnapshotListener(cb: () => void): () => void {
    return this.subagentStore.addSnapshotListener(cb);
  }

  getSubagentSnapshot(): ToolCallSubagentSnapshot {
    const description = str(this.toolCall.args['description']) || str(this.toolCall.description);
    return this.subagentStore.getSubagentSnapshot(
      this.toolCall.id,
      this.toolCall.name,
      description,
      this.result,
      this.workspaceDir,
    );
  }

  /**
   * Returns the full subagent activity detail for the live viewer.
   * Contains all tool-call activities (not truncated), all text, and thinking.
   */
  getSubagentActivityDetail(): SubagentActivityDetail {
    const description = str(this.toolCall.args['description']) || str(this.toolCall.description);
    return this.subagentStore.getSubagentActivityDetail(
      this.toolCall.id,
      description,
      this.result,
      this.workspaceDir,
    );
  }

  /**
   * Used by `ReadGroupComponent` to sum line counts across same-step Read
   * cards. `lines` matches the single-card chip
   * (`pluralize(countNonEmptyLines(...), 'line')`) so group and card counts do
   * not drift.
   */
  getReadSnapshot(): ToolCallReadSnapshot {
    const args = this.toolCall.args;
    const filePathRaw = args['file_path'] ?? args['path'];
    const filePath =
      typeof filePathRaw === 'string'
        ? makeWorkspaceRelativePath(filePathRaw, this.workspaceDir)
        : undefined;
    if (this.result === undefined) {
      return { toolCallId: this.toolCall.id, filePath, phase: 'pending', lines: 0 };
    }
    if (this.result.is_error === true) {
      return { toolCallId: this.toolCall.id, filePath, phase: 'failed', lines: 0 };
    }
    return {
      toolCallId: this.toolCall.id,
      filePath,
      phase: 'done',
      lines: countNonEmptyLines(this.result.output),
    };
  }

  // Readonly view for group access to toolCall metadata (id, name, description).
  get toolCallView(): Readonly<ToolCallBlockData> {
    return this.toolCall;
  }

  /** Notifies all listeners when internal state changes. */
  private notifySnapshotChange(): void {
    this.subagentStore.notifySnapshotChange();
  }

  private isStreamingEditPreview(): boolean {
    return (
      this.toolCall.name === 'Edit' &&
      this.result === undefined &&
      this.toolCall.streamingArguments !== undefined
    );
  }

  private syncStreamingProgressTimer(): void {
    if (!this.isStreamingEditPreview()) {
      this.stopStreamingProgressTimer();
      return;
    }
    if (this.ui === undefined || this.streamingProgressTimer !== undefined) return;
    this.streamingProgressTimer = setInterval(() => {
      if (!this.isStreamingEditPreview()) {
        this.stopStreamingProgressTimer();
        return;
      }
      this.rebuildBody();
      this.ui?.requestRender();
    }, STREAMING_PROGRESS_INTERVAL_MS);
  }

  private stopStreamingProgressTimer(): void {
    if (this.streamingProgressTimer === undefined) return;
    clearInterval(this.streamingProgressTimer);
    this.streamingProgressTimer = undefined;
  }

  /**
   * Sync the elapsed timer for the subagent. Delegates to the store which
   * handles its own timer; the callback updates the header on each tick.
   */
  private syncElapsedTimer(): void {
    this.subagentStore.syncElapsedTimer(this.result, this.ui, () => {
      this.headerText.setText(this.buildHeader());
      this.invalidate();
    });
  }

  /**
   * Handles SDK `subagent.spawned`. The child agent is registered, but internal
   * activity events (`assistant.delta` or `tool.call.started`) may not have
   * arrived yet, so the UI moves to the 'spawning' placeholder state unless the
   * agent is running in the background.
   */
  onSubagentSpawned(meta: {
    agentId: string;
    agentName?: string | undefined;
    runInBackground: boolean;
  }): void {
    this.subagentStore.onSubagentSpawned(meta);
    this.syncElapsedTimer();
    this.headerText.setText(this.buildHeader());
    this.rebuildContent();
    this.ui?.requestRender();
  }

  /**
   * Handles SDK `subagent.completed`. Moves the phase to 'done' and records
   * token usage plus the result summary for the header chip and tail summary.
   */
  onSubagentCompleted(payload: {
    usage?: SubagentTokenUsage | undefined;
    resultSummary: string;
  }): void {
    this.subagentStore.onSubagentCompleted(payload);
    this.syncElapsedTimer();
    this.headerText.setText(this.buildHeader());
    this.rebuildContent();
    this.ui?.requestRender();
  }

  /** Handles SDK `subagent.failed`. */
  onSubagentFailed(payload: { error: string }): void {
    this.subagentStore.onSubagentFailed(payload);
    this.syncElapsedTimer();
    this.headerText.setText(this.buildHeader());
    this.rebuildContent();
    this.ui?.requestRender();
  }

  /** Receives live cumulative token usage from `agent.status.updated` while running. */
  updateSubagentLiveUsage(usage: SubagentTokenUsage | undefined): void {
    this.subagentStore.updateSubagentLiveUsage(usage);
  }

  appendSubagentText(text: string, kind: SubagentTextKind = 'text'): void {
    this.subagentStore.appendSubagentText(text, kind);
  }

  appendSubToolCall(call: { id: string; name: string; args: Record<string, unknown> }): void {
    this.subagentStore.appendSubToolCall(call);
  }

  appendSubToolCallDelta(delta: {
    id: string;
    name?: string | undefined;
    argumentsPart: string | null;
  }): void {
    this.subagentStore.appendSubToolCallDelta(delta);
  }

  finishSubToolCall(result: {
    tool_call_id: string;
    output: string;
    is_error?: boolean | undefined;
  }): void {
    this.subagentStore.finishSubToolCall(result);
  }

  private buildHeader(): string {
    const { toolCall, result, colors } = this;
    const isFinished = result !== undefined;
    const isError = result?.is_error ?? false;
    const isTruncated = toolCall.truncated === true && !isFinished;

    let bullet: string;
    if (isFinished) {
      bullet = isError ? chalk.hex(colors.error)('✗ ') : chalk.hex(colors.success)(STATUS_BULLET);
    } else if (isTruncated) {
      bullet = chalk.hex(colors.error)('✗ ');
    } else {
      // Solid bullet for in-flight tools — the previous marker ↔ blank
      // toggle caused visible flicker on every re-render.
      bullet = chalk.hex(colors.roleAssistant)(STATUS_BULLET);
    }

    if (toolCall.name === 'AskUserQuestion') {
      const label = isFinished
        ? isError
          ? 'Could not collect your input'
          : 'Collected your answers'
        : 'Waiting for your input';
      const tone = isError ? chalk.hex(colors.error) : chalk.hex(colors.primary);
      return `${bullet}${tone.bold(label)}`;
    }

    if (this.isSingleSubagentView()) {
      return this.buildSingleSubagentHeader();
    }

    const verb =
      isFinished && result?.blockedReason === 'rejected'
        ? 'Rejected'
        : isFinished && result?.blockedReason === 'cancelled'
          ? 'Cancelled'
          : isFinished
            ? 'Used'
            : isTruncated
              ? 'Truncated'
              : 'Using';
    const keyArg = extractKeyArgument(toolCall.name, toolCall.args, this.workspaceDir);
    const decoded = decodeMcpToolName(toolCall.name);
    const verbStyled = isTruncated ? chalk.hex(colors.error)(verb) : verb;
    const toolLabel =
      decoded !== null
        ? `${chalk.hex(colors.primary).bold(decoded.toolName)}${chalk.dim(` · MCP/${decoded.serverName}`)}`
        : chalk.hex(colors.primary).bold(toolCall.name);
    const argStr = keyArg ? chalk.dim(` (${keyArg})`) : '';
    let chipStr = '';
    if (isFinished && result) chipStr = this.buildHeaderChip(result);
    return `${bullet}${verbStyled} ${toolLabel}${argStr}${chipStr}`;
  }

  private buildHeaderChip(result: ToolResultBlockData): string {
    const provider = pickChip(this.toolCall.name);
    if (provider === undefined) return '';
    const text = provider(this.toolCall, result);
    if (text.length === 0) return '';
    const tone = result.is_error ? chalk.hex(this.colors.error) : chalk.dim;
    return tone(` · ${text}`);
  }

  private rebuildContent(): void {
    while (this.children.length > this.callPreviewEndIndex) {
      this.children.pop();
    }
    this.buildProgressBlock();
    this.buildContent();
    this.buildSubagentBlock();
  }

  private rebuildBody(): void {
    while (this.children.length > 2) {
      this.children.pop();
    }
    this.buildCallPreview();
    this.callPreviewEndIndex = this.children.length;
    this.buildProgressBlock();
    this.buildContent();
    this.buildSubagentBlock();
  }

  /**
   * Render the accumulated `progressLines` between the call preview and
   * the result body. URLs inside a line are wrapped in an OSC 8 hyperlink
   * sequence so terminals that support it (iTerm2, Ghostty, kitty, modern
   * Terminal.app, VS Code) make the URL Cmd-clickable and expose
   * "Copy Link" via the context menu — even when pi-tui soft-wraps the
   * URL across multiple rows (pi-tui's wrapTextWithAnsi re-opens the
   * active OSC 8 link on each continuation line). Each embedded URL is
   * styled individually so surrounding prose keeps its default dim tone.
   */
  private buildProgressBlock(): void {
    if (this.progressLines.length === 0) return;
    if (this.result !== undefined) return;
    for (const raw of this.progressLines) {
      if (raw.length === 0) {
        this.addChild(new Text('', 2, 0));
        continue;
      }
      PROGRESS_URL_RE.lastIndex = 0;
      const styled = PROGRESS_URL_RE.test(raw)
        ? raw.replace(PROGRESS_URL_RE, (url) => {
            const visible = chalk.hex(this.colors.warning).underline(url);
            return `\u001B]8;;${url}\u001B\\${visible}\u001B]8;;\u001B\\`;
          })
        : chalk.dim(raw);
      PROGRESS_URL_RE.lastIndex = 0;
      this.addChild(new Text(styled, 2, 0));
    }
  }

  private buildSubagentBlock(): void {
    const store = this.subagentStore;
    if (!store.hasSubagentState()) return;

    if (store.isSingleSubagentView(this.toolCall.name)) {
      this.buildSingleSubagentBlock();
      return;
    }

    const dim = chalk.dim;
    const phaseChip = this.formatPhaseChip();
    const headerLabel =
      store.agentName !== undefined
        ? `subagent ${store.agentName} (${store.formatAgentId()})`
        : `subagent (${store.formatAgentId()})`;
    this.addChild(new Text(`  ${dim(`↳ ${headerLabel}`)}${phaseChip}`, 0, 0));

    if (store.hiddenSubCallCount > 0) {
      const suffix = store.hiddenSubCallCount > 1 ? 's' : '';
      this.addChild(
        new Text(
          dim.italic(`    ${String(store.hiddenSubCallCount)} more tool call${suffix} ...`),
          0,
          0,
        ),
      );
    }

    for (const sub of store.finishedSubCalls) {
      const mark = sub.isError
        ? chalk.hex(this.colors.error)('✗')
        : chalk.hex(this.colors.success)('•');
      const keyArg = extractKeyArgument(sub.name, sub.args, this.workspaceDir);
      const nameCol = chalk.hex(this.colors.primary)(sub.name);
      const argCol = keyArg ? dim(` (${keyArg})`) : '';
      this.addChild(new Text(`    ${mark} Used ${nameCol}${argCol}`, 0, 0));
    }

    for (const call of store.ongoingSubCalls.values()) {
      const keyArg = extractKeyArgument(call.name, call.args, this.workspaceDir);
      const nameCol = chalk.hex(this.colors.primary)(call.name);
      const argCol = keyArg ? dim(` (${keyArg})`) : '';
      this.addChild(new Text(`    ${dim('…')} Using ${nameCol}${argCol}`, 0, 0));
    }

    if (store.subagentText.length > 0) {
      const tailLines = store.subagentText.split('\n').slice(-3);
      for (const line of tailLines) {
        this.addChild(new Text(`    ${dim(line)}`, 0, 0));
      }
    }

    // Result summary from subagent.completed.
    if (store.subagentPhase === 'done' && store.subagentResultSummary !== undefined) {
      const summaryLines = store.subagentResultSummary.split('\n').slice(0, 2);
      for (const line of summaryLines) {
        this.addChild(new Text(`    ${dim('└')} ${line}`, 0, 0));
      }
    }

    // Full error text from subagent.failed; do not collapse it.
    if (store.subagentPhase === 'failed' && store.subagentError !== undefined) {
      const errLines = store.subagentError.split('\n');
      for (const line of errLines) {
        this.addChild(new Text(`    ${chalk.hex(this.colors.error)('└')} ${line}`, 0, 0));
      }
    }
  }

  /**
   * Header phase/token chip. No chip is shown when phase is undefined.
   *   spawning      -> starting
   *   running       -> running
   *   done          -> N tools, 8.4k tok
   *   failed        -> failed
   *   backgrounded  -> backgrounded
   */
  private formatPhaseChip(): string {
    const store = this.subagentStore;
    if (store.subagentPhase === undefined) return '';
    const dim = chalk.dim;
    const parts: string[] = [];
    switch (store.subagentPhase) {
      case 'spawning':
        parts.push('↻ starting…');
        break;
      case 'running': {
        parts.push('↻ running');
        const liveTokens = formatSubagentTokens(store.agentUsage);
        if (liveTokens !== undefined) parts.push(liveTokens);
        break;
      }
      case 'done': {
        parts.push(chalk.hex(this.colors.success)('✓ done'));
        const toolCount = store.finishedSubCalls.length + store.hiddenSubCallCount;
        if (toolCount > 0) parts.push(`${String(toolCount)} tool${toolCount > 1 ? 's' : ''}`);
        const tokens = formatSubagentTokens(store.agentUsage);
        if (tokens !== undefined) parts.push(tokens);
        break;
      }
      case 'failed':
        parts.push(chalk.hex(this.colors.error)('✗ failed'));
        break;
      case 'backgrounded':
        parts.push('◐ backgrounded');
        break;
    }
    return parts.length > 0 ? dim(` · ${parts.join(' · ')}`) : '';
  }

  private isSingleSubagentView(): boolean {
    return this.subagentStore.isSingleSubagentView(this.toolCall.name);
  }

  private getDerivedSubagentPhase():
    | 'spawning'
    | 'running'
    | 'done'
    | 'failed'
    | 'backgrounded'
    | undefined {
    return this.subagentStore.getDerivedPhase(this.result);
  }

  private buildSingleSubagentHeader(): string {
    const store = this.subagentStore;
    const phase = this.getDerivedSubagentPhase();
    const isFailed = phase === 'failed';
    const isDone = phase === 'done';
    const bullet = isFailed
      ? chalk.hex(this.colors.error)('✗ ')
      : isDone
        ? chalk.hex(this.colors.success)(STATUS_BULLET)
        : chalk.hex(this.colors.roleAssistant)(STATUS_BULLET);
    const labelText = formatSubagentLabel(store.agentName);
    const label = chalk.hex(this.colors.primary).bold(labelText);
    const status = this.formatSingleSubagentStatus(phase);
    const description = str(this.toolCall.args['description']);
    const descriptionPlain = description.length > 0 ? ` (${description})` : '';
    const descriptionText = descriptionPlain.length > 0 ? chalk.dim(descriptionPlain) : '';
    const statsText = this.formatSingleSubagentStatsText();
    if (isDone) {
      const success = chalk.hex(this.colors.success);
      return `${bullet}${success.bold(labelText)} ${success(`Completed${descriptionPlain}${statsText}`)}`;
    }
    const stats = chalk.dim(statsText);
    // Show hint only while running/spawning (not failed/backgrounded)
    const hint =
      phase === 'running' || phase === 'spawning' ? chalk.dim(' · /agent to inspect') : '';
    return `${bullet}${label} ${status}${descriptionText}${stats}${hint}`;
  }

  private formatSingleSubagentStatus(
    phase: 'spawning' | 'running' | 'done' | 'failed' | 'backgrounded' | undefined,
  ): string {
    switch (phase) {
      case 'done':
        return chalk.hex(this.colors.success)('Completed');
      case 'failed':
        return chalk.hex(this.colors.error)('Failed');
      case 'running':
        return chalk.hex(this.colors.primary)('Running');
      case 'backgrounded':
        return 'Backgrounded';
      case 'spawning':
      case undefined:
        return chalk.hex(this.colors.primary)('Starting');
    }
  }

  private formatSingleSubagentStatsText(): string {
    const store = this.subagentStore;
    const parts = [
      `${String(store.subToolActivities.size)} tool${store.subToolActivities.size === 1 ? '' : 's'}`,
    ];
    const elapsed = store.getElapsedSeconds();
    if (elapsed !== undefined) parts.push(formatElapsed(elapsed));
    return ` · ${parts.join(' · ')}`;
  }

  private buildSingleSubagentBlock(): void {
    const store = this.subagentStore;
    for (const activity of store.getRecentSubToolActivities()) {
      const mark =
        activity.phase === 'failed'
          ? chalk.hex(this.colors.error)('✗')
          : activity.phase === 'done'
            ? chalk.hex(this.colors.success)('•')
            : chalk.hex(this.colors.text)('•');
      const verb = activity.phase === 'ongoing' ? 'Using' : 'Used';
      this.addChild(new Text(`  ${mark} ${this.formatSubToolActivity(verb, activity)}`, 0, 0));
    }

    if (store.getDerivedPhase(this.result) === 'failed' && store.subagentError !== undefined) {
      const errorLine = tailNonEmptyLines(store.subagentError, 1).at(-1);
      if (errorLine !== undefined) {
        this.addChild(
          new PrefixedWrappedLine(
            `  ${chalk.hex(this.colors.error)('└')} `,
            '    ',
            chalk.hex(this.colors.error)(errorLine),
          ),
        );
      }
      return;
    }

    const outputLine = tailNonEmptyLines(store.subagentText, 1).at(-1);
    const thinkingLine = tailNonEmptyLines(store.subagentThinkingText, 1).at(-1);
    if (store.getDerivedPhase(this.result) !== 'done' && thinkingLine !== undefined) {
      this.addChild(
        new PrefixedWrappedLine(`  ${chalk.dim('◌')} `, '    ', chalk.dim(thinkingLine)),
      );
    }
    if (outputLine !== undefined) {
      this.addChild(
        new PrefixedWrappedLine(
          `  ${chalk.hex(this.colors.text)('└')} `,
          '    ',
          chalk.hex(this.colors.text)(outputLine),
        ),
      );
    }
  }

  private formatSubToolActivity(verb: string, activity: SubToolActivity): string {
    const keyArg = extractKeyArgument(activity.name, activity.args, this.workspaceDir);
    const nameCol = chalk.hex(this.colors.primary)(activity.name);
    const argCol = keyArg ? chalk.dim(` (${keyArg})`) : '';
    return `${verb} ${nameCol}${argCol}`;
  }

  private buildCallPreview(): void {
    const name = this.toolCall.name;
    if (this.result === undefined && this.toolCall.truncated === true) {
      this.addChild(
        new Text(
          chalk.dim('Tool call arguments truncated by max_tokens — call never executed.'),
          2,
          0,
        ),
      );
      return;
    }
    if (this.result === undefined && this.toolCall.streamingArguments !== undefined) {
      this.buildStreamingPreview(this.toolCall.streamingArguments);
      return;
    }
    const shouldCap = this.result !== undefined && !this.expanded;
    if (name === 'Write') {
      const content = str(this.toolCall.args['content']);
      if (content.length === 0) return;
      const filePath = str(this.toolCall.args['file_path'] ?? this.toolCall.args['path']);
      const lang = langFromPath(filePath);
      const allLines = highlightLines(content, lang);
      // Cap as soon as args finalize, not just when result lands. Otherwise the
      // brief render tick between finalized args and result draws the full file,
      // and the snap back to the collapsed cap triggers pi-tui's full-redraw
      // path which wipes the terminal scrollback (pre-TUI history).
      const writeShouldCap = !this.expanded;
      const shown = writeShouldCap ? allLines.slice(0, COMMAND_PREVIEW_LINES) : allLines;
      const remaining = allLines.length - shown.length;
      for (const [i, line] of shown.entries()) {
        const lineNum = chalk.dim(String(i + 1).padStart(4) + '  ');
        this.addChild(new Text(lineNum + line, 2, 0));
      }
      if (writeShouldCap && remaining > 0) {
        this.addChild(
          new Text(
            chalk.dim(
              `... (${String(remaining)} more lines, ${String(allLines.length)} total, ctrl+o to expand)`,
            ),
            2,
            0,
          ),
        );
      }
    } else if (name === 'Edit') {
      const oldStr = str(this.toolCall.args['old_string']);
      const newStr = str(this.toolCall.args['new_string']);
      if (oldStr.length === 0 && newStr.length === 0) return;
      const filePath = str(this.toolCall.args['file_path'] ?? this.toolCall.args['path']);
      const lines = renderDiffLinesClustered(oldStr, newStr, filePath, this.colors, {
        contextLines: 3,
        ...(shouldCap ? { maxLines: COMMAND_PREVIEW_LINES } : {}),
      });
      for (const line of lines) {
        this.addChild(new Text(line, 2, 0));
      }
    }
  }

  /**
   * Live-rendering during the `tool.call.delta` streaming window.
   *
   * For tools we recognise, we reach into the partial JSON (via
   * `extractPartialStringField`) and render a stable high-signal
   * preview: Write's `content` as highlighted code, Edit's argument
   * receive progress, Bash's `$ command`, etc. While args are still
   * streaming we render from a bounded preview buffer; once the result lands,
   * the preview snaps to the collapsed cap unless the user has expanded.
   */
  private buildStreamingPreview(streamText: string): void {
    const name = this.toolCall.name;
    const previewText = streamText.slice(0, STREAMING_ARGS_PREVIEW_MAX_CHARS);
    if (name === 'Write') {
      const content = extractPartialStringField(previewText, 'content');
      if (content === undefined || content.length === 0) return;
      const filePath =
        extractPartialStringField(previewText, 'file_path') ??
        extractPartialStringField(previewText, 'path') ??
        '';
      const lang = langFromPath(filePath);
      const allLines = highlightLines(content, lang);
      const maxLines = COMMAND_PREVIEW_LINES;
      const scrollLines =
        allLines.length > maxLines ? allLines.slice(allLines.length - maxLines) : allLines;
      for (const [i, line] of scrollLines.entries()) {
        const originalLineNumber = allLines.length > maxLines ? allLines.length - maxLines + i : i;
        const lineNum = chalk.dim(String(originalLineNumber + 1).padStart(4) + '  ');
        this.addChild(new Text(lineNum + line, 2, 0));
      }
      return;
    }
    if (name === 'Edit') {
      const filePath =
        extractPartialStringField(previewText, 'file_path') ??
        extractPartialStringField(previewText, 'path') ??
        '';
      const bytes = Buffer.byteLength(previewText, 'utf8');
      const startedAtMs = this.toolCall.streamingStartedAtMs;
      const elapsedSeconds =
        startedAtMs === undefined ? 0 : Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
      const target = filePath.length > 0 ? ` for ${filePath}` : '';
      const progress = `Preparing changes${target}... ${formatBytes(bytes)} · ${formatElapsed(
        elapsedSeconds,
      )} elapsed`;
      this.addChild(new Text(chalk.dim(progress), 2, 0));
      return;
    }
    if (name === 'Bash') {
      const cmd = extractPartialStringField(previewText, 'command');
      if (cmd === undefined || cmd.length === 0) return;
      this.addChild(
        new ShellExecutionComponent({
          command: cmd,
          colors: this.colors,
          showCommand: true,
          commandPreviewLines: COMMAND_PREVIEW_LINES,
        }),
      );
    }
    // Unknown tools: nothing sensible to stream without a schema, so
    // leave the body blank and let the header do the talking.
  }

  private buildContent(): void {
    const { result } = this;
    if (result === undefined || !result.output) return;

    // Blocked tools: the body is the LLM-facing rejection message, which is
    // not useful for the user who made the decision.
    if (result.blockedReason !== undefined) return;

    if (this.isSingleSubagentView()) {
      return;
    }

    // Outputs that start with a `<system…>` tag are harness-injected
    // reminders piggy-backing on a tool result. They are noise for the
    // user, so suppress the body while keeping the header chip intact.
    if (result.output.trimStart().startsWith('<system')) {
      return;
    }

    // TodoList: the authoritative list is shown in the dedicated
    // TodoPanel before the input area, so repeating the text dump here is
    // pure clutter. Keep the headline, drop the body.
    if (this.toolCall.name === 'TodoList' && !result.is_error) {
      return;
    }

    if (
      this.toolCall.name === 'AskUserQuestion' &&
      !result.is_error &&
      this.renderAskUserQuestionResult(result.output)
    ) {
      return;
    }

    const renderer = pickResultRenderer(this.toolCall.name);
    const components = renderer(this.toolCall, result, {
      expanded: this.expanded,
      colors: this.colors,
    });
    for (const component of components) {
      this.addChild(component);
    }
  }

  /**
   * Render AskUserQuestion's JSON payload as a friendly Q/A list.
   * Returns true on success (caller skips the default JSON dump);
   * false on parse failure (caller falls back to raw display).
   */
  private renderAskUserQuestionResult(output: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(output);
    } catch {
      return false;
    }
    if (typeof parsed !== 'object' || parsed === null) return false;

    const colors = this.colors;
    const dim = chalk.dim;
    const accent = chalk.hex(colors.primary);

    const answers = (parsed as { answers?: unknown }).answers;
    const note = (parsed as { note?: unknown }).note;

    const hasAnswers =
      typeof answers === 'object' && answers !== null && Object.keys(answers).length > 0;

    if (!hasAnswers) {
      const noteText =
        typeof note === 'string' && note.length > 0 ? note : 'User dismissed the question.';
      this.addChild(new Text(dim(`  ${noteText}`), 0, 0));
      return true;
    }

    for (const [question, answer] of Object.entries(answers as Record<string, unknown>)) {
      const answerText = typeof answer === 'string' ? answer : JSON.stringify(answer);
      this.addChild(new Text(`  ${dim('Q')}  ${question}`, 0, 0));
      this.addChild(new Text(`  ${accent('→')}  ${answerText}`, 0, 0));
    }
    return true;
  }
}

// Re-export types and values that moved to SubagentActivityStore so consumers
// importing from './tool-call' do not need to update import paths.
export type {
  ToolCallSubagentSnapshot,
  SubagentActivityLine,
  SubagentActivityDetail,
} from './subagent-activity-store';
export { formatSubagentTokens } from './subagent-activity-store';
