import type { Message } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { applyCacheStaking, type StakingContext } from '../../src/agent/cache-staking';

describe('CacheStakingStrategy', () => {
  describe('isLastTurnEnd tagging', () => {
    it('tags the last assistant message of the previous turn', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
        { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }], toolCalls: [] },
        { role: 'user', content: [{ type: 'text', text: 'How are you?' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 2 });

      expect(result[0].cacheHint).toBeUndefined();
      expect(result[1].cacheHint).toEqual({ isLastTurnEnd: true });
      expect(result[2].cacheHint).toBeUndefined();
    });

    it('does not tag when previousTurnMessageCount is 0', () => {
      const messages: Message[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 0 });

      expect(result[0].cacheHint).toBeUndefined();
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
      expect(result[1].cacheHint).toBeUndefined();
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

      expect(messages[1].cacheHint).toBeUndefined();
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

      expect(result[0].cacheHint).toEqual({
        isSuddenLargeContext: true,
        isLastTurnEnd: true,
      });
    });

    it('handles single-message turn correctly', () => {
      const messages: Message[] = [
        { role: 'assistant', content: [{ type: 'text', text: 'Hi' }], toolCalls: [] },
      ];

      const result = applyCacheStaking(messages, { previousTurnMessageCount: 1 });

      expect(result[0].cacheHint).toEqual({ isLastTurnEnd: true });
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
      expect(result[1].cacheHint?.isLastTurnEnd).toBe(true);
      // Index 3 = isSuddenLargeContext (largest content in current turn)
      expect(result[3].cacheHint?.isSuddenLargeContext).toBe(true);
      // Others should not have isSuddenLargeContext
      expect(result[0].cacheHint?.isSuddenLargeContext).toBeUndefined();
      expect(result[2].cacheHint?.isSuddenLargeContext).toBeUndefined();
      expect(result[4].cacheHint?.isSuddenLargeContext).toBeUndefined();
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
      expect(result[3].cacheHint?.isSuddenLargeContext).toBe(true);
      expect(result[2].cacheHint?.isSuddenLargeContext).toBeUndefined();
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

      expect(result[2].cacheHint?.isSuddenLargeContext).toBe(true);
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
      expect(result[0].cacheHint?.isSuddenLargeContext).toBeUndefined();
      // No qualifying messages in current turn
      expect(result[2].cacheHint?.isSuddenLargeContext).toBeUndefined();
    });
  });
});
