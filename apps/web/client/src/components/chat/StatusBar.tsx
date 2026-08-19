import type { StatusView } from '#/lib/chat';

/**
 * 顶部状态栏：会话状态 + 模型 + 上下文占用。
 * 权限选择已移入 Composer 底栏（对齐 deepseek 的 PermissionSelect 座位）；
 * 后台任务入口已升级为中心 Tasks tab（PRD-0035 R-D1）。
 * 信息分层：左侧「状态指示点 + 状态词」，右侧「模型 / 上下文」，用分组间距
 * 取代碎 `·` 分隔符，提升扫读层级。
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
    <div className="flex items-center justify-between gap-3 border-b border-border bg-surface-2 px-4 py-1.5 text-xs text-fg-muted">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            busy ? 'animate-pulse bg-state-warning' : 'bg-state-success'
          }`}
          aria-hidden
        />
        <span className="font-medium text-fg">{busy ? '工作中' : '空闲'}</span>
        <span className={connected ? 'mx-1 text-fg-subtle' : 'mx-1 text-state-warning'}>
          {connected ? '实时' : '连接中…'}
        </span>
        <span className="h-3 w-px shrink-0 bg-border" aria-hidden />
        {status?.model !== undefined && (
          <span className="min-w-0 truncate font-mono text-fg">{status.model}</span>
        )}
      </div>
      {usagePct !== undefined && (
        <span className="shrink-0 text-fg-subtle">上下文 {usagePct}%</span>
      )}
    </div>
  );
}
