import { useQuery } from '@tanstack/react-query';

import { inspectorApi as api } from '#/api';
import { QK } from '#/lib/query-keys';

export function useWire(
  sessionId: string | undefined,
  agentId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: QK.sessionWire(sessionId, agentId),
    queryFn: () => api.getWire(sessionId!, agentId!),
    enabled: !!sessionId && !!agentId && enabled,
  });
}
