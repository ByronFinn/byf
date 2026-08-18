import { useMemo } from 'react';

import type { BackgroundTaskInfo } from '#/types';

import { Pill, type PillTone } from '../shared/Pill';

export const TASK_STATUS_TONE: Record<BackgroundTaskInfo['status'], PillTone> = {
  running: 'info',
  awaiting_approval: 'approval',
  completed: 'conversation',
  failed: 'warning',
  killed: 'warning',
  lost: 'warning',
};

export const TASK_STATUS_LABEL: Record<BackgroundTaskInfo['status'], string> = {
  running: 'running',
  awaiting_approval: 'approval',
  completed: 'completed',
  failed: 'failed',
  killed: 'killed',
  lost: 'lost',
};

interface TaskListProps {
  tasks: readonly BackgroundTaskInfo[];
  /**
   * 初始快照尚未就绪(resume 进行中)。区分「加载中」与「确实没有任务」,
   * 避免用户在 resume 窗口期看到 no background tasks 误判为空。
   */
  loading?: boolean;
  /** 点击任务行:由宿主决定去向(中心 Tasks tab → 右侧详情)。 */
  onSelect: (task: BackgroundTaskInfo) => void;
}

/**
 * 后台任务列表(deepseek 式):按 active/done 分组展示任务状态。
 * 行可点击,宿主注入 onSelect(如推入 details 列)。
 */
export function TaskList({ tasks, loading = false, onSelect }: TaskListProps) {
  const byStatus = useMemo(() => {
    const out = { active: [] as BackgroundTaskInfo[], done: [] as BackgroundTaskInfo[] };
    for (const t of tasks) {
      if (t.status === 'running' || t.status === 'awaiting_approval') out.active.push(t);
      else out.done.push(t);
    }
    return out;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <div className="p-4 font-mono text-[12px] text-fg-3">
        {loading ? 'loading background tasks…' : 'no background tasks'}
      </div>
    );
  }

  return (
    <div>
      {byStatus.active.length > 0 ? (
        <div className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
          active ({byStatus.active.length})
        </div>
      ) : null}
      {byStatus.active.map((t) => (
        <TaskRow key={t.taskId} task={t} onSelect={onSelect} />
      ))}
      {byStatus.done.length > 0 ? (
        <div className="border-t border-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
          done ({byStatus.done.length})
        </div>
      ) : null}
      {byStatus.done.map((t) => (
        <TaskRow key={t.taskId} task={t} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  onSelect,
}: {
  task: BackgroundTaskInfo;
  onSelect: (task: BackgroundTaskInfo) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(task);
      }}
      className="block w-full border-b border-border/60 px-3 py-2 text-left hover:bg-surface-1"
    >
      <span className="flex items-center gap-2">
        <Pill tone={TASK_STATUS_TONE[task.status]} variant="soft">
          {TASK_STATUS_LABEL[task.status]}
        </Pill>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-0">
          {task.command}
        </span>
      </span>
      {task.description.length > 0 ? (
        <span
          className="mt-1 block truncate font-mono text-[10.5px] text-fg-3"
          title={task.description}
        >
          {task.description}
        </span>
      ) : null}
      <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-fg-3 tabular">
        <span>{task.taskId.slice(0, 12)}</span>
        {task.pid !== null ? <span>pid {task.pid}</span> : null}
        {task.agentId !== undefined ? <span>agent {task.agentId}</span> : null}
        {task.exitCode !== null ? <span>exit {task.exitCode}</span> : null}
        {task.timedOut === true ? (
          <span className="text-[var(--color-sev-warning)]">timed out</span>
        ) : null}
      </span>
    </button>
  );
}
