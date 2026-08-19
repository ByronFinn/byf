/**
 * 构建于 chalk 之上的主题感知样式辅助。组件经 `state.theme.styles` 持有
 * `ThemeStyles` 实例的引用,绝不直接触碰原始 chalk 颜色名——这使主题切换
 * 保持一致,并让每个视觉 token 都经 `ColorPalette` 路由。
 */

import chalk from 'chalk';

import type { ColorPalette } from './colors';

export interface ThemeStyles {
  colors: ColorPalette;

  /** Brand primary (links, focus, slash highlight). */
  primary(text: string): string;
  /** Secondary brand accent (command operators, approval labels). */
  accent(text: string): string;
  /** Dimmed text — secondary but still readable. */
  dim(text: string): string;
  /** Muted text — most faded; for unchanged-line counters, scroll info. */
  muted(text: string): string;
  /** Body text — same color as default but explicit for theming. */
  text(text: string): string;
  /** Strong / emphasized text — paths, URLs, command bodies. */
  strong(text: string): string;

  error(text: string): string;
  warning(text: string): string;
  success(text: string): string;

  /** Bold + dim, for label cells. */
  label(text: string): string;
  /** Body color, for value cells. */
  value(text: string): string;

  diffAdd(text: string): string;
  diffDel(text: string): string;
  diffAddBold(text: string): string;
  diffDelBold(text: string): string;
  diffGutter(text: string): string;
  diffMeta(text: string): string;
}

export function createThemeStyles(colors: ColorPalette): ThemeStyles {
  return {
    colors,
    primary: (s) => chalk.hex(colors.primary)(s),
    accent: (s) => chalk.hex(colors.accent)(s),
    dim: (s) => chalk.hex(colors.textDim)(s),
    muted: (s) => chalk.hex(colors.textMuted)(s),
    text: (s) => chalk.hex(colors.text)(s),
    strong: (s) => chalk.hex(colors.textStrong)(s),
    error: (s) => chalk.hex(colors.error)(s),
    warning: (s) => chalk.hex(colors.warning)(s),
    success: (s) => chalk.hex(colors.success)(s),
    label: (s) => chalk.bold.hex(colors.textDim)(s),
    value: (s) => chalk.hex(colors.text)(s),
    diffAdd: (s) => chalk.hex(colors.diffAdded)(s),
    diffDel: (s) => chalk.hex(colors.diffRemoved)(s),
    diffAddBold: (s) => chalk.bold.hex(colors.diffAddedStrong)(s),
    diffDelBold: (s) => chalk.bold.hex(colors.diffRemovedStrong)(s),
    diffGutter: (s) => chalk.hex(colors.diffGutter)(s),
    diffMeta: (s) => chalk.hex(colors.diffMeta)(s),
  };
}
