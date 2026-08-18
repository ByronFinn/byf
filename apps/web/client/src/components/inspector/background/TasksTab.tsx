import { useDetailsSetter } from '#/components/layout/details-context';
import type { BackgroundTaskInfo } from '#/types';

import { TaskDetail } from './TaskDetail';
import { TaskList } from './TaskList';

interface TasksTabProps {
  sessionId: string;
  /** 后台任务列表(父层从 resume 快照 + SSE background.task.* 事件维护)。 */
  tasks: readonly BackgroundTaskInfo[];
  /** 初始快照尚未就绪(resume 进行中)——空列表显示 loading 而非空态。 */
  loading?: boolean;
}

/**
 * 中心 Tasks tab(与 Agents 平级,deepseek 式):列出后台任务,
 * 点击任务行把该任务详情推入右侧 details 列。
 */
export function TasksTab({ sessionId, tasks, loading = false }: TasksTabProps) {
  const setDetails = useDetailsSetter();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <TaskList
        tasks={tasks}
        loading={loading}
        onSelect={(task) => {
          setDetails(<TaskDetail sessionId={sessionId} task={task} />);
        }}
      />
    </div>
  );
}
