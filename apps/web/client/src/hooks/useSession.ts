import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { inspectorApi as api } from '#/api';
import type { InspectorSessionSummary } from '#/types';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'] as const,
    queryFn: () => api.listInspectableSessions(),
  });
}

export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session', sessionId] as const,
    queryFn: () => api.getSessionDetail(sessionId!),
    enabled: !!sessionId,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => api.deleteSession(sessionId),
    onSuccess: (_result, sessionId) => {
      qc.setQueryData<InspectorSessionSummary[]>(['sessions'], (old) =>
        old?.filter((s) => s.sessionId !== sessionId),
      );
      qc.removeQueries({ queryKey: ['session', sessionId] });
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
  });
}
