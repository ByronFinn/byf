import { describe, expect, it } from 'vitest';

import { testAgent } from './harness/agent';
import type { AgentRecord } from '../../src/agent/records/types';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';

describe('Wire.jsonl compatibility regression tests', () => {
  describe('版本兼容性测试', () => {
    it('应该正确恢复v1.0版本的wire.jsonl', async () => {
      // 模拟一个v1.0版本的记录（包含旧的tool call格式）
      const v1Records: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.0',
          created_at: 1000000,
        },
        {
          type: 'config.update',
          modelAlias: 'test-model',
          systemPrompt: 'Test system prompt',
          thinkingLevel: 'medium',
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Test user message' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
        {
          type: 'context.append_loop_event',
          event: {
            type: 'tool.result',
            parentUuid: 'step-uuid',
            toolCallId: 'call_test',
            result: {
              output: 'Tool output',
              isError: false,
            },
          },
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(v1Records);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      // 验证恢复成功
      expect(result.error).toBeUndefined();

      // 验证状态正确恢复
      expect(agent.config.modelAlias).toBe('test-model');
      expect(agent.config.systemPrompt).toBe('Test system prompt');
      expect(agent.context.history.length).toBeGreaterThan(0);
    });

    it('应该正确恢复v1.1版本的wire.jsonl', async () => {
      // 当前版本的记录格式
      const v1Records: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 2000000,
        },
        {
          type: 'config.update',
          modelAlias: 'new-model',
          systemPrompt: 'New system prompt',
          thinkingLevel: 'high',
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Another test message' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(v1Records);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeUndefined();
      expect(agent.config.modelAlias).toBe('new-model');
      expect(agent.config.systemPrompt).toBe('New system prompt');
    });

    it('应该处理包含完整compaction历史的旧版本文件', async () => {
      const recordsWithCompaction: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.0',
          created_at: 1000000,
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Message 1' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
        {
          type: 'context.append_message',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Response 1' }],
            toolCalls: [],
          },
        },
        {
          type: 'full_compaction.begin',
          turnId: 1,
          source: 'auto',
          maxSize: 4000,
          usedSize: 3000,
        } as unknown as AgentRecord,
        {
          type: 'full_compaction.complete',
          compactedCount: 2,
          summary: 'Compacted into summary',
          tokensBefore: 3000,
          tokensAfter: 1500,
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Message 2' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(recordsWithCompaction);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeUndefined();

      // 验证compaction历史被正确恢复
      expect(agent.fullCompaction.compactedHistory).toHaveLength(1);
      expect(agent.fullCompaction.compactedHistory[0]).toHaveProperty('text');
      expect(typeof agent.fullCompaction.compactedHistory[0].text).toBe('string');
    });
  });

  describe('复杂会话历史恢复', () => {
    it('应该正确恢复包含多种记录类型的复杂会话', async () => {
      const complexRecords: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          cwd: '/workspace',
          modelAlias: 'claude-3-5-sonnet-20241022',
          systemPrompt: 'You are a helpful assistant.',
          thinkingLevel: 'medium',
        },
        {
          type: 'permission.set_mode',
          mode: 'manual',
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Help me understand this codebase' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
        {
          type: 'context.append_loop_event',
          event: {
            type: 'tool.result',
            parentUuid: 'step-1',
            toolCallId: 'call_grep',
            result: {
              output: 'Found 5 files',
              isError: false,
            },
          },
        },
        {
          type: 'usage.record',
          model: 'claude-3-5-sonnet-20241022',
          usage: {
            inputCacheCreation: 1000,
            inputCacheRead: 500,
            inputOther: 2000,
            output: 1500,
          },
          usageScope: 'session',
        },
        {
          type: 'tools.set_active_tools',
          names: ['Bash', 'Read', 'Write', 'Grep'],
        },
        {
          type: 'context.append_message',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'I found 5 files for you' }],
            toolCalls: [],
          },
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(complexRecords);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeUndefined();

      // 验证所有子系统都被正确恢复
      expect(agent.config.cwd).toBe('/workspace');
      expect(agent.config.modelAlias).toBe('claude-3-5-sonnet-20241022');
      expect(agent.context.history.length).toBeGreaterThan(0);
      expect(agent.permission.mode).toBe('manual');
      expect(agent.usage.data().total).toMatchObject({
        inputCacheCreation: 1000,
        inputCacheRead: 500,
        inputOther: 2000,
        output: 1500,
      });
    });
  });

  describe('向后兼容性保证', () => {
    it('应该支持包含legacy plan_mode记录的旧文件', async () => {
      const legacyRecords: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.0',
          created_at: 1000000,
        },
        {
          type: 'plan_mode.enter',
          input: [{ type: 'text', text: 'Plan request' }],
          origin: { kind: 'user' },
        } as unknown as AgentRecord,
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'After planning' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(legacyRecords);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      // Legacy plan_mode records should be treated as no-ops during replay
      expect(result.error).toBeUndefined();
      expect(agent.context.history.length).toBeGreaterThan(0);
    });

    it('应该正确处理部分缺失或损坏的记录', async () => {
      // 测试对边缘情况的处理
      const edgeCaseRecords: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          // 缺少一些字段
          modelAlias: 'test',
        } as unknown as AgentRecord,
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Minimal message' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(edgeCaseRecords);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      // 应该能处理不完整的记录
      expect(result.error).toBeUndefined();
    });
  });
});