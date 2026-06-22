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

export type TextInputDialogResult =
  | { readonly kind: 'ok'; readonly value: string }
  | { readonly kind: 'cancel' };

const FOOTER = 'Enter to submit  ·  Esc to cancel';

export class TextInputDialogComponent extends Container implements Focusable {
  focused = false;

  private readonly input = new Input();
  private readonly onDone: (result: TextInputDialogResult) => void;
  private readonly colors: ColorPalette;
  private readonly title: string;
  private readonly subtitle: string;
  private readonly placeholder: string;
  private readonly allowEmpty: boolean;
  private done = false;
  private emptyHinted = false;

  constructor(opts: {
    readonly title: string;
    readonly subtitle: string;
    readonly placeholder?: string;
    readonly initialValue?: string;
    readonly allowEmpty?: boolean;
    readonly colors: ColorPalette;
    readonly onDone: (result: TextInputDialogResult) => void;
  }) {
    super();
    this.onDone = opts.onDone;
    this.colors = opts.colors;
    this.title = opts.title;
    this.subtitle = opts.subtitle;
    this.placeholder = opts.placeholder ?? '';
    this.allowEmpty = opts.allowEmpty ?? false;
    if (opts.initialValue) {
      this.input.handleInput(opts.initialValue);
    }
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
    const titleStyled = chalk.bold.hex(this.colors.textStrong)(this.title);
    const subtitleText = this.emptyHinted ? 'Input cannot be empty.' : this.subtitle;
    const subtitleStyled = chalk.hex(this.colors.textDim)(subtitleText);
    const footerStyled = chalk.hex(this.colors.textDim)(FOOTER);

    const titleLine = truncateToWidth(titleStyled, innerWidth, '…');
    const subtitleLine = truncateToWidth(subtitleStyled, innerWidth, '…');
    const footerLine = truncateToWidth(footerStyled, innerWidth, '…');
    const rawInputLine = this.input.render(innerWidth)[0] ?? '> ';
    const showPlaceholder = this.input.getValue() === '' && this.placeholder.length > 0;
    const inputLine = showPlaceholder
      ? chalk.hex(this.colors.textDim)(`> ${this.placeholder}`)
      : rawInputLine;

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
    if (trimmed.length === 0 && !this.allowEmpty) {
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
