import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import { testAgent } from '../harness/agent';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';

describe('ContextMemory restore handler', () => {
  describe('restoreRecord method', () => {
    it('should restore context.append_message records', () => {
      const { agent } = testAgent();

      // Ensure context implements RecordRestoreHandler
      const context = agent.context as unknown as RecordRestoreHandler;

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
        context.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the message was restored
      const history = agent.context.history;
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: 'test message' }],
      });
    });

    it('should restore context.clear records', () => {
      const { agent } = testAgent();

      // Add some initial context
      agent.context.appendMessage({
        role: 'user',
        content: [{ type: 'text', text: 'initial message' }],
        toolCalls: [],
      });

      expect(agent.context.history).toHaveLength(1);

      const context = agent.context as unknown as RecordRestoreHandler;

      const clearRecord: AgentRecord = {
        type: 'context.clear',
      };

      context.restoreRecord(clearRecord);

      // Verify the context was cleared
      expect(agent.context.history).toHaveLength(0);
    });

    it('should restore context.apply_compaction records', () => {
      const { agent } = testAgent();

      // Add some initial context
      for (let i = 0; i < 5; i++) {
        agent.context.appendMessage({
          role: 'user',
          content: [{ type: 'text', text: `message ${i}` }],
          toolCalls: [],
        });
      }

      expect(agent.context.history).toHaveLength(5);

      const context = agent.context as unknown as RecordRestoreHandler;

      const compactionRecord: AgentRecord = {
        type: 'context.apply_compaction',
        compactedCount: 3,
        summary: 'Compacted summary',
        tokensAfter: 100,
      };

      context.restoreRecord(compactionRecord);

      // Verify compaction was applied - should have summary + remaining messages
      expect(agent.context.history.length).toBeGreaterThanOrEqual(1);
      expect(agent.context.history[0]).toMatchObject({
        role: 'assistant',
        content: [{ type: 'text', text: 'Compacted summary' }],
      });
    });

    it('should restore context.mark_last_user_prompt_blocked records', () => {
      const { agent } = testAgent();

      // Add a user message
      agent.context.appendMessage({
        role: 'user',
        content: [{ type: 'text', text: 'user message' }],
        toolCalls: [],
        origin: { kind: 'user' },
      });

      const context = agent.context as unknown as RecordRestoreHandler;

      const blockedRecord: AgentRecord = {
        type: 'context.mark_last_user_prompt_blocked',
        hookEvent: 'test-hook',
      };

      context.restoreRecord(blockedRecord);

      // Verify the last user prompt was marked as blocked
      const history = agent.context.history;
      expect(history[history.length - 1]).toMatchObject({
        role: 'user',
        origin: {
          kind: 'user',
          blockedByHook: 'test-hook',
        },
      });
    });

    it('should restore context.observation_masking records', () => {
      const { agent } = testAgent();

      const context = agent.context as unknown as RecordRestoreHandler;

      const maskingRecord: AgentRecord = {
        type: 'context.observation_masking',
        maskedCount: 2,
        tokensBefore: 1000,
        tokensAfter: 800,
      };

      expect(() => {
        context.restoreRecord(maskingRecord);
      }).not.toThrow();
    });
  });
});