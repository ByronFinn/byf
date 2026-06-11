/**
 * Color palette definitions for dark and light themes.
 *
 * Two layers:
 *  - private `dark` / `light` raw palettes — unsemantic constants reused
 *    across multiple semantic tokens to avoid hex literal duplication.
 *  - exported `darkColors` / `lightColors` — the semantic `ColorPalette`
 *    consumed by every UI component via chalk.hex(...).
 *
 * Light palette values are tuned for ≥ 4.5:1 contrast against #FFFFFF
 * for text tokens and ≥ 3:1 for chrome (border / large text), matching
 * WCAG AA.
 */

const dark = {
  // Brand — softened for long sessions; lower saturation avoids blue-light fatigue
  blue300: '#79C0FF',
  cyan300: '#7EC8E3',
  // Text — warm grays prevent the harsh "pure white on black" glare that
  // causes eye strain during extended use.  Contrast stays above 10:1.
  gray40: '#CDCDCD',
  gray60: '#B8B8B8',
  gray400: '#8B949E',
  gray500: '#6E7681',
  gray600: '#484F58',
  // State — slightly desaturated to reduce visual shouting
  green400: '#56D364',
  green300: '#7EE787',
  red400: '#F78166',
  red300: '#FFA198',
  amber400: '#D29922',
  orange300: '#F0C674',
} as const;

const light = {
  // Brand — richer but not neon, keeps WCAG AA on white
  blue600: '#0969DA',
  cyan700: '#087E8B',
  // Text — slightly warm-tinted dark tones
  gray900: '#1F2328',
  gray700: '#424A53',
  gray600: '#57606A',
  gray500: '#6E7781',
  green700: '#116329',
  red700: '#CF222E',
  amber800: '#9A6700',
  orange700: '#953800',
} as const;

export interface ColorPalette {
  // Brand
  primary: string;
  accent: string;

  // Text
  text: string;
  textStrong: string;
  textDim: string;
  textMuted: string;

  // Surface
  border: string;
  borderFocus: string;

  // State
  success: string;
  warning: string;
  error: string;

  // Diff
  diffAdded: string;
  diffRemoved: string;
  diffAddedStrong: string;
  diffRemovedStrong: string;
  diffGutter: string;
  diffMeta: string;

  // Roles
  roleUser: string;
  roleAssistant: string;
  roleThinking: string;
  roleTool: string;

  // Status
  status: string;
}

export const darkColors: ColorPalette = {
  primary: dark.blue300,
  accent: dark.cyan300,

  text: dark.gray60,
  textStrong: dark.gray40,
  textDim: dark.gray400,
  textMuted: dark.gray500,

  border: dark.gray600,
  borderFocus: dark.amber400,

  success: dark.green400,
  warning: dark.amber400,
  error: dark.red400,

  diffAdded: dark.green400,
  diffRemoved: dark.red400,
  diffAddedStrong: dark.green300,
  diffRemovedStrong: dark.red300,
  diffGutter: dark.gray500,
  diffMeta: dark.gray400,

  roleUser: dark.orange300,
  roleAssistant: dark.gray60,
  roleThinking: dark.gray400,
  roleTool: dark.amber400,

  status: dark.gray400,
};

export const lightColors: ColorPalette = {
  primary: light.blue600,
  accent: light.cyan700,

  text: light.gray900,
  textStrong: light.gray900,
  textDim: light.gray700,
  textMuted: light.gray600,

  border: light.gray500,
  borderFocus: light.amber800,

  success: light.green700,
  warning: light.amber800,
  error: light.red700,

  diffAdded: light.green700,
  diffRemoved: light.red700,
  diffAddedStrong: light.green700,
  diffRemovedStrong: light.red700,
  diffGutter: light.gray500,
  diffMeta: light.gray600,

  roleUser: light.orange700,
  roleAssistant: light.gray900,
  roleThinking: light.gray700,
  roleTool: light.amber800,

  status: light.gray700,
};

export type ResolvedTheme = 'dark' | 'light';

export function getColorPalette(theme: ResolvedTheme): ColorPalette {
  return theme === 'dark' ? darkColors : lightColors;
}
