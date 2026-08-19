/**
 * react-query 查询键的单一构造点（2026-08-19 IA 合并后钉住，测试见
 * `test/query-keys.test.ts`）。
 *
 * SSE 失效契约：ChatPage 在 turn/step 结束时以 `INVALIDATE.session(id)`
 * 前缀一次失效 inspection/wire/agents（react-query 前缀匹配），
 * `INVALIDATE.context(id)` 单独失效上下文投影（key 根不同）。任何一处
 * key 形状漂移都会让「实时刷新」静默失效，故形状集中于此并被测试钉住。
 */
export const QK = {
  session: (id: string | undefined) => ['session', id] as const,
  /** state.json 抽屉投影（StateLive，3s 轮询 + SSE invalidate）。 */
  sessionState: (id: string) => ['session', id, 'inspection'] as const,
  sessionWire: (sessionId: string | undefined, agentId: string | undefined) =>
    ['session', sessionId, 'wire', agentId] as const,
  sessionAgents: (sessionId: string | undefined) => ['session', sessionId, 'agents'] as const,
  context: (sessionId: string | undefined, agentId: string) =>
    ['context', sessionId, agentId] as const,
} as const;

/** SSE 实时刷新的失效前缀（一次失效多组查询）。 */
export const INVALIDATE = {
  /** 前缀覆盖 QK.sessionState / sessionWire / sessionAgents。 */
  session: (id: string) => ['session', id] as const,
  context: (id: string) => ['context', id] as const,
} as const;
