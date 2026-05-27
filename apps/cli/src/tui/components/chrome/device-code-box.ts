/**
 * OAuth device-code panel rendered inside the transcript.
 *
 * Borrows the rounded-border layout from `WelcomeComponent` so the login
 * prompt matches the rest of the chrome. All colors flow through the
 * active palette so theme switches take effect on the next render.
 */

import type { Component } from '@earendil-works/pi-tui';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';

export interface DeviceCodeBoxParams {
  readonly title: string;
  readonly url: string;
  readonly code: string;
  readonly hint?: string;
  readonly colors: ColorPalette;
}

export class DeviceCodeBoxComponent implements Component {
  private readonly params: DeviceCodeBoxParams;

  constructor(params: DeviceCodeBoxParams) {
    this.params = params;
  }

  invalidate(): void {}

  render(width: number): string[] {
    const { title, url, code, hint, colors } = this.params;
    const border = (s: string): string => chalk.hex(colors.primary)(s);
    const safeWidth = Math.max(28, width);
    const innerWidth = Math.max(10, safeWidth - 4);
    const pad = '  ';

    const titleLine = truncateToWidth(chalk.bold.hex(colors.textStrong)(title), innerWidth, '…');
    const promptLine = truncateToWidth(
      chalk.hex(colors.textDim)('Visit the URL below in your browser to authorize:'),
      innerWidth,
      '…',
    );
    const urlLine = truncateToWidth(chalk.hex(colors.primary)(url), innerWidth, '…');

    const codeLabel = chalk.bold.hex(colors.textDim)('Verification code:  ');
    const codeValue = chalk.bold.hex(colors.accent)(code);
    const codeLine = truncateToWidth(`${codeLabel}${codeValue}`, innerWidth, '…');

    const contentLines: string[] = [titleLine, '', promptLine, urlLine, '', codeLine];
    if (hint !== undefined && hint.length > 0) {
      contentLines.push('');
      contentLines.push(truncateToWidth(chalk.hex(colors.textDim)(hint), innerWidth, '…'));
    }

    const lines: string[] = [
      '',
      border('╭' + '─'.repeat(safeWidth - 2) + '╮'),
      border('│') + ' '.repeat(safeWidth - 2) + border('│'),
    ];

    for (const content of contentLines) {
      const truncated = content;
      const vis = visibleWidth(truncated);
      const rightPad = Math.max(0, innerWidth - vis);
      lines.push(border('│') + pad + truncated + ' '.repeat(rightPad) + border('│'));
    }

    lines.push(border('│') + ' '.repeat(safeWidth - 2) + border('│'));
    lines.push(border('╰' + '─'.repeat(safeWidth - 2) + '╯'));
    lines.push('');

    return lines;
  }
}
