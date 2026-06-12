/**
 * FileViewerComponent — fullscreen viewer for reviewing file content and
 * diffs during approval prompts. Displays pre-computed sections (each with
 * a header and ANSI-rendered lines) as a single scrollable view with
 * vim-style navigation.
 *
 * Follows the same pattern as TaskOutputViewer: Container + Focusable,
 * Terminal-aware, header/body/footer layout, scroll management.
 */

import {
  Container,
  Key,
  matchesKey,
  type Terminal,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '../../theme/colors';
import { printableChar } from '../../utils/printable-key';

const ELLIPSIS = '…';

export interface FileViewerSection {
  readonly header: string; // e.g. "+3 -2 src/foo.ts" for diff, "src/foo.ts" for content
  readonly lines: readonly string[]; // pre-rendered ANSI lines
}

export interface FileViewerProps {
  readonly sections: readonly FileViewerSection[];
  readonly colors: ColorPalette;
  readonly onClose: () => void;
}

function padToWidth(line: string, width: number): string {
  const w = visibleWidth(line);
  if (w === width) return line;
  if (w > width) return truncateToWidth(line, width, ELLIPSIS);
  return line + ' '.repeat(width - w);
}

function fitExactly(line: string, width: number): string {
  let s = line;
  if (visibleWidth(s) > width) s = truncateToWidth(s, width, ELLIPSIS);
  return padToWidth(s, width);
}

const NO_CONTENT_MSG = '[no content]';

export class FileViewerComponent extends Container implements Focusable {
  focused = false;

  private props: FileViewerProps;
  private readonly terminal: Terminal;
  /** Flattened lines: section headers + content lines concatenated. */
  private lines: string[];
  /** Index of the topmost visible line. */
  private scrollTop = 0;

  constructor(props: FileViewerProps, terminal: Terminal) {
    super();
    this.props = props;
    this.terminal = terminal;
    this.lines = this.flattenSections(props.sections);
  }

  private flattenSections(sections: readonly FileViewerSection[]): string[] {
    const result: string[] = [];
    for (const section of sections) {
      result.push(section.header);
      result.push(...section.lines);
    }
    // Show a placeholder when there are no content lines at all.
    if (sections.length === 0 || result.length <= sections.length) {
      result.push(NO_CONTENT_MSG);
    }
    return result;
  }

  // ── input ──────────────────────────────────────────────────────────

  handleInput(data: string): void {
    const visible = this.viewableRows();
    const k = printableChar(data);

    if (matchesKey(data, Key.escape) || k === 'q' || k === 'Q') {
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
    if (matchesKey(data, Key.pageUp)) {
      this.scrollBy(-Math.max(1, visible - 1));
      return;
    }
    if (matchesKey(data, Key.pageDown)) {
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

  /**
   * Number of content rows visible inside the body frame: total terminal
   * rows minus header(1) + footer(1) + top border(1) + bottom border(1).
   */
  private viewableRows(): number {
    return Math.max(1, this.terminal.rows - 4);
  }

  // ── render ─────────────────────────────────────────────────────────

  override render(width: number): string[] {
    const rows = Math.max(3, this.terminal.rows);
    const bodyHeight = rows - 2;

    const header = this.renderHeader(width);
    const body = this.renderBody(width, bodyHeight);
    const footer = this.renderFooter(width, bodyHeight);

    const out: string[] = [header];
    for (const line of body) out.push(line);
    out.push(footer);
    return out;
  }

  private renderHeader(width: number): string {
    const colors = this.props.colors;
    const title = chalk.hex(colors.primary).bold(' File Viewer ');
    return fitExactly(title, width);
  }

  private renderBody(width: number, bodyHeight: number): string[] {
    const colors = this.props.colors;
    const stroke = colors.primary;

    // Reserve 1 col for left/right border each, 1 col for left padding.
    const innerWidth = Math.max(1, width - 4);

    // Re-clamp scroll in case the terminal got resized smaller.
    const max = this.maxScroll();
    if (this.scrollTop > max) this.scrollTop = max;
    if (this.scrollTop < 0) this.scrollTop = 0;

    const viewRows = bodyHeight - 2; // inside top + bottom border
    const top = chalk.hex(stroke)('┌' + '─'.repeat(Math.max(0, width - 2)) + '┐');
    const bottom = chalk.hex(stroke)('└' + '─'.repeat(Math.max(0, width - 2)) + '┘');

    const out: string[] = [top];
    for (let i = 0; i < viewRows; i++) {
      const lineIndex = this.scrollTop + i;
      const raw = this.lines[lineIndex] ?? '';
      const inner = fitExactly(chalk.hex(colors.text)(raw), innerWidth);
      out.push(chalk.hex(stroke)('│ ') + inner + chalk.hex(stroke)(' │'));
    }
    out.push(bottom);
    return out;
  }

  private renderFooter(width: number, bodyHeight: number): string {
    const colors = this.props.colors;
    const key = (text: string): string => chalk.hex(colors.primary).bold(text);
    const dim = (text: string): string => chalk.hex(colors.textMuted)(text);

    const total = this.lines.length;
    const viewRows = Math.max(1, bodyHeight - 2);
    const maxScroll = Math.max(0, total - viewRows);
    const percent =
      maxScroll === 0 ? 100 : Math.round((this.scrollTop / maxScroll) * 100);
    const lineFrom = this.scrollTop + 1;
    const lineTo = Math.min(total, this.scrollTop + viewRows);

    const position = chalk.hex(colors.textMuted)(
      ` ${String(lineFrom)}-${String(lineTo)} / ${String(total)} (${String(percent)}%) `,
    );
    const keys =
      `${key('↑↓')} ${dim('line')}  ` +
      `${key('PgUp/PgDn')} ${dim('page')}  ` +
      `${key('g/G')} ${dim('top/bot')}  ` +
      `${key('Q/Esc')} ${dim('back')}`;
    const left = ` ${keys}`;
    const leftW = visibleWidth(left);
    const rightW = visibleWidth(position);
    if (leftW + 2 + rightW <= width) {
      return left + ' '.repeat(width - leftW - rightW) + position;
    }
    return fitExactly(left, width);
  }
}
