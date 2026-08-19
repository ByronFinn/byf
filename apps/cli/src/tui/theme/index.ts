/**
 * 主题系统公开 API。
 */

import type { ResolvedTheme } from './colors';
import { detectTerminalTheme } from './detect';

export { darkColors, lightColors, getColorPalette } from './colors';
export type { ColorPalette, ResolvedTheme } from './colors';
export { createThemeStyles } from './styles';
export type { ThemeStyles } from './styles';
export { createMarkdownTheme, createEditorTheme } from './pi-tui-theme';
export { detectTerminalTheme } from './detect';

/**
 * 用户可见的主题偏好。`'auto'` 在启动时交给终端背景检测;`'dark'` /
 * `'light'` 是永不触发检测的显式覆盖。`tui.toml` 中持久化的值始终是
 * 三者之一;检测出的 `ResolvedTheme` 在启动时计算,仅存于内存。
 */
export type Theme = 'dark' | 'light' | 'auto';

export function isTheme(value: string): value is Theme {
  return value === 'dark' || value === 'light' || value === 'auto';
}

/**
 * 把用户偏好解析为具体调色板键。`'auto'` 触发终端背景检测
 * (OSC 11,COLORFGBG / 暗色回退);显式选择直接透传。
 */
export async function resolveTheme(theme: Theme): Promise<ResolvedTheme> {
  if (theme === 'auto') return detectTerminalTheme();
  return theme;
}

/**
 * 无法等待终端探测的路径使用的同步回退(初始状态构建、TUI 内主题切换)。
 * `'auto'` 归并为 `'dark'`;显式选择直接透传。
 */
export function resolveThemeSync(theme: Theme): ResolvedTheme {
  if (theme === 'auto') return 'dark';
  return theme;
}
