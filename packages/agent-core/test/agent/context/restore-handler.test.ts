import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import { testAgent } from '../harness/agent';

describe('ContextMemory restore handler', () => {
  describe('restore path (Phase 5：context.* 已注册 Op，单条 restore = dispatch apply + handleReplayRecord 副作用)', () => {
    it('should restore context.append_message records', () => {
      const ctx = testAgent();

      const testRecord: AgentRecord = {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'test message' }],
          toolCalls: [],
          origin: { kind: 'user' },
        },
      };

      expect(() => {
        ctx.dispatch(testRecord);
      }).not.toThrow();

      // Verify the message was restored
      const history = ctx.agent.context.history;
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: 'test message' }],
      });
    });

    it('should restore context.clear records', () => {
      const ctx = testAgent();

      // Add some initial context
      ctx.agent.context.appendMessage({
        role: 'user',
        content: [{ type: 'text', text: 'initial message' }],
        toolCalls: [],
      });

      expect(ctx.agent.context.history).toHaveLength(1);

      const clearRecord: AgentRecord = {
        type: 'context.clear',
      };

      ctx.dispatch(clearRecord);

      // Verify the context was cleared
      expect(ctx.agent.context.history).toHaveLength(0);
    });

    it('should restore context.apply_compaction records', () => {
      const ctx = testAgent();

      // Add some initial context
      for (let i = 0; i < 5; i++) {
        ctx.agent.context.appendMessage({
          role: 'user',
          content: [{ type: 'text', text: `message ${i}` }],
          toolCalls: [],
        });
      }

      expect(ctx.agent.context.history).toHaveLength(5);

      const compactionRecord: AgentRecord = {
        type: 'context.apply_compaction',
        compactedCount: 3,
        summary: 'Compacted summary',
        tokensBefore: 1000,
        tokensAfter: 100,
      };

      ctx.dispatch(compactionRecord);

      // Verify compaction was applied - should have summary + remaining messages
      expect(ctx.agent.context.history.length).toBeGreaterThanOrEqual(1);
      expect(ctx.agent.context.history[0]).toMatchObject({
        role: 'assistant',
        content: [{ type: 'text', text: 'Compacted summary' }],
      });
      expect(ctx.agent.context.history).toHaveLength(3);
    });

    it('should restore context.mark_last_user_prompt_blocked records', () => {
      const ctx = testAgent();

      // Add a user message
      ctx.agent.context.appendMessage({
        role: 'user',
        content: [{ type: 'text', text: 'user message' }],
        toolCalls: [],
        origin: { kind: 'user' },
      });

      const blockedRecord: AgentRecord = {
        type: 'context.mark_last_user_prompt_blocked',
        hookEvent: 'test-hook',
      };

      ctx.dispatch(blockedRecord);

      // Verify the last user prompt was marked as blocked
      const history = ctx.agent.context.history;
      expect(history.at(-1)).toMatchObject({
        role: 'user',
        origin: {
          kind: 'user',
          blockedByHook: 'test-hook',
        },
      });
    });

    it('should restore context.observation_masking records (legacyRoute)', () => {
      const ctx = testAgent();

      const maskingRecord: AgentRecord = {
        type: 'context.observation_masking',
        maskedCount: 2,
        tokensBefore: 1000,
        tokensAfter: 800,
      };

      expect(() => {
        ctx.dispatch(maskingRecord);
      }).not.toThrow();
    });
  });
});
