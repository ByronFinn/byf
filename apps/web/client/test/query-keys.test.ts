import { describe, expect, test } from 'bun:test';

import { INVALIDATE, QK, invalidationsForFrame } from '../src/lib/query-keys';
import type { ServerFrame } from '../src/types';

/**
 * SSE 实时刷新失效契约（2026-08-19 IA 合并后钉住）：
 * inspection/wire/agents 全部落在 `['session', id]` 前缀下——ChatPage 在
 * turn/step 结束时一次前缀失效即可覆盖三组查询；context 因 key 根不同
 * 必须单独失效。任何 key 形状漂移都会让「实时刷新」静默失效。
 */
describe('query keys — SSE invalidation prefix contract', () => {
  const sid = 'session_s1';

  test('state/wire/agents 全部落在 session 前缀下（一次前缀失效全覆盖）', () => {
    const sessionRoot = ['session', sid];
    expect(QK.session(sid)).toEqual(['session', sid] as const);
    expect(QK.sessionState(sid).slice(0, 2)).toEqual(sessionRoot);
    expect(QK.sessionWire(sid, 'agent-0').slice(0, 2)).toEqual(sessionRoot);
    expect(QK.sessionAgents(sid).slice(0, 2)).toEqual(sessionRoot);
  });

  test('context 用独立 key 根，需单独失效', () => {
    expect(QK.context(sid, 'main')[0]).toBe('context');
    expect(QK.context(sid, 'main')[0]).not.toBe('session');
  });

  test('invalidate 前缀精确对应上述两组根', () => {
    expect(INVALIDATE.session(sid)).toEqual(['session', sid]);
    expect(INVALIDATE.context(sid)).toEqual(['context', sid]);
  });

  test('同 agent 的 wire/context 细分 key 稳定可预测', () => {
    expect(QK.sessionWire(sid, 'agent-0')).toEqual(['session', sid, 'wire', 'agent-0']);
    expect(QK.context(sid, 'agent-0')).toEqual(['context', sid, 'agent-0']);
    expect(QK.sessionState(sid)).toEqual(['session', sid, 'inspection']);
  });
});

// #307 项 1:侧栏会话元数据新鲜度。session.meta.updated(服务端每次 prompt
// 落定 title/updatedAt 后恰好一帧)必须失效侧栏 ['workspaces'];流式 delta
// 帧必须零失效——否则每条 token 触发一次列表 refetch(风暴红线)。
describe('invalidationsForFrame — SSE 帧到缓存失效的映射(#307 项 1)', () => {
  const sid = 'session_s1';
  const metaFrame = (title?: string): ServerFrame => ({
    type: 'agent.event',
    event: {
      type: 'session.meta.updated',
      agentId: 'main',
      sessionId: sid,
      title,
      patch: { title },
    },
  });

  test('session.meta.updated 恰好失效一次侧栏 workspaces 查询', () => {
    const keys = invalidationsForFrame(metaFrame('帮我总结这个仓库'), sid);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toEqual(['workspaces']);
    // 与侧栏/hero 查询用的 key 根一致(invalidate 前缀匹配才能命中)
    expect(keys[0]).toEqual(QK.workspaces);
  });

  test('流式 delta 帧零失效(无 refetch 风暴)', () => {
    const delta: ServerFrame = {
      type: 'agent.event',
      event: {
        type: 'assistant.delta',
        turnId: 1,
        delta: '字',
        agentId: 'main',
        sessionId: sid,
      },
    };
    const thinking: ServerFrame = {
      type: 'agent.event',
      event: { type: 'thinking.delta', turnId: 1, delta: '嗯', agentId: 'main', sessionId: sid },
    };
    // 模拟一次长回答:每个 delta 帧都不产生失效;单条 prompt 只对应一帧 meta。
    let total = 0;
    for (let i = 0; i < 200; i++) {
      total += invalidationsForFrame(delta, sid).length;
      total += invalidationsForFrame(thinking, sid).length;
    }
    total += invalidationsForFrame(metaFrame('标题'), sid).length;
    expect(total).toBe(1);
  });

  test('turn/step 结束仍失效 session/context 前缀(既有契约不回归)', () => {
    const turnEnded: ServerFrame = {
      type: 'agent.event',
      event: {
        type: 'turn.ended',
        turnId: 1,
        reason: 'completed',
        agentId: 'main',
        sessionId: sid,
      },
    };
    expect(invalidationsForFrame(turnEnded, sid)).toEqual([
      INVALIDATE.session(sid),
      INVALIDATE.context(sid),
    ]);
  });

  test('非 agent.event 帧(心跳/系统帧)不失效任何查询', () => {
    expect(invalidationsForFrame({ type: 'sys.heartbeat' }, sid)).toEqual([]);
    expect(invalidationsForFrame({ type: 'sys.connected', sessionId: sid }, sid)).toEqual([]);
    expect(invalidationsForFrame({ type: 'sys.error', message: 'x' }, sid)).toEqual([]);
  });
});
