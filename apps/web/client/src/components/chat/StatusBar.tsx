import { api } from '#/api';
import type { StatusView } from '#/lib/chat';
import type { PermissionMode } from '#/types';

const PERMISSIONS: readonly PermissionMode[] = ['yolo', 'manual', 'auto'];

export function StatusBar(props: {
  sessionId: string;
  status: StatusView | null;
  busy: boolean;
  connected: boolean;
  onCancel: () => void;
}): React.JSX.Element {
  const { sessionId, status, busy, connected, onCancel } = props;
  const usagePct =
    status?.contextUsage !== undefined
      ? Math.round(status.contextUsage * 100)
      : status?.maxContextTokens && status?.contextTokens
        ? Math.round((status.contextTokens / status.maxContextTokens) * 100)
        : undefined;
  const current = status?.permission ?? 'manual';

  return (
    <div className="flex items-center gap-3 border-b border-white/10 bg-[#0e1216] px-4 py-1.5 text-xs text-zinc-400">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${busy ? 'animate-pulse bg-amber-400' : 'bg-emerald-400'}`}
          aria-hidden
        />
        <span>{busy ? 'working' : 'idle'}</span>
      </div>
      <span className="text-zinc-700">·</span>
      <span className={connected ? 'text-emerald-400' : 'text-zinc-600'}>
        {connected ? 'live' : 'connecting…'}
      </span>
      {status?.model !== undefined && (
        <>
          <span className="text-zinc-700">·</span>
          <span className="font-mono text-zinc-300">{status.model}</span>
        </>
      )}
      {usagePct !== undefined && (
        <>
          <span className="text-zinc-700">·</span>
          <span>ctx {usagePct}%</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <div className="flex overflow-hidden rounded-md border border-white/10">
          {PERMISSIONS.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => void api.setPermission(sessionId, mode)}
              className={`px-2 py-0.5 ${
                current === mode ? 'bg-emerald-600/80 text-white' : 'text-zinc-400 hover:bg-white/5'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
        {busy && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-rose-600/50 px-2 py-0.5 text-rose-300 hover:bg-rose-600/10"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
