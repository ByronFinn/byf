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
 * `percent` are the same six values normalized via the largest-remainder method
 * so they sum strictly to `100.0` (one decimal place). When the six token
 * values total zero, every `percent` field is `undefined` — a signal to render
 * the breakdown with absolute values only.
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

/** The six breakdown buckets in a fixed order, used for normalization. */
const BREAKDOWN_FIELDS = [
  'systemPrompt',
  'metaContext',
  'skills',
  'mcpTools',
  'systemTools',
  'messages',
] as const;

/**
 * Largest-remainder method: distribute `1000` tenths-of-a-percent across six
 * items so the result sums to exactly `1000` (= 100.0%). Each item gets at
 * least `floor(share * 10)` tenths; the residual tenths are handed out to the
 * items with the largest remainders (ties broken by fixed field order, then by
 * larger raw token count) so the allocation is deterministic.
 *
 * Returns `undefined` for every field when `total` is zero.
 */
function normalizePercent(
  rawTokens: Record<(typeof BREAKDOWN_FIELDS)[number], number>,
  total: number,
): InputTokenBreakdown['percent'] {
  if (total === 0) {
    return {
      systemPrompt: undefined,
      metaContext: undefined,
      skills: undefined,
      mcpTools: undefined,
      systemTools: undefined,
      messages: undefined,
    };
  }

  // scaled = (item/total) * 100 * 10, i.e. tenths of a percent.
  const scaled = BREAKDOWN_FIELDS.map((field) => (rawTokens[field] / total) * 1000);
  const lower = scaled.map((value) => Math.floor(value));
  const remainder = scaled.map((value, i) => value - lower[i]!);

  let deficit = 1000 - lower.reduce((sum, value) => sum + value, 0);

  // Indexes of items still eligible for a +1 tenths, sorted by remainder desc,
  // then by fixed field order, then by larger raw token count. The sort is
  // stable so equal remainders resolve deterministically.
  const ranked = [...scaled.keys()].toSorted((a, b) => {
    const byRemainder = remainder[b]! - remainder[a]!;
    if (byRemainder !== 0) return byRemainder;
    if (a !== b) return a - b; // earlier field wins ties
    return rawTokens[BREAKDOWN_FIELDS[b]!] - rawTokens[BREAKDOWN_FIELDS[a]!];
  });

  const adjusted = [...lower];
  for (const index of ranked) {
    if (deficit <= 0) break;
    adjusted[index]! += 1;
    deficit -= 1;
  }

  const result = {} as Record<(typeof BREAKDOWN_FIELDS)[number], number>;
  adjusted.forEach((tenths, i) => {
    result[BREAKDOWN_FIELDS[i]!] = tenths / 10;
  });
  return result;
}

/**
 * Estimate how input tokens are distributed across six mutually exclusive
 * categories, with normalized percentages that sum strictly to 100%.
 *
 * Pure function; reuses {@link estimateTokens} / {@link estimateTokensForTools}
 * / {@link estimateTokensForMessages}. See {@link InputTokenBreakdown} for the
 * block-name → bucket mapping and the normalization guarantee.
 */
export function estimateInputBreakdown(input: {
  readonly promptPlan: PromptPlan;
  readonly tools: readonly Tool[];
  readonly messages: readonly Message[];
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

  const total =
    tokens.systemPrompt +
    tokens.metaContext +
    tokens.skills +
    tokens.mcpTools +
    tokens.systemTools +
    tokens.messages;

  const percent = normalizePercent(tokens, total);

  return { tokens, percent };
}
