import { useQuery } from '@tanstack/react-query';

import { inspectorApi as api } from '#/api';
import { QK } from '#/lib/query-keys';

export function useAgentTree(sessionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: QK.sessionAgents(sessionId),
    queryFn: () => api.getAgentTree(sessionId!),
    enabled: !!sessionId && enabled,
  });
}
