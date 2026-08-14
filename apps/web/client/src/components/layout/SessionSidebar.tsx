import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Folder,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api } from '#/api';
import { SettingsDialog } from '#/components/layout/SettingsDialog';
import { Button } from '#/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { useWorkDir } from '#/hooks/useWorkDir';
import { useWorkspaceView } from '#/hooks/useWorkspaceView';
import { relativeTimeLabel } from '#/lib/relative-time';
import { cn } from '#/lib/utils';
import {
  deriveWorkspaceTree,
  reconcileOrder,
  VISIBLE_SESSION_LIMIT,
  type SessionNode,
  type WorkspaceGroupNode,
} from '#/lib/workspace-tree';

/** 工作区数据 query key(侧边栏与 hero 选择器共享缓存)。 */
export function workspaceListKey(): readonly unknown[] {
  return ['workspaces'];
}

/** 拖拽插入半区:行上半部 → before,下半部 → after。 */
function rowHalf(e: React.DragEvent): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

/** 把 dragId 从 order 中取出,按 overId 半区插回。 */
function reorderById(
  order: string[],
  dragId: string,
  overId: string,
  half: 'before' | 'after',
): string[] {
  if (dragId === overId) return order;
  const without = order.filter((id) => id !== dragId);
  const targetIndex = without.indexOf(overId);
  if (targetIndex === -1) return order;
  const insertAt = half === 'before' ? targetIndex : targetIndex + 1;
  without.splice(insertAt, 0, dragId);
  return without;
}

interface DragSession {
  readonly workDir: string;
  readonly id: string;
}

/** 行插入标记(hover 半区)。 */
interface DropMarker {
  readonly id: string;
  readonly half: 'before' | 'after';
}

/**
 * 会话侧边栏(对齐 deepseek harness):品牌行 + 新建会话 + 工作区分区
 * (视图选项 / 添加工作区 / 搜索 / 分组树)+ 底部设置。
 * - 分组:按工作区(组行可展开收起,收起显示前 5 条)或单列表。
 * - 排序:手动(拖拽,localStorage 持久化)或最近更新。
 * - `collapsed` 变体渲染 56px 图标 rail(点击展开并执行动作)。
 */
export function SessionSidebar(props: {
  variant?: 'static' | 'overlay';
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}): React.JSX.Element {
  const { variant = 'static', collapsed = false, onToggleCollapsed, onNavigate } = props;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const activeId = /^\/sessions\/([^/]+)/.exec(location.pathname)?.[1];
  const { setDir } = useWorkDir();

  const [q, setQ] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusSearchRequest, setFocusSearchRequest] = useState(0);
  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [dragWorkspace, setDragWorkspace] = useState<string | null>(null);
  const [marker, setMarker] = useState<DropMarker | null>(null);
  const [confirm, setConfirm] = useState<{
    workDir: string;
    title: string;
    error: string | null;
  } | null>(null);
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    path: string;
    error: string | null;
    busy: boolean;
  }>({ open: false, path: '', error: null, busy: false });

  const { view, patch, setGroupBy, setOrderBy, setWorkspaceOrder, setSessionOrder, setFlatOrder } =
    useWorkspaceView();

  const { data: workspaces, isFetching } = useQuery({
    queryKey: workspaceListKey(),
    queryFn: () => api.listWorkspaces(),
    staleTime: 30_000,
  });

  const { groups, flat } = deriveWorkspaceTree(workspaces ?? [], view, q, activeId);

  const invalidateWorkspaces = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
  };

  const expand = (): void => {
    if (collapsed) onToggleCollapsed?.();
  };

  // rail 搜索:展开后聚焦搜索框
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusSearchRequest > 0 && !collapsed) {
      searchInputRef.current?.focus();
    }
  }, [focusSearchRequest, collapsed]);

  const manual = view.orderBy === 'manual' && q.trim().length === 0;

  // ---- 添加工作区:原生选择器 → 失败 fallback 路径输入 -----------------------
  const addMutation = useMutation({
    mutationFn: (path: string) => api.addWorkspace(path),
    onSuccess: (data) => {
      invalidateWorkspaces();
      setDir(data.workspace.workDir);
    },
  });

  const startAddFlow = async (): Promise<void> => {
    expand();
    try {
      const { path } = await api.pickWorkspaceDirectory();
      if (path === null) return; // 用户取消
      addMutation.mutate(path);
    } catch {
      // 平台不支持或选择器失败 → 路径输入弹窗
      setAddDialog({ open: true, path: '', error: null, busy: false });
    }
  };

  const submitAddPath = (): void => {
    const path = addDialog.path.trim();
    if (path.length === 0) return;
    setAddDialog((prev) => ({ ...prev, busy: true, error: null }));
    void api
      .addWorkspace(path)
      .then((data) => {
        invalidateWorkspaces();
        setDir(data.workspace.workDir);
        setAddDialog({ open: false, path: '', error: null, busy: false });
      })
      .catch((error: unknown) => {
        setAddDialog((prev) => ({
          ...prev,
          busy: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      });
  };

  // ---- 删除工作区(二次确认) ---------------------------------------------------
  // 注意:会话删除暂不可用——SDK 无 deleteSession 面,closeSession 只关闭内存
  // 会话、磁盘记录仍在(列表会保留),故不提供误导性入口。
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (confirm === null) return;
      await api.removeWorkspace(confirm.workDir);
    },
    onSuccess: () => {
      invalidateWorkspaces();
      setConfirm(null);
    },
    onError: (error: Error) => {
      setConfirm((prev) => (prev === null ? prev : { ...prev, error: error.message }));
    },
  });

  // ---- 拖拽提交 ---------------------------------------------------------------
  const commitSessionDrop = (workDir: string, overId: string, half: 'before' | 'after'): void => {
    const drag = dragSession;
    setDragSession(null);
    setMarker(null);
    if (drag === null || drag.workDir !== workDir) return;
    const ws = workspaces?.find((w) => w.workDir === workDir);
    if (ws === undefined) return;
    const ids = ws.sessions.map((s) => s.id);
    const reconciled = reconcileOrder(ids, view.sessionOrders[workDir]);
    setSessionOrder(workDir, reorderById(reconciled, drag.id, overId, half));
  };

  const commitFlatDrop = (overId: string, half: 'before' | 'after'): void => {
    const drag = dragSession;
    setDragSession(null);
    setMarker(null);
    if (drag === null) return;
    const ids = (workspaces ?? []).flatMap((w) => w.sessions.map((s) => s.id));
    setFlatOrder(reorderById(reconcileOrder(ids, view.flatOrder), drag.id, overId, half));
  };

  const commitWorkspaceDrop = (overWorkDir: string, half: 'before' | 'after'): void => {
    const drag = dragWorkspace;
    setDragWorkspace(null);
    setMarker(null);
    if (drag === null) return;
    const ids = (workspaces ?? []).map((w) => w.workDir);
    setWorkspaceOrder(
      reorderById(reconcileOrder(ids, view.workspaceOrder), drag, overWorkDir, half),
    );
  };

  const goNewSession = (workDir?: string): void => {
    if (workDir !== undefined) setDir(workDir);
    onNavigate?.();
    void navigate('/');
  };

  // ---- 折叠 rail --------------------------------------------------------------
  if (collapsed && variant === 'static') {
    return (
      <aside
        className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-2 @4xl:flex"
        aria-label="Sidebar rail"
      >
        <SidebarIconButton label="展开侧边栏" onClick={onToggleCollapsed} active>
          <Terminal aria-hidden />
        </SidebarIconButton>
        <SidebarIconButton label="新建会话" onClick={() => goNewSession()}>
          <MessageSquarePlus aria-hidden />
        </SidebarIconButton>
        <SidebarIconButton
          label="搜索会话"
          onClick={() => {
            expand();
            setFocusSearchRequest((n) => n + 1);
          }}
        >
          <Search aria-hidden />
        </SidebarIconButton>
        <SidebarIconButton label="添加工作区" onClick={() => void startAddFlow()}>
          <Plus aria-hidden />
        </SidebarIconButton>
        <div className="min-h-0 flex-1" />
        <SidebarIconButton
          label="设置"
          onClick={() => {
            expand();
            setSettingsOpen(true);
          }}
        >
          <Settings aria-hidden />
        </SidebarIconButton>
      </aside>
    );
  }

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col border-r border-border bg-sidebar',
        variant === 'static' && 'hidden @4xl:flex',
      )}
    >
      {/* 品牌行:wordmark 点击 = 新建会话;收起按钮(仅 static) */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1">
        <Button
          variant="ghost"
          asChild
          className="flex-1 justify-start gap-2 px-1.5 py-1 font-semibold text-fg"
        >
          <Link to="/" onClick={onNavigate} aria-label="新建会话">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-on-brand"
              aria-hidden
            >
              <Terminal className="size-3.5" />
            </span>
            byf
          </Link>
        </Button>
        {variant === 'static' && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleCollapsed}
            aria-label="收起侧边栏"
            title="收起侧边栏"
          >
            <PanelLeft aria-hidden />
          </Button>
        )}
      </div>

      {/* 新建会话 */}
      <div className="px-2 pb-1">
        <Button variant="outline" asChild className="w-full justify-start">
          <Link to="/" onClick={onNavigate}>
            <MessageSquarePlus aria-hidden />
            新会话
          </Link>
        </Button>
      </div>

      {/* 工作区分区:标题 + 视图选项 + 添加工作区 */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-0.5">
        <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-fg-subtle">
          工作区
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="视图选项">
              <SlidersHorizontal aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            <DropdownMenuLabel>分组方式</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={view.groupBy === 'workspace'}
              onSelect={() => {
                setGroupBy('workspace');
              }}
            >
              按工作区
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={view.groupBy === 'flat'}
              onSelect={() => {
                setGroupBy('flat');
              }}
            >
              单列表
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>排序方式</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={view.orderBy === 'manual'}
              onSelect={() => {
                setOrderBy('manual');
              }}
            >
              手动排序
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={view.orderBy === 'updated'}
              onSelect={() => {
                setOrderBy('updated');
              }}
            >
              最近更新
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="添加工作区" onClick={() => void startAddFlow()}>
          <Plus aria-hidden />
        </IconButton>
      </div>

      {/* 搜索 */}
      <div className="px-2 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-fg-subtle"
            aria-hidden
          />
          <input
            ref={searchInputRef}
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
            }}
            placeholder="搜索会话"
            aria-label="搜索会话"
            className="w-full rounded-md border border-border bg-input-fill py-1.5 pr-2 pl-7 text-sm outline-none placeholder:text-fg-subtle focus:border-brand"
          />
        </div>
      </div>

      {/* 树 */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2" aria-label="会话">
        {workspaces === undefined && isFetching && (
          <div className="space-y-0.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-surface-2" aria-hidden />
            ))}
          </div>
        )}
        {workspaces !== undefined && workspaces.length === 0 && (
          <p className="px-2 py-4 text-xs text-fg-subtle">暂无会话</p>
        )}
        {workspaces !== undefined &&
          workspaces.length > 0 &&
          groups.length === 0 &&
          flat.length === 0 && <p className="px-2 py-4 text-xs text-fg-subtle">没有匹配的会话</p>}
        {view.groupBy === 'workspace'
          ? groups.map((group) => (
              <WorkspaceGroupRow
                key={group.workDir}
                group={group}
                activeId={activeId}
                manual={manual}
                marker={marker}
                dragWorkspace={dragWorkspace}
                dragSession={dragSession}
                onToggle={() => {
                  patch({
                    expanded: { ...view.expanded, [group.workDir]: !group.expanded },
                  });
                }}
                onNewSession={() => goNewSession(group.workDir)}
                onDelete={() => {
                  setConfirm({
                    workDir: group.workDir,
                    title: group.title,
                    error: null,
                  });
                }}
                onSessionDragStart={(id) => setDragSession({ workDir: group.workDir, id })}
                onSessionDragOver={(e, id) => {
                  if (dragSession === null || dragSession.workDir !== group.workDir) return;
                  e.preventDefault();
                  setMarker({ id, half: rowHalf(e) });
                }}
                onSessionDrop={(id, half) => commitSessionDrop(group.workDir, id, half)}
                onDragEnd={() => {
                  setDragSession(null);
                  setMarker(null);
                }}
                onWorkspaceDragStart={(workDir) => {
                  setDragWorkspace(workDir);
                  setMarker(null);
                }}
                onWorkspaceDragOver={(e, workDir) => {
                  if (dragWorkspace === null) return;
                  e.preventDefault();
                  setMarker({ id: workDir, half: rowHalf(e) });
                }}
                onWorkspaceDrop={(workDir, half) => commitWorkspaceDrop(workDir, half)}
                onWorkspaceDragEnd={() => {
                  setDragWorkspace(null);
                  setMarker(null);
                }}
              />
            ))
          : flat.map((node) => (
              <SessionRow
                key={node.id}
                node={node}
                active={node.id === activeId}
                manual={manual}
                marker={marker}
                dragSession={dragSession}
                onDragStart={() => setDragSession({ workDir: node.workDir, id: node.id })}
                onDragOver={(e, id) => {
                  if (dragSession === null) return;
                  e.preventDefault();
                  setMarker({ id, half: rowHalf(e) });
                }}
                onDrop={(id, half) => commitFlatDrop(id, half)}
                onDragEnd={() => {
                  setDragSession(null);
                  setMarker(null);
                }}
                onNavigate={onNavigate}
              />
            ))}
      </nav>

      {/* 底部:设置(打开导航式设置弹层) */}
      <div className="border-t border-border p-2">
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2 text-fg-muted"
          onClick={() => {
            setSettingsOpen(true);
          }}
        >
          <Settings aria-hidden />
          设置
        </Button>
      </div>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

      {/* 删除工作区确认 + 添加工作区路径弹窗 */}
      {confirm !== null && (
        <ConfirmDialog
          title="删除工作区"
          message={`将「${confirm.title}」从侧边栏移除?目录与会话数据保留,可随时重新添加。`}
          confirmLabel="移除"
          busy={deleteMutation.isPending}
          error={confirm.error}
          onCancel={() => {
            setConfirm(null);
          }}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
      {addDialog.open && (
        <PathInputDialog
          busy={addDialog.busy}
          error={addDialog.error}
          onCancel={() => {
            setAddDialog({ open: false, path: '', error: null, busy: false });
          }}
          onSubmit={submitAddPath}
          onPathChange={(path) => setAddDialog((prev) => ({ ...prev, path }))}
        />
      )}
    </aside>
  );
}

/** 图标小按钮(侧边栏分区头部 / rail)。透传剩余 props(Radix asChild 需要)。 */
function IconButton(
  props: React.ComponentProps<'button'> & {
    label: string;
    children: React.ReactNode;
  },
): React.JSX.Element {
  const { label, className, children, ...rest } = props;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex size-6 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

function SidebarIconButton(
  props: React.ComponentProps<'button'> & {
    label: string;
    active?: boolean;
    children: React.ReactNode;
  },
): React.JSX.Element {
  const { label, className, active = false, children, ...rest } = props;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg',
        active && 'text-fg',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 一个工作区分组:组行(文件夹 + 标题 + chevron,悬停出菜单)+ 组内会话行。 */
function WorkspaceGroupRow(props: {
  group: WorkspaceGroupNode;
  activeId: string | undefined;
  manual: boolean;
  marker: DropMarker | null;
  dragWorkspace: string | null;
  dragSession: DragSession | null;
  onToggle: () => void;
  onNewSession: () => void;
  onDelete: () => void;
  onSessionDragStart: (id: string) => void;
  onSessionDragOver: (e: React.DragEvent, id: string) => void;
  onSessionDrop: (id: string, half: 'before' | 'after') => void;
  onDragEnd: () => void;
  onWorkspaceDragStart: (workDir: string) => void;
  onWorkspaceDragOver: (e: React.DragEvent, workDir: string) => void;
  onWorkspaceDrop: (workDir: string, half: 'before' | 'after') => void;
  onWorkspaceDragEnd: () => void;
}): React.JSX.Element {
  const { group, activeId, manual, marker, dragWorkspace, dragSession } = props;
  // 组内局部展开(transient):展开的组默认显示前 5 行,溢出按钮切换全量;
  // 组折叠时复位(对齐 deepseek WorkspaceBrowser 的局部展开态)。
  const [overflowOpen, setOverflowOpen] = useState(false);
  useEffect(() => {
    if (!group.expanded) setOverflowOpen(false);
  }, [group.expanded]);
  const wsMarker = dragWorkspace !== null && marker?.id === group.workDir ? marker.half : null;
  const visibleSessions = overflowOpen
    ? group.sessions
    : group.sessions.slice(0, VISIBLE_SESSION_LIMIT);
  const hiddenCount = group.sessionCount - VISIBLE_SESSION_LIMIT;
  return (
    <div className="mb-0.5">
      <div
        role="treeitem"
        aria-expanded={group.expanded}
        draggable={manual}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', group.workDir);
          props.onWorkspaceDragStart(group.workDir);
        }}
        onDragOver={(e) => props.onWorkspaceDragOver(e, group.workDir)}
        onDrop={(e) => {
          e.preventDefault();
          props.onWorkspaceDrop(group.workDir, rowHalf(e));
        }}
        onDragEnd={props.onWorkspaceDragEnd}
        className={cn(
          'group flex items-center gap-1 rounded-md px-1.5 py-1.5 text-sm transition-colors',
          'cursor-pointer hover:bg-hover',
          wsMarker === 'before' && 'border-t-2 border-t-brand',
          wsMarker === 'after' && 'border-b-2 border-b-brand',
          dragWorkspace !== null && dragWorkspace !== group.workDir && 'opacity-60',
          group.containsCurrent && 'bg-active',
        )}
        onClick={props.onToggle}
      >
        <ChevronDown
          aria-hidden
          className={cn(
            'size-3.5 shrink-0 text-fg-subtle transition-transform',
            !group.expanded && '-rotate-90',
          )}
        />
        <Folder className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-fg">{group.title}</span>
        <span className="hidden items-center gap-0.5 group-hover:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${group.title} 菜单`}
                className="flex size-5 items-center justify-center rounded text-fg-subtle hover:bg-hover hover:text-fg"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={props.onNewSession}>新建会话</DropdownMenuItem>
              <DropdownMenuItem variant="danger" onSelect={props.onDelete}>
                <Trash2 className="size-4" aria-hidden />
                删除工作区
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </div>
      {group.expanded &&
        visibleSessions.map((node) => (
          <SessionRow
            key={node.id}
            node={node}
            active={node.id === activeId}
            manual={manual}
            marker={dragSession !== null && marker?.id === node.id ? marker : null}
            dragSession={dragSession}
            onDragStart={() => props.onSessionDragStart(node.id)}
            onDragOver={(e, id) => {
              if (dragSession === null || dragSession.workDir !== group.workDir) return;
              props.onSessionDragOver(e, id);
            }}
            onDrop={(id, half) => props.onSessionDrop(id, half)}
            onDragEnd={props.onDragEnd}
            onNavigate={undefined}
            indent
          />
        ))}
      {group.expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => {
            setOverflowOpen((v) => !v);
          }}
          className="w-full rounded py-1 pl-6 text-left text-xs text-fg-subtle transition-colors hover:text-fg"
        >
          {overflowOpen ? '收起' : `展开其余 ${hiddenCount} 个会话`}
        </button>
      )}
    </div>
  );
}

/** 会话行:标题 + 相对时间 + active 高亮 + 拖拽。 */
function SessionRow(props: {
  node: SessionNode;
  active: boolean;
  manual: boolean;
  marker: DropMarker | null;
  dragSession: DragSession | null;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent, id: string) => void;
  onDrop: (id: string, half: 'before' | 'after') => void;
  onDragEnd: () => void;
  onNavigate?: () => void;
  indent?: boolean;
}): React.JSX.Element {
  const { node, active, manual, marker, dragSession, indent = false } = props;
  const dragMarker = dragSession !== null && marker?.id === node.id ? marker.half : null;
  return (
    <Link
      to={`/sessions/${node.id}`}
      onClick={props.onNavigate}
      aria-current={active ? 'page' : undefined}
      draggable={manual}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', node.id);
        props.onDragStart();
      }}
      onDragOver={(e) => props.onDragOver(e, node.id)}
      onDrop={(e) => {
        e.preventDefault();
        props.onDrop(node.id, rowHalf(e));
      }}
      onDragEnd={props.onDragEnd}
      className={cn(
        'group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors',
        active ? 'bg-active text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
        dragMarker === 'before' && 'border-t-2 border-t-brand',
        dragMarker === 'after' && 'border-b-2 border-b-brand',
        dragSession !== null && dragSession.id !== node.id && 'opacity-60',
        indent && 'pl-6',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{node.title}</span>
      <span className="shrink-0 text-xs text-fg-subtle">{relativeTimeLabel(node.updatedAt)}</span>
    </Link>
  );
}

/** 通用确认弹窗(删除工作区)。 */
function ConfirmDialog(props: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}): React.JSX.Element {
  const { title, message, confirmLabel, busy, error, onCancel, onConfirm } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label={title}
        className="relative w-80 rounded-lg border border-border bg-popover p-4 shadow-3"
      >
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{message}</p>
        {error !== null && <p className="mt-2 text-sm text-state-error">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button type="button" size="sm" variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? '处理中…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 添加工作区路径输入弹窗(native picker 不可用时的 fallback)。 */
function PathInputDialog(props: {
  busy: boolean;
  error: string | null;
  onPathChange: (path: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  const { busy, error, onPathChange, onSubmit, onCancel } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={onCancel} aria-hidden />
      <div
        role="dialog"
        aria-label="添加工作区"
        className="relative w-96 rounded-lg border border-border bg-popover p-4 shadow-3"
      >
        <h2 className="text-sm font-semibold text-fg">添加工作区</h2>
        <p className="mt-1.5 text-sm text-fg-muted">输入一个绝对路径作为工作区目录:</p>
        <input
          type="text"
          autoFocus
          placeholder="/absolute/path/to/project"
          onChange={(e) => onPathChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          className="mt-2 w-full rounded-md border border-border-strong bg-input-fill px-3 py-2 font-mono text-sm outline-none focus:border-brand"
        />
        {error !== null && <p className="mt-2 text-sm text-state-error">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button type="button" size="sm" onClick={onSubmit} disabled={busy}>
            {busy ? '添加中…' : '添加'}
          </Button>
        </div>
      </div>
    </div>
  );
}
