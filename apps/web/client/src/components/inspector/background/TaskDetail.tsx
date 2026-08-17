import { formatDuration } from '#/components/chat/ToolCallView';
import { relativeTimeLabel } from '#/lib/relative-time';
import type { BackgroundTaskInfo } from '#/types';

import { Pill } from '../shared/Pill';
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from './TaskList';

interface TaskDetailProps {
  task: BackgroundTaskInfo;
}

/**
 * 单条后台任务详情(deepseek 式):点击 Tasks tab 中的任务行后,在右侧
 * details 列展示完整生命周期字段 —— 不打断当前上下文。
 */
export function TaskDetail({ task }: TaskDetailProps) {
  const duration =
    task.endedAt !== null ? task.endedAt - task.startedAt : Date.now() - task.startedAt;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-surface-1 px-3 py-2">
        <div className="flex items-center gap-2">
          <Pill tone={TASK_STATUS_TONE[task.status]} variant="soft">
            {TASK_STATUS_LABEL[task.status]}
          </Pill>
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-0">
            {task.command}
          </span>
        </div>
        {task.description.length > 0 ? (
          <div className="mt-1 truncate font-mono text-[10.5px] text-fg-3" title={task.description}>
            {task.description}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <dl className="space-y-2 font-mono text-[11px]">
          <MetaRow label="taskId" value={task.taskId} />
          <MetaRow label="pid" value={task.pid !== null ? String(task.pid) : '—'} />
          {task.agentId !== undefined ? <MetaRow label="agent" value={task.agentId} /> : null}
          {task.subagentType !== undefined ? (
            <MetaRow label="type" value={task.subagentType} />
          ) : null}
          <MetaRow label="started" value={relativeTimeLabel(task.startedAt)} />
          <MetaRow
            label="ended"
            value={task.endedAt !== null ? relativeTimeLabel(task.endedAt) : '—'}
          />
          <MetaRow label="duration" value={formatDuration(duration)} />
          {task.timeoutMs !== undefined ? (
            <MetaRow label="timeout" value={formatDuration(task.timeoutMs)} />
          ) : null}
          <MetaRow label="exit" value={task.exitCode !== null ? String(task.exitCode) : '—'} />
          {task.approvalReason !== undefined ? (
            <MetaRow label="approval" value={task.approvalReason} />
          ) : null}
          {task.stopReason !== undefined ? (
            <MetaRow label="stopped" value={task.stopReason} />
          ) : null}
          {task.failureReason !== undefined ? (
            <MetaRow label="reason" value={task.failureReason} />
          ) : null}
          {task.timedOut === true ? <MetaRow label="timeout" value="timed out" /> : null}
        </dl>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-fg-2">{value}</dd>
    </div>
  );
}
