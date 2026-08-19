/**
 * 头部 chip 提供者——结果到达后,生成追加到工具调用头部的短「统计」后缀。
 * chip 拥有*数值*摘要(行数、退出码、字节大小),因此下面的摘要渲染器
 * 不再重复它们。
 *
 * 返回 `''` 的 chip 被抑制;注册表中无条目的工具完全没有 chip。
 */

import { computeDiffLines } from '#/tui/components/media/diff-preview';
import type { ToolCallBlockData, ToolResultBlockData } from '#/tui/types';
import { formatBytes } from '#/utils/format';

import { readMediaChip } from './media';
import { strArg } from './types';

export type ChipProvider = (toolCall: ToolCallBlockData, result: ToolResultBlockData) => string;

export function countNonEmptyLines(text: string): number {
  if (text.length === 0) return 0;
  let n = 0;
  for (const line of text.split('\n')) if (line.length > 0) n++;
  return n;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return `${String(n)} ${n === 1 ? singular : (plural ?? `${singular}s`)}`;
}

export interface EditStats {
  readonly added: number;
  readonly removed: number;
}

export interface WriteStats {
  readonly lines: number;
}

export function computeEditStats(args: Record<string, unknown>): EditStats {
  const oldStr = strArg(args, 'old_string');
  const newStr = strArg(args, 'new_string');
  if (oldStr.length === 0 && newStr.length === 0) return { added: 0, removed: 0 };
  const diff = computeDiffLines(oldStr, newStr);
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.kind === 'add') added++;
    else if (line.kind === 'delete') removed++;
  }
  return { added, removed };
}

export function computeWriteStats(args: Record<string, unknown>): WriteStats {
  const content = strArg(args, 'content');
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  const lines = normalized.length > 0 ? normalized.split('\n').length : 0;
  return { lines };
}

export function formatEditChip(stats: EditStats): string {
  const parts: string[] = [];
  if (stats.added > 0) parts.push(`+${String(stats.added)}`);
  if (stats.removed > 0) parts.push(`-${String(stats.removed)}`);
  return parts.join(' ');
}

export function formatWriteChip(stats: WriteStats): string {
  return pluralize(stats.lines, 'line');
}

const editChip: ChipProvider = (toolCall) => {
  const stats = computeEditStats(toolCall.args);
  if (stats.added === 0 && stats.removed === 0) return '';
  return formatEditChip(stats);
};

const writeChip: ChipProvider = (toolCall) => formatWriteChip(computeWriteStats(toolCall.args));

const readChip: ChipProvider = (_toolCall, result) =>
  pluralize(countNonEmptyLines(result.output), 'line');

const grepChip: ChipProvider = (_toolCall, result) => {
  const matches = countNonEmptyLines(result.output);
  if (matches === 0) return 'no matches';
  return pluralize(matches, 'match', 'matches');
};

const globChip: ChipProvider = (_toolCall, result) => {
  const files = countNonEmptyLines(result.output);
  if (files === 0) return 'no files';
  return pluralize(files, 'file');
};

const fetchChip: ChipProvider = (_toolCall, result) =>
  formatBytes(Buffer.byteLength(result.output, 'utf8'));

const webSearchChip: ChipProvider = (_toolCall, result) => {
  const lines = result.output.split('\n').filter((l) => l.trim().length > 0);
  let count = 0;
  for (const line of lines) {
    if (/^\s*(\d+\.|[-*])\s+/.test(line)) count++;
  }
  if (count === 0) return lines.length === 0 ? 'no results' : 'web result';
  return pluralize(count, 'result');
};

const bashChip: ChipProvider = (_toolCall, result) => {
  const lines = result.output.split('\n').filter((l) => l.trim().length > 0).length;
  if (lines === 0) return '';
  if (!result.is_error) return pluralize(lines, 'line');
  const m =
    result.output.match(/Command failed with exit code: (\d+)/) ??
    result.output.match(/Process exited with code (\d+)/);
  if (m) return `exit ${m[1]}, ${pluralize(lines, 'line')}`;
  return pluralize(lines, 'line');
};

const REGISTRY: Record<string, ChipProvider> = {
  Bash: bashChip,
  Edit: editChip,
  Write: writeChip,
  Read: readChip,
  ReadMediaFile: readMediaChip,
  Grep: grepChip,
  Glob: globChip,
  FetchURL: fetchChip,
  WebSearch: webSearchChip,
};

export function pickChip(toolName: string): ChipProvider | undefined {
  return REGISTRY[toolName];
}
