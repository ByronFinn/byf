import { useQuery } from '@tanstack/react-query';

import { inspectorApi } from '#/api';
import { QK } from '#/lib/query-keys';

import { StateTab } from './StateTab';

interface StateLiveProps {
  sessionId: string;
  /**
   * 轮询间隔(ms)。作为详情抽屉默认内容,key 落在 `['session', id]` 前缀下
   * (SSE invalidate 一次覆盖),经 refetchInterval 轮询 + SSE 事件驱动
   * invalidate 保证与磁盘/运行态一致。
   */
  refetchIntervalMs?: number;
}

/**
 * 实时刷新的 state.json 投影(抽屉默认内容,2026-08-19 起;对话 tab 展开时
 * 常驻,收起即卸载、轮询随之停止)。
 * 经 `useQuery` 的 refetchInterval 轮询 + SSE 事件驱动 invalidate,
 * 保证 state 面板与磁盘/运行态一致,无需手动刷新。
 */
export function StateLive({ sessionId, refetchIntervalMs = 3000 }: StateLiveProps) {
  const { data: detail, isLoading } = useQuery({
    queryKey: QK.sessionState(sessionId),
    queryFn: () => inspectorApi.getSessionDetail(sessionId),
    refetchInterval: refetchIntervalMs,
  });
  if (isLoading) {
    return <div className="p-4 font-mono text-xs text-fg-subtle">状态加载中…</div>;
  }
  return <StateTab state={detail?.state ?? null} />;
}
