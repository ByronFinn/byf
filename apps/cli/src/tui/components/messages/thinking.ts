/**
 * Renders thinking content in the transcript.
 * Supports live in-place updates while thinking streams, then finalizes
 * without replacing the component.
 * Supports expand/collapse via Ctrl+O (shared with tool output).
 */

import type { Component, TUI } from '@earendil-works/pi-tui';
import { Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import {
  SPINNER_FRAMES,
  SPINNER_INTERVAL_MS,
  MESSAGE_INDENT,
  RESULT_PREVIEW_LINES,
} from '#/tui/constant/rendering';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';

export type ThinkingRenderMode = 'live' | 'finalized';

export class ThinkingComponent implements Component {
  private text: string;
  private color: string;
  private showMarker: boolean;
  private mode: ThinkingRenderMode;
  private expanded = false;
  private readonly ui: TUI | undefined;
  private spinnerFrame = 0;
  private spinnerInterval: ReturnType<typeof setInterval> | undefined;

  constructor(
    text: string,
    colors: ColorPalette,
    showMarker: boolean = true,
    mode: ThinkingRenderMode = 'finalized',
    ui?: TUI,
  ) {
    this.text = text;
    this.color = colors.roleThinking;
    this.showMarker = showMarker;
    this.mode = mode;
    this.ui = ui;
    if (mode === 'live') {
      this.startSpinner();
    }
  }

  invalidate(): void {}

  setText(text: string): void {
    this.text = text;
  }

  finalize(): void {
    this.mode = 'finalized';
    this.stopSpinner();
  }

  dispose(): void {
    this.stopSpinner();
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
  }

  render(width: number): string[] {
    const contentWidth = Math.max(1, width - MESSAGE_INDENT.length);
    const textComponent = new Text(chalk.hex(this.color).italic(this.text), 0, 0);
    const contentLines = this.text.length > 0 ? textComponent.render(contentWidth) : [''];

    if (this.mode === 'live') {
      const visibleLines =
        contentLines.length > RESULT_PREVIEW_LINES
          ? contentLines.slice(contentLines.length - RESULT_PREVIEW_LINES)
          : contentLines;
      const spinner = chalk.hex(this.color)(
        `${SPINNER_FRAMES[this.spinnerFrame] ?? SPINNER_FRAMES[0]} `,
      );
      return [
        '',
        spinner + chalk.hex(this.color)('thinking...'),
        ...visibleLines.map((line) => MESSAGE_INDENT + line),
      ];
    }

    const rendered: string[] = [''];
    for (let i = 0; i < contentLines.length; i++) {
      const p = i === 0 && this.showMarker ? chalk.hex(this.color)(STATUS_BULLET) : MESSAGE_INDENT;
      rendered.push(p + contentLines[i]);
    }

    if (this.expanded || contentLines.length <= RESULT_PREVIEW_LINES) {
      return rendered;
    }

    // Leading blank + first PREVIEW_LINES content lines + hint line.
    const truncated = rendered.slice(0, 1 + RESULT_PREVIEW_LINES);
    const remaining = contentLines.length - RESULT_PREVIEW_LINES;
    truncated.push(
      MESSAGE_INDENT + chalk.dim(`... (${String(remaining)} more lines, ctrl+o to expand)`),
    );
    return truncated;
  }

  private startSpinner(): void {
    if (this.ui === undefined || this.spinnerInterval !== undefined) return;
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
      this.ui?.requestRender();
    }, SPINNER_INTERVAL_MS);
  }

  private stopSpinner(): void {
    if (this.spinnerInterval === undefined) return;
    clearInterval(this.spinnerInterval);
    this.spinnerInterval = undefined;
  }
}
