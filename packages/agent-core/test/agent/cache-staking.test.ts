import { describe, expect, it } from 'bun:test';

import type { Message } from '@byfriends/kosong';

import {
  applyCacheStaking,
  planCacheStaking,
  type StakingContext,
} from '../../src/agent/cache-staking';
import type { CompactionStrategy } from '../../src/agent/compaction';
import { testAgent, type TestAgentContext } from './harness/agent';

describe('CacheStakingStrategy', () => {
  describe('isLastTurnEnd tagging', () => {
    it('tags the last assistant message of the previous turn', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'How are you?' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      expect(result[0]?.cacheHint).toBeUndefined();
      expect(result[1]?.cacheHint).toEqual({ isLastTurnEnd: true });
      expect(result[2]?.cacheHint).toBeUndefined();
    });

    it('does not tag when previousTurnMessageCount is 0', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 0 });

      expect(result[0]?.cacheHint).toBeUndefined();
    });

    it('does not tag when last turn message is not assistant', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        {
          role: 'tool',
          content: [{ type: 'text', text: 'result' }],
          toolCalls: [],
          toolCallId: 'abc',
        },
        { role: 'user', content: [{ type: 'text', text: 'Next' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      // tool message at index 1 should NOT be tagged (not assistant)
      expect(result[1]?.cacheHint).toBeUndefined();
    });

    it('handles empty messages array', () => {
      const result = applyCacheStaking([], { previousTurnMessageCount: 5 });
      expect(result).toEqual([]);
    });

    it('does not mutate original messages', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'Bye' }], toolCalls: [] },
      ];

      applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      expect(messages[1]?.cacheHint).toBeUndefined();
    });

    it('preserves existing cacheHint fields when adding isLastTurnEnd', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi' }],
          toolCalls: [],
          cacheHint: { isSuddenLargeContext: true },
        },
        { role: 'user', content: [{ type: 'text', text: 'Next' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 1 });

      expect(result[0]?.cacheHint).toEqual({
        isSuddenLargeContext: true,
        isLastTurnEnd: true,
      });
    });

    it('handles single-message turn correctly', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 1 });

      expect(result[0]?.cacheHint).toEqual({ isLastTurnEnd: true });
    });
  });

  describe('isSuddenLargeContext tagging (Stake 4)', () => {
    const longText = 'x'.repeat(2500);
    const shortText = 'short';

    it('tags the largest content block in the current turn above threshold', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: shortText }], toolCalls: [] },
        {
          role: 'tool',
          content: [{ type: 'text', text: longText }],
          toolCalls: [],
          toolCallId: 'tc1',
        },
        { role: 'user', content: [{ type: 'text', text: 'What now?' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      // Index 1 = isLastTurnEnd (assistant at previousTurnMessageCount - 1)
      expect(result[1]?.cacheHint?.isLastTurnEnd).toBe(true);
      // Index 3 = isSuddenLargeContext (largest content in current turn)
      expect(result[3]?.cacheHint?.isSuddenLargeContext).toBe(true);
      // Others should not have isSuddenLargeContext
      expect(result[0]?.cacheHint?.isSuddenLargeContext).toBeUndefined();
      expect(result[2]?.cacheHint?.isSuddenLargeContext).toBeUndefined();
      expect(result[4]?.cacheHint?.isSuddenLargeContext).toBeUndefined();
    });

    it('picks the largest qualifying block when multiple exceed threshold', () => {
      const mediumText = 'm'.repeat(2200);
      const hugeText = 'h'.repeat(5000);

      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
        {
          role: 'tool',
          content: [{ type: 'text', text: mediumText }],
          toolCalls: [],
          toolCallId: 'tc1',
        },
        {
          role: 'tool',
          content: [{ type: 'text', text: hugeText }],
          toolCalls: [],
          toolCallId: 'tc2',
        },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      // Index 3 (hugeText, 5000 chars) should win over index 2 (mediumText, 2200 chars)
      expect(result[3]?.cacheHint?.isSuddenLargeContext).toBe(true);
      expect(result[2]?.cacheHint?.isSuddenLargeContext).toBeUndefined();
    });

    it('does not tag when no current-turn message exceeds threshold', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: shortText }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'Still short' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      for (const msg of result) {
        expect(msg.cacheHint?.isSuddenLargeContext).toBeUndefined();
      }
    });

    it('uses custom sizeThreshold', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'a'.repeat(100) }], toolCalls: [] },
      ];

      // With threshold at 50, the 100-char message qualifies
      const result = applyCacheStaking(messages, {
        previousTurnMessageCount: 2,
        sizeThreshold: 50,
      });

      expect(result[2]?.cacheHint?.isSuddenLargeContext).toBe(true);
    });

    it('does not set isSuddenLargeContext on previous turn messages', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: [{ type: 'text', text: longText }],
          toolCalls: [],
          toolCallId: 'tc1',
        },
        { role: 'assistant', content: [{ type: 'text', text: 'Done' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'Next' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      // Index 0 is in previous turn, should NOT get isSuddenLargeContext
      expect(result[0]?.cacheHint?.isSuddenLargeContext).toBeUndefined();
      // No qualifying messages in current turn
      expect(result[2]?.cacheHint?.isSuddenLargeContext).toBeUndefined();
    });
  });
});

/**
 * PRD-0038 AC-6.2：cache staking 按消息序号定位桩 3/4（`previousTurnMessageCount
 * - 1`），turn 中途压缩重写历史长度后该基线不再指向"上一轮的最后一条消息"。
 *
 * 期望的可断言观测是**桩落点索引**（`planCacheStaking`）：基线一旦被判定失效，
 * 桩必须整体不应用（索引为 `null`），而不是继续按旧序号打到错位的地方。
 */
describe('CacheStakingStrategy 基线失效（PRD-0038 AC-6.2）', () => {
  const compactedTurn = (role: Message['role'], text: string): Message => ({
    role,
    content: [{ type: 'text', text }],
    toolCalls: [],
  });

  function stakeIndexes(messages: readonly Message[]): {
    turnEnd: number;
    largeContext: number;
  } {
    return {
      turnEnd: messages.findIndex((message) => message.cacheHint?.isLastTurnEnd === true),
      largeContext: messages.findIndex(
        (message) => message.cacheHint?.isSuddenLargeContext === true,
      ),
    };
  }

  describe('planCacheStaking（桩落点的可断言观测）', () => {
    const history: Message[] = [
      compactedTurn('user', '上一轮提问'),
      compactedTurn('assistant', '上一轮回答'),
      compactedTurn('user', '本轮提问'),
      compactedTurn('assistant', '本轮中途回答'),
    ];

    it('基线有效时报告桩 3 的落点索引', () => {
      expect(planCacheStaking(history, { previousTurnMessageCount: 2 })).toMatchObject({
        turnEndStakeIndex: 1,
        baselineInvalid: false,
      });
    });

    it('基线被判定失效时两个桩都不应用（索引为 null），且不写任何 cacheHint', () => {
      const context: StakingContext = {
        previousTurnMessageCount: 2,
        baselineInvalid: true,
      };

      expect(planCacheStaking(history, context)).toEqual({
        turnEndStakeIndex: null,
        largeContextStakeIndex: null,
        baselineInvalid: true,
      });
      for (const message of applyCacheStaking(history, context)) {
        expect(message.cacheHint).toBeUndefined();
      }
    });

    it('基线落在历史之外（压缩后长度变短）时报失效而非静默跳过', () => {
      expect(
        planCacheStaking(history.slice(0, 2), { previousTurnMessageCount: 4 }).baselineInvalid,
      ).toBe(true);
    });

    it('桩 4 的扫描起点同样随失效基线取消', () => {
      const long: Message = {
        role: 'assistant',
        content: [{ type: 'text', text: 'x'.repeat(2500) }],
        toolCalls: [],
      };
      const messages = [...history.slice(0, 2), long];

      expect(
        planCacheStaking(messages, { previousTurnMessageCount: 2 }).largeContextStakeIndex,
      ).toBe(2);
      expect(
        planCacheStaking(messages, {
          previousTurnMessageCount: 2,
          baselineInvalid: true,
        }).largeContextStakeIndex,
      ).toBeNull();
    });
  });

  describe('TurnFlow 集成：turn 中途发生压缩', () => {
    /**
     * 走生产的 `beforeStep` Pass 4 压缩路径（注入 `CompactionStrategy` 决定何时
     * 压缩、压缩多少条），观测每次 generate 实际收到的 history 上桩的落点。
     * ADR-0011 的桩 3 依赖 `previousTurnMessageCount` 序号，而压缩会原地重写
     * 历史长度——基线一旦失效，桩必须整体不应用。
     */
    async function drive(compactMidTurn: boolean): Promise<Message[][]> {
      const holder: { ctx?: TestAgentContext } = {};
      let compacted = false;
      const strategy: CompactionStrategy = {
        // 历史长到 5 条 = 第 2 轮 step 2 的 beforeStep（上一轮 2 条 + 本轮
        // user/assistant/tool 3 条），正是"turn 中途"的时机。
        shouldCompact: () =>
          compactMidTurn && !compacted && (holder.ctx?.agent.context.history.length ?? 0) >= 5,
        // 让 beforeStep 等压缩落地后再打桩，避免与 worker 竞态。
        shouldBlock: () => holder.ctx?.agent.fullCompaction.isCompacting === true,
        computeCompactCount: () => {
          compacted = true;
          // 摘要掉上一轮 2 条 + 本轮 user 1 条，留下本轮的 assistant/tool。
          return 3;
        },
        checkAfterStep: false,
        maxCompactionPerTurn: 1,
      };

      const ctx = testAgent({ compactionStrategy: strategy });
      holder.ctx = ctx;
      ctx.configure();

      ctx.mockNextResponse({ type: 'text', text: '第一轮回答' });
      ctx.mockNextResponse({
        type: 'function',
        id: 'call_staking',
        name: 'MissingTool',
        arguments: '{}',
      });
      if (compactMidTurn) {
        ctx.mockNextResponse({ type: 'text', text: '中途压缩摘要' });
      }
      ctx.mockNextResponse({ type: 'text', text: '第二轮回答' });
      ctx.mockNextResponse({ type: 'text', text: '第三轮回答' });

      await ctx.rpc.prompt({ input: [{ type: 'text', text: '第一轮提问' }] });
      await ctx.untilTurnEnd();
      await ctx.rpc.prompt({ input: [{ type: 'text', text: '第二轮提问' }] });
      await ctx.untilTurnEnd();
      await ctx.rpc.prompt({ input: [{ type: 'text', text: '第三轮提问' }] });
      await ctx.untilTurnEnd();

      // 压缩摘要请求与真正的 step 共用同一个 systemPrompt（`full.ts` 的 worker
      // 调用点），靠它尾部那条"direct task"指令消息区分，只保留真正的 step。
      const isCompactionSummaryCall = (history: readonly Message[]): boolean =>
        history
          .at(-1)
          ?.content.some(
            (part) =>
              part.type === 'text' && part.text.includes('not part of the above conversation'),
          ) === true;

      const stepHistories = ctx.llmCalls
        .filter((call) => !isCompactionSummaryCall(call.history))
        .map((call) => call.history);
      return stepHistories;
    }

    it('未压缩时同一轮各 step 的桩锚点保持稳定', async () => {
      const histories = await drive(false);
      // [第一轮 step1, 第二轮 step1, 第二轮 step2, 第三轮 step1]
      expect(histories).toHaveLength(4);
      for (const history of histories.slice(1, 3)) {
        expect(stakeIndexes(history!).turnEnd).toBe(1);
      }
    });

    it('中途压缩后不再按失效序号打桩（缺陷：桩落在本轮消息上）', async () => {
      const histories = await drive(true);
      const afterCompaction = histories[2]!;

      // 前置事实：压缩确实在本轮中途落地——历史被重建为
      // [摘要(assistant), 本轮 assistant(工具调用), 本轮 tool 结果]。
      expect(afterCompaction.map((message) => message.role)).toEqual([
        'assistant',
        'assistant',
        'tool',
      ]);
      expect(stakeIndexes(afterCompaction).turnEnd).toBe(-1);
      expect(stakeIndexes(afterCompaction).largeContext).toBe(-1);
    });

    it('失效只作用于当轮：下一轮基线重建后桩 3 恢复', async () => {
      const histories = await drive(true);
      const thirdTurn = histories[3]!;
      const stake = stakeIndexes(thirdTurn);

      expect(stake.turnEnd).toBeGreaterThan(-1);
      expect(thirdTurn[stake.turnEnd]?.role).toBe('assistant');
      // 桩必须落在本轮开始之前就已存在的最后一条消息上。
      expect(stake.turnEnd).toBe(thirdTurn.length - 2);
    });
  });
});
