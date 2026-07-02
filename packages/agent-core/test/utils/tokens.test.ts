import type { Message, PromptBlock, PromptPlan, Tool } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import {
  estimateInputBreakdown,
  estimateTokens,
  estimateTokensForMessages,
  estimateTokensForTools,
  type InputTokenBreakdown,
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

function sumPercents(b: InputTokenBreakdown): number {
  const p = b.percent;
  return (
    (p.systemPrompt ?? 0) +
    (p.metaContext ?? 0) +
    (p.skills ?? 0) +
    (p.mcpTools ?? 0) +
    (p.systemTools ?? 0) +
    (p.messages ?? 0)
  );
}

/**
 * Build an `estimateInputBreakdown` input whose six buckets evaluate to the
 * given exact token counts. metaContext is split across projectInstructions +
 * workingEnvironment so the "combined metaContext" path is exercised.
 */
function inputWithBuckets(buckets: {
  systemPrompt: number;
  metaContext: number;
  skills: number;
  mcpTools: number;
  systemTools: number;
  messages: number;
}): { promptPlan: PromptPlan; tools: readonly Tool[]; messages: readonly Message[] } {
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
  return { promptPlan, tools, messages };
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

  describe('largest-remainder normalization', () => {
    it('strictly sums the six percent fields to exactly 100', () => {
      const datasets = [
        // The PRD's worked example.
        [3634, 3337, 2120, 380, 330, 190] as const,
        // Three-way equal split (naive round → 99.9).
        [1, 1, 1, 0, 0, 0] as const,
        // Two-way equal split.
        [5, 5, 0, 0, 0, 0] as const,
        // A heavier dataset that tends to drift under naive rounding.
        [4000, 3000, 1500, 900, 400, 200] as const,
        // Single non-zero bucket → must be 100.0.
        [7, 0, 0, 0, 0, 0] as const,
        // Awkward remainders across all six.
        [101, 103, 107, 109, 113, 127] as const,
        // Overshoot-prone: six shares near an x.x5 boundary (naive round → 100.1).
        [17, 17, 17, 17, 16, 16] as const,
      ];
      for (const [sp, mc, sk, mt, st, mm] of datasets) {
        const result = estimateInputBreakdown(
          inputWithBuckets({
            systemPrompt: sp,
            metaContext: mc,
            skills: sk,
            mcpTools: mt,
            systemTools: st,
            messages: mm,
          }),
        );
        const sum = sumPercents(result);
        expect(sum, `dataset ${JSON.stringify([sp, mc, sk, mt, st, mm])}`).toBeCloseTo(100, 9);
      }
    });

    it('produces one-decimal percentages for the PRD example dataset', () => {
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
      for (const value of Object.values(result.percent)) {
        expect(value).not.toBeUndefined();
        // One decimal place: value * 10 is integral.
        expect(Number.isInteger(Math.round(value! * 10))).toBe(true);
        // Stronger: rounded to 1 decimal is a no-op.
        expect(Math.round(value! * 10) / 10).toBe(value);
      }
      expect(sumPercents(result)).toBeCloseTo(100, 9);
    });

    it('is deterministic across repeated calls for the same input (tie handling)', () => {
      // Three equal buckets create tied remainders; output must be stable.
      const input = inputWithBuckets({
        systemPrompt: 2,
        metaContext: 2,
        skills: 2,
        mcpTools: 0,
        systemTools: 0,
        messages: 0,
      });
      const first = estimateInputBreakdown(input);
      const second = estimateInputBreakdown(input);
      expect(second.percent).toEqual(first.percent);
      expect(sumPercents(first)).toBeCloseTo(100, 9);
      // Tie-break rule: earlier field order wins. Each of the three tied
      // buckets floors to 33.3%; the one residual tenth goes to systemPrompt
      // (the earliest field), so it must be >= the later tied fields.
      expect(first.percent.systemPrompt).toBeGreaterThanOrEqual(first.percent.metaContext!);
      expect(first.percent.metaContext).toBeGreaterThanOrEqual(first.percent.skills!);
      expect(first.percent.mcpTools).toBe(0);
    });
  });

  describe('degenerate inputs', () => {
    it('returns all undefined percents when total tokens is 0', () => {
      const result = estimateInputBreakdown(
        inputWithBuckets({
          systemPrompt: 0,
          metaContext: 0,
          skills: 0,
          mcpTools: 0,
          systemTools: 0,
          messages: 0,
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
      expect(result.percent).toEqual({
        systemPrompt: undefined,
        metaContext: undefined,
        skills: undefined,
        mcpTools: undefined,
        systemTools: undefined,
        messages: undefined,
      });
    });

    it('handles completely empty input (no blocks, no tools, no messages)', () => {
      const result = estimateInputBreakdown({
        promptPlan: { blocks: [] },
        tools: [],
        messages: [],
      });
      expect(sumPercents(result)).toBe(0);
      expect(Object.values(result.tokens).every((v) => v === 0)).toBe(true);
    });
  });
});
