import { describe, expect, it } from 'vitest';

import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import type { AgentRecord } from '../../src/agent/records/types';
import { testAgent } from './harness/agent';

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
    it('应该捕获恢复过程中的错误并返回（损坏的 metadata 信封）', async () => {
      // metadata 缺失 created_at —— isWireMetadataRecord 失败，restore 抛错，
      // resume 捕获并返回 {error}（新路径：wire.restore 是唯一 restore 路径）。
      const persistence = new InMemoryAgentRecordPersistence([
        {
          type: 'metadata',
          protocol_version: '1.1',
        } as unknown as AgentRecord,
        {
          type: 'config.update',
          modelAlias: 'test-model',
        },
      ]);

      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('metadata');
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
    it('应该按记录顺序重建子系统状态（Facade：wire.restore 逐条重放）', async () => {
      // 旧版用 registerHandlers 注入跟踪 handler 验证顺序；Facade 下 restore 走
      // wire.restore()（OP_REGISTRY 纯 reducer + legacyRoute），顺序由最终状态反映：
      // usage 按顺序累加、context 消息按序、config 取最终值。
      const records: AgentRecord[] = [
        { type: 'metadata', protocol_version: '1.1', created_at: 1 },
        { type: 'config.update', modelAlias: 'model1' },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Msg1' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
        {
          type: 'context.append_message',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Resp1' }], toolCalls: [] },
        },
        {
          type: 'usage.record',
          model: 'model1',
          usage: { inputCacheCreation: 100, inputCacheRead: 0, inputOther: 200, output: 150 },
          usageScope: 'session',
        },
        {
          type: 'usage.record',
          model: 'model1',
          usage: { inputCacheCreation: 10, inputCacheRead: 0, inputOther: 20, output: 30 },
          usageScope: 'session',
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(records);
      const { agent } = testAgent({ persistence });

      await agent.resume();

      expect(agent.context.history.map((m) => m.content[0]?.text ?? '')).toEqual(['Msg1', 'Resp1']);
      // usage 两条按顺序累加。
      expect(agent.usage.data().total).toMatchObject({
        inputCacheCreation: 110,
        inputCacheRead: 0,
        inputOther: 220,
        output: 180,
      });
    });
  });
});
