import { describe, expect, test } from 'vitest';

import { INVALIDATE, QK } from '../src/lib/query-keys';

/**
 * SSE 实时刷新失效契约（2026-08-19 IA 合并后钉住）：
 * inspection/wire/agents 全部落在 `['session', id]` 前缀下——ChatPage 在
 * turn/step 结束时一次前缀失效即可覆盖三组查询；context 因 key 根不同
 * 必须单独失效。任何 key 形状漂移都会让「实时刷新」静默失效。
 */
describe('query keys — SSE invalidation prefix contract', () => {
  const sid = 'session_s1';

  test('state/wire/agents 全部落在 session 前缀下（一次前缀失效全覆盖）', () => {
    const sessionRoot = QK.session(sid);
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
