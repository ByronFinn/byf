import type { Component } from '@earendil-works/pi-tui';
import { Container, Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { COMMAND_PREVIEW_LINES } from '#/tui/constant/rendering';
import type { ColorPalette } from '#/tui/theme/colors';
import type { ToolCallBlockData, ToolResultBlockData } from '#/tui/types';

import type { ResultRenderer } from './tool-renderers/types';
import { PREVIEW_LINES } from './tool-renderers/types';

export interface ShellExecutionOptions {
  readonly command?: string;
  readonly result?: ToolResultBlockData;
  readonly colors: ColorPalette;
  readonly expanded?: boolean;
  readonly showCommand?: boolean;
  readonly commandPreviewLines?: number;
  readonly resultPreviewLines?: number;
}

export class ShellExecutionComponent extends Container {
  constructor(options: ShellExecutionOptions) {
    super();

    if (options.showCommand === true) {
      this.addCommandPreview(
        options.command ?? '',
        options.commandPreviewLines ?? COMMAND_PREVIEW_LINES,
      );
    }

    if (options.result !== undefined) {
      this.addResultPreview(
        options.result,
        options.colors,
        options.expanded ?? false,
        options.resultPreviewLines ?? PREVIEW_LINES,
      );
    }
  }

  private addCommandPreview(command: string, previewLines: number): void {
    if (command.length === 0) return;
    const lines = command.split('\n').slice(0, previewLines);
    for (const [i, line] of lines.entries()) {
      const prefix = i === 0 ? '$ ' : '  ';
      this.addChild(new Text(chalk.dim(prefix + line), 2, 0));
    }
  }

  private addResultPreview(
    result: ToolResultBlockData,
    colors: ColorPalette,
    expanded: boolean,
    previewLines: number,
  ): void {
    if (!result.output) return;
    const tint = result.is_error ? chalk.hex(colors.error) : chalk.dim;
    if (expanded) {
      this.addChild(new Text(tint(result.output), 2, 0));
      return;
    }

    const lines = result.output.split('\n');
    const shown = lines.slice(0, previewLines);
    const remaining = lines.length - shown.length;
    this.addChild(new Text(tint(shown.join('\n')), 2, 0));
    if (remaining > 0) {
      this.addChild(
        new Text(chalk.dim(`... (${String(remaining)} more lines, ctrl+o to expand)`), 2, 0),
      );
    }
  }
}

export const shellExecutionResultRenderer: ResultRenderer = (
  toolCall: ToolCallBlockData,
  result: ToolResultBlockData,
  ctx,
): Component[] => [
  new ShellExecutionComponent({
    command: typeof toolCall.args['command'] === 'string' ? toolCall.args['command'] : '',
    result,
    colors: ctx.colors,
    expanded: ctx.expanded,
  }),
];
