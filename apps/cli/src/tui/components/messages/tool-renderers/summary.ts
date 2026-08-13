/**
 * 摘要式渲染器——为原始输出量大但信息量低的工具(Grep、Glob)生成可选
 * 的一瞥式内联内容。数值摘要(行数、退出码、大小)位于头部 chip
 * (见 chip.ts),因此多数工具有意渲染空主体,仅在全局展开开关开启时
 * 暴露细节。
 *
 * 错误总是回退到截断渲染器,使用户看到真实错误消息,而非合成摘要。
 */

import type { Component } from '@earendil-works/pi-tui';
import { Text } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import { renderTruncated } from './truncated';
import type { ResultRenderer } from './types';

const GLANCE_SAMPLES = 3;

type GlanceFn = (
  toolCall: Parameters<ResultRenderer>[0],
  result: Parameters<ResultRenderer>[1],
) => string;

function withGlance(glance: GlanceFn | null): ResultRenderer {
  return (toolCall, result, ctx) => {
    if (result.is_error) return renderTruncated(toolCall, result, ctx);

    const out: Component[] = [];
    if (glance !== null) {
      const line = glance(toolCall, result);
      if (line.length > 0) {
        out.push(new Text(`  ${chalk.dim(line)}`, 0, 0));
      }
    }
    if (ctx.expanded && result.output.length > 0) {
      out.push(new Text(chalk.dim(result.output), 4, 0));
    }
    return out;
  };
}

function nonEmptyLines(text: string): string[] {
  if (text.length === 0) return [];
  return text.split('\n').filter((line) => line.length > 0);
}

// Strip a trailing `:line:col:text` so the glance shows the file path
// only, even when grep is in `content` mode (`src/foo.ts:42:    foo()`).
function pathFromGrepLine(line: string): string {
  const idx = line.indexOf(':');
  if (idx <= 0) return line;
  const second = line.indexOf(':', idx + 1);
  if (second <= 0) return line;
  return line.slice(0, second);
}

const grepGlance: GlanceFn = (_toolCall, result) => {
  const lines = nonEmptyLines(result.output);
  if (lines.length === 0) return '';
  const samples = lines.slice(0, GLANCE_SAMPLES).map(pathFromGrepLine);
  const remaining = lines.length - samples.length;
  const tail = remaining > 0 ? `, +${String(remaining)} more` : '';
  return `${samples.join(', ')}${tail}`;
};

const globGlance: GlanceFn = (_toolCall, result) => {
  const lines = nonEmptyLines(result.output);
  if (lines.length === 0) return '';
  const samples = lines.slice(0, GLANCE_SAMPLES);
  const remaining = lines.length - samples.length;
  const tail = remaining > 0 ? `, +${String(remaining)} more` : '';
  return `${samples.join(', ')}${tail}`;
};

// ── Exports ──────────────────────────────────────────────────────────

// Tools whose chip already conveys everything — the body is empty in
// the collapsed state and only the raw output appears when expanded.
export const readSummary: ResultRenderer = withGlance(null);
export const fetchSummary: ResultRenderer = withGlance(null);
export const webSearchSummary: ResultRenderer = withGlance(null);
export const thinkSummary: ResultRenderer = withGlance(null);
export const editSummary: ResultRenderer = withGlance(null);
export const writeSummary: ResultRenderer = withGlance(null);

// Tools that benefit from inline path samples below the chip.
export const grepSummary: ResultRenderer = withGlance(grepGlance);
export const globSummary: ResultRenderer = withGlance(globGlance);
