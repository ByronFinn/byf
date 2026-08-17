import { useQuery } from '@tanstack/react-query';

import { inspectorApi } from '#/api';

import { StateTab } from './StateTab';

interface StateLiveProps {
  sessionId: string;
  /**
   * 轮询间隔(ms)。作为右侧 details 默认内容与 Center State tab 共用同一
   * queryKey(react-query 去重),SSE turn 结束时还会 invalidate 触发即时刷新。
   */
  refetchIntervalMs?: number;
}

/**
 * 实时刷新的 state.json 投影(PRD-0035 用户诉求:右栏常驻 State)。
 * 经 `useQuery` 的 refetchInterval 轮询 + SSE 事件驱动 invalidate,
 * 保证 state 面板与磁盘/运行态一致,无需手动刷新。
 */
export function StateLive({ sessionId, refetchIntervalMs = 3000 }: StateLiveProps) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ['session', sessionId, 'inspection'] as const,
    queryFn: () => inspectorApi.getSessionDetail(sessionId),
    refetchInterval: refetchIntervalMs,
  });
  if (isLoading) {
    return <div className="p-4 font-mono text-xs text-fg-subtle">loading state…</div>;
  }
  return <StateTab state={detail?.state ?? null} />;
}
