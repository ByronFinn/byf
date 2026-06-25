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
  readonly colors: ColorPalette;
  readonly onClose: () => void;
}

const ELLIPSIS = '…';

export class BtwViewer extends Container implements Focusable {
  focused = false;

  private props: BtwViewerProps;
  private readonly terminal: Terminal;
  private scrollTop = 0;
  /** Pre-rendered logical lines (cached on each setProps). */
  private lines: string[] = [];
  private lastBodyWidth = 80;

  constructor(props: BtwViewerProps, terminal: Terminal) {
    super();
    this.props = props;
    this.terminal = terminal;
    this.lines = this.buildLines(props);
  }

  setProps(next: BtwViewerProps): void {
    const wasAtBottom = this.scrollTop >= this.maxScroll();
    const answerChanged = next.answer !== this.props.answer;
    this.props = next;
    if (answerChanged) {
      this.lines = this.buildLines(next);
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
    return [
      `Q: ${sanitizeForDisplay(props.query)}`,
      '',
      ...(answer.length > 0 ? [`A: ${answer}`] : props.status === 'streaming' ? ['A: …'] : []),
    ];
  }

  // ── input ──────────────────────────────────────────────────────────

  handleInput(data: string): void {
    const visible = this.viewableRows();
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
    return Math.max(0, this.lines.length - this.viewableRows());
  }

  private viewableRows(): number {
    return Math.max(1, this.terminal.rows - 4);
  }

  // ── render ─────────────────────────────────────────────────────────

  override render(width: number): string[] {
    const rows = Math.max(3, this.terminal.rows);
    const bodyHeight = rows - 2;

    const header = this.renderHeader(width);
    const body = this.renderBody(width, bodyHeight);
    const footer = this.renderFooter(width);

    const out: string[] = [header];
    for (const line of body) out.push(line);
    out.push(footer);
    return out;
  }

  private renderHeader(width: number): string {
    const colors = this.props.colors;
    const title = chalk.hex(colors.primary).bold(' btw ');
    const status = this.props.status;
    const statusLabel =
      status === 'streaming'
        ? chalk.hex(colors.warning)('streaming')
        : status === 'failed'
          ? chalk.hex(colors.error)('failed')
          : chalk.hex(colors.success)('done');
    const composed = `${title}${statusLabel}`;
    return fitExactly(composed, width);
  }

  private renderBody(width: number, bodyHeight: number): string[] {
    const colors = this.props.colors;
    const stroke = colors.primary;
    const innerWidth = Math.max(1, width - 4);

    const max = this.maxScroll();
    if (this.scrollTop > max) this.scrollTop = max;
    if (this.scrollTop < 0) this.scrollTop = 0;

    const viewRows = bodyHeight - 2;
    const top = chalk.hex(stroke)('┌' + '─'.repeat(Math.max(0, width - 2)) + '┐');
    const bottom = chalk.hex(stroke)('└' + '─'.repeat(Math.max(0, width - 2)) + '┘');

    const out: string[] = [top];
    for (let i = 0; i < viewRows; i++) {
      const lineIndex = this.scrollTop + i;
      const logicalLine = this.lines[lineIndex];
      const visualLines = logicalLine === undefined ? [] : this.wrapLine(logicalLine, innerWidth);
      const visual = visualLines[i === 0 ? 0 : Math.min(i, visualLines.length - 1)] ?? '';
      const empty = lineIndex >= this.lines.length;
      const rendered = empty ? '' : visual;
      out.push(
        chalk.hex(stroke)('│ ') + padToWidth(rendered, innerWidth) + chalk.hex(stroke)(' │'),
      );
    }
    out.push(bottom);
    return out;
  }

  private renderFooter(width: number): string {
    const colors = this.props.colors;
    const key = (text: string): string => chalk.hex(colors.primary).bold(text);
    const dim = (text: string): string => chalk.hex(colors.textMuted)(text);

    const keys = `${key('↑↓')} ${dim('scroll')}  ${key('Q/Esc/Enter')} ${dim('close')}`;
    return fitExactly(` ${keys}`, width);
  }

  private wrapLine(line: string, innerWidth: number): string[] {
    if (visibleWidth(line) <= innerWidth) return [line];
    const wrapped = wrapTextWithAnsi(line, innerWidth);
    if (wrapped.length === 0) return [''];
    return wrapped;
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
