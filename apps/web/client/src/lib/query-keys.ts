/**
 * react-query 查询键的单一构造点（2026-08-19 IA 合并后钉住，测试见
 * `test/query-keys.test.ts`）。
 *
 * SSE 失效契约：ChatPage 把每帧交给 `invalidationsForFrame` 决定要失效哪些
 * query key——turn/step 结束时以 `INVALIDATE.session(id)` 前缀一次失效
 * inspection/wire/agents（react-query 前缀匹配），`INVALIDATE.context(id)`
 * 单独失效上下文投影（key 根不同）；`session.meta.updated` 失效侧栏
 * `['workspaces']`（title/updatedAt 新鲜度，#307 项 1）。任何一处 key 形状
 * 漂移都会让「实时刷新」静默失效，故形状集中于此并被测试钉住。
 */
import type { ServerFrame } from '#/types';

export const QK = {
  session: (id: string | undefined) => ['session', id] as const,
  /** state.json 抽屉投影（StateLive，3s 轮询 + SSE invalidate）。 */
  sessionState: (id: string) => ['session', id, 'inspection'] as const,
  sessionWire: (sessionId: string | undefined, agentId: string | undefined) =>
    ['session', sessionId, 'wire', agentId] as const,
  sessionAgents: (sessionId: string | undefined) => ['session', sessionId, 'agents'] as const,
  context: (sessionId: string | undefined, agentId: string) =>
    ['context', sessionId, agentId] as const,
  /** 侧栏工作区 + 会话列表（与 SessionSidebar 的 workspaceListKey 同一形状）。 */
  workspaces: ['workspaces'] as const,
} as const;

/** SSE 实时刷新的失效前缀（一次失效多组查询）。 */
export const INVALIDATE = {
  /** 前缀覆盖 QK.sessionState / sessionWire / sessionAgents。 */
  session: (id: string) => ['session', id] as const,
  context: (id: string) => ['context', id] as const,
} as const;

/**
 * 一帧 SSE → 应失效的 query key 前缀列表（纯函数，失效决策集中于此）。
 * 节流语义即契约本身：只响元数据真发生变化的帧——delta 类高频帧必须返回空，
 * 否则每帧一次 refetch（#307 项 1 的「refetch 风暴」红线）。
 */
export function invalidationsForFrame(
  frame: ServerFrame,
  sessionId: string,
): readonly (readonly unknown[])[] {
  if (frame.type !== 'agent.event') return [];
  const event = frame.event;
  if (event.type === 'turn.ended' || event.type === 'turn.step.completed') {
    return [INVALIDATE.session(sessionId), INVALIDATE.context(sessionId)];
  }
  // 服务端每次 prompt 落定 lastPrompt/updatedAt/（首条 prompt 派生的）title 后
  // 恰好发一帧 session.meta.updated——每「发送」一次刷新一次侧栏，不随输入 /
  // 流式 token 变化，天然无风暴。
  if (event.type === 'session.meta.updated') {
    return [QK.workspaces];
  }
  return [];
}
