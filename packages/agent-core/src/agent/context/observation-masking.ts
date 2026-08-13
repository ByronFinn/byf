import type { ContentPart } from '@byfriends/kosong';

import { estimateTokensForMessages } from '../../utils/tokens';
import type { ContextMessage } from './types';

export interface MaskingConfig {
  /** 有效容量比例(默认 0.6 = 通告容量的 60%) */
  effectiveCapacityRatio: number;
  /** 低优先级遮蔽阈值(默认 0.60) */
  lowPriorityThreshold: number;
  /** 中优先级遮蔽阈值(默认 0.80) */
  mediumPriorityThreshold: number;
  /** 高优先级阈值——不可遮蔽,直接进入压缩 */
  highPriorityThreshold: number;
}

export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  effectiveCapacityRatio: 0.6,
  lowPriorityThreshold: 0.6,
  mediumPriorityThreshold: 0.8,
  highPriorityThreshold: 0.85,
};

/** 工具优先级 */
export type ToolPriority = 'high' | 'medium' | 'low';

export function getToolPriority(toolName: string): ToolPriority {
  switch (toolName) {
    case 'Write':
    case 'Edit':
    case 'Agent':
      return 'high';
    case 'Bash':
      return 'medium';
    case 'Read':
    case 'Glob':
    case 'Grep':
      return 'low';
    default:
      return 'low';
  }
}

export interface MaskingResult {
  masked: boolean;
  maskedCount: number;
  tokensBefore: number;
  tokensAfter: number;
}

interface ToolCallInfo {
  readonly name: string;
  readonly args: unknown;
}

function extractTextFromContent(content: string | ContentPart[]): string {
  if (typeof content === 'string') return content;
  return content
    .filter(
      (part): part is Extract<(typeof content)[number], { type: 'text' }> => part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}

function countLines(text: string): number {
  if (text.length === 0) return 0;
  let count = 1;
  for (const char of text) {
    if (char === '\n') count++;
  }
  return count;
}

function headTailLines(text: string, headCount: number, tailCount: number): string {
  const lines = text.split('\n');
  if (lines.length <= headCount + tailCount) return text;
  const head = lines.slice(0, headCount).join('\n');
  const tail = lines.slice(-tailCount).join('\n');
  return `${head}\n...\n${tail}`;
}

function formatSummary(
  toolName: string,
  _args: unknown,
  lineCount: number,
  isError: boolean,
): string {
  const errorTag = isError ? ', error' : '';
  return `[${toolName}: ${String(lineCount)} lines${errorTag}]`;
}

function isAlreadyMasked(text: string, toolName: string): boolean {
  return text.startsWith(`[${toolName}:`);
}

function maskToolResult(
  message: ContextMessage,
  toolName: string,
  toolArgs: unknown,
): ContextMessage {
  const text = extractTextFromContent(message.content);

  // Prevent re-masking an already-masked message
  if (isAlreadyMasked(text, toolName)) {
    return message;
  }

  const lineCount = countLines(text);
  const summary = formatSummary(toolName, toolArgs, lineCount, message.isError === true);

  const priority = getToolPriority(toolName);
  let maskedContent: string;

  if (priority === 'high') {
    // High priority: summary only
    maskedContent = summary;
  } else {
    const headCount = priority === 'medium' ? 3 : 3;
    const tailCount =
      priority === 'medium'
        ? 5 // Bash
        : toolName === 'Read'
          ? 3
          : 2; // Grep, Glob, and others

    if (lineCount <= headCount + tailCount) {
      if (lineCount === 0) {
        maskedContent = summary;
      } else {
        maskedContent = `${summary}\n---\n${text}`;
      }
    } else {
      const headTail = headTailLines(text, headCount, tailCount);
      maskedContent = `${summary}\n---\n${headTail}`;
    }
  }

  return {
    ...message,
    content: [{ type: 'text', text: maskedContent }],
  };
}

/**
 * 对历史中的工具结果消息应用 observation masking。
 * 返回新的历史数组(不修改原数组)与遮蔽结果。
 */
export function applyObservationMasking(
  history: readonly ContextMessage[],
  maxContextSize: number,
  toolCallIdToInfo: ReadonlyMap<string, ToolCallInfo>,
  config: MaskingConfig = DEFAULT_MASKING_CONFIG,
): { history: ContextMessage[]; result: MaskingResult } {
  const effectiveCapacity = maxContextSize * config.effectiveCapacityRatio;
  const tokensBefore = estimateTokensForMessages(history);
  const pressure = effectiveCapacity > 0 ? tokensBefore / effectiveCapacity : 0;

  // Determine which priorities should be masked
  let maskPriorities: Set<ToolPriority>;
  if (pressure < config.lowPriorityThreshold) {
    maskPriorities = new Set();
  } else if (pressure < config.mediumPriorityThreshold) {
    maskPriorities = new Set<ToolPriority>(['low']);
  } else if (pressure < config.highPriorityThreshold) {
    maskPriorities = new Set<ToolPriority>(['low', 'medium']);
  } else {
    maskPriorities = new Set<ToolPriority>(['low', 'medium']);
    // Note: high priority (Write/Edit) is never masked — goes to compaction
  }

  if (maskPriorities.size === 0) {
    return {
      history: [...history],
      result: { masked: false, maskedCount: 0, tokensBefore, tokensAfter: tokensBefore },
    };
  }

  let maskedCount = 0;
  const newHistory: ContextMessage[] = [];

  for (const message of history) {
    if (message.role !== 'tool' || message.toolCallId === undefined) {
      newHistory.push(message);
      continue;
    }

    const info = toolCallIdToInfo.get(message.toolCallId);
    if (info === undefined) {
      newHistory.push(message);
      continue;
    }

    const priority = getToolPriority(info.name);
    if (!maskPriorities.has(priority)) {
      newHistory.push(message);
      continue;
    }

    const masked = maskToolResult(message, info.name, info.args);
    newHistory.push(masked);
    if (masked !== message) {
      maskedCount++;
    }
  }

  const tokensAfter = estimateTokensForMessages(newHistory);

  return {
    history: newHistory,
    result: {
      masked: maskedCount > 0,
      maskedCount,
      tokensBefore,
      tokensAfter,
    },
  };
}
