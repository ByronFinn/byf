/**
 * SubagentsListApp — full-screen list of foreground sub-agents.
 *
 * Three-pane layout (matching /tasks):
 *   Left: scrollable sub-agent list
 *   Right top: selected sub-agent detail
 *   Right bottom: selected sub-agent output preview
 *
 * Falls back to single-pane list on narrow terminals (< 80 cols).
 */

import { Container, Key, matchesKey, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { Focusable, Terminal } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import { printableChar } from '#/tui/utils/printable-key';
import { formatElapsed } from '#/utils/format';

// ── Layout constants (matching TasksBrowserApp) ──────────────────────

const MIN_WIDTH = 48;
const MIN_HEIGHT = 10;
const LIST_COL_MIN = 28;
const LIST_COL_MAX = 44;
const LIST_COL_RATIO = 0.32;

// ── Types ───────────────────────────────────────────────────────────

export type SubagentsFilter = 'all' | 'active';

export interface SubagentListEntry {
  readonly toolCallId: string;
  readonly agentName: string | undefined;
  readonly description: string;
  readonly phase: 'spawning' | 'running' | 'done' | 'failed' | 'backgrounded' | undefined;
  readonly toolCount: number;
  readonly tokens: number;
  readonly elapsedSeconds: number | undefined;
}

export interface SubagentDetailPane {
  readonly latestActivity: string | undefined;
  readonly toolList: readonly string[];
  readonly errorText: string | undefined;
}

export interface SubagentPreviewPane {
  readonly lines: readonly string[];
  readonly resultSummary: string | undefined;
  readonly toolOutputs: readonly string[];
  /** Pre-rendered activity lines (ongoing + done) for real-time stream output. */
  readonly activityLines?: readonly string[];
}

export interface SubagentsListProps {
  readonly entries: readonly SubagentListEntry[];
  readonly filter: SubagentsFilter;
  readonly colors: ColorPalette;
  readonly onClose: () => void;
  readonly onSelect?: (toolCallId: string) => void;
  readonly onSelectionChange?: (index: number) => void;
  readonly onToggleFilter?: () => void;
  readonly selectedDetail?: SubagentDetailPane;
  readonly selectedPreview?: SubagentPreviewPane;
}

// ── Component ───────────────────────────────────────────────────────

export class SubagentsListApp extends Container implements Focusable {
  focused = false;
  selectedIndex = 0;

  constructor(
    private props: SubagentsListProps,
    private readonly terminal: Terminal,
  ) {
    super();
  }

  handleInput(data: string): void {
    const k = printableChar(data);

    if (matchesKey(data, Key.escape) || k === 'q') {
      this.props.onClose();
      return;
    }

    if (k === 'j' || matchesKey(data, Key.down)) {
      this.selectedIndex = Math.min(this.props.entries.length - 1, this.selectedIndex + 1);
      this.props.onSelectionChange?.(this.selectedIndex);
      this.invalidate();
      return;
    }

    if (k === 'k' || matchesKey(data, Key.up)) {
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
      this.props.onSelectionChange?.(this.selectedIndex);
      this.invalidate();
      return;
    }

    if (matchesKey(data, Key.tab) || k === '\t') {
      this.props.onToggleFilter?.();
      return;
    }

    // Enter — drill into live viewer (#150)
    if (matchesKey(data, Key.enter)) {
      const selected = this.props.entries[this.selectedIndex];
      if (selected !== undefined) {
        this.props.onSelect?.(selected.toolCallId);
      }
      return;
    }
  }

  /** Updates displayed entries (called by controller on each poll tick). */
  setProps(next: SubagentsListProps): void {
    this.props = next;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, next.entries.length - 1));
    this.invalidate();
  }

  /** Re-focus helper (called after viewer close). */
  refocus(): void {
    this.invalidate();
  }

  override render(width: number): string[] {
    const rows = Math.max(1, this.terminal.rows);
    if (width < MIN_WIDTH || rows < MIN_HEIGHT) {
      return this.renderTooSmall(width, rows);
    }

    const colors = this.props.colors;
    const entries =
      this.props.filter === 'all'
        ? this.props.entries
        : this.props.entries.filter((e) => e.phase === 'running' || e.phase === 'spawning');
    const header = this.renderHeader(width, colors, entries, this.props.filter);
    const footer = this.renderFooter(width, rows - 2, entries, this.props.filter);
    const bodyHeight = rows - 2;

    const listWidth = Math.max(
      LIST_COL_MIN,
      Math.min(LIST_COL_MAX, Math.floor(width * LIST_COL_RATIO)),
    );
    const rightWidth = width - listWidth - 1; // 1-char gap between frames

    const listFrame = this.renderListFrame(
      listWidth,
      bodyHeight,
      colors,
      entries,
      this.props.filter,
    );
    const rightFrame = this.renderRightStack(rightWidth, bodyHeight, colors);

    const out: string[] = [header];
    for (let i = 0; i < bodyHeight; i++) {
      const left = listFrame[i] ?? ' '.repeat(listWidth);
      const right = rightFrame[i] ?? ' '.repeat(rightWidth);
      out.push(left + ' ' + right);
    }
    out.push(footer);
    return out;
  }

  // ── Single-pane (narrow terminal) ─────────────────────────────────

  private renderTooSmall(width: number, rows: number): string[] {
    const msg = chalk.dim('Terminal too narrow for AGENTS view');
    const lines: string[] = [];
    for (let i = 0; i < rows; i++) lines.push('');
    if (rows > 2) lines[Math.floor(rows / 2)] = centerLine(msg, width);
    return lines;
  }

  // ── Three-pane: header ─────────────────────────────────────────

  private renderHeader(
    width: number,
    colors: ColorPalette,
    entries: readonly SubagentListEntry[],
    filter: SubagentsFilter,
  ): string {
    const title = chalk.hex(colors.primary).bold(' AGENTS ');
    const filterText = chalk.hex(colors.textMuted)(
      ` filter=${filter === 'all' ? 'ALL' : 'ACTIVE'} `,
    );
    const running = entries.filter((e) => e.phase === 'running' || e.phase === 'spawning').length;
    const done = entries.filter((e) => e.phase === 'done').length;
    const failed = entries.filter((e) => e.phase === 'failed').length;
    const parts: string[] = [];
    if (running > 0) parts.push(chalk.hex(colors.primary)(`${String(running)} running`));
    if (done > 0) parts.push(chalk.hex(colors.success)(`${String(done)} completed`));
    if (failed > 0) parts.push(chalk.hex(colors.error)(`${String(failed)} failed`));
    const counts = parts.length > 0 ? `  ${parts.join(', ')}` : '';
    const total = chalk.dim(` · ${String(entries.length)} total`);
    const composed = `${title}${filterText}${counts}${total}`;
    return padOrTruncate(composed, width);
  }

  // ── frame primitive (matching TasksBrowserApp) ──────────────────

  /**
   * Render a framed box: `┌─ Title ─┐` top, `│ <content> │` sides, `└─┘`
   * bottom. Result is exactly `width × height` cells. `content` is a
   * pre-rendered array of inner-width-sized lines; extra rows are padded.
   */
  private renderFrame(
    title: string,
    content: readonly string[],
    width: number,
    height: number,
  ): string[] {
    if (height < 2 || width < 4) {
      const out: string[] = [];
      for (let i = 0; i < height; i++) out.push(' '.repeat(width));
      return out;
    }
    const stroke = this.props.colors.primary;
    const innerWidth = width - 2;
    const innerHeight = height - 2;

    const titleStyled = chalk.hex(this.props.colors.textMuted).bold(title);
    // Compute dashes from the PLAIN title width, not ANSI-wrapped (visibleWidth
    // counts ANSI escape codes as visible characters, inflating the width).
    const plainSegment = `─ ${title} `;
    const plainSegmentWidth = plainSegment.length;
    const remainingDashes = Math.max(0, innerWidth - plainSegmentWidth);
    const topMid =
      title.length > 0 && plainSegmentWidth <= innerWidth
        ? `─ ${titleStyled} ${chalk.hex(stroke)('─'.repeat(remainingDashes))}`
        : chalk.hex(stroke)('─'.repeat(innerWidth));
    const top = chalk.hex(stroke)('┌') + topMid + chalk.hex(stroke)('┐');
    const bottom = chalk.hex(stroke)('└' + '─'.repeat(innerWidth) + '┘');

    const lines: string[] = [top];
    for (let i = 0; i < innerHeight; i++) {
      const inner = content[i] ?? '';
      lines.push(chalk.hex(stroke)('│') + fitExactly(inner, innerWidth) + chalk.hex(stroke)('│'));
    }
    lines.push(bottom);
    return lines;
  }

  // ── Left: list frame ────────────────────────────────────────────

  private renderListFrame(
    width: number,
    height: number,
    colors: ColorPalette,
    entries: readonly SubagentListEntry[],
    filter: SubagentsFilter,
  ): string[] {
    const innerHeight = Math.max(0, height - 2);

    if (entries.length === 0) {
      const empty = chalk.hex(colors.textMuted)(
        filter === 'active'
          ? 'No active sub-agents. Tab = show all.'
          : 'No sub-agents in this session.',
      );
      const lines: string[] = [empty];
      while (lines.length < innerHeight) lines.push('');
      return this.renderFrame('Agents', lines, width, height);
    }

    const maxDisplay = innerHeight;
    const start = Math.max(0, this.selectedIndex - maxDisplay + 1);
    const innerWidth = width - 2;
    const lines: string[] = [];
    const visible = entries.slice(start, start + maxDisplay);

    for (const entry of visible) {
      lines.push(
        this.renderListRow(
          entry,
          this.props.entries.indexOf(entry) === this.selectedIndex,
          innerWidth,
          colors,
        ),
      );
    }

    while (lines.length < innerHeight) lines.push('');
    return this.renderFrame('Agents', lines, width, height);
  }

  private renderListRow(
    entry: SubagentListEntry,
    selected: boolean,
    innerWidth: number,
    colors: ColorPalette,
  ): string {
    const dim = chalk.dim;
    const accent = chalk.hex(colors.primary);
    const success = chalk.hex(colors.success);
    const error = chalk.hex(colors.error);

    let bullet: string;
    // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- backgrounded/undefined phases render via the default bullet
    switch (entry.phase) {
      case 'running':
      case 'spawning':
        bullet = chalk.hex(colors.primary)('●');
        break;
      case 'done':
        bullet = success('✓');
        break;
      case 'failed':
        bullet = error('✗');
        break;
      default:
        bullet = dim('●');
    }

    const name = entry.agentName ?? 'Agent';
    const nameStr = accent(name);

    // Short description as differentiator (truncated to fit)
    const descStr =
      entry.description.length > 0
        ? dim(` ${truncateMid(entry.description, Math.max(4, innerWidth - name.length - 12))}`)
        : '';

    // Stats (compact)
    const statsParts: string[] = [];
    if (entry.toolCount > 0) statsParts.push(String(entry.toolCount));
    if (entry.tokens > 0) statsParts.push(formatTokens(entry.tokens));
    const stats = statsParts.length > 0 ? dim(` ${statsParts.join(' ')}`) : '';
    const pointer = selected ? '>' : ' ';
    return padOrTruncate(`${pointer} ${bullet} ${nameStr}${descStr}${stats}`, innerWidth);
  }

  // ── Right stack: detail + preview (matching TasksBrowserApp) ───

  private renderRightStack(width: number, height: number, colors: ColorPalette): string[] {
    // Detail gets ~8 rows (or 40% of body, whichever is larger). Preview
    // takes the rest. Both rendered as separate frames stacked vertically.
    const detailHeight = Math.max(8, Math.min(Math.floor(height * 0.4), height - 5));
    const previewHeight = height - detailHeight;
    return [
      ...this.renderDetailFrame(width, detailHeight, colors),
      ...this.renderPreviewFrame(width, previewHeight, colors),
    ];
  }

  private renderDetailFrame(width: number, height: number, colors: ColorPalette): string[] {
    const innerHeight = Math.max(0, height - 2);
    const dim = chalk.dim;
    const accent = chalk.hex(colors.primary);
    const success = chalk.hex(colors.success);
    const error = chalk.hex(colors.error);

    const entry = this.props.entries[this.selectedIndex];
    if (entry === undefined) {
      const empty = chalk.hex(colors.textMuted)('Select a sub-agent from the list.');
      const lines: string[] = [empty];
      while (lines.length < innerHeight) lines.push('');
      return this.renderFrame('Detail', lines, width, height);
    }

    const d = this.props.selectedDetail;
    const lines: string[] = [];

    // Agent metadata as label:value pairs (matching TasksBrowserApp style)
    const label = (text: string): string => chalk.hex(colors.textMuted)(text.padEnd(14));

    // Agent ID (truncated for display)
    const idShort =
      entry.toolCallId.length > 20 ? entry.toolCallId.slice(0, 17) + '…' : entry.toolCallId;
    lines.push(`${label('Agent ID:')}${accent(idShort)}`);

    // Agent type
    const typeVal = entry.agentName ?? 'Agent';
    lines.push(`${label('Type:')}${accent(typeVal)}`);

    // Phase/status
    const phaseStr = this.phaseLabel(entry.phase, colors, success, error, accent);
    lines.push(`${label('Status:')}${phaseStr}`);

    // Description (full, not truncated)
    if (entry.description.length > 0) {
      lines.push(`${label('Description:')}${chalk.hex(colors.text)(entry.description)}`);
    }

    // Elapsed time
    if (entry.elapsedSeconds !== undefined) {
      lines.push(`${label('Elapsed:')}${dim(formatElapsed(entry.elapsedSeconds))}`);
    }

    // Tool count breakdown
    let toolStr = `${String(entry.toolCount)} tool${entry.toolCount === 1 ? '' : 's'}`;
    if (d !== undefined && d.toolList.length > 0) {
      const doneTools = d.toolList.filter((t) => t.startsWith('•')).length;
      const ongoingTools = d.toolList.filter((t) => t.startsWith('…')).length;
      const failedTools = d.toolList.filter((t) => t.startsWith('✗')).length;
      if (doneTools > 0) toolStr += `, ${String(doneTools)} done`;
      if (ongoingTools > 0) toolStr += `, ${String(ongoingTools)} active`;
      if (failedTools > 0) toolStr += `, ${String(failedTools)} failed`;
    }
    lines.push(`${label('Tools:')}${dim(toolStr)}`);

    // Tokens
    if (entry.tokens > 0) {
      lines.push(`${label('Tokens:')}${dim(formatTokens(entry.tokens))}`);
    }

    // Latest activity (running/spawning) or error (failed)
    if (d !== undefined) {
      if (entry.phase === 'failed' && d.errorText !== undefined) {
        const errLine = d.errorText.split('\n')[0] ?? '';
        lines.push(`${label('Error:')}${error(errLine)}`);
      } else if (
        (entry.phase === 'running' || entry.phase === 'spawning') &&
        d.latestActivity !== undefined
      ) {
        lines.push(`${label('Activity:')}${dim(d.latestActivity)}`);
      }
    }

    while (lines.length < innerHeight) lines.push('');
    return this.renderFrame('Detail', lines, width, height);
  }

  private phaseLabel(
    phase: SubagentListEntry['phase'],
    colors: ColorPalette,
    success: (s: string) => string,
    error: (s: string) => string,
    accent: (s: string) => string,
  ): string {
    // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- undefined phase renders via default label
    switch (phase) {
      case 'done':
        return success('✓ Completed');
      case 'failed':
        return error('✗ Failed');
      case 'running':
        return accent('● Running');
      case 'spawning':
        return accent('● Starting');
      case 'backgrounded':
        return chalk.dim('◐ Backgrounded');
      default:
        return chalk.dim('—');
    }
  }

  private renderPreviewFrame(width: number, height: number, colors: ColorPalette): string[] {
    const dim = chalk.dim;
    const innerHeight = Math.max(0, height - 2);

    const entry = this.props.entries[this.selectedIndex];
    if (entry === undefined) {
      const lines: string[] = [chalk.hex(colors.textMuted)('No sub-agent selected.')];
      while (lines.length < innerHeight) lines.push('');
      return this.renderFrame('Output', lines, width, height);
    }

    const preview = this.props.selectedPreview;
    const lines: string[] = [];

    // Real-time activity stream — show latest (tail-follow), not oldest
    if (
      preview !== undefined &&
      preview.activityLines !== undefined &&
      preview.activityLines.length > 0
    ) {
      for (const line of preview.activityLines.slice(-innerHeight)) {
        lines.push(dim(line));
      }
      if (
        lines.length < innerHeight &&
        preview.resultSummary !== undefined &&
        preview.resultSummary.length > 0
      ) {
        lines.push('');
      }
    }

    // Result summary (most factual)
    if (
      preview !== undefined &&
      preview.resultSummary !== undefined &&
      preview.resultSummary.length > 0
    ) {
      for (const line of preview.resultSummary.split('\n').slice(0, innerHeight - lines.length)) {
        lines.push(chalk.hex(colors.text)(line));
      }
      if (lines.length < innerHeight && preview.toolOutputs.length > 0) {
        lines.push('');
      }
    }

    // Tool outputs (factual results from each tool).
    // Each output string may contain embedded newlines (controller joins
    // up to 3 lines with \n).  Split them so every visual line stays
    // inside the frame — a single logical entry with \n would otherwise
    // bleed across the border and corrupt the layout.
    if (preview !== undefined && preview.toolOutputs.length > 0) {
      for (const output of preview.toolOutputs) {
        for (const sub of output.split('\n')) {
          if (lines.length >= innerHeight) break;
          lines.push(dim(sub));
        }
        if (lines.length >= innerHeight) break;
      }
    }

    // Agent text output (fallback) — show latest lines
    if (lines.length === 0 && preview !== undefined && preview.lines.length > 0) {
      for (const line of preview.lines.slice(-innerHeight)) {
        lines.push(dim(line));
      }
    }

    if (lines.length === 0) {
      lines.push(
        chalk.hex(colors.textMuted)(
          entry.phase === 'running' ? 'Waiting for output…' : 'No output.',
        ),
      );
    }

    while (lines.length < innerHeight) lines.push('');
    return this.renderFrame('Output', lines, width, height);
  }

  private renderFooter(
    width: number,
    _bodyHeight: number,
    entries: readonly SubagentListEntry[],
  ): string {
    const dim = chalk.dim;
    const key = (text: string): string => chalk.hex(this.props.colors.primary).bold(text);

    const total = entries.length;
    const sel = this.selectedIndex + 1;
    const position = total > 0 ? dim(` ${String(sel)}-${String(total)}`) : dim(' 0-0');

    const keys =
      `${key('↑↓/jk')} ${dim('select')}  ${key('Tab')} ${dim('filter')}  ${key('Q/Esc')} ${dim('back')}` +
      (total > 0 ? `  ${key('Enter')} ${dim('inspect')}` : '');

    const left = ` ${keys}`;
    const leftW = visibleWidth(left);
    const rightW = visibleWidth(position);
    if (leftW + 2 + rightW <= width) {
      return left + ' '.repeat(width - leftW - rightW) + position;
    }
    return padOrTruncate(left, width);
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Ensure `line` is exactly `width` visible cells wide.
 * Truncates with ellipsis when too long; pads with spaces when too short.
 * ANSI escape sequences are ignored when measuring width.
 */
function fitExactly(line: string, width: number): string {
  return truncateToWidth(line, width, '…', true);
}

function padOrTruncate(text: string, width: number): string {
  return fitExactly(text, width);
}

function centerLine(text: string, width: number): string {
  const w = visibleWidth(text);
  const pad = Math.max(0, Math.floor((width - w) / 2));
  return ' '.repeat(pad) + text;
}

function truncateMid(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 3)) + '...';
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tok`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k tok`;
  return `${String(n)} tok`;
}
