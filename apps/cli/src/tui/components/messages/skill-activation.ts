/**
 * 技能激活卡片。
 *
 * 用户运行 `/skill:foo bar` 时,TUI 渲染紧凑卡片,而非把 SKILL.md 正文
 * 展开进用户气泡:
 *
 *   ▶ Activated skill: foo
 *     bar
 *
 * 参数行可选。核心把技能正文展开进 LLM 上下文;TUI 只消费
 * `skill.activated` 事件与 user_message origin 元数据。
 */

import { Container, Text, Spacer } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';

const ARGS_PREVIEW_MAX = 200;

export class SkillActivationComponent extends Container {
  constructor(name: string, args: string | undefined, colors: ColorPalette) {
    super();
    this.addChild(new Spacer(1));
    const head =
      chalk.hex(colors.primary).bold('▶ Activated skill: ') + chalk.hex(colors.roleUser).bold(name);
    this.addChild(new Text(head, 0, 0));
    const trimmed = args?.trim() ?? '';
    if (trimmed.length > 0) {
      const preview =
        trimmed.length > ARGS_PREVIEW_MAX ? trimmed.slice(0, ARGS_PREVIEW_MAX) + '…' : trimmed;
      this.addChild(new Text('  ' + chalk.hex(colors.textDim)(preview), 0, 0));
    }
  }
}
