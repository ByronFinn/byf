import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '#/api';
import { sessionListKey } from '#/components/layout/SessionSidebar';
import { Button } from '#/components/ui/button';
import { useWorkDir } from '#/hooks/useWorkDir';
import type { PermissionMode, SessionSummary } from '#/types';

export function SessionListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dir: loadedDir, setDir } = useWorkDir();
  const [workDir, setWorkDir] = useState(() => loadedDir ?? '');
  const [model, setModel] = useState('');
  const [permission, setPermission] = useState<PermissionMode>('manual');

  const {
    data: sessions,
    isLoading,
    error,
  } = useQuery({
    queryKey: sessionListKey(loadedDir ?? '', ''),
    queryFn: () => api.listSessions(loadedDir as string),
    enabled: loadedDir !== null,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSession({
        workDir: (loadedDir ?? workDir).trim(),
        model: model.trim().length > 0 ? model.trim() : undefined,
        permission,
      }),
    onSuccess: (data) => {
      // 让侧边栏与首页列表立刻出现新会话(默认 staleTime=Infinity)
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
      void navigate(`/sessions/${data.session.id}`);
    },
  });

  const load = (): void => {
    const trimmed = workDir.trim();
    if (trimmed.length === 0) return;
    setDir(trimmed);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-lg font-semibold text-fg">Sessions</h1>
          <p className="text-sm text-fg-muted">
            Pick a working directory. Sessions are listed per directory (same as the CLI).
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={workDir}
            onChange={(e) => {
              setWorkDir(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') load();
            }}
            placeholder="/absolute/path/to/project"
            className="flex-1 rounded-lg border border-border-strong bg-input-fill px-3 py-2 font-mono text-sm outline-none focus:border-brand"
          />
          <Button type="button" onClick={load}>
            Load
          </Button>
        </div>

        {error !== null && (
          <div className="rounded-lg border border-state-error/40 bg-state-error/10 px-3 py-2 text-sm text-state-error">
            {error.message}
          </div>
        )}

        {isLoading && <div className="text-sm text-fg-muted">Loading sessions…</div>}

        {sessions !== undefined && (
          <div className="space-y-2">
            {sessions.length === 0 && (
              <div className="text-sm text-fg-muted">No sessions in this directory yet.</div>
            )}
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}

        <div className="rounded-xl border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-sm font-semibold text-fg">Start a new session</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
              }}
              placeholder="model alias (optional — uses default if blank)"
              className="rounded-lg border border-border-strong bg-input-fill px-3 py-2 text-sm outline-none focus:border-brand"
            />
            <select
              value={permission}
              onChange={(e) => {
                setPermission(e.target.value as PermissionMode);
              }}
              className="rounded-lg border border-border-strong bg-input-fill px-3 py-2 text-sm outline-none"
            >
              <option value="manual">manual</option>
              <option value="auto">auto</option>
              <option value="yolo">yolo</option>
            </select>
          </div>
          <Button
            type="button"
            onClick={() => {
              createMutation.mutate();
            }}
            disabled={createMutation.isPending || (loadedDir ?? workDir).trim().length === 0}
            className="mt-3 disabled:opacity-40"
          >
            {createMutation.isPending ? 'Starting…' : 'New session'}
          </Button>
          {createMutation.isError && (
            <div className="mt-2 text-sm text-state-error">{createMutation.error.message}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: SessionSummary }): React.JSX.Element {
  const updated = new Date(session.updatedAt);
  return (
    <Link
      to={`/sessions/${session.id}`}
      className="block rounded-lg border border-border bg-surface-1 px-4 py-3 hover:border-brand/50 hover:bg-surface-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg">
            {session.title ?? session.lastPrompt ?? session.id}
          </div>
          <div className="truncate font-mono text-xs text-fg-subtle">{session.workDir}</div>
        </div>
        <div className="shrink-0 text-xs text-fg-subtle">
          {updated.toLocaleDateString()}{' '}
          {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </Link>
  );
}
