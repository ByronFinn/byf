import type { SessionSummary, WorkspaceView } from '#/types';

/** 会话列表分组方式:按工作区分组,或单列平铺。 */
export type SessionGroupBy = 'workspace' | 'flat';
/** 会话排序方式:手动(拖拽)或最近更新。 */
export type SessionOrderBy = 'manual' | 'updated';

/** 侧边栏视图偏好(对齐 deepseek `dsh.workspace.view` 的客户端半区)。 */
export interface WorkspaceViewState {
  groupBy: SessionGroupBy;
  orderBy: SessionOrderBy;
  /** workDir → 组是否展开。收起 = 0 行,展开 = 默认前 5 行 + 溢出按钮(deepseek 的 zero-or-five)。 */
  expanded: Record<string, boolean>;
  /** 手动排序:工作区顺序。 */
  workspaceOrder: string[];
  /** 手动排序:每个工作区内的会话顺序。 */
  sessionOrders: Record<string, string[]>;
  /** 手动排序:单列表模式的会话顺序。 */
  flatOrder: string[];
}

const STORAGE_KEY = 'byf.workspace.view';

export const DEFAULT_VIEW: WorkspaceViewState = {
  groupBy: 'workspace',
  orderBy: 'updated',
  expanded: {},
  workspaceOrder: [],
  sessionOrders: {},
  flatOrder: [],
};

/** 解析持久化的视图偏好;损坏 / 缺失时回退默认。 */
export function loadWorkspaceView(): WorkspaceViewState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_VIEW;
    const parsed = JSON.parse(raw) as Partial<WorkspaceViewState>;
    return {
      groupBy: parsed.groupBy === 'flat' ? 'flat' : 'workspace',
      orderBy: parsed.orderBy === 'manual' ? 'manual' : 'updated',
      expanded: isRecord(parsed.expanded) ? parsed.expanded : {},
      workspaceOrder: Array.isArray(parsed.workspaceOrder) ? parsed.workspaceOrder : [],
      sessionOrders: isRecord(parsed.sessionOrders) ? parsed.sessionOrders : {},
      flatOrder: Array.isArray(parsed.flatOrder) ? parsed.flatOrder : [],
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveWorkspaceView(state: WorkspaceViewState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 配额等错误忽略;偏好不持久化不阻塞使用
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 树节点:一条会话(标题 / 相对时间 / 所属工作区)。 */
export interface SessionNode {
  id: string;
  title: string;
  updatedAt: number;
  workDir: string;
}

/** 树节点:一个工作区分组。 */
export interface WorkspaceGroupNode {
  workDir: string;
  title: string;
  /** 当前要渲染的会话行(展开 = 渲染层截断,收起 = 空)。 */
  sessions: SessionNode[];
  /** 组内会话总数(与展示列表解耦,供溢出按钮计算)。 */
  sessionCount: number;
  expanded: boolean;
  containsCurrent: boolean;
}

/** 组展开时默认显示的会话条数;超出由渲染层的溢出按钮展开全部(deepseek 的 zero-or-five)。 */
export const VISIBLE_SESSION_LIMIT = 5;

function toNode(s: SessionSummary): SessionNode {
  return {
    id: s.id,
    title: s.title ?? s.lastPrompt ?? s.id,
    updatedAt: s.updatedAt,
    workDir: s.workDir,
  };
}

/** 手动顺序与当前列表对账:存储序 + 未记录的新项按列表序补尾。 */
export function reconcileOrder(
  ids: readonly string[],
  stored: readonly string[] | undefined,
): string[] {
  if (stored === undefined || stored.length === 0) return [...ids];
  const byId = new Set(ids);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const key of stored) {
    if (!byId.has(key) || seen.has(key)) continue;
    ordered.push(key);
    seen.add(key);
  }
  for (const id of ids) {
    if (seen.has(id)) continue;
    ordered.push(id);
  }
  return ordered;
}

function byRecency(a: SessionNode, b: SessionNode): number {
  if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
  return a.id < b.id ? -1 : 1;
}

function matchesQuery(s: SessionNode, q: string): boolean {
  if (q.length === 0) return true;
  return s.title.toLowerCase().includes(q);
}

/**
 * 由工作区数据推导侧边栏树(分组 / 排序 / 搜索 / 展开),对齐 deepseek 的
 * `deriveGroups` 语义。`activeId` 用于当前会话所在组的自动展开与高亮。
 */
export function deriveWorkspaceTree(
  workspaces: readonly WorkspaceView[],
  view: WorkspaceViewState,
  q: string,
  activeId: string | undefined,
): { groups: WorkspaceGroupNode[]; flat: SessionNode[] } {
  const query = q.trim().toLowerCase();

  // 工作区顺序:手动 → 存储序对账;最近更新 → 按组内最新会话时间倒序。
  const baseOrder = workspaces.map((w) => w.workDir);
  const orderedWorkspaces =
    view.orderBy === 'manual'
      ? reconcileOrder(baseOrder, view.workspaceOrder).map(
          (dir) => workspaces.find((w) => w.workDir === dir)!,
        )
      : [...workspaces].toSorted((a, b) => {
          const aMax = Math.max(0, ...a.sessions.map((s) => s.updatedAt));
          const bMax = Math.max(0, ...b.sessions.map((s) => s.updatedAt));
          if (bMax !== aMax) return bMax - aMax;
          return baseOrder.indexOf(a.workDir) - baseOrder.indexOf(b.workDir);
        });

  // 当前会话所在工作区首次出现时自动展开该组。
  const currentWorkDir =
    activeId === undefined
      ? undefined
      : workspaces.find((w) => w.sessions.some((s) => s.id === activeId))?.workDir;

  const groups: WorkspaceGroupNode[] = [];
  for (const workspace of orderedWorkspaces) {
    const nodes = workspace.sessions.map(toNode).filter((n) => matchesQuery(n, query));
    // 搜索时无匹配的组不显示;空闲时空工作区保留组行(对齐 deepseek 注册表语义)
    if (nodes.length === 0 && query.length > 0) continue;
    const ordered =
      view.orderBy === 'manual'
        ? reconcileOrder(
            nodes.map((n) => n.id),
            view.sessionOrders[workspace.workDir],
          ).map((id) => nodes.find((n) => n.id === id)!)
        : [...nodes].toSorted(byRecency);
    const expanded = view.expanded[workspace.workDir] ?? workspace.workDir === currentWorkDir;
    groups.push({
      workDir: workspace.workDir,
      title: workspace.title,
      // 收起 = 0 行(deepseek `tree.ts`: folded group 不渲染任何会话行)
      sessions: expanded ? ordered : [],
      sessionCount: ordered.length,
      expanded,
      containsCurrent: activeId !== undefined && nodes.some((n) => n.id === activeId),
    });
  }

  // 单列表:全部会话平铺(手动 → 存储序;最近更新 → 时间倒序)。
  const allNodes = workspaces
    .flatMap((w) => w.sessions.map(toNode))
    .filter((n) => matchesQuery(n, query));
  const flat =
    view.orderBy === 'manual'
      ? reconcileOrder(
          allNodes.map((n) => n.id),
          view.flatOrder,
        ).map((id) => allNodes.find((n) => n.id === id)!)
      : [...allNodes].toSorted(byRecency);

  return { groups, flat };
}
