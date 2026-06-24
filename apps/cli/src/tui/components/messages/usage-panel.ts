/**
 * UsagePanelComponent — wraps pre-coloured `/usage` lines in a blue box
 * border with a left indent, mirroring the PlanBoxComponent layout so
 * the pattern stays consistent across command-triggered panels.
 */

import type { SessionUsage, TokenUsage } from '@byfriends/sdk';
import type { Component } from '@earendil-works/pi-tui';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import {
  computeCacheHitRate,
  formatCacheHitRate,
  formatTokenCount,
  ratioSeverity,
  renderProgressBar,
  safeNumber,
  safeUsageRatio,
} from '#/utils/usage/usage-format';

const LEFT_MARGIN = 2;
const SIDE_PADDING = 1;
const MIN_INTERIOR_WIDTH = 20;

type Colorize = (text: string) => string;

export interface ManagedUsageRow {
  readonly label: string;
  readonly used: number;
  readonly limit: number;
  readonly resetHint?: string;
}

export interface ManagedUsageReport {
  readonly summary: ManagedUsageRow | null;
  readonly limits: readonly ManagedUsageRow[];
}

export interface UsageReportOptions {
  readonly colors: ColorPalette;
  readonly sessionUsage?: SessionUsage;
  readonly sessionUsageError?: string;
  readonly contextUsage: number;
  readonly contextTokens: number;
  readonly maxContextTokens: number;
  readonly managedUsage?: ManagedUsageReport;
  readonly managedUsageError?: string;
}

export interface ManagedUsageReportLineOptions {
  readonly colors: ColorPalette;
  readonly managedUsage?: ManagedUsageReport;
  readonly managedUsageError?: string;
}

function usageInputTotal(usage: TokenUsage): number {
  return (
    safeNumber(usage.inputOther) +
    safeNumber(usage.inputCacheRead) +
    safeNumber(usage.inputCacheCreation)
  );
}

function buildSessionUsageSection(
  usage: SessionUsage | undefined,
  error: string | undefined,
  value: Colorize,
  muted: Colorize,
  errorStyle: Colorize,
): string[] {
  if (error !== undefined) return [errorStyle(`  ${error}`)];
  const byModel = (usage as { readonly byModel?: Record<string, TokenUsage> } | undefined)?.byModel;
  const entries = Object.entries(byModel ?? {});
  if (entries.length === 0) return [muted('  No token usage recorded yet.')];

  const lines: string[] = [];
  let totalInput = 0;
  let totalOutput = 0;
  let totalOther = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  for (const [model, row] of entries) {
    const input = usageInputTotal(row);
    const output = safeNumber(row.output);
    const other = safeNumber(row.inputOther);
    const cacheRead = safeNumber(row.inputCacheRead);
    const cacheCreation = safeNumber(row.inputCacheCreation);
    totalInput += input;
    totalOutput += output;
    totalOther += other;
    totalCacheRead += cacheRead;
    totalCacheCreation += cacheCreation;

    const hitRate = computeCacheHitRate(other, cacheRead, cacheCreation);
    const hitRateStr = formatCacheHitRate(hitRate);
    const cacheSuffix =
      hitRateStr !== undefined ? muted(' (cache ') + value(hitRateStr) + muted(')') : '';

    lines.push(
      `  ${muted(model)}  input ${value(formatTokenCount(input))}${cacheSuffix}  output ${value(
        formatTokenCount(output),
      )}  total ${value(formatTokenCount(input + output))}`,
    );
  }
  if (entries.length > 1) {
    const totalHitRate = computeCacheHitRate(totalOther, totalCacheRead, totalCacheCreation);
    const totalHitRateStr = formatCacheHitRate(totalHitRate);
    const totalCacheSuffix =
      totalHitRateStr !== undefined ? muted(' (cache ') + value(totalHitRateStr) + muted(')') : '';

    lines.push(
      `  ${muted('total')}  input ${value(formatTokenCount(totalInput))}${totalCacheSuffix}  output ${value(
        formatTokenCount(totalOutput),
      )}  total ${value(formatTokenCount(totalInput + totalOutput))}`,
    );
  }
  return lines;
}

function buildManagedUsageSection(
  usage: ManagedUsageReport | undefined,
  error: string | undefined,
  accent: Colorize,
  value: Colorize,
  muted: Colorize,
  errorStyle: Colorize,
  severityHex: (sev: 'ok' | 'warn' | 'danger') => string,
): string[] {
  if (error !== undefined) return [accent('Plan usage'), errorStyle(`  ${error}`)];
  if (usage === undefined) return [];
  const { summary, limits } = usage;
  if (summary === null && limits.length === 0) {
    return [accent('Plan usage'), muted('  No usage data available.')];
  }

  const rows: ManagedUsageRow[] = [];
  if (summary !== null) rows.push(summary);
  rows.push(...limits);
  const labelWidth = Math.max(10, ...rows.map((r) => r.label.length));
  const out: string[] = [accent('Plan usage')];
  for (const row of rows) {
    const ratioUsed = row.limit > 0 ? row.used / row.limit : 0;
    const leftRatio = 1 - Math.max(0, Math.min(ratioUsed, 1));
    const bar = renderProgressBar(Math.max(0, Math.min(ratioUsed, 1)), 20);
    const pct = `${Math.round(leftRatio * 100)}% left`;
    const barColoured = chalk.hex(severityHex(ratioSeverity(ratioUsed)))(bar);
    const label = row.label.padEnd(labelWidth, ' ');
    const resetStr = row.resetHint ? muted(` (${row.resetHint})`) : '';
    out.push(`  ${muted(label)}  ${barColoured}  ${value(pct)}${resetStr}`);
  }
  return out;
}

export function buildManagedUsageReportLines(options: ManagedUsageReportLineOptions): string[] {
  const colors = options.colors;
  const accent = chalk.hex(colors.primary).bold;
  const value = chalk.hex(colors.text);
  const muted = chalk.hex(colors.textDim);
  const errorStyle = chalk.hex(colors.error);
  const severityHex = (sev: 'ok' | 'warn' | 'danger'): string =>
    sev === 'danger' ? colors.error : sev === 'warn' ? colors.warning : colors.success;

  return buildManagedUsageSection(
    options.managedUsage,
    options.managedUsageError,
    accent,
    value,
    muted,
    errorStyle,
    severityHex,
  );
}

export function buildUsageReportLines(options: UsageReportOptions): string[] {
  const colors = options.colors;
  const accent = chalk.hex(colors.primary).bold;
  const value = chalk.hex(colors.text);
  const muted = chalk.hex(colors.textDim);
  const errorStyle = chalk.hex(colors.error);
  const severityHex = (sev: 'ok' | 'warn' | 'danger'): string =>
    sev === 'danger' ? colors.error : sev === 'warn' ? colors.warning : colors.success;

  const lines: string[] = [
    accent('Session usage'),
    ...buildSessionUsageSection(
      options.sessionUsage,
      options.sessionUsageError,
      value,
      muted,
      errorStyle,
    ),
  ];

  if (options.maxContextTokens > 0) {
    const ratio = safeUsageRatio(options.contextUsage);
    const bar = renderProgressBar(ratio, 20);
    const pct = `${(ratio * 100).toFixed(1)}%`;
    const barColoured = chalk.hex(severityHex(ratioSeverity(ratio)))(bar);
    lines.push('');
    lines.push(accent('Context window'));
    lines.push(
      `  ${barColoured}  ${value(pct.padStart(6, ' '))}  ` +
        muted(
          `(${formatTokenCount(options.contextTokens)} / ${formatTokenCount(
            options.maxContextTokens,
          )})`,
        ),
    );
  }

  const managedSection = buildManagedUsageReportLines({
    colors,
    managedUsage: options.managedUsage,
    managedUsageError: options.managedUsageError,
  });
  if (managedSection.length > 0) {
    lines.push('');
    lines.push(...managedSection);
  }

  return lines;
}

export class UsagePanelComponent implements Component {
  constructor(
    private readonly lines: readonly string[],
    private readonly borderHex: string,
    private readonly title: string = ' Usage ',
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const paint = (s: string): string => chalk.hex(this.borderHex)(s);
    const indent = ' '.repeat(LEFT_MARGIN);

    const availableInterior = Math.max(
      MIN_INTERIOR_WIDTH,
      width - LEFT_MARGIN - 2 - 2 * SIDE_PADDING,
    );
    const longestLine = this.lines.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);
    const contentWidth = Math.max(
      MIN_INTERIOR_WIDTH,
      Math.min(availableInterior, longestLine, Math.max(longestLine, this.title.length)),
    );
    const horzLen = contentWidth + 2 * SIDE_PADDING;

    const trailingDashLen = Math.max(0, horzLen - this.title.length);
    const top =
      indent + paint('╭') + paint(this.title) + paint('─'.repeat(trailingDashLen)) + paint('╮');
    const bottom = indent + paint('╰' + '─'.repeat(horzLen) + '╯');

    const out: string[] = [top];
    for (const line of this.lines) {
      const clipped =
        visibleWidth(line) > contentWidth ? truncateToWidth(line, contentWidth) : line;
      const pad = Math.max(0, contentWidth - visibleWidth(clipped));
      out.push(indent + paint('│') + ' ' + clipped + ' '.repeat(pad) + ' ' + paint('│'));
    }
    out.push(bottom);
    return out;
  }
}
