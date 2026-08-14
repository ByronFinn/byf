import { describe, expect, test } from 'bun:test';

import { chatReducer, groupParts, initialChatState, replayToEntries } from '../src/lib/chat';
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

// ---- 工具耗时与归组(PRD-0034 R-B2) ---------------------------------------------

describe('tool timing and grouping', () => {
  function liveEvent(
    type: string,
    patch: Record<string, unknown>,
  ): { type: string } & Record<string, unknown> {
    return { type, ...patch };
  }

  test('live tool.call.started/tool.result 把 startedAt/endedAt 存进 ToolPart', () => {
    let state = initialChatState();
    const frame = (event: unknown): { type: 'frame'; frame: { type: string; event: unknown } } => ({
      type: 'frame',
      frame: { type: 'agent.event', event },
    });
    state = chatReducer(
      state,
      frame(liveEvent('turn.started', { turnId: 1, origin: { kind: 'user' } })),
    );
    state = chatReducer(
      state,
      frame(
        liveEvent('tool.call.started', {
          turnId: 1,
          toolCallId: 't1',
          name: 'Read',
          display: { kind: 'file_io', operation: 'read', path: '/a' },
          startedAt: 1000,
        }),
      ),
    );
    state = chatReducer(
      state,
      frame(
        liveEvent('tool.result', {
          turnId: 1,
          toolCallId: 't1',
          output: 'ok',
          startedAt: 1000,
          endedAt: 2500,
        }),
      ),
    );
    const entry = state.entries[0];
    if (entry === undefined || entry.kind !== 'assistant') throw new Error('expected assistant');
    expect(entry.parts[0]).toMatchObject({
      kind: 'tool',
      status: 'done',
      startedAt: 1000,
      endedAt: 2500,
    });
  });

  test('replay tool_timing 记录为历史 ToolPart 补上耗时(先 timing 后消息也成立)', () => {
    const replay: AgentReplayRecord[] = [
      { type: 'tool_timing', toolCallId: 't1', startedAt: 100, endedAt: 400 },
      assistantMessage([], [toolCall('t1', 'Read')]),
      toolResultMessage('t1', 'ok'),
    ];
    const { entries } = replayToEntries(replay);
    const entry = entries[0];
    if (entry === undefined || entry.kind !== 'assistant') throw new Error('expected assistant');
    expect(entry.parts[0]).toMatchObject({ kind: 'tool', startedAt: 100, endedAt: 400 });
  });

  test('groupParts:相邻同 kind 折叠为一组,text 打断分组,单个不组', () => {
    const tool = (id: string, kind: string, status: 'running' | 'done' = 'done'): unknown => ({
      kind: 'tool',
      toolCallId: id,
      name: 'X',
      display: { kind },
      status,
    });
    const parts = [
      tool('a', 'file_io'),
      tool('b', 'file_io'),
      { kind: 'text', text: '中段说明' },
      tool('c', 'file_io'),
      tool('d', 'command'),
    ];
    const grouped = groupParts(parts as never);
    expect(grouped).toHaveLength(4);
    expect(grouped[0]).toMatchObject({ kind: 'tool-group', toolKind: 'file_io' });
    expect((grouped[0] as { tools: unknown[] }).tools).toHaveLength(2);
    expect(grouped[1]).toMatchObject({ kind: 'text' });
    expect(grouped[2]).toMatchObject({ kind: 'tool', toolCallId: 'c' });
    expect(grouped[3]).toMatchObject({ kind: 'tool', toolCallId: 'd' });
  });

  test('groupParts:组摘要给出 span 总耗时与进行中标记', () => {
    const parts = [
      {
        kind: 'tool',
        toolCallId: 'a',
        name: 'Read',
        display: { kind: 'file_io' },
        status: 'done',
        startedAt: 1000,
        endedAt: 1500,
      },
      {
        kind: 'tool',
        toolCallId: 'b',
        name: 'Read',
        display: { kind: 'file_io' },
        status: 'done',
        startedAt: 1400,
        endedAt: 2200,
      },
      {
        kind: 'tool',
        toolCallId: 'c',
        name: 'Read',
        display: { kind: 'file_io' },
        status: 'running',
        startedAt: 2300,
      },
    ];
    const grouped = groupParts(parts as never);
    expect(grouped).toHaveLength(1);
    const group = grouped[0] as {
      kind: string;
      tools: unknown[];
      spanMs: number;
      hasRunning: boolean;
    };
    expect(group.kind).toBe('tool-group');
    expect(group.tools).toHaveLength(3);
    // span = max(endedAt) - min(startedAt);进行中的工具不计入 endedAt。
    expect(group.spanMs).toBe(1200);
    expect(group.hasRunning).toBe(true);
  });
});
