import type { StatusView } from '#/lib/chat';

/**
 * 顶部状态栏:会话状态 + 模型 + 上下文占用。权限选择已移入 Composer
 * 底栏(对齐 deepseek 的 PermissionSelect 座位)。
 */
export function StatusBar(props: {
  status: StatusView | null;
  busy: boolean;
  connected: boolean;
}): React.JSX.Element {
  const { status, busy, connected } = props;
  const usagePct =
    status?.contextUsage !== undefined
      ? Math.round(status.contextUsage * 100)
      : status?.maxContextTokens && status?.contextTokens
        ? Math.round((status.contextTokens / status.maxContextTokens) * 100)
        : undefined;

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
    </div>
  );
}
