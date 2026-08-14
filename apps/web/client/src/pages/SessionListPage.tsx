import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '#/api';
import type { PermissionMode, SessionSummary } from '#/types';

const WORKDIR_KEY = 'byf-web-workdir';

export function SessionListPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [workDir, setWorkDir] = useState(() => localStorage.getItem(WORKDIR_KEY) ?? '');
  const [loadedDir, setLoadedDir] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [permission, setPermission] = useState<PermissionMode>('manual');

  const {
    data: sessions,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['sessions', loadedDir],
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
      void navigate(`/sessions/${data.session.id}`);
    },
  });

  const load = (): void => {
    const dir = workDir.trim();
    if (dir.length === 0) return;
    localStorage.setItem(WORKDIR_KEY, dir);
    setLoadedDir(dir);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Sessions</h1>
          <p className="text-sm text-zinc-500">
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
            className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-sm outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            Load
          </button>
        </div>

        {error !== null && (
          <div className="rounded-lg border border-rose-600/40 bg-rose-600/10 px-3 py-2 text-sm text-rose-300">
            {error.message}
          </div>
        )}

        {isLoading && <div className="text-sm text-zinc-500">Loading sessions…</div>}

        {sessions !== undefined && (
          <div className="space-y-2">
            {sessions.length === 0 && (
              <div className="text-sm text-zinc-500">No sessions in this directory yet.</div>
            )}
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-[#11151a] p-4">
          <h2 className="mb-3 text-sm font-semibold text-zinc-200">Start a new session</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
            <input
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
              }}
              placeholder="model alias (optional — uses default if blank)"
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <select
              value={permission}
              onChange={(e) => {
                setPermission(e.target.value as PermissionMode);
              }}
              className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none"
            >
              <option value="manual">manual</option>
              <option value="auto">auto</option>
              <option value="yolo">yolo</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              createMutation.mutate();
            }}
            disabled={createMutation.isPending || (loadedDir ?? workDir).trim().length === 0}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-40"
          >
            {createMutation.isPending ? 'Starting…' : 'New session'}
          </button>
          {createMutation.isError && (
            <div className="mt-2 text-sm text-rose-300">{createMutation.error.message}</div>
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
      className="block rounded-lg border border-white/10 bg-[#11151a] px-4 py-3 hover:border-emerald-500/50 hover:bg-[#151a20]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-100">
            {session.title ?? session.lastPrompt ?? session.id}
          </div>
          <div className="truncate font-mono text-xs text-zinc-600">{session.workDir}</div>
        </div>
        <div className="shrink-0 text-xs text-zinc-600">
          {updated.toLocaleDateString()}{' '}
          {updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </Link>
  );
}
