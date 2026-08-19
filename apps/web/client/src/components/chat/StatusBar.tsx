import { ListChecks } from 'lucide-react';

import type { StatusView } from '#/lib/chat';

/**
 * 顶部状态栏：会话状态 + 模型 + 上下文占用 + 后台任务入口。
 * 权限选择已移入 Composer 底栏（对齐 deepseek 的 PermissionSelect 座位）；
 * 后台任务入口 = 状态栏徽标（IA 合并 2026-08-19：任务不再占 Center tab，
 * 运行中计数常驻可见，点击弹抽屉任务列表——监控是次级任务，不劫持主导航）。
 * 信息分层：左侧「状态指示点 + 状态词」，右侧「任务 / 模型 / 上下文」。
 */
export function StatusBar(props: {
  status: StatusView | null;
  busy: boolean;
  connected: boolean;
  /** 运行中（含待审批）任务数；>0 时徽标高亮。 */
  taskCount: number;
  onOpenTasks: () => void;
}): React.JSX.Element {
  const { status, busy, connected, taskCount, onOpenTasks } = props;
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
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenTasks}
          aria-label={`后台任务（${taskCount} 个进行中）`}
          title="后台任务"
          className={`flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-hover ${
            taskCount > 0 ? 'text-fg-muted hover:text-fg' : 'text-fg-subtle hover:text-fg'
          }`}
        >
          <ListChecks className="size-3.5" aria-hidden />
          {taskCount > 0 && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 font-mono text-[10px] font-medium text-on-brand">
              {taskCount}
            </span>
          )}
        </button>
        {usagePct !== undefined && (
          <span className="shrink-0 text-fg-subtle">上下文 {usagePct}%</span>
        )}
      </div>
    </div>
  );
}
