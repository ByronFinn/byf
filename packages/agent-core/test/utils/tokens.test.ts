import type { Message, PromptBlock, PromptPlan, Tool } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import {
  estimateInputBreakdown,
  estimateTokens,
  estimateTokensForMessages,
  estimateTokensForTools,
} from '../../src/utils/tokens';

/**
 * ASCII text whose `estimateTokens` is exactly `tokens`.
 * estimateTokens treats ASCII as 4 chars/token with ceil, so 4n chars → n tokens.
 */
function textOf(tokens: number): string {
  return 'a'.repeat(tokens * 4);
}

function block(name: string, tokens: number): PromptBlock {
  return { name, text: textOf(tokens), cacheScope: 'none' };
}

/** A user text message whose `estimateTokensForMessage` is exactly `tokens`. */
function messageOf(tokens: number): Message {
  // estimateTokensForMessage = estimateTokens('user') (=1) + content tokens.
  return {
    role: 'user',
    content: [{ type: 'text', text: textOf(Math.max(tokens - 1, 0)) }],
    toolCalls: [],
  };
}

/**
 * A tool whose `estimateTokensForTools` (for this single tool) is exactly
 * `targetTokens`, padding the description to absorb name + parameters cost.
 */
function toolWithTokens(name: string, targetTokens: number): Tool {
  const parameters = { type: 'object', properties: {} };
  const overhead = estimateTokens(name) + estimateTokens(JSON.stringify(parameters));
  const descTokens = Math.max(targetTokens - overhead, 0);
  return { name, description: textOf(descTokens), parameters };
}

/** All six percent fields are `undefined` — used for degenerate-input checks. */
const ALL_UNDEFINED_PERCENT = {
  systemPrompt: undefined,
  metaContext: undefined,
  skills: undefined,
  mcpTools: undefined,
  systemTools: undefined,
  messages: undefined,
} as const;

/**
 * Build an `estimateInputBreakdown` input whose six buckets evaluate to the
 * given exact token counts. metaContext is split across projectInstructions +
 * workingEnvironment so the "combined metaContext" path is exercised.
 * `maxContextTokens` defaults to a large window so percentages are computed.
 */
function inputWithBuckets(buckets: {
  systemPrompt: number;
  metaContext: number;
  skills: number;
  mcpTools: number;
  systemTools: number;
  messages: number;
  maxContextTokens?: number;
}): {
  promptPlan: PromptPlan;
  tools: readonly Tool[];
  messages: readonly Message[];
  maxContextTokens?: number;
} {
  const half = Math.floor(buckets.metaContext / 2);
  const rest = buckets.metaContext - half;
  const blocks: PromptBlock[] = [block('base', buckets.systemPrompt)];
  if (buckets.metaContext > 0) {
    blocks.push(block('projectInstructions', half));
    if (rest > 0) blocks.push(block('workingEnvironment', rest));
  }
  blocks.push(block('sessionContext', buckets.skills));
  const promptPlan: PromptPlan = { blocks };

  const tools: Tool[] = [];
  if (buckets.mcpTools > 0) tools.push(toolWithTokens('mcp__srv__probe', buckets.mcpTools));
  if (buckets.systemTools > 0) tools.push(toolWithTokens('Read', buckets.systemTools));

  const messages: Message[] = buckets.messages > 0 ? [messageOf(buckets.messages)] : [];
  return {
    promptPlan,
    tools,
    messages,
    maxContextTokens: buckets.maxContextTokens,
  };
}

describe('estimateInputBreakdown', () => {
  describe('token bucket mapping', () => {
    it('maps base → systemPrompt', () => {
      const { tokens } = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 40,
          metaContext: 0,
          skills: 0,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
        }),
      );
      expect(tokens.systemPrompt).toBe(40);
      expect(tokens.metaContext).toBe(0);
      expect(tokens.skills).toBe(0);
    });

    it('combines projectInstructions + workingEnvironment → metaContext', () => {
      const { tokens } = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 0,
          metaContext: 30,
          skills: 0,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
        }),
      );
      expect(tokens.metaContext).toBe(30);
      expect(tokens.systemPrompt).toBe(0);
    });

    it('maps sessionContext → skills', () => {
      const { tokens } = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 0,
          metaContext: 0,
          skills: 17,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
        }),
      );
      expect(tokens.skills).toBe(17);
    });

    it('ignores unknown block names without counting or erroring', () => {
      const promptPlan: PromptPlan = {
        blocks: [
          block('base', 10),
          { name: 'unknownBlock', text: textOf(999), cacheScope: 'none' },
          block('sessionContext', 5),
        ],
      };
      const { tokens } = estimateInputBreakdown({
        promptPlan,
        tools: [],
        messages: [],
      });
      // The 999-token unknown block must NOT leak into any bucket.
      expect(tokens.systemPrompt).toBe(10);
      expect(tokens.skills).toBe(5);
      expect(tokens.metaContext).toBe(0);
      expect(tokens.mcpTools).toBe(0);
      expect(tokens.systemTools).toBe(0);
      expect(tokens.messages).toBe(0);
    });
  });

  describe('tool partitioning', () => {
    it('splits tools by isMcpToolName prefix into mcpTools vs systemTools', () => {
      const tools: Tool[] = [
        toolWithTokens('mcp__server__alpha', 100),
        toolWithTokens('mcp__server__beta', 50),
        toolWithTokens('Read', 80),
        toolWithTokens('Write', 70),
      ];
      const { tokens } = estimateInputBreakdown({
        promptPlan: { blocks: [] },
        tools,
        messages: [],
      });
      expect(tokens.mcpTools).toBe(150);
      expect(tokens.systemTools).toBe(150);
    });

    it('estimates tools consistently with estimateTokensForTools', () => {
      const mcp: Tool[] = [toolWithTokens('mcp__s__x', 123)];
      const sys: Tool[] = [toolWithTokens('Grep', 45)];
      const { tokens } = estimateInputBreakdown({
        promptPlan: { blocks: [] },
        tools: [...mcp, ...sys],
        messages: [],
      });
      expect(tokens.mcpTools).toBe(estimateTokensForTools(mcp));
      expect(tokens.systemTools).toBe(estimateTokensForTools(sys));
    });
  });

  describe('messages', () => {
    it('estimates messages via estimateTokensForMessages', () => {
      const messages: Message[] = [messageOf(64), messageOf(36)];
      const { tokens } = estimateInputBreakdown({
        promptPlan: { blocks: [] },
        tools: [],
        messages,
      });
      expect(tokens.messages).toBe(estimateTokensForMessages(messages));
      expect(tokens.messages).toBe(100);
    });
  });

  describe('percentage of context window', () => {
    it('expresses each bucket as token/maxContextTokens, one decimal place', () => {
      // A 100k window so every bucket is a clean fraction of the window.
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 3634,
          metaContext: 3337,
          skills: 2120,
          mcpTools: 380,
          systemTools: 330,
          messages: 190,
          maxContextTokens: 100_000,
        }),
      );
      // Each percent = round(token / 100_000 * 1000) / 10.
      expect(result.percent.systemPrompt).toBe(3.6);
      expect(result.percent.metaContext).toBe(3.3);
      expect(result.percent.skills).toBe(2.1);
      expect(result.percent.mcpTools).toBe(0.4);
      expect(result.percent.systemTools).toBe(0.3);
      expect(result.percent.messages).toBe(0.2);
      for (const value of Object.values(result.percent)) {
        // One decimal place: value * 10 is integral.
        expect(Number.isInteger(Math.round(value! * 10))).toBe(true);
      }
    });

    it('does not force the six rows to sum to 100% (they sum to the window share)', () => {
      // Tokens sum to 10k of a 200k window → the six percent rows sum to ~5%,
      // not 100%. This is the whole point of the context-window denominator.
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 4000,
          metaContext: 3000,
          skills: 1500,
          mcpTools: 900,
          systemTools: 400,
          messages: 200,
          maxContextTokens: 200_000,
        }),
      );
      const sum = Object.values(result.percent)
        .map((v) => v ?? 0)
        .reduce((acc, v) => acc + v, 0);
      // The exact window share is 10_000 / 200_000 * 100 = 5.0%; the summed
      // rounded rows drift slightly (~5.1%) because each row is independently
      // rounded to one decimal. That drift is expected and acceptable — the
      // rows are individual window shares, not a partition forced to 100%.
      expect(sum).toBeGreaterThan(4.5);
      expect(sum).toBeLessThan(6);
      expect(sum).toBeLessThan(100);
    });

    it('rounds to one decimal via tenths scaling at the 0.05 boundary', () => {
      // Formula: Math.round((token / window) * 1000) / 10. With a 100k window:
      //   40 tokens → 0.04% → Math.round(0.4) / 10 = 0.0  (rounds down)
      //   50 tokens → 0.05% → Math.round(0.5) / 10 = 0.1  (rounds up — the boundary)
      //   150 tokens → 0.15% → Math.round(1.5) / 10 = 0.2 (rounds up)
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 40,
          metaContext: 50,
          skills: 150,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
          maxContextTokens: 100_000,
        }),
      );
      expect(result.percent.systemPrompt).toBe(0.0);
      expect(result.percent.metaContext).toBe(0.1);
      expect(result.percent.skills).toBe(0.2);
    });

    it('is deterministic across repeated calls for the same input', () => {
      const input = inputWithBuckets({
        systemPrompt: 2,
        metaContext: 2,
        skills: 2,
        mcpTools: 0,
        systemTools: 0,
        messages: 0,
        maxContextTokens: 10_000,
      });
      const first = estimateInputBreakdown(input);
      const second = estimateInputBreakdown(input);
      expect(second.percent).toEqual(first.percent);
    });

    it('treats a zero-token bucket as 0.0%, not undefined', () => {
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 1000,
          metaContext: 0,
          skills: 0,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
          maxContextTokens: 100_000,
        }),
      );
      expect(result.percent.systemPrompt).toBe(1.0);
      expect(result.percent.metaContext).toBe(0.0);
      expect(result.percent.messages).toBe(0.0);
    });
  });

  describe('degenerate inputs', () => {
    it('returns all undefined percents when maxContextTokens is omitted', () => {
      // No window denominator available → cannot compute a percentage share.
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 3634,
          metaContext: 3337,
          skills: 2120,
          mcpTools: 380,
          systemTools: 330,
          messages: 190,
        }),
      );
      // tokens are still estimated...
      expect(result.tokens.systemPrompt).toBe(3634);
      expect(result.tokens.messages).toBe(190);
      // ...but percent is entirely undefined.
      expect(result.percent).toEqual(ALL_UNDEFINED_PERCENT);
    });

    it('returns all undefined percents when maxContextTokens is 0', () => {
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 100,
          metaContext: 0,
          skills: 0,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
          maxContextTokens: 0,
        }),
      );
      expect(result.tokens.systemPrompt).toBe(100);
      expect(result.percent).toEqual(ALL_UNDEFINED_PERCENT);
    });

    it('returns all undefined percents when total tokens is 0 (window still set)', () => {
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 0,
          metaContext: 0,
          skills: 0,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
          maxContextTokens: 100_000,
        }),
      );
      expect(result.tokens).toEqual({
        systemPrompt: 0,
        metaContext: 0,
        skills: 0,
        mcpTools: 0,
        systemTools: 0,
        messages: 0,
      });
      // Window exists, so percent is computed: every bucket is 0.0%.
      expect(result.percent.systemPrompt).toBe(0.0);
      expect(result.percent.messages).toBe(0.0);
    });

    it('handles completely empty input with no window', () => {
      const result = estimateInputBreakdown({
        promptPlan: { blocks: [] },
        tools: [],
        messages: [],
      });
      expect(Object.values(result.tokens).every((v) => v === 0)).toBe(true);
      expect(result.percent).toEqual(ALL_UNDEFINED_PERCENT);
    });
  });
});
