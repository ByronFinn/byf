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
        event: { type: 'turn.started', turnId: 1, origin: { kind: 'user' } },
      },
    });
    state = chatReducer(state, {
      type: 'frame',
      frame: {
        type: 'agent.event',
        event: { type: 'assistant.delta', turnId: 1, delta: '好的' },
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
