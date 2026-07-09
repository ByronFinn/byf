import type { ContentPart, Message, PromptPlan, Tool } from '@byfriends/kosong';

import { isMcpToolName } from '../mcp/tool-naming';

/**
 * Estimate token count from text using a character-based heuristic.
 *   - ASCII (~4 chars per token)
 *   - CJK and other non-ASCII (~1 char per token)
 * The estimate is transient — the next LLM call returns the real count
 * and supersedes this value. Used to keep `tokenCountWithPending`
 * monotonic between LLM round-trips without paying for a tokenizer.
 */
export function estimateTokens(text: string): number {
  let asciiCount = 0;
  let nonAsciiCount = 0;
  for (const char of text) {
    if (char.codePointAt(0)! <= 127) {
      asciiCount++;
    } else {
      nonAsciiCount++;
    }
  }
  return Math.ceil(asciiCount / 4) + nonAsciiCount;
}

export function estimateTokensForMessages(messages: readonly Message[]): number {
  let total = 0;
  for (const message of messages) {
    total += estimateTokensForMessage(message);
  }
  return total;
}

export function estimateTokensForTools(tools: readonly Tool[]): number {
  let total = 0;
  for (const tool of tools) {
    total += estimateTokens(tool.name);
    total += estimateTokens(tool.description);
    total += estimateTokens(JSON.stringify(tool.parameters));
  }
  return total;
}

export function estimateTokensForMessage(message: Message): number {
  let total = estimateTokens(message.role);
  for (const part of message.content) {
    total += estimateTokensForContentPart(part);
  }
  if (message.toolCalls !== undefined) {
    for (const call of message.toolCalls) {
      total += estimateTokens(call.name);
      total += estimateTokens(JSON.stringify(call.arguments));
    }
  }
  return total;
}

export function estimateTokensForContentPart(part: ContentPart): number {
  if (part.type === 'text') {
    return estimateTokens(part.text);
  } else if (part.type === 'think') {
    return estimateTokens(part.think);
  }
  return 0;
}

/**
 * Estimated input-token distribution across six mutually exclusive categories.
 *
 * `tokens` are raw character-heuristic estimates (see {@link estimateTokens}).
 * `percent` is each category expressed as a share of the model's context
 * window — `tokens[field] / maxContextTokens * 100`, rounded to one decimal.
 * The six rows do **not** sum to 100% (they sum to the share of the window
 * actually consumed by estimated input). When `maxContextTokens` is unavailable
 * (no model configured, or zero), every `percent` field is `undefined` — a
 * signal to render the breakdown with absolute values only.
 *
 * The mapping from prompt-plan blocks is: `base` → systemPrompt,
 * `projectInstructions` + `workingEnvironment` → metaContext,
 * `sessionContext` → skills; unknown block names are ignored. Tools are split
 * by `isMcpToolName` into mcpTools vs systemTools; messages are estimated as a
 * whole.
 */
export interface InputTokenBreakdown {
  readonly tokens: {
    readonly systemPrompt: number;
    readonly metaContext: number;
    readonly skills: number;
    readonly mcpTools: number;
    readonly systemTools: number;
    readonly messages: number;
  };
  readonly percent: {
    readonly systemPrompt: number | undefined;
    readonly metaContext: number | undefined;
    readonly skills: number | undefined;
    readonly mcpTools: number | undefined;
    readonly systemTools: number | undefined;
    readonly messages: number | undefined;
  };
}

/** The six breakdown buckets in a fixed order. */
const BREAKDOWN_FIELDS = [
  'systemPrompt',
  'metaContext',
  'skills',
  'mcpTools',
  'systemTools',
  'messages',
] as const;

/**
 * Express each bucket as a share of the context window, rounded to one
 * decimal place. Returns `undefined` for every field when `maxContextTokens`
 * is missing or non-positive — i.e. the percentage cannot be meaningfully
 * computed without a window denominator.
 */
function percentOfWindow(
  tokens: Record<(typeof BREAKDOWN_FIELDS)[number], number>,
  maxContextTokens: number | undefined,
): InputTokenBreakdown['percent'] {
  if (maxContextTokens === undefined || maxContextTokens <= 0) {
    return {
      systemPrompt: undefined,
      metaContext: undefined,
      skills: undefined,
      mcpTools: undefined,
      systemTools: undefined,
      messages: undefined,
    };
  }

  const result = {} as Record<(typeof BREAKDOWN_FIELDS)[number], number>;
  for (const field of BREAKDOWN_FIELDS) {
    // (token / window) * 100, rounded to one decimal via tenths scaling.
    result[field] = Math.round((tokens[field] / maxContextTokens) * 1000) / 10;
  }
  return result;
}

/**
 * Estimate how input tokens are distributed across six mutually exclusive
 * categories, each expressed as a share of the context window.
 *
 * `maxContextTokens` is the denominator for the `percent` fields — pass the
 * model's `max_context_tokens` so the percentages line up with the
 * `Context window` row on the `/usage` panel. Omit it (or pass `0`) when no
 * model is configured; every `percent` field is then `undefined`.
 *
 * Pure function; reuses {@link estimateTokens} / {@link estimateTokensForTools}
 * / {@link estimateTokensForMessages}. See {@link InputTokenBreakdown} for the
 * block-name → bucket mapping.
 */
export function estimateInputBreakdown(input: {
  readonly promptPlan: PromptPlan;
  readonly tools: readonly Tool[];
  readonly messages: readonly Message[];
  readonly maxContextTokens?: number;
}): InputTokenBreakdown {
  const tokens = {
    systemPrompt: 0,
    metaContext: 0,
    skills: 0,
    mcpTools: 0,
    systemTools: 0,
    messages: 0,
  };

  for (const block of input.promptPlan.blocks) {
    switch (block.name) {
      case 'base':
        tokens.systemPrompt += estimateTokens(block.text);
        break;
      case 'projectInstructions':
      case 'workingEnvironment':
        tokens.metaContext += estimateTokens(block.text);
        break;
      case 'sessionContext':
        tokens.skills += estimateTokens(block.text);
        break;
      default:
        // Unknown block names are ignored — they do not belong to any bucket.
        break;
    }
  }

  const mcpTools: Tool[] = [];
  const systemTools: Tool[] = [];
  for (const tool of input.tools) {
    if (isMcpToolName(tool.name)) {
      mcpTools.push(tool);
    } else {
      systemTools.push(tool);
    }
  }
  tokens.mcpTools = estimateTokensForTools(mcpTools);
  tokens.systemTools = estimateTokensForTools(systemTools);

  tokens.messages = estimateTokensForMessages(input.messages);

  const percent = percentOfWindow(tokens, input.maxContextTokens);

  return { tokens, percent };
}
