/**
 * Completion card for a finished goal (PRD-0019 R14).
 *
 * Rendered only when the model calls `UpdateGoal('complete')`. `cancel` does
 * NOT produce this card — it renders a low-presence lifecycle marker instead.
 *
 * The card text is produced by a pure function from the `goal.updated` event
 * snapshot, so live and replay paths render identically.
 */

import type { Component } from '@earendil-works/pi-tui';
import { Container, Spacer, Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { MESSAGE_INDENT } from '#/tui/constant/rendering';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';
import type { GoalCompletionData } from '#/tui/types';

/** Format the usage line shared by the completion card and markers. */
export function formatGoalUsageLine(data: {
  turns: number;
  tokens: number;
  wallClockMs: number;
}): string {
  const elapsed = Math.max(0, Math.round(data.wallClockMs / 1000));
  return `turns=${data.turns} tokens=${data.tokens} elapsed=${elapsed}s`;
}

export class GoalCompletionComponent extends Container implements Component {
  constructor(data: GoalCompletionData, colors: ColorPalette) {
    super();
    this.addChild(new Spacer(1));

    const bullet = chalk.hex(colors.success)(STATUS_BULLET);
    const title = chalk.hex(colors.success).bold('Goal complete');
    this.addChild(new Text(`${bullet}${title}`, 0, 0));

    this.addChild(
      new Text(chalk.hex(colors.textStrong)(`${MESSAGE_INDENT}${data.objective}`), 0, 0),
    );

    if (data.reason !== undefined && data.reason.trim().length > 0) {
      this.addChild(
        new Text(chalk.hex(colors.textDim)(`${MESSAGE_INDENT}${data.reason.trim()}`), 0, 0),
      );
    }

    const usage = formatGoalUsageLine(data);
    this.addChild(new Text(chalk.hex(colors.textDim)(`${MESSAGE_INDENT}${usage}`), 0, 0));
  }
}
