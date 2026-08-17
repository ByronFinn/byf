import { useQuery } from '@tanstack/react-query';

import { inspectorApi as api } from '#/api';

/**
 * 获取会话中给定 agent 的投影上下文。
 *
 * `/api/sessions/:id/context?agent=<agentId>` 路由返回完整
 * `ContextProjection`(消息、用量总计、配置快照、权限模式)。
 * 未提供 agent id 时默认为 `main`,但调用方应传显式 id 以求清晰。
 */
export function useContext(sessionId: string, agentId: string) {
  return useQuery({
    queryKey: ['context', sessionId, agentId] as const,
    queryFn: () => api.getContext(sessionId, agentId),
    enabled: sessionId.length > 0 && agentId.length > 0,
  });
}
