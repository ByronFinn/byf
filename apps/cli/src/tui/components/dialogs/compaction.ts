/**
 * Renders a compaction block in the transcript.
 *
 * Lifecycle:
 *   - constructed on `compaction.started` → blinking white bullet +
 *     "Compacting context..." and optional custom instruction
 *   - `markDone()` on `compaction.completed` → solid green bullet +
 *     "Compaction complete (X → Y tokens)" + optional summary (Ctrl-O)
 *   - `markCanceled()` on `compaction.cancelled` → solid warning bullet +
 *     "Compaction cancelled"
 *
 * Bullet animation mirrors `ToolCallComponent` (500ms blink) so the user
 * reads the same "work in progress" signal across the UI.
 *
 * Implements `Expandable` so Ctrl-O (`toggleToolOutputExpansion`) can
 * show/hide the compaction summary — the same shared shortcut used by
 * tool output and thinking blocks. The summary text comes from the
 * already-existing `CompactionCompletedEvent.result.summary` field; no
 * new core field is added.
 */

import { Container, Text, Spacer } from '@earendil-works/pi-tui';
import type { TUI } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';
import type { Expandable } from '#/tui/utils/component-capabilities';

const BLINK_INTERVAL = 500;
const SUMMARY_INDENT = '  ';

export class CompactionComponent extends Container implements Expandable {
  private readonly colors: ColorPalette;
  private readonly ui: TUI | undefined;
  private readonly headerText: Text;
  private blinkOn = true;
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  private done = false;
  private canceled = false;
  private tokensBefore: number | undefined;
  private tokensAfter: number | undefined;
  private summary: string | undefined;
  private expanded = false;

  constructor(colors: ColorPalette, ui?: TUI, instruction?: string) {
    super();
    this.colors = colors;
    this.ui = ui;

    // Top margin so the block isn't glued to the previous transcript
    // entry (status line, tool result, etc.).
    this.addChild(new Spacer(1));
    this.headerText = new Text(this.buildHeader(), 0, 0);
    this.addChild(this.headerText);
    if (instruction !== undefined) {
      this.addChild(new Text(chalk.dim(`  ${instruction}`), 0, 0));
    }

    this.startBlink();
  }

  markDone(tokensBefore?: number, tokensAfter?: number, summary?: string): void {
    if (this.done || this.canceled) return;
    this.done = true;
    this.tokensBefore = tokensBefore;
    this.tokensAfter = tokensAfter;
    this.summary = summary;
    this.stopBlink();
    this.headerText.setText(this.buildHeader());
    this.ui?.requestRender();
  }

  markCanceled(): void {
    if (this.done || this.canceled) return;
    this.canceled = true;
    this.stopBlink();
    this.headerText.setText(this.buildHeader());
    this.ui?.requestRender();
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) return;
    this.expanded = expanded;
    // Re-render the header so the Ctrl-O hint flips between
    // "show" and "hide".
    this.headerText.setText(this.buildHeader());
    this.ui?.requestRender();
  }

  dispose(): void {
    this.stopBlink();
  }

  override render(width: number): string[] {
    const lines = super.render(width);
    // Only show the summary body when expanded and a non-empty summary
    // exists. When collapsed (or no summary), the header alone renders —
    // no misleading "show summary" hint.
    if (this.done && this.expanded && this.summary && this.summary.trim().length > 0) {
      const summaryText = new Text(chalk.dim(this.summary), 0, 0);
      for (const line of summaryText.render(Math.max(1, width - SUMMARY_INDENT.length))) {
        lines.push(SUMMARY_INDENT + line);
      }
    }
    return lines;
  }

  private buildHeader(): string {
    if (this.done) {
      const bullet = chalk.hex(this.colors.success)(STATUS_BULLET);
      const label = chalk.hex(this.colors.success).bold('Compaction complete');
      const detail =
        this.tokensBefore !== undefined && this.tokensAfter !== undefined
          ? chalk.dim(` (${String(this.tokensBefore)} → ${String(this.tokensAfter)} tokens)`)
          : '';
      const hint =
        this.summary && this.summary.trim().length > 0
          ? chalk.dim(
              this.expanded
                ? ' (Ctrl-O to hide compaction summary)'
                : ' (Ctrl-O to show compaction summary)',
            )
          : '';
      return `${bullet}${label}${detail}${hint}`;
    }
    if (this.canceled) {
      const bullet = chalk.hex(this.colors.warning)(STATUS_BULLET);
      const label = chalk.hex(this.colors.warning).bold('Compaction cancelled');
      return `${bullet}${label}`;
    }
    const bullet = this.blinkOn ? chalk.hex(this.colors.roleAssistant)(STATUS_BULLET) : '  ';
    const label = chalk.hex(this.colors.primary).bold('Compacting context...');
    return `${bullet}${label}`;
  }

  private startBlink(): void {
    this.blinkTimer = setInterval(() => {
      this.blinkOn = !this.blinkOn;
      this.headerText.setText(this.buildHeader());
      this.ui?.requestRender();
    }, BLINK_INTERVAL);
  }

  private stopBlink(): void {
    if (this.blinkTimer !== null) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
  }
}
