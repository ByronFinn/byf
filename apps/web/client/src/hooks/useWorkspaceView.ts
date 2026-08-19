import { useCallback, useState } from 'react';

import {
  loadWorkspaceView,
  saveWorkspaceView,
  type SessionGroupBy,
  type SessionOrderBy,
  type WorkspaceViewState,
} from '#/lib/workspace-tree';

type Patch =
  | Partial<WorkspaceViewState>
  | ((prev: WorkspaceViewState) => Partial<WorkspaceViewState>);

/**
 * 侧边栏视图偏好(groupBy / orderBy / 展开 / 手动顺序),localStorage 持久化
 * (对齐 deepseek harness 的 `dsh.workspace.view` 客户端存储)。
 */
export function useWorkspaceView(): {
  view: WorkspaceViewState;
  patch: (p: Patch) => void;
  setGroupBy: (mode: SessionGroupBy) => void;
  setOrderBy: (mode: SessionOrderBy) => void;
  setWorkspaceOrder: (order: string[]) => void;
  setSessionOrder: (workDir: string, order: string[]) => void;
  setFlatOrder: (order: string[]) => void;
} {
  const [view, setView] = useState<WorkspaceViewState>(() => loadWorkspaceView());

  const patch = useCallback((p: Patch) => {
    setView((prev) => {
      const next = { ...prev, ...(typeof p === 'function' ? p(prev) : p) };
      saveWorkspaceView(next);
      return next;
    });
  }, []);

  const setGroupBy = useCallback(
    (mode: SessionGroupBy) => {
      patch({ groupBy: mode });
    },
    [patch],
  );
  const setOrderBy = useCallback(
    (mode: SessionOrderBy) => {
      patch({ orderBy: mode });
    },
    [patch],
  );
  const setWorkspaceOrder = useCallback(
    (order: string[]) => {
      patch({ workspaceOrder: order });
    },
    [patch],
  );
  const setSessionOrder = useCallback(
    (workDir: string, order: string[]) => {
      patch((prev) => ({ sessionOrders: { ...prev.sessionOrders, [workDir]: order } }));
    },
    [patch],
  );
  const setFlatOrder = useCallback(
    (order: string[]) => {
      patch({ flatOrder: order });
    },
    [patch],
  );

  return { view, patch, setGroupBy, setOrderBy, setWorkspaceOrder, setSessionOrder, setFlatOrder };
}
