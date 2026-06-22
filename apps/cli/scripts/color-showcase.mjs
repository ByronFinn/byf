#!/usr/bin/env node
/**
 * Color & style showcase — renders every ThemeStyles token + raw palette
 * color for both dark and light themes so you can review the palette visually.
 *
 * Usage: node scripts/color-showcase.mjs [dark|light|auto]
 */

import { createRequire } from 'node:module';

import chalk from 'chalk';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Inline copies of the palette + style factory (avoids TS compilation)
// ---------------------------------------------------------------------------

const darkRaw = {
  blue300: '#79C0FF',
  cyan300: '#7EC8E3',
  gray40: '#CDCDCD',
  gray60: '#B8B8B8',
  gray400: '#8B949E',
  gray500: '#6E7681',
  gray600: '#484F58',
  green400: '#56D364',
  green300: '#7EE787',
  red400: '#F78166',
  red300: '#FFA198',
  amber400: '#D29922',
  orange300: '#F0C674',
};

const lightRaw = {
  blue600: '#0969DA',
  cyan700: '#087E8B',
  gray900: '#1F2328',
  gray700: '#424A53',
  gray600: '#57606A',
  gray500: '#6E7781',
  green700: '#116329',
  red700: '#CF222E',
  amber800: '#9A6700',
  orange700: '#953800',
};

const darkColors = {
  primary: darkRaw.blue300,
  accent: darkRaw.cyan300,
  text: darkRaw.gray60,
  textStrong: darkRaw.gray40,
  textDim: darkRaw.gray400,
  textMuted: darkRaw.gray500,
  border: darkRaw.gray600,
  borderFocus: darkRaw.amber400,
  success: darkRaw.green400,
  warning: darkRaw.amber400,
  error: darkRaw.red400,
  diffAdded: darkRaw.green400,
  diffRemoved: darkRaw.red400,
  diffAddedStrong: darkRaw.green300,
  diffRemovedStrong: darkRaw.red300,
  diffGutter: darkRaw.gray500,
  diffMeta: darkRaw.gray400,
  roleUser: darkRaw.orange300,
  roleAssistant: darkRaw.gray60,
  roleThinking: darkRaw.gray400,
  roleTool: darkRaw.amber400,
  status: darkRaw.gray400,
};

const lightColors = {
  primary: lightRaw.blue600,
  accent: lightRaw.cyan700,
  text: lightRaw.gray900,
  textStrong: lightRaw.gray900,
  textDim: lightRaw.gray700,
  textMuted: lightRaw.gray600,
  border: lightRaw.gray500,
  borderFocus: lightRaw.amber800,
  success: lightRaw.green700,
  warning: lightRaw.amber800,
  error: lightRaw.red700,
  diffAdded: lightRaw.green700,
  diffRemoved: lightRaw.red700,
  diffAddedStrong: lightRaw.green700,
  diffRemovedStrong: lightRaw.red700,
  diffGutter: lightRaw.gray500,
  diffMeta: lightRaw.gray600,
  roleUser: lightRaw.orange700,
  roleAssistant: lightRaw.gray900,
  roleThinking: lightRaw.gray700,
  roleTool: lightRaw.amber800,
  status: lightRaw.gray700,
};

function createStyles(c) {
  return {
    colors: c,
    primary: (s) => chalk.hex(c.primary)(s),
    accent: (s) => chalk.hex(c.accent)(s),
    dim: (s) => chalk.hex(c.textDim)(s),
    muted: (s) => chalk.hex(c.textMuted)(s),
    text: (s) => chalk.hex(c.text)(s),
    strong: (s) => chalk.hex(c.textStrong)(s),
    error: (s) => chalk.hex(c.error)(s),
    warning: (s) => chalk.hex(c.warning)(s),
    success: (s) => chalk.hex(c.success)(s),
    label: (s) => chalk.bold.hex(c.textDim)(s),
    value: (s) => chalk.hex(c.text)(s),
    diffAdd: (s) => chalk.hex(c.diffAdded)(s),
    diffDel: (s) => chalk.hex(c.diffRemoved)(s),
    diffAddBold: (s) => chalk.bold.hex(c.diffAddedStrong)(s),
    diffDelBold: (s) => chalk.bold.hex(c.diffRemovedStrong)(s),
    diffGutter: (s) => chalk.hex(c.diffGutter)(s),
    diffMeta: (s) => chalk.hex(c.diffMeta)(s),
  };
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function swatch(hex) {
  return chalk.hex(hex)('█████');
}

function section(title) {
  console.log('');
  console.log(chalk.bold.underline(title));
  console.log(chalk.dim('─'.repeat(60)));
}

function row(label, styled, raw) {
  const l = label.padEnd(22);
  const sample = styled('The quick brown fox jumps over the lazy dog');
  const hexTag = chalk.dim(`(${raw})`);
  console.log(`  ${l}  ${swatch(raw)}  ${sample}  ${hexTag}`);
}

function renderPalette(name, colors) {
  const s = createStyles(colors);

  section(`${name} Theme — Semantic Styles`);

  console.log(chalk.bold('\n  ▸ Brand'));
  row('primary', s.primary, colors.primary);
  row('accent', s.accent, colors.accent);

  console.log(chalk.bold('\n  ▸ Text'));
  row('text', s.text, colors.text);
  row('textStrong', s.strong, colors.textStrong);
  row('textDim', s.dim, colors.textDim);
  row('textMuted', s.muted, colors.textMuted);

  console.log(chalk.bold('\n  ▸ Surface'));
  row('border', s.label, colors.border);
  row('borderFocus', s.accent, colors.borderFocus);

  console.log(chalk.bold('\n  ▸ State'));
  row('success', s.success, colors.success);
  row('warning', s.warning, colors.warning);
  row('error', s.error, colors.error);

  console.log(chalk.bold('\n  ▸ Diff'));
  row('diffAdded', s.diffAdd, colors.diffAdded);
  row('diffRemoved', s.diffDel, colors.diffRemoved);
  row('diffAddedStrong', s.diffAddBold, colors.diffAddedStrong);
  row('diffRemovedStrong', s.diffDelBold, colors.diffRemovedStrong);
  row('diffGutter', s.diffGutter, colors.diffGutter);
  row('diffMeta', s.diffMeta, colors.diffMeta);

  console.log(chalk.bold('\n  ▸ Roles'));
  row('roleUser', s.primary, colors.roleUser);
  row('roleAssistant', s.text, colors.roleAssistant);
  row('roleThinking', s.dim, colors.roleThinking);
  row('roleTool', s.warning, colors.roleTool);

  console.log(chalk.bold('\n  ▸ Status'));
  row('status', s.dim, colors.status);

  console.log(chalk.bold('\n  ▸ Label / Value'));
  row('label', s.label, colors.textDim);
  row('value', s.value, colors.text);

  // Simulated message snippets
  section(`${name} Theme — Simulated Messages`);

  console.log('');
  console.log(
    `  ${s.success('✔')}  ${s.success('Success:')} ${s.text('Session restored successfully.')}`,
  );
  console.log(
    `  ${s.warning('⚠')}  ${s.warning('Warning:')} ${s.text('Token usage is at 87%. Consider compacting.')}`,
  );
  console.log(
    `  ${s.error('✖')}  ${s.error('Error:')}   ${s.text('Failed to connect to provider. Retrying…')}`,
  );
  console.log(
    `  ${s.primary('ℹ')}  ${s.primary('Info:')}    ${s.text('Using model ')}${s.strong('claude-sonnet-4-20250514')}`,
  );
  console.log('');
  console.log(`  ${s.label('User')}      ${s.value('>')} ${s.strong('Fix the auth middleware')}`);
  console.log(
    `  ${s.label('Assistant')} ${s.value('>')} ${s.text("I'll update the JWT validation logic in auth.ts")}`,
  );
  console.log(
    `  ${s.label('Tool')}      ${s.value('>')} ${s.accent('Read')} ${s.dim('src/middleware/auth.ts')}`,
  );
  console.log(
    `  ${s.label('Thinking')} ${s.value('>')} ${s.dim('The token expiry check is missing a clock skew margin…')}`,
  );
  console.log('');
  console.log(`  ${s.diffGutter(' 1 ')} ${s.diffMeta('// before')}`);
  console.log(`  ${s.diffGutter(' 2 ')} ${s.diffDel('-  if (token.expired) throw new Error();')}`);
  console.log(
    `  ${s.diffGutter(' 3 ')} ${s.diffAdd('+  if (token.expired && !isWithinSkew(token)) {')}`,
  );
  console.log(
    `  ${s.diffGutter(' 4 ')} ${s.diffAdd('+    throw new AuthError("Token expired", { skew: true });')}`,
  );
  console.log(`  ${s.diffGutter(' 5 ')} ${s.diffAdd('+  }')}`);
  console.log(`  ${s.diffGutter(' 6 ')} ${s.diffMeta('// after')}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const arg = process.argv[2] || 'auto';

if (arg === 'dark' || arg === 'light' || arg === 'auto') {
  // We render BOTH themes regardless — the user asked to review.
  // Dark first, then light.
  renderPalette('Dark', darkColors);
  renderPalette('Light', lightColors);
} else {
  console.error('Usage: node scripts/color-showcase.mjs [dark|light|auto]');
  process.exit(1);
}

console.log('\n');
