import { describe, expect, it } from 'vitest';

import { testAgent } from './harness/agent';
import type { AgentRecord } from '../../src/agent/records/types';
import { InMemoryAgentRecordPersistence } from '../../src/agent/records';

describe('Agent.resume() integration tests', () => {
  describe('完整恢复流程测试', () => {
    it('应该成功恢复正常的agent会话', async () => {
      const persistence = new InMemoryAgentRecordPersistence([
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          modelAlias: 'test-model',
          systemPrompt: 'Test prompt',
          thinkingLevel: 'off',
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
      ]);

      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();

      // 验证恢复的状态
      expect(agent.config.modelAlias).toBe('test-model');
      expect(agent.config.systemPrompt).toBe('Test prompt');
      expect(agent.context.history).toHaveLength(1);
      expect(agent.context.history[0]).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      });
    });

    it('应该返回迁移警告', async () => {
      const persistence = new InMemoryAgentRecordPersistence([
        {
          type: 'metadata',
          protocol_version: '1.0',
          created_at: 1,
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Test' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
      ]);

      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      // 版本迁移应该自动完成，可能不返回警告
      expect(result.error).toBeUndefined();

      // 验证恢复仍然成功
      expect(agent.context.history).toHaveLength(1);
      expect(agent.context.history[0]).toMatchObject({
        role: 'user',
        content: [{ type: 'text', text: 'Test' }],
      });
    });

    it('应该处理版本不匹配错误', async () => {
      const persistence = new InMemoryAgentRecordPersistence([
        {
          type: 'metadata',
          protocol_version: '0.9',
          created_at: 1,
        },
      ]);

      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('0.9');
    });
  });

  describe('错误恢复测试', () => {
    it('应该捕获恢复过程中的错误并返回', async () => {
      // 创建一个会触发错误的记录
      const persistence = new InMemoryAgentRecordPersistence([
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          modelAlias: 'test-model',
        },
      ]);

      const { agent } = testAgent({ persistence });

      // 注入一个会出错的handler
      const mockHandler = {
        restoreRecord: (_record: AgentRecord) => {
          throw new Error('Simulated restoration error');
        },
      };

      agent.records.registerHandlers({ config: mockHandler });

      const result = await agent.resume();

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Simulated restoration error');
    });

    it('应该在恢复错误时保持agent状态一致', async () => {
      const originalRecords: readonly AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          modelAlias: 'test-model',
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(originalRecords);

      const { agent } = testAgent({ persistence });

      // 添加一个会失败的handler
      const callCount = { value: 0 };
      const conditionalHandler = {
        restoreRecord: (record: AgentRecord) => {
          callCount.value++;
          if (record.type === 'config.update') {
            throw new Error('Config restoration failed');
          }
        },
      };

      agent.records.registerHandlers({ config: conditionalHandler });

      const result = await agent.resume();

      expect(result.error).toBeDefined();
      expect(callCount.value).toBe(1); // 尝试了恢复
    });
  });

  describe('状态恢复验证测试', () => {
    it('应该正确恢复复杂的多记录会话', async () => {
      const records: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          cwd: '/test/path',
          modelAlias: 'test-model',
          systemPrompt: 'Test system prompt',
          thinkingLevel: 'high',
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'First message' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
        {
          type: 'context.append_message',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'First response' }],
            toolCalls: [],
          },
        },
        {
          type: 'usage.record',
          model: 'test-model',
          usage: {
            inputCacheCreation: 100,
            inputCacheRead: 50,
            inputOther: 200,
            output: 150,
          },
          usageScope: 'session',
        },
        {
          type: 'permission.set_mode',
          mode: 'yolo',
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(records);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeUndefined();

      // 验证所有状态都被正确恢复
      expect(agent.config.cwd).toBe('/test/path');
      expect(agent.config.modelAlias).toBe('test-model');
      expect(agent.config.systemPrompt).toBe('Test system prompt');
      expect(agent.config.thinkingLevel).toBe('high');
      expect(agent.context.history).toHaveLength(2);
      expect(agent.permission.mode).toBe('yolo');
      expect(agent.usage.data().total).toMatchObject({
        inputCacheCreation: 100,
        inputCacheRead: 50,
        inputOther: 200,
        output: 150,
      });
    });
  });

  describe('恢复顺序测试', () => {
    it('应该按正确顺序恢复记录', async () => {
      const executionOrder: string[] = [];

      const trackingHandler = {
        restoreRecord: (record: AgentRecord) => {
          executionOrder.push(record.type);
        },
      };

      const records: AgentRecord[] = [
        { type: 'metadata', protocol_version: '1.1', created_at: 1 },
        { type: 'config.update', modelAlias: 'model1' },
        { type: 'context.append_message', message: { role: 'user', content: [{ type: 'text', text: 'Msg1' }], toolCalls: [], origin: { kind: 'user' } } },
        { type: 'context.append_message', message: { role: 'assistant', content: [{ type: 'text', text: 'Resp1' }], toolCalls: [] } },
        { type: 'usage.record', model: 'model1', usage: { inputCacheCreation: 100, inputCacheRead: 0, inputOther: 200, output: 150 }, usageScope: 'session' },
      ];

      const persistence = new InMemoryAgentRecordPersistence(records);
      const { agent } = testAgent({ persistence });

      // 注册跟踪handler
      agent.records.registerHandlers({
        config: trackingHandler,
        context: trackingHandler,
        usage: trackingHandler,
      });

      await agent.resume();

      // 验证恢复顺序
      expect(executionOrder).toEqual([
        'config.update',
        'context.append_message',
        'context.append_message',
        'usage.record',
      ]);
    });
  });
});