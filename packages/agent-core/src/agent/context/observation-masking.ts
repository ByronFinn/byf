import type { ContentPart } from '@byfriends/kosong';

import { estimateTokensForMessages } from '../../utils/tokens';
import type { ContextMessage } from './types';

export interface MaskingConfig {
  /** Effective capacity ratio (default 0.6 = 60% of advertised capacity) */
  effectiveCapacityRatio: number;
  /** Low priority masking threshold (default 0.60) */
  lowPriorityThreshold: number;
  /** Medium priority masking threshold (default 0.80) */
  mediumPriorityThreshold: number;
  /** High priority threshold — unmaskable, goes straight to compaction */
  highPriorityThreshold: number;
}

export const DEFAULT_MASKING_CONFIG: MaskingConfig = {
  effectiveCapacityRatio: 0.6,
  lowPriorityThreshold: 0.60,
  mediumPriorityThreshold: 0.80,
  highPriorityThreshold: 0.85,
};

/** Tool priority */
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
    .filter((part): part is Extract<(typeof content)[number], { type: 'text' }> => part.type === 'text')
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

function formatSummary(toolName: string, _args: unknown, lineCount: number, isError: boolean): string {
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
 * Apply observation masking to tool result messages in history.
 * Returns a new history array (does not mutate the original) and masking result.
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
