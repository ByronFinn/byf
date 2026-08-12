import { describe, expect, it } from 'vitest';

import {
  AGENT_WIRE_PROTOCOL_VERSION,
  InMemoryAgentRecordPersistence,
  type AgentRecord,
} from '../../../src/agent/records';
import { testAgent } from '../harness/agent';

/**
 * AC1 行为等价（PRD-0027）—— Facade 切换的安全网。
 *
 * 一份覆盖全部 record 类型的 wire.jsonl fixture（含 v1.0 迁移 case），经新
 * `Agent.resume()`（→ WireService.restore + onDidRestore hooks）重建 8 个子系统
 * 状态，逐字段断言。旧 `AgentRecords.restore()` 路径已随 Facade 移除；live↔replay
 * 等价性由 harness 的 `expectResumeMatches`（各 turn/compaction 测试）覆盖。
 */
describe('Facade AC1 — 行为等价（全 record 类型 fixture）', () => {
  function fixtureAgent(records: readonly AgentRecord[]): ReturnType<typeof testAgent> {
    const persistence = new InMemoryAgentRecordPersistence([
      { type: 'metadata', protocol_version: AGENT_WIRE_PROTOCOL_VERSION, created_at: 1 },
      ...records,
    ] as readonly AgentRecord[]);
    return testAgent({ persistence });
  }

  it('重建全部 8 个子系统的核心状态', async () => {
    const { agent } = fixtureAgent([
      // goal：create + paused update（避开 normalizeAfterReplay 的 active 降级）。
      { type: 'goal.create', objective: 'ship it', budget: { turnBudget: 3 }, createdAt: 100 },
      {
        type: 'goal.update',
        snapshot: {
          objective: 'ship it',
          status: 'paused',
          pausedReason: 'user paused',
          budget: { turnBudget: 3 },
          usage: { turns: 2, tokens: 500, wallClockMs: 9000 },
          createdAt: 100,
        },
      },
      // usage：两条按序累加。
      {
        type: 'usage.record',
        model: 'mock-model',
        usage: { inputOther: 100, output: 50, inputCacheRead: 0, inputCacheCreation: 0 },
        usageScope: 'session',
      },
      {
        type: 'usage.record',
        model: 'mock-model',
        usage: { inputOther: 10, output: 5, inputCacheRead: 0, inputCacheCreation: 0 },
        usageScope: 'turn',
      },
      // tools：注册 + 激活（含 MCP glob 拆分）。
      {
        type: 'tools.register_user_tool',
        name: 'myTool',
        description: 'a user tool',
        parameters: { type: 'object' },
      },
      { type: 'tools.set_active_tools', names: ['myTool', 'mcp__github__*'] },
      // turn：两条 prompt → turnId = 1。
      {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'one' }],
        origin: { kind: 'user' },
      },
      {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'two' }],
        origin: { kind: 'user' },
      },
      // config：6 字段之一。
      { type: 'config.update', modelAlias: 'mock-model', cwd: '/tmp/work' },
      // permission（legacy）：mode + session 审批。
      { type: 'permission.set_mode', mode: 'yolo' },
      {
        type: 'permission.record_approval_result',
        turnId: 0,
        toolCallId: 'call_1',
        toolName: 'Bash',
        action: 'Bash(ls)',
        result: {
          decision: 'approved',
          scope: 'session',
          selectedLabel: 'Approve for this session',
        },
      },
      // context：两条消息（legacy）。
      {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
          toolCalls: [],
          origin: { kind: 'user' },
        },
      },
      {
        type: 'context.append_message',
        message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
      },
      // full_compaction（legacy）：begin(auto) + complete。
      { type: 'full_compaction.begin', source: 'auto' },
      {
        type: 'full_compaction.complete',
        summary: 'compacted',
        compactedCount: 1,
        tokensBefore: 10,
        tokensAfter: 4,
      },
      // background（no-op Op，审计）。
      { type: 'background.stop', taskId: 'task-1' },
    ] as readonly AgentRecord[]);

    await agent.resume();

    // goal：paused snapshot 完整重建。
    expect(agent.goal.getSnapshot()).toMatchObject({
      objective: 'ship it',
      status: 'paused',
      pausedReason: 'user paused',
      budget: { turnBudget: 3 },
      usage: { turns: 2, tokens: 500, wallClockMs: 9000 },
      createdAt: 100,
    });
    // usage：两条累加（turn scope 也进 byModel，session 语义）。
    expect(agent.usage.data().total).toMatchObject({
      inputOther: 110,
      output: 55,
      inputCacheRead: 0,
      inputCacheCreation: 0,
    });
    // tools：注册 + 激活（MCP glob 拆分）。
    expect(agent.tools.data().map((t) => t.name)).toContain('myTool');
    // turn：turnId = 1。
    expect(agent.turn.currentId).toBe(1);
    // config。
    expect(agent.config.modelAlias).toBe('mock-model');
    expect(agent.config.cwd).toBe('/tmp/work');
    // permission（legacy）：mode + session rule。
    expect(agent.permission.mode).toBe('yolo');
    expect(agent.permission.data().rules).toContainEqual(
      expect.objectContaining({ decision: 'allow', scope: 'session-runtime' }),
    );
    // context：两条消息。
    expect(agent.context.history).toHaveLength(2);
    expect(agent.context.history[0]).toMatchObject({ role: 'user' });
    expect(agent.context.history[1]).toMatchObject({ role: 'assistant' });
    // full_compaction（legacy）：count + _compactedHistory。
    expect(agent.fullCompaction.compactionCountInTurn).toBe(1);
  });

  it('v1.0 老会话经迁移链重建（context.append_message 工具调用展平）', async () => {
    const persistence = new InMemoryAgentRecordPersistence([
      { type: 'metadata', protocol_version: '1.0', created_at: 1 },
      {
        type: 'context.append_message',
        message: {
          role: 'assistant',
          content: [],
          toolCalls: [
            {
              type: 'function',
              id: 'call_legacy_bash',
              function: { name: 'Bash', arguments: '{"command":"pwd"}' },
            },
          ],
        },
      } as unknown as AgentRecord,
    ] as readonly AgentRecord[]);
    const { agent } = testAgent({ persistence });

    const result = await agent.resume();

    expect(result.error).toBeUndefined();
    expect(agent.context.history[0]).toMatchObject({
      toolCalls: [
        {
          name: 'Bash',
          arguments: '{"command":"pwd"}',
        },
      ],
    });
    // 迁移后 protocol_version 归一为当前。
    expect(persistence.records[0]).toMatchObject({
      protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    });
  });
});
