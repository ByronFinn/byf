/**
 * BtwViewer — full-screen overlay for a `/btw` side query.
 *
 * Shows the user's question (static) and the streamed answer side-by-side,
 * following the same Container + Focusable skeleton as TaskOutputViewer /
 * SubagentLiveViewer. The answer arrives incrementally via `setProps`
 * (driven by `btw.delta` events); closing the overlay aborts the in-flight
 * side query. The exchange never touches the main transcript.
 */

import {
  Container,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import type { Focusable, Terminal } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import { printableChar } from '#/tui/utils/printable-key';
import { sanitizeForDisplay } from '#/tui/utils/sanitize-text';

export interface BtwViewerProps {
  readonly query: string;
  /** Answer text accumulated so far. Empty while the side query is streaming. */
  readonly answer: string;
  /** Terminal lifecycle: streaming | completed | failed. */
  readonly status: 'streaming' | 'completed' | 'failed';
  /** Optional token usage shown when the query completes. */
  readonly usage?:
    | {
        readonly inputCacheRead: number;
        readonly inputCacheCreation: number;
        readonly inputOther: number;
        readonly output: number;
      }
    | undefined;
  /** Optional error message shown when the query failed. */
  readonly error?: string | undefined;
  /**
   * Maximum height in rows the overlay is allowed to occupy. The component uses
   * this to size itself so the bottom border is not clipped by the overlay
   * manager.
   */
  readonly maxHeight?: number | undefined;
  readonly colors: ColorPalette;
  readonly onClose: () => void;
}

const ELLIPSIS = '…';

/** Fixed rows consumed by top bar, title, blank divider, bottom bar and footer. */
const FIXED_OVERHEAD = 5;

export class BtwViewer extends Container implements Focusable {
  focused = false;

  private props: BtwViewerProps;
  private readonly terminal: Terminal;
  private scrollTop = 0;
  /** Pre-rendered logical lines (cached on each setProps). */
  private lines: string[] = [];
  /** Last inner width used to compute visual lines. */
  private lastInnerWidth = 80;
  /** Pre-wrapped visual lines (recomputed when width changes). */
  private visualLines: string[] = [];

  constructor(props: BtwViewerProps, terminal: Terminal) {
    super();
    this.props = props;
    this.terminal = terminal;
    this.lines = this.buildLines(props);
    this.visualLines = this.buildVisualLines(this.lines, this.lastInnerWidth);
  }

  setProps(next: BtwViewerProps): void {
    const wasAtBottom = this.scrollTop >= this.maxScroll();
    const answerChanged = next.answer !== this.props.answer || next.status !== this.props.status;
    this.props = next;
    if (answerChanged) {
      this.lines = this.buildLines(next);
      this.visualLines = this.buildVisualLines(this.lines, this.lastInnerWidth);
      if (wasAtBottom) this.scrollTop = this.maxScroll();
      else this.scrollTop = Math.min(this.scrollTop, this.maxScroll());
    }
    this.invalidate();
  }

  /** The question this viewer was opened for. */
  get query(): string {
    return this.props.query;
  }

  private buildLines(props: BtwViewerProps): string[] {
    const answer = props.answer.length > 0 ? sanitizeForDisplay(props.answer) : '';
    const lines = [
      `Q: ${sanitizeForDisplay(props.query)}`,
      '',
      ...(answer.length > 0 ? [`A: ${answer}`] : props.status === 'streaming' ? ['A: …'] : []),
    ];
    if (props.status === 'completed' && props.usage !== undefined) {
      const total =
        props.usage.inputCacheRead +
        props.usage.inputCacheCreation +
        props.usage.inputOther +
        props.usage.output;
      lines.push(
        '',
        `tokens: ${String(total)} (in-cache ${String(props.usage.inputCacheRead)} / create ${String(props.usage.inputCacheCreation)} / other ${String(props.usage.inputOther)} / out ${String(props.usage.output)})`,
      );
    }
    if (props.status === 'failed' && props.error !== undefined && props.error.length > 0) {
      lines.push('', `Error: ${sanitizeForDisplay(props.error)}`);
    }
    return lines;
  }

  private buildVisualLines(lines: readonly string[], innerWidth: number): string[] {
    const out: string[] = [];
    for (const line of lines) {
      if (visibleWidth(line) <= innerWidth) {
        out.push(line);
        continue;
      }
      const wrapped = wrapTextWithAnsi(line, innerWidth);
      out.push(...(wrapped.length > 0 ? wrapped : ['']));
    }
    return out;
  }

  // ── input ──────────────────────────────────────────────────────────

  handleInput(data: string): void {
    const visible = this.visibleRows();
    const k = printableChar(data);

    if (matchesKey(data, Key.escape) || matchesKey(data, Key.enter) || k === 'q' || k === 'Q') {
      this.props.onClose();
      return;
    }
    if (matchesKey(data, Key.up) || k === 'k') {
      this.scrollBy(-1);
      return;
    }
    if (matchesKey(data, Key.down) || k === 'j') {
      this.scrollBy(1);
      return;
    }
    if (matchesKey(data, Key.pageUp) || k === ' ' || data === '\u0002' /* C-b */) {
      this.scrollBy(-Math.max(1, visible - 1));
      return;
    }
    if (matchesKey(data, Key.pageDown) || data === '\u0006' /* C-f */) {
      this.scrollBy(Math.max(1, visible - 1));
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

  private scrollBy(delta: number): void {
    this.scrollTo(this.scrollTop + delta);
  }

  private scrollTo(target: number): void {
    this.scrollTop = Math.max(0, Math.min(target, this.maxScroll()));
    this.invalidate();
  }

  private maxScroll(): number {
    const maxHeight = this.props.maxHeight ?? this.terminal.rows;
    const height = Math.max(FIXED_OVERHEAD + 1, maxHeight);
    const contentRows = Math.max(1, height - FIXED_OVERHEAD);
    return Math.max(0, this.visualLines.length - contentRows);
  }

  private visibleRows(): number {
    const maxHeight = this.props.maxHeight ?? this.terminal.rows;
    const height = Math.max(FIXED_OVERHEAD + 1, maxHeight);
    return Math.max(1, height - FIXED_OVERHEAD);
  }

  // ── render ─────────────────────────────────────────────────────────

  override render(width: number): string[] {
    const colors = this.props.colors;
    const accent = chalk.hex(colors.primary);
    const innerWidth = Math.max(1, width);

    if (innerWidth !== this.lastInnerWidth) {
      this.lastInnerWidth = innerWidth;
      this.visualLines = this.buildVisualLines(this.lines, innerWidth);
    }

    const maxHeight = this.props.maxHeight ?? this.terminal.rows;
    const height = Math.max(FIXED_OVERHEAD + 1, maxHeight);
    const contentRows = Math.max(1, height - FIXED_OVERHEAD);

    const max = Math.max(0, this.visualLines.length - contentRows);
    if (this.scrollTop > max) this.scrollTop = max;
    if (this.scrollTop < 0) this.scrollTop = 0;

    const topBar = accent('─'.repeat(innerWidth));
    const bottomBar = topBar;
    const title = this.renderTitle(innerWidth);
    const footer = this.renderFooter(innerWidth);

    const lines: string[] = [topBar, title, ''];
    for (let i = 0; i < contentRows; i++) {
      const lineIndex = this.scrollTop + i;
      const visual = this.visualLines[lineIndex] ?? '';
      lines.push(truncateToWidth(visual, innerWidth));
    }
    lines.push(bottomBar, footer);

    return lines;
  }

  private renderTitle(width: number): string {
    const colors = this.props.colors;
    const title = chalk.hex(colors.primary).bold(' btw ');
    const status = this.props.status;
    const statusLabel =
      status === 'streaming'
        ? chalk.hex(colors.warning)('streaming')
        : status === 'failed'
          ? chalk.hex(colors.error)('failed')
          : chalk.hex(colors.success)('done');
    return fitExactly(` ${title}${statusLabel}`, width);
  }

  private renderFooter(width: number): string {
    const colors = this.props.colors;
    const key = (text: string): string => chalk.hex(colors.primary).bold(text);
    const dim = (text: string): string => chalk.hex(colors.textMuted)(text);

    const keys = `${key('↑↓')} ${dim('scroll')}  ${key('Q/Esc/Enter')} ${dim('close')}`;
    return fitExactly(` ${keys}`, width);
  }
}

function fitExactly(line: string, width: number): string {
  let s = line;
  if (visibleWidth(s) > width) s = truncateToWidth(s, width, ELLIPSIS);
  return padToWidth(s, width);
}

function padToWidth(line: string, width: number): string {
  const w = visibleWidth(line);
  if (w === width) return line;
  if (w > width) return truncateToWidth(line, width, ELLIPSIS);
  return line + ' '.repeat(width - w);
}
