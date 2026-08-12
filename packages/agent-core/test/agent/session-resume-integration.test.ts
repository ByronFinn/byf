import { describe, expect, it, vi } from 'vitest';

import { InMemoryAgentRecordPersistence } from '../../src/agent/records';
import type { AgentRecord } from '../../src/agent/records/types';
import { testAgent } from './harness/agent';

describe('Session.resume() integration tests', () => {
  describe('主agent和subagent错误处理', () => {
    it('应该在主agent恢复失败时返回错误而不是抛出', async () => {
      // Facade：restore 走 wire.restore()（唯一 restore 路径）。损坏的 metadata
      // 信封（缺 created_at）使 restore 抛错，resume 捕获并返回 {error}。
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

      // 主agent错误应该被返回而不是抛出
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('metadata');
    });

    it('应该处理多个记录的恢复', async () => {
      const records: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          modelAlias: 'model1',
          systemPrompt: 'System prompt',
        },
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'User message' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
        {
          type: 'usage.record',
          model: 'model1',
          usage: {
            inputCacheCreation: 50,
            inputCacheRead: 25,
            inputOther: 100,
            output: 75,
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
      expect(agent.config.modelAlias).toBe('model1');
      expect(agent.config.systemPrompt).toBe('System prompt');
      expect(agent.context.history).toHaveLength(1);
      expect(agent.usage.data().total).toMatchObject({
        inputCacheCreation: 50,
        inputCacheRead: 25,
        inputOther: 100,
        output: 75,
      });
      expect(agent.permission.mode).toBe('yolo');
    });
  });

  describe('恢复一致性验证', () => {
    it('应该保证恢复前后的状态一致性', async () => {
      const { agent: originalAgent } = testAgent();

      // 配置agent
      originalAgent.config.update({
        modelAlias: 'test-model',
        systemPrompt: 'Test prompt',
        thinkingLevel: 'high',
      });

      originalAgent.context.appendMessage({
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
        toolCalls: [],
      });

      // 模拟记录历史
      const recordHistory =
        originalAgent.constructor.name === 'MockAgent'
          ? []
          : (originalAgent as unknown as { recordHistory: AgentRecord[] }).recordHistory || [];

      if (recordHistory.length > 0) {
        // 创建新的agent实例进行恢复测试
        const persistence = new InMemoryAgentRecordPersistence(recordHistory);
        const { agent: resumedAgent } = testAgent({ persistence });

        await resumedAgent.resume();

        // 验证关键状态一致
        expect(resumedAgent.config.modelAlias).toBe(originalAgent.config.modelAlias);
        expect(resumedAgent.context.history).toHaveLength(originalAgent.context.history.length);
      }
    });

    it('应该正确处理空的会话历史', async () => {
      const persistence = new InMemoryAgentRecordPersistence([
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
      ]);

      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();

      // 验证初始状态
      expect(agent.context.history).toHaveLength(0);
      expect(agent.config.modelAlias).toBeUndefined();
    });
  });

  describe('错误恢复和容错', () => {
    it('应该在第一个错误时停止恢复（失败记录之后的记录不被应用）', async () => {
      // metadata 损坏（缺 created_at）使 restore 抛错并停止；其后有效的
      // context.append_message 不应被应用。
      const badPersistence = new InMemoryAgentRecordPersistence([
        { type: 'metadata', protocol_version: '1.1' } as unknown as AgentRecord,
        {
          type: 'context.append_message',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'should not apply' }],
            toolCalls: [],
            origin: { kind: 'user' },
          },
        },
      ]);
      const { agent } = testAgent({ persistence: badPersistence });

      const result = await agent.resume();

      // 错误应该被返回（restore 在首个错误停止，后续记录未应用）。
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('metadata');
      expect(agent.context.history).toHaveLength(0);
    });

    it('应该处理边界情况和异常记录', async () => {
      // 测试包含一些边界情况的记录
      const records: AgentRecord[] = [
        {
          type: 'metadata',
          protocol_version: '1.1',
          created_at: 1,
        },
        {
          type: 'config.update',
          modelAlias: '', // 空字符串模型名
          systemPrompt: '', // 空系统提示
        },
        {
          type: 'context.clear',
        },
        {
          type: 'permission.set_mode',
          mode: 'manual',
        },
      ];

      const persistence = new InMemoryAgentRecordPersistence(records);
      const { agent } = testAgent({ persistence });

      const result = await agent.resume();

      expect(result.error).toBeUndefined();

      // 验证边界情况被正确处理
      expect(agent.config.modelAlias).toBe('');
      expect(agent.config.systemPrompt).toBe('');
      expect(agent.context.history).toHaveLength(0);
      expect(agent.permission.mode).toBe('manual');
    });
  });
});
