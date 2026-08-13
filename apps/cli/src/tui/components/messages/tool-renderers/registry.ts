/**
 * 工具结果渲染器注册表。
 *
 * 每个工具名映射到一个把工具的 `ToolResultBlockData` 变为可渲染
 * Component 的 `ResultRenderer`。没有显式条目的工具回退到
 * `renderTruncated`(原始的 3 行 + ctrl+o 行为)。
 *
 * 保持此分发扁平——工具名与其选择的渲染器相邻,新增工具只需追加一个分支。
 */

import { shellExecutionResultRenderer } from '../shell-execution';
import { readMediaSummary } from './media';
import {
  editSummary,
  fetchSummary,
  globSummary,
  grepSummary,
  readSummary,
  thinkSummary,
  webSearchSummary,
  writeSummary,
} from './summary';
import { renderTruncated } from './truncated';
import type { ResultRenderer } from './types';

export function pickResultRenderer(toolName: string): ResultRenderer {
  switch (toolName) {
    case 'Read':
      return readSummary;
    case 'ReadMediaFile':
      return readMediaSummary;
    case 'Grep':
      return grepSummary;
    case 'Glob':
      return globSummary;
    case 'FetchURL':
      return fetchSummary;
    case 'WebSearch':
      return webSearchSummary;
    case 'Bash':
      return shellExecutionResultRenderer;
    case 'Think':
      return thinkSummary;
    case 'Edit':
      return editSummary;
    case 'Write':
      return writeSummary;
    default:
      return renderTruncated;
  }
}

export type { ResultRenderer } from './types';
