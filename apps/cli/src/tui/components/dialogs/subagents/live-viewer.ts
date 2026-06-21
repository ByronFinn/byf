/**
 * SubagentLiveViewer — full-screen real-time viewer of a foreground sub-agent's
 * tool-activity trail.
 *
 * Based on TaskOutputViewer skeleton, aligned with approval-fullscreen-viewer
 * props pattern. Subscribes to ToolCallComponent.setSnapshotListener for live
 * updates; follow-tail when user is parked at the bottom.
 */

import { Container, Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import type { Focusable, Terminal } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import { printableChar } from '#/tui/utils/printable-key';
import { formatElapsed } from '#/utils/format';
import { sanitizeForDisplay } from '#/tui/utils/sanitize-text';
import type { SubagentActivityDetail } from '#/tui/components/messages/tool-call';

export interface SubagentLiveViewerProps {
  readonly data: SubagentActivityDetail;
  readonly colors: ColorPalette;
  readonly onClose: () => void;
}

export class SubagentLiveViewer extends Container implements Focusable {
  focused = false;
  private scrollTop = 0;
  private showThinking = false;
  private props: SubagentLiveViewerProps;
  private readonly terminal: Terminal;
  /** Pre-rendered logical lines (cached on each setProps). */
  private lines: string[] = [];
  /**
   * Body width from the last `render()` call. Used to compute visual-line
   * count (after soft-wrapping) for scroll math in `setProps`, which runs
   * without a width. Updated on every render; defaulted in the constructor.
   */
  private lastBodyWidth = 80;
  /**
   * Memoized {@link buildVisualLines} result keyed by (width, lines identity).
   * `buildVisualLines` is O(n×width) (ANSI parse + truncate per line) and is
   * called from renderBody, renderFooter, and maxScroll — up to 3× per render
   * and via setProps during streaming. The cache invalidates whenever the
   * logical lines array is rebuilt (setProps/renderLines/toggle) or the width
   * changes.
   */
  private visualLinesCache: { width: number; linesRef: string[]; result: string[] } | undefined;

  constructor(props: SubagentLiveViewerProps, terminal: Terminal) {
    super();
    this.props = props;
    this.terminal = terminal;
    this.lastBodyWidth = Math.max(1, terminal.columns ?? 80);
    this.lines = this.renderLines(props.data);
  }

  handleInput(data: string): void {
    const currentLines = this.lines;
    if (currentLines.length === 0) return;

    const k = printableChar(data);
    const viewH = this.viewableRows();

    if (matchesKey(data, Key.escape) || k === 'q') {
      this.props.onClose();
      return;
    }

    if (k === 't') {
      this.showThinking = !this.showThinking;
      this.lines = this.renderLines(this.props.data);
      this.invalidate();
      return;
    }

    if (k === 'j' || matchesKey(data, Key.down)) {
      this.scrollBy(1);
      return;
    }

    if (k === 'k' || matchesKey(data, Key.up)) {
      this.scrollBy(-1);
      return;
    }

    if (matchesKey(data, Key.pageUp) || k === ' ' || data === '\u0002' /* C-b */) {
      this.scrollBy(-Math.max(1, viewH - 1));
      return;
    }

    if (matchesKey(data, Key.pageDown) || data === '\u0006' /* C-f */) {
      this.scrollBy(Math.max(1, viewH - 1));
      return;
    }

    if (matchesKey(data, Key.home) || k === 'g') {
      this.scrollTo(0);
      return;
    }

    if (matchesKey(data, Key.end) || k === 'G') {
      this.scrollTo(this.maxScroll());
      return;
    }
  }

  setProps(next: SubagentLiveViewerProps): void {
    const wasAtBottom = this.scrollTop >= this.maxScroll();
    this.props = next;
    this.lines = this.renderLines(next.data);
    // Follow tail only if user was at bottom
    if (wasAtBottom) this.scrollTop = this.maxScroll();
    else this.scrollTop = Math.min(this.scrollTop, this.maxScroll());
    this.invalidate();
  }

  // ── render ────────────────────────────────────────────────────────

  override render(width: number): string[] {
    const rows = this.terminal.rows;
    const bodyHeight = rows - 2; // header + footer

    const header = this.renderHeader(width);
    const body = this.renderBody(width, bodyHeight);
    const footer = this.renderFooter(width, bodyHeight);

    return [header, ...body, footer];
  }
  private renderHeader(width: number): string {
    const d = this.props.data;
    const colors = this.props.colors;
    const accent = chalk.hex(colors.primary);
    const dim = chalk.dim;

    const agentName = d.agentName ?? 'Agent';
    const title = accent.bold(` ${agentName} `);
    const phase = this.formatPhaseTag(d.phase, colors);
    const stats = dim(` · ${String(d.toolCount)} tool${d.toolCount === 1 ? '' : 's'} · ${formatTokens(d.tokens)}`);
    const elapsed = d.elapsedSeconds !== undefined ? dim(` · ${formatElapsed(d.elapsedSeconds)}`) : '';
    const thinkingHint = d.thinkingText.length > 0
      ? dim(this.showThinking ? ' · thinking: ON' : ' · thinking: OFF')
      : '';
    return truncateToWidth(`${title}${phase}${stats}${elapsed}${thinkingHint}`, width, '…', true);
  }

  private renderBody(width: number, bodyHeight: number): string[] {
    this.lastBodyWidth = width;
    const visualLines = this.buildVisualLines(width);
    const max = Math.max(0, visualLines.length - bodyHeight);
    if (this.scrollTop > max) this.scrollTop = max;
    if (this.scrollTop < 0) this.scrollTop = 0;

    const viewH = bodyHeight;
    const out: string[] = [];
    for (let i = 0; i < viewH; i++) {
      const lineIndex = this.scrollTop + i;
      out.push(visualLines[lineIndex] ?? truncateToWidth('', width, '', true));
    }
    return out;
  }

  private renderFooter(width: number, bodyHeight: number): string {
    const colors = this.props.colors;
    const dim = chalk.dim;
    const key = (text: string): string => chalk.hex(colors.primary).bold(text);

    const total = this.buildVisualLines(width).length;
    const viewH = bodyHeight;
    const max = Math.max(0, total - viewH);
    const percent = max === 0 ? 100 : Math.round((this.scrollTop / max) * 100);
    const lineFrom = this.scrollTop + 1;
    const lineTo = Math.min(total, this.scrollTop + viewH);

    const position = dim(` ${String(lineFrom)}-${String(lineTo)} / ${String(total)} (${String(percent)}%) `);
    let keys =
      `${key('↑↓/jk')} ${dim('line')}  ` +
      `${key('PgUp/PgDn')} ${dim('page')}  ` +
      `${key('g/G')} ${dim('top/bot')}`;

    // Show t hint only when thinking text exists
    const hasThinking = this.props.data.thinkingText.length > 0;
    if (hasThinking) {
      keys += `  ${key('t')} ${dim('thinking')}`;
    }

    keys += `  ${key('Q/Esc')} ${dim('back')}`;

    const left = ` ${keys}`;
    const leftW = visibleWidth(left);
    const rightW = visibleWidth(position);
    if (leftW + 2 + rightW <= width) {
      return left + ' '.repeat(width - leftW - rightW) + position;
    }
    return truncateToWidth(left, width, '…', true);
  }

  // ── line building ─────────────────────────────────────────────────

  private renderLines(data: SubagentActivityDetail): string[] {
    const lines: string[] = [];
    const colors = this.props.colors;
    const dim = chalk.dim;
    const success = chalk.hex(colors.success);
    const error = chalk.hex(colors.error);
    const accent = chalk.hex(colors.primary);

    // ── Phase header ────────────────────────────────────────────────
    const phaseLine = dim('─'.repeat(4)) + ` ${this.formatPhaseTag(data.phase, colors)} ` + dim('─'.repeat(40));
    lines.push(phaseLine);

    // ── Tool activities (ordered) ───────────────────────────────────
    for (const act of data.activities) {
      const bullet =
        act.phase === 'failed' ? error('✗')
        : act.phase === 'done' ? success('•')
        : dim('…');
      const verb = act.phase === 'ongoing' ? 'Using' : 'Used';
      const keyArg = toolKeyArg(act.name, act.args);
      const nameStr = accent(act.name);
      const argStr = keyArg ? dim(` (${keyArg})`) : '';
      lines.push(`  ${bullet} ${dim(verb)} ${nameStr}${argStr}`);

      // Tool output (indented)
      if (act.output !== undefined && act.output.length > 0) {
        const outputLines = sanitizeForDisplay(act.output).split('\n');
        for (const outLine of outputLines.slice(0, 20)) {
          lines.push(`    ${dim(outLine)}`);
        }
        if (outputLines.length > 20) {
          lines.push(`    ${dim('... (output truncated)')}`);
        }
      }
    }

    // ── Spacer ─────────────────────────────────────────────────────
    if (data.activities.length > 0) lines.push('');

    // ── Thinking text (conditional) ─────────────────────────────────
    if (this.showThinking && data.thinkingText.length > 0) {
      lines.push(dim('─ Thinking ──────────────────────────────────────'));
      for (const textLine of sanitizeForDisplay(data.thinkingText).split('\n')) {
        lines.push(`  ${dim(textLine)}`);
      }
      lines.push('');
    }

    // ── Subagent text output ────────────────────────────────────────
    if (data.text.length > 0) {
      lines.push(dim('─ Output ───────────────────────────────────────'));
      for (const textLine of sanitizeForDisplay(data.text).split('\n')) {
        lines.push(`  ${textLine}`);
      }
    }

    // ── Result summary ──────────────────────────────────────────────
    if (data.resultSummary !== undefined) {
      lines.push('');
      lines.push(dim('Result:'));
      for (const line of sanitizeForDisplay(data.resultSummary).split('\n')) {
        lines.push(`  ${dim(line)}`);
      }
    }

    // ── Error text ──────────────────────────────────────────────────
    if (data.phase === 'failed' && data.errorText !== undefined) {
      lines.push('');
      lines.push(error('Error:'));
      for (const line of sanitizeForDisplay(data.errorText).split('\n')) {
        lines.push(`  ${error(line)}`);
      }
    }

    return lines;
  }

  private formatPhaseTag(
    phase: SubagentActivityDetail['phase'],
    colors: ColorPalette,
  ): string {
    // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- backgrounded/undefined phases render as idle via default
    switch (phase) {
      case 'done':
        return chalk.hex(colors.success)('✓ Completed');
      case 'failed':
        return chalk.hex(colors.error)('✗ Failed');
      case 'running':
      case 'spawning':
        return chalk.hex(colors.primary)('● Running');
      default:
        return chalk.dim('● idle');
    }
  }

  // ── scrolling helpers ─────────────────────────────────────────────

  private scrollBy(delta: number): void {
    this.scrollTo(this.scrollTop + delta);
  }

  private scrollTo(target: number): void {
    this.scrollTop = Math.max(0, Math.min(target, this.maxScroll()));
    this.invalidate();
  }

  /**
   * Number of scrollable rows below the top. Based on visual (soft-wrapped)
   * line count at the last known body width, so long streamed lines that wrap
   * across several rows are counted correctly.
   */
  private maxScroll(): number {
    return Math.max(0, this.buildVisualLines(this.lastBodyWidth).length - this.viewableRows());
  }

  private viewableRows(): number {
    return Math.max(1, this.terminal.rows - 2); // header + footer
  }

  /**
   * Expand cached logical lines into visual lines, soft-wrapping each to the
   * body width. Each visual line is padded exactly to `width` so colored text
   * never breaks alignment.
   *
   * Without this step, long lines were hard-truncated by `truncateToWidth`
   * (ellipsis) and, combined with raw control characters in streamed text,
   * produced the "one character per line" garble.
   *
   * Memoized on (width, lines identity) — see {@link visualLinesCache}.
   */
  private buildVisualLines(width: number): string[] {
    const cache = this.visualLinesCache;
    if (cache !== undefined && cache.width === width && cache.linesRef === this.lines) {
      return cache.result;
    }
    const out: string[] = [];
    for (const raw of this.lines) {
      for (const w of wrapTextWithAnsi(raw, width)) {
        out.push(truncateToWidth(w, width, '', true));
      }
    }
    this.visualLinesCache = { width, linesRef: this.lines, result: out };
    return out;
  }
}

// ── Shared helpers ───────────────────────────────────────────────────

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M tok`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k tok`;
  return `${String(n)} tok`;
}

/** Inline key-arg extraction for live viewer display. */
function toolKeyArg(name: string, args: Record<string, unknown>): string | undefined {
  const keyMap: Record<string, string[]> = {
    Bash: ['command'],
    Read: ['path', 'file_path'],
    Write: ['path', 'file_path'],
    Edit: ['path', 'file_path'],
    Grep: ['pattern'],
    Glob: ['pattern'],
    WebSearch: ['query'],
    Agent: ['description', 'prompt'],
  };
  const candidates = keyMap[name] ?? Object.keys(args);
  for (const key of candidates) {
    const val = args[key];
    if (typeof val === 'string' && val.length > 0) {
      // Sanitize: tool args (Bash command, Edit path, …) are external streamed
      // content and can carry C0 control chars that corrupt the layout. Mirrors
      // controller.ts `previewKeyArg`.
      const firstLine = sanitizeForDisplay(val).split('\n')[0] ?? val;
      return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine;
    }
  }
  return undefined;
}
