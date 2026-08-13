/**
 * FeedbackInputDialog — 在把单行用户反馈提交到受管的 Byf Code 平台前
 * 收集它的蓝色圆角框。
 *
 * 框内嵌一个 `pi-tui` Input 用于实际文本输入;光标可见性跟随对话框的
 * `focused` 标志。
 */

import {
  Container,
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type Focusable,
} from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';

export type FeedbackInputDialogResult =
  | { readonly kind: 'ok'; readonly value: string }
  | { readonly kind: 'cancel' };

const TITLE = 'Send feedback to Byf Code';
const SUBTITLE_DEFAULT = "Tell us what's working or what's not.";
const SUBTITLE_EMPTY = 'Feedback cannot be empty.';
const FOOTER = 'Enter to submit  ·  Esc to cancel';

export class FeedbackInputDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly input = new Input();
  private readonly onDone: (result: FeedbackInputDialogResult) => void;
  private readonly colors: ColorPalette;
  private done = false;
  private emptyHinted = false;

  constructor(onDone: (result: FeedbackInputDialogResult) => void, colors: ColorPalette) {
    super();
    this.onDone = onDone;
    this.colors = colors;
    this.input.onSubmit = (value) => {
      this.submit(value);
    };
  }

  handleInput(data: string): void {
    if (this.done) return;
    if (
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl('c')) ||
      matchesKey(data, Key.ctrl('d'))
    ) {
      this.cancel();
      return;
    }
    if (this.emptyHinted) {
      this.emptyHinted = false;
    }
    this.input.handleInput(data);
  }

  override invalidate(): void {
    super.invalidate();
    this.input.invalidate();
  }

  override render(width: number): string[] {
    this.input.focused = this.focused && !this.done;

    const safeWidth = Math.max(28, width);
    const innerWidth = Math.max(10, safeWidth - 4);
    const pad = '  ';

    const border = (s: string): string => chalk.hex(this.colors.primary)(s);
    const titleStyled = chalk.bold.hex(this.colors.textStrong)(TITLE);
    const subtitleText = this.emptyHinted ? SUBTITLE_EMPTY : SUBTITLE_DEFAULT;
    const subtitleStyled = chalk.hex(this.colors.textDim)(subtitleText);
    const footerStyled = chalk.hex(this.colors.textDim)(FOOTER);

    const titleLine = truncateToWidth(titleStyled, innerWidth, '…');
    const subtitleLine = truncateToWidth(subtitleStyled, innerWidth, '…');
    const footerLine = truncateToWidth(footerStyled, innerWidth, '…');
    const inputLine = this.input.render(innerWidth)[0] ?? '> ';

    const contentLines: string[] = [titleLine, '', subtitleLine, '', inputLine, '', footerLine];

    const lines: string[] = [
      '',
      border('╭' + '─'.repeat(safeWidth - 2) + '╮'),
      border('│') + ' '.repeat(safeWidth - 2) + border('│'),
    ];

    for (const content of contentLines) {
      const vis = visibleWidth(content);
      const rightPad = Math.max(0, innerWidth - vis);
      lines.push(border('│') + pad + content + ' '.repeat(rightPad) + border('│'));
    }

    lines.push(border('│') + ' '.repeat(safeWidth - 2) + border('│'));
    lines.push(border('╰' + '─'.repeat(safeWidth - 2) + '╯'));
    lines.push('');

    return lines;
  }

  private submit(value: string): void {
    if (this.done) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      this.emptyHinted = true;
      return;
    }
    this.done = true;
    this.onDone({ kind: 'ok', value: trimmed });
  }

  private cancel(): void {
    if (this.done) return;
    this.done = true;
    this.onDone({ kind: 'cancel' });
  }
}
