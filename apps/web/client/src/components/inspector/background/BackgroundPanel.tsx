import { useMemo } from 'react';

import type { BackgroundTaskInfo } from '#/types';

import { Pill, type PillTone } from '../shared/Pill';

interface BackgroundPanelProps {
  sessionId: string;
  /** 后台任务列表(父层从 resume 快照 + SSE background.task.* 事件维护)。 */
  tasks: readonly BackgroundTaskInfo[];
}

const STATUS_TONE: Record<BackgroundTaskInfo['status'], PillTone> = {
  running: 'info',
  awaiting_approval: 'approval',
  completed: 'conversation',
  failed: 'warning',
  killed: 'warning',
  lost: 'warning',
};

const STATUS_LABEL: Record<BackgroundTaskInfo['status'], string> = {
  running: 'running',
  awaiting_approval: 'approval',
  completed: 'completed',
  failed: 'failed',
  killed: 'killed',
  lost: 'lost',
};

/**
 * 后台任务面板(deepseek 式):按 active/done 分组展示任务状态。
 * 仅状态展示(PRD-0035 Out of Scope:管理操作仍走 TUI/CLI)。
 */
export function BackgroundPanel({ tasks }: BackgroundPanelProps) {
  const byStatus = useMemo(() => {
    const out = { active: [] as BackgroundTaskInfo[], done: [] as BackgroundTaskInfo[] };
    for (const t of tasks) {
      if (t.status === 'running' || t.status === 'awaiting_approval') out.active.push(t);
      else out.done.push(t);
    }
    return out;
  }, [tasks]);

  if (tasks.length === 0) {
    return <div className="p-4 font-mono text-[12px] text-fg-3">no background tasks</div>;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {byStatus.active.length > 0 ? (
        <div className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
          active ({byStatus.active.length})
        </div>
      ) : null}
      {byStatus.active.map((t) => (
        <TaskRow key={t.taskId} task={t} />
      ))}
      {byStatus.done.length > 0 ? (
        <div className="border-t border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
          done ({byStatus.done.length})
        </div>
      ) : null}
      {byStatus.done.map((t) => (
        <TaskRow key={t.taskId} task={t} />
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: BackgroundTaskInfo }) {
  return (
    <div className="border-b border-border/60 px-3 py-2">
      <div className="flex items-center gap-2">
        <Pill tone={STATUS_TONE[task.status]} variant="soft">
          {STATUS_LABEL[task.status]}
        </Pill>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-0">
          {task.command}
        </span>
      </div>
      {task.description.length > 0 ? (
        <div className="mt-1 truncate font-mono text-[10.5px] text-fg-3" title={task.description}>
          {task.description}
        </div>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-fg-3 tabular">
        <span>{task.taskId.slice(0, 12)}</span>
        {task.pid !== null ? <span>pid {task.pid}</span> : null}
        {task.agentId !== undefined ? <span>agent {task.agentId}</span> : null}
        {task.exitCode !== null ? <span>exit {task.exitCode}</span> : null}
        {task.timedOut === true ? (
          <span className="text-[var(--color-sev-warning)]">timed out</span>
        ) : null}
      </div>
    </div>
  );
}
