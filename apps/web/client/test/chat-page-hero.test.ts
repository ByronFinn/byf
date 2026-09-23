import { describe, expect, test } from 'bun:test';

import { chatReducer, initialChatState } from '../src/lib/chat';
import { shouldPruneHeroSession } from '../src/pages/ChatPage';

// 回归 1:hero 新建会话发送首条消息后,用户自己的消息必须出现在转录里。
// 修复前 ChatPage 的 hero 交接只发 api.prompt、不乐观落用户条目,而 SSE 事件流
// 只推 assistant/tool 事件(turn.started 无 input 字段)——新建会话里永远看不到
// 用户自己的第一条消息。此用例钉住交接后的转录形状:用户条目在助手回复之前。
describe('hero 新建会话首条消息显示', () => {
  test('hero 交接乐观落用户条目,首个用户消息先于助手回复出现', () => {
    let state = initialChatState();
    // 与 ChatPage mount effect 的 hero 交接一致:先乐观落用户条目,再等 turn 事件
    state = chatReducer(state, { type: 'user-message', text: '帮我总结这个仓库' });
    state = chatReducer(state, {
      type: 'frame',
      frame: {
        type: 'agent.event',
        event: {
          type: 'turn.started',
          turnId: 1,
          origin: { kind: 'user' },
          agentId: 'main',
          sessionId: 's-hero',
        },
      },
    });
    state = chatReducer(state, {
      type: 'frame',
      frame: {
        type: 'agent.event',
        event: {
          type: 'assistant.delta',
          turnId: 1,
          delta: '好的',
          agentId: 'main',
          sessionId: 's-hero',
        },
      },
    });
    expect(state.entries).toHaveLength(2);
    expect(state.entries[0]).toMatchObject({ kind: 'user', text: '帮我总结这个仓库' });
    expect(state.entries[1]).toMatchObject({ kind: 'assistant' });
  });
});

// 回归 2:hero 新建会话在首个 prompt 未发出前被放弃时,应关闭并删除残留的空会话
// (createSession 即落盘目录,没有任何内容却留在侧栏)。已发出 prompt 的会话或
// 非 hero 挂载(已有会话)一律不清理。
describe('放弃清理规则 shouldPruneHeroSession', () => {
  test('hero 新建且首个 prompt 未发出 → 清理;其余情况不清理', () => {
    expect(shouldPruneHeroSession(true, false)).toBe(true);
    expect(shouldPruneHeroSession(true, true)).toBe(false);
    expect(shouldPruneHeroSession(false, false)).toBe(false);
    expect(shouldPruneHeroSession(false, true)).toBe(false);
  });
});

// 回归 3(#307 项 2):prompt POST 被拒(网络失败 / PRD-0038 R1 写门 401/403)
// 时,ChatPage 会派发 send-failed 回滚——乐观用户条目必须撤销、转录落一条错误,
// UI 不得停在「已发送」。reducer 是回滚的全部状态机,契约在此钉住。
describe('乐观发送失败回滚(send-failed)', () => {
  test('显式 id 的用户条目被移除,并落转录错误条目(不留「已发送」假象)', () => {
    let state = initialChatState();
    state = chatReducer(state, { type: 'user-message', text: '你好', id: 'u-send-1' });
    expect(state.entries.map((e) => e.id)).toEqual(['u-send-1']);
    state = chatReducer(state, {
      type: 'send-failed',
      entryId: 'u-send-1',
      message: '发送失败：HTTP 401 Unauthorized',
    });
    expect(state.entries.filter((e) => e.kind === 'user')).toHaveLength(0);
    expect(state.entries.at(-1)).toMatchObject({
      kind: 'system',
      level: 'error',
      text: '发送失败：HTTP 401 Unauthorized',
    });
  });

  test('hero 交接条目(id 固定)失败同样回滚', () => {
    let state = initialChatState();
    state = chatReducer(state, { type: 'user-message', text: '首条消息', id: 'u-hero-s1' });
    state = chatReducer(state, {
      type: 'send-failed',
      entryId: 'u-hero-s1',
      message: '发送失败：Failed to fetch',
    });
    expect(state.entries.some((e) => e.kind === 'user')).toBe(false);
    expect(state.entries).toHaveLength(1);
  });

  test('移除中段条目时 turnIndex/toolIndex 下标同步前移(索引不悬空)', () => {
    let state = initialChatState();
    state = chatReducer(state, { type: 'user-message', text: '将被撤销', id: 'u1' });
    state = chatReducer(state, {
      type: 'frame',
      frame: {
        type: 'agent.event',
        event: {
          type: 'turn.started',
          turnId: 7,
          origin: { kind: 'user' },
          agentId: 'main',
          sessionId: 's1',
        },
      },
    });
    state = chatReducer(state, {
      type: 'frame',
      frame: {
        type: 'agent.event',
        event: {
          type: 'tool.call.started',
          turnId: 7,
          toolCallId: 'call-1',
          name: 'Read',
          args: { path: 'README.md' },
          agentId: 'main',
          sessionId: 's1',
        },
      },
    });
    // 基线:entries = [u1, a7];turn 7 在 1,工具在 entry 1
    expect(state.turnIndex.get(7)).toBe(1);
    expect(state.toolIndex.get('call-1')).toEqual({ entry: 1, part: 0 });
    state = chatReducer(state, {
      type: 'send-failed',
      entryId: 'u1',
      message: '发送失败：HTTP 403',
    });
    // u1 移除后:assistant 前移到 0,索引必须跟着重建;随后追加错误系统条目
    expect(state.turnIndex.get(7)).toBe(0);
    expect(state.toolIndex.get('call-1')).toEqual({ entry: 0, part: 0 });
    expect(state.entries[0]).toMatchObject({ kind: 'assistant', turnId: 7 });
  });

  test('entryId 不存在(已被 reset/重载)→ 只落错误,不炸状态', () => {
    let state = initialChatState();
    state = chatReducer(state, {
      type: 'send-failed',
      entryId: 'u-ghost',
      message: '发送失败：offline',
    });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ kind: 'system', level: 'error' });
  });
});
