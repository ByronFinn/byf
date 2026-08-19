/**
 * 已完成 goal 的完成卡片(PRD-0019 R14)。
 *
 * 仅当模型调用 `UpdateGoal('complete')` 时渲染。`cancel` 不产生此卡片——
 * 它改为渲染低存在感的生命周期标记。
 *
 * 卡片文本由 `goal.updated` 事件快照的纯函数生成,因此 live 与 replay
 * 路径渲染一致。
 */

import type { Component } from '@earendil-works/pi-tui';
import { Container, Spacer, Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { MESSAGE_INDENT } from '#/tui/constant/rendering';
import { STATUS_BULLET } from '#/tui/constant/symbols';
import type { ColorPalette } from '#/tui/theme/colors';
import type { GoalCompletionData } from '#/tui/types';

/** 格式化完成卡片与标记共享的用量行。 */
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
