import { useEffect, useRef } from 'react';

import { api } from '#/api';
import type { ServerFrame } from '#/types';

/** 服务端会发出的所有 SSE 帧类型(`event:` 字段)。 */
const FRAME_TYPES = [
  'sys.connected',
  'sys.heartbeat',
  'sys.error',
  'agent.event',
  'approval.requested',
  'approval.settled',
  'question.requested',
  'question.settled',
] as const;

/**
 * 订阅指定会话的 SSE 事件流,把每帧交给 `onFrame`。`onFrame` 经 ref 透传,避免其
 * 变化触发重订阅。EventSource 自动重连;重连时服务端重放待裁决的反向 RPC。
 */
export function useEventStream(
  sessionId: string | undefined,
  onFrame: (frame: ServerFrame) => void,
): void {
  const ref = useRef(onFrame);
  ref.current = onFrame;

  useEffect(() => {
    if (sessionId === undefined || sessionId.length === 0) return;
    const es = new EventSource(api.eventStreamUrl(sessionId));
    const handler = (event: MessageEvent): void => {
      try {
        ref.current(JSON.parse(event.data as string) as ServerFrame);
      } catch {
        // 忽略畸形帧
      }
    };
    for (const t of FRAME_TYPES) {
      es.addEventListener(t, handler);
    }
    return () => {
      es.close();
    };
  }, [sessionId]);
}
