import { api } from '#/api';
import type { StatusView } from '#/lib/chat';
import type { PermissionMode } from '#/types';

const PERMISSIONS: readonly PermissionMode[] = ['yolo', 'manual', 'auto'];

export function StatusBar(props: {
  sessionId: string;
  status: StatusView | null;
  busy: boolean;
  connected: boolean;
}): React.JSX.Element {
  const { sessionId, status, busy, connected } = props;
  const usagePct =
    status?.contextUsage !== undefined
      ? Math.round(status.contextUsage * 100)
      : status?.maxContextTokens && status?.contextTokens
        ? Math.round((status.contextTokens / status.maxContextTokens) * 100)
        : undefined;
  const current = status?.permission ?? 'manual';

  return (
    <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-fg-muted">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            busy ? 'animate-pulse bg-state-warning' : 'bg-state-success'
          }`}
          aria-hidden
        />
        <span>{busy ? 'working' : 'idle'}</span>
      </div>
      <span className="text-fg-subtle">·</span>
      <span className={connected ? 'text-state-success' : 'text-fg-subtle'}>
        {connected ? 'live' : 'connecting…'}
      </span>
      {status?.model !== undefined && (
        <>
          <span className="text-fg-subtle">·</span>
          <span className="font-mono text-fg">{status.model}</span>
        </>
      )}
      {usagePct !== undefined && (
        <>
          <span className="text-fg-subtle">·</span>
          <span>ctx {usagePct}%</span>
        </>
      )}
      <div className="ml-auto flex items-center gap-1">
        <div className="flex overflow-hidden rounded-md border border-border">
          {PERMISSIONS.map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => void api.setPermission(sessionId, mode)}
              className={`px-2 py-0.5 ${
                current === mode ? 'bg-brand text-on-brand' : 'text-fg-muted hover:bg-hover'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
