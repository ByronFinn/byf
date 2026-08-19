import { useEffect, useState } from 'react';

import { api } from '#/api';
import { formatDuration } from '#/components/chat/ToolCallView';
import { relativeTimeLabel } from '#/lib/relative-time';
import type { BackgroundTaskInfo } from '#/types';

import { Pill } from '../shared/Pill';
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from './TaskList';

/** 输出预览上限:与 CLI TaskOutput 的 32 KiB 对齐,超出只取尾部。 */
const OUTPUT_PREVIEW_CHARS = 32 * 1024;

interface TaskDetailProps {
  sessionId: string;
  task: BackgroundTaskInfo;
}

/**
 * 单条后台任务详情(deepseek 式):点击 Tasks tab 中的任务行后,在右侧
 * details 列展示完整生命周期字段与命令输出 —— 不打断当前上下文。
 */
export function TaskDetail({ sessionId, task }: TaskDetailProps) {
  const duration =
    task.endedAt !== null ? task.endedAt - task.startedAt : Date.now() - task.startedAt;
  const { output, loading, error, truncated } = useTaskOutput(sessionId, task.taskId);

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

        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3">
            output
          </div>
          {loading ? (
            <div className="font-mono text-[11px] text-fg-3">输出加载中…</div>
          ) : error !== null ? (
            <div className="font-mono text-[11px] text-fg-3">failed to load output: {error}</div>
          ) : output.length > 0 ? (
            <>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-surface-1 p-2 font-mono text-[11px] leading-relaxed text-fg-2">
                {output}
              </pre>
              {truncated ? (
                <div className="mt-1 font-mono text-[10.5px] text-[var(--color-sev-warning)]">
                  …output 过长,仅显示末尾 {OUTPUT_PREVIEW_CHARS} 字符
                </div>
              ) : null}
            </>
          ) : (
            <div className="font-mono text-[11px] text-fg-3">暂无可用输出</div>
          )}
        </div>
      </div>
    </div>
  );
}

function useTaskOutput(sessionId: string, taskId: string) {
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOutput('');
    void api
      .backgroundTaskOutput(sessionId, taskId, OUTPUT_PREVIEW_CHARS)
      .then(({ output: text }) => {
        if (cancelled) return;
        setOutput(text);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setError(error instanceof Error ? error.message : String(error));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, taskId]);

  return { output, loading, error, truncated: output.length === OUTPUT_PREVIEW_CHARS };
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-20 shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-fg-2">{value}</dd>
    </div>
  );
}
