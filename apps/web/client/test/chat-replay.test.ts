import { describe, expect, test } from 'bun:test';

import { chatReducer, initialChatState, replayToEntries } from '../src/lib/chat';
import type { AgentReplayRecord } from '../src/types';

/** 完整形状的 toolCall(与 ContextMessage 的 ToolCall 对齐)。 */
function toolCall(
  id: string,
  name: string,
): { type: 'function'; id: string; name: string; arguments: null } {
  return { type: 'function', id, name, arguments: null };
}

function userMessage(text: string): AgentReplayRecord {
  return {
    type: 'message',
    message: { role: 'user', content: [{ type: 'text', text }], toolCalls: [] },
  };
}

function assistantMessage(
  parts: readonly ({ type: 'text'; text: string } | { type: 'think'; think: string })[],
  toolCalls: readonly { type: 'function'; id: string; name: string; arguments: null }[] = [],
): AgentReplayRecord {
  return {
    type: 'message',
    message: { role: 'assistant', content: [...parts], toolCalls: [...toolCalls] },
  };
}

function toolResultMessage(toolCallId: string, text: string, isError?: boolean): AgentReplayRecord {
  return {
    type: 'message',
    message: {
      role: 'tool',
      toolCallId,
      content: [{ type: 'text', text }],
      toolCalls: [],
      isError,
    },
  };
}

/**
 * replayToEntries 守护:resume 响应的 `agents.main.replay` 必须映射为与 live
 * 渲染一致的对话条目——历史会话恢复的全部正确性都压在这一个函数上。
 */
describe('replayToEntries', () => {
  test('user + assistant 文本 → UserEntry / AssistantEntry(text part)', () => {
    const { entries } = replayToEntries([
      userMessage('你好'),
      assistantMessage([{ type: 'text', text: '你好!有什么可以帮你?' }]),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'user', text: '你好' });
    expect(entries[1]).toMatchObject({ kind: 'assistant' });
    const parts = entries[1]?.kind === 'assistant' ? entries[1].parts : [];
    expect(parts).toEqual([{ kind: 'text', text: '你好!有什么可以帮你?' }]);
  });

  test('think part → ThinkingPart;tool 结果按 toolCallId 落到对应 ToolPart(done + result)', () => {
    const { entries, toolIndex } = replayToEntries([
      assistantMessage([{ type: 'think', think: '内部推理' }], [toolCall('tc1', 'bash')]),
      toolResultMessage('tc1', 'ok'),
      assistantMessage([{ type: 'text', text: '完成' }]),
    ]);
    expect(entries).toHaveLength(2);
    const a = entries[0];
    expect(a?.kind).toBe('assistant');
    if (a?.kind !== 'assistant') return;
    expect(a.parts[0]).toEqual({ kind: 'thinking', text: '内部推理' });
    expect(a.parts[1]).toMatchObject({
      kind: 'tool',
      toolCallId: 'tc1',
      name: 'bash',
      status: 'done',
      result: 'ok',
    });
    // toolIndex 保留:后续 live 事件(中断 turn 续流)还能对账
    expect(toolIndex.get('tc1')).toEqual({ entry: 0, part: 1 });
  });

  test('工具错误结果 → isError;无结果的 tool 保持 running(与 live 语义一致)', () => {
    const { entries } = replayToEntries([
      assistantMessage([], [toolCall('tc2', 'write')]),
      toolResultMessage('tc2', 'boom', true),
    ]);
    const a = entries[0];
    if (a?.kind !== 'assistant') throw new Error('expected assistant');
    expect(a.parts[0]).toMatchObject({ status: 'done', isError: true, result: 'boom' });
  });

  test('system 消息与 config/permission/approval 记录不渲染(live 同样不渲染)', () => {
    const { entries } = replayToEntries([
      {
        type: 'message',
        message: { role: 'system', content: [{ type: 'text', text: 'inject' }], toolCalls: [] },
      },
      { type: 'config_updated', config: {} } as unknown as AgentReplayRecord,
      { type: 'permission_updated', mode: 'yolo' },
      userMessage('真实消息'),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: 'user', text: '真实消息' });
  });

  test('空 assistant(无 parts)跳过;空 replay 返回空', () => {
    expect(replayToEntries([]).entries).toEqual([]);
    const { entries } = replayToEntries([
      assistantMessage([]),
      userMessage('x'),
      assistantMessage([{ type: 'text', text: 'y' }]),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ kind: 'user', text: 'x' });
  });

  test('transcript-loaded 替换 entries 并重建 toolIndex(reducer 集成)', () => {
    const state = initialChatState();
    const next = chatReducer(state, {
      type: 'transcript-loaded',
      entries: [
        { kind: 'user', id: 'r-u-0', text: 'hi' },
        { kind: 'assistant', id: 'r-a-0', turnId: 0, parts: [{ kind: 'text', text: 'yo' }] },
      ],
      toolIndex: new Map(),
    });
    expect(next.entries).toHaveLength(2);
    // 之后 live turn 事件新建条目,不与历史条目撞车
    const after = chatReducer(next, {
      type: 'frame',
      frame: {
        type: 'agent.event',
        event: {
          type: 'turn.started',
          sessionId: 's',
          agentId: 'main',
          turnId: 5,
          origin: { kind: 'user' },
        },
      },
    });
    expect(after.entries).toHaveLength(3);
    expect(after.entries[2]).toMatchObject({ kind: 'assistant', turnId: 5 });
  });
});
