import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronDown,
  Folder,
  FolderSearch,
  ListChecks,
  Slash,
  Sparkles,
} from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { api } from '#/api';
import { ApprovalCard } from '#/components/chat/ApprovalCard';
import { Composer } from '#/components/chat/Composer';
import { ComposerCard } from '#/components/chat/ComposerCard';
import { PermissionChip } from '#/components/chat/PermissionChip';
import { QuestionCard } from '#/components/chat/QuestionCard';
import { StatusBar } from '#/components/chat/StatusBar';
import { Transcript } from '#/components/chat/Transcript';
import { workspaceListKey } from '#/components/layout/SessionSidebar';
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
import { useEventStream } from '#/hooks/useEventStream';
import { useWorkDir } from '#/hooks/useWorkDir';
import { chatReducer, initialChatState, replayToEntries } from '#/lib/chat';
import { cn } from '#/lib/utils';
import type { PermissionMode } from '#/types';

const EXAMPLE_PROMPTS: readonly { icon: typeof BookOpen; label: string; prompt: string }[] = [
  {
    icon: BookOpen,
    label: 'Summarize this repo',
    prompt: 'Read the README at the repo root and summarize what this project does in 5 bullets.',
  },
  {
    icon: FolderSearch,
    label: 'Find TODOs',
    prompt: 'Search the src directory for TODO comments and list them grouped by file.',
  },
  {
    icon: ListChecks,
    label: 'Explain the structure',
    prompt: 'Walk through the top-level directory structure of this project and explain each part.',
  },
];

/** 目录路径的显示名(basename)。 */
function dirTitle(workDir: string): string {
  const parts = workDir.replace(/[/\\]+$/, '').split(/[/\\]/);
  return parts.at(-1) ?? workDir;
}

export function ChatPage(): React.JSX.Element {
  const params = useParams();
  const sessionId = params['sessionId'];
  if (sessionId === undefined || sessionId.length === 0) {
    return <NewSessionHero />;
  }
  return <ChatSessionPage sessionId={sessionId} />;
}

/**
 * 会话聊天页:StatusBar + Transcript + 审批/问答卡片 + Composer。
 * - 转录恢复:resume 响应的 `agents.main.replay` 映射为历史条目;
 * - SSE 在 resume 完成(会话已加载)后才订阅——端点对未加载会话 404,
 *   EventSource 遇 404 不会自动重连,先订阅会永久丢失事件流;
 * - 首条消息经导航 state `initialPrompt` 传入(hero 创建会话后携带)。
 */
function ChatSessionPage({ sessionId }: { sessionId: string }): React.JSX.Element {
  const location = useLocation();
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);
  const [resumed, setResumed] = useState(false);

  useEventStream(resumed ? sessionId : undefined, (frame) => {
    dispatch({ type: 'frame', frame });
  });

  useEffect(() => {
    if (sessionId.length === 0) return;
    // 会话切换由 App 层 key 重挂组件(reducer 重建),此处只需加载新会话状态
    let cancelled = false;
    // 同步清除导航 state,避免 StrictMode 双跑重复发送首条消息
    const initialPrompt = readInitialPrompt(location.state);
    void (async () => {
      try {
        const { session } = await api.resumeSession(sessionId);
        if (!cancelled) {
          const replay = session.agents?.['main']?.replay;
          if (replay !== undefined && replay.length > 0) {
            const { entries, toolIndex } = replayToEntries(replay);
            if (entries.length > 0) {
              dispatch({ type: 'transcript-loaded', entries, toolIndex });
            }
          }
          setResumed(true);
        }
        const { status } = await api.getSession(sessionId);
        if (!cancelled) dispatch({ type: 'status-loaded', status });
        if (initialPrompt !== null) {
          void api.prompt(sessionId, initialPrompt);
        }
      } catch (error) {
        if (!cancelled) {
          dispatch({
            type: 'frame',
            frame: {
              type: 'sys.error',
              message: error instanceof Error ? error.message : 'failed to load session',
            },
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, location.state]);

  const onSend = (text: string): void => {
    dispatch({ type: 'user-message', text });
    void api.prompt(sessionId, text);
  };

  const onCancel = (): void => {
    void api.cancel(sessionId);
  };

  // 权限切换:乐观值由 PermissionChip 内部持有,settle 后回读服务端状态确认。
  const onPermissionChange = (mode: PermissionMode): Promise<void> =>
    api.setPermission(sessionId, mode).then(() =>
      api.getSession(sessionId).then(({ status }) => {
        dispatch({ type: 'status-loaded', status });
      }),
    );

  const approvalIds = Object.keys(state.pendingApprovals);
  const questionIds = Object.keys(state.pendingQuestions);

  return (
    <div className="flex h-full flex-col">
      <StatusBar status={state.status} busy={state.busy} connected={state.connected} />
      <div className="min-h-0 flex-1">
        {state.entries.length === 0 ? (
          <EmptyState onPick={onSend} />
        ) : (
          <Transcript entries={state.entries} busy={state.busy} />
        )}
      </div>
      {(approvalIds.length > 0 || questionIds.length > 0) && (
        <div className="max-h-64 overflow-y-auto border-t border-border bg-surface-2 px-4 py-3">
          <div className="mx-auto max-w-3xl space-y-3">
            {approvalIds.map((id) => (
              <ApprovalCard
                key={id}
                sessionId={sessionId}
                requestId={id}
                request={state.pendingApprovals[id]!}
              />
            ))}
            {questionIds.map((id) => (
              <QuestionCard
                key={id}
                sessionId={sessionId}
                requestId={id}
                request={state.pendingQuestions[id]!}
              />
            ))}
          </div>
        </div>
      )}
      <Composer
        disabled={state.busy}
        model={state.status?.model}
        permission={state.status?.permission}
        onPermissionChange={onPermissionChange}
        onSend={onSend}
        onCancel={onCancel}
      />
    </div>
  );
}

/** 读取并清除导航 state 中的 initialPrompt。 */
function readInitialPrompt(state: unknown): string | null {
  const prompt = (state as { initialPrompt?: string } | null)?.initialPrompt;
  if (typeof prompt !== 'string' || prompt.length === 0) return null;
  window.history.replaceState({}, '', window.location.pathname);
  return prompt;
}

/**
 * 新会话 hero(对齐 deepseek harness):大标题 + 工作区 chip 行(卡片外上方)
 * + 输入卡片(权限 chip 于底栏左侧)。选择工作区仅暂存,发送首条消息时
 * 才创建会话并进入。
 */
function NewSessionHero(): React.JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { dir, setDir } = useWorkDir();
  const [permission, setPermission] = useState<PermissionMode | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    path: string;
    error: string | null;
    busy: boolean;
  }>({ open: false, path: '', error: null, busy: false });

  const { data: workspaces } = useQuery({
    queryKey: workspaceListKey(),
    queryFn: () => api.listWorkspaces(),
    staleTime: 30_000,
  });

  // 配置(默认模型 / 默认权限):权限初值在用户主动选择前跟随配置
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    staleTime: 60_000,
  });
  const currentPermission = permission ?? config?.defaultPermissionMode ?? 'manual';

  const startAddFlow = async (): Promise<void> => {
    try {
      const { path } = await api.pickWorkspaceDirectory();
      if (path === null) return; // 用户取消
      const { workspace } = await api.addWorkspace(path);
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setDir(workspace.workDir);
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
      .then(({ workspace }) => {
        void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        setDir(workspace.workDir);
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

  const send = (): void => {
    const value = text.trim();
    if (dir === null || value.length === 0 || sending) return;
    setSending(true);
    setError(null);
    void api
      .createSession({ workDir: dir, permission: currentPermission, model: config?.defaultModel })
      .then(({ session }) => {
        void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
        void navigate(`/sessions/${session.id}`, { state: { initialPrompt: value } });
      })
      .catch((error: unknown) => {
        setSending(false);
        setError(error instanceof Error ? error.message : String(error));
      });
  };

  const selectedWorkspace = workspaces?.find((w) => w.workDir === dir);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pt-16 pb-8">
        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-on-brand shadow-2"
            aria-hidden
          >
            <Sparkles className="size-5" />
          </span>
          <h1 className="text-xl font-semibold text-fg">Hi, I'm byf</h1>
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-fg-subtle">
            web client
          </span>
        </div>
        <p className="mt-2 max-w-md text-center text-sm text-fg-muted">
          选择一个工作区,agent 将在其中执行任务。
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="mx-auto max-w-3xl">
          {/* 工作区 chip 行:卡片外上方(对齐 deepseek heroWorkspaceRow) */}
          <div className="mb-2 flex min-h-7 items-center gap-2">
            {workspaces !== undefined && workspaces.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SeatChip label={dir === null ? '选择工作区' : dirTitle(dir)}>
                    <Folder className="size-4 text-fg-muted" aria-hidden />
                  </SeatChip>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>工作区</DropdownMenuLabel>
                  {workspaces.map((w) => (
                    <DropdownMenuCheckboxItem
                      key={w.workDir}
                      checked={w.workDir === dir}
                      onSelect={() => {
                        setDir(w.workDir);
                      }}
                    >
                      <Folder className="size-4" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{w.title}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void startAddFlow()}>
                    <Folder className="size-4" aria-hidden />
                    添加工作区
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <SeatChip
                label={dir === null ? '选择工作区' : dirTitle(dir)}
                onClick={() => void startAddFlow()}
              >
                <Folder className="size-4 text-fg-muted" aria-hidden />
              </SeatChip>
            )}
            {dir !== null && selectedWorkspace === undefined && workspaces !== undefined && (
              <span className="min-w-0 truncate text-xs text-fg-subtle">
                工作区「{dirTitle(dir)}」尚未登记,发送消息时仍会在此目录创建会话。
              </span>
            )}
          </div>

          <ComposerCard
            value={text}
            onChange={setText}
            placeholder={dir === null ? '选择一个工作区开始' : '输入消息,Enter 发送'}
            onSend={send}
            sendDisabled={dir === null || sending}
            error={error}
            model={config?.defaultModel}
            leading={
              <>
                <button
                  type="button"
                  disabled
                  aria-label="命令"
                  title="命令"
                  className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 text-xs text-fg-subtle"
                >
                  <Slash className="size-3.5" aria-hidden />
                  命令
                </button>
                <PermissionChip mode={currentPermission} onChange={setPermission} />
              </>
            }
          />
        </div>
      </div>

      {addDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-scrim"
            aria-hidden
            onClick={() => setAddDialog((prev) => ({ ...prev, open: false }))}
          />
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
              onChange={(e) => setAddDialog((prev) => ({ ...prev, path: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAddPath();
              }}
              className="mt-2 w-full rounded-md border border-border-strong bg-input-fill px-3 py-2 font-mono text-sm outline-none focus:border-brand"
            />
            {addDialog.error !== null && (
              <p className="mt-2 text-sm text-state-error">{addDialog.error}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={addDialog.busy}
                onClick={() => {
                  setAddDialog({ open: false, path: '', error: null, busy: false });
                }}
              >
                取消
              </Button>
              <Button type="button" size="sm" disabled={addDialog.busy} onClick={submitAddPath}>
                {addDialog.busy ? '添加中…' : '添加'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** seat chip(对齐 deepseek 的 ghost 视觉):无边框,悬停才出浅底。 */
function SeatChip(
  props: React.ComponentProps<'button'> & {
    label: string;
    children: React.ReactNode;
  },
): React.JSX.Element {
  const { label, className, children, ...rest } = props;
  return (
    <button
      type="button"
      className={cn(
        'flex h-7 max-w-56 items-center gap-1.5 rounded-full px-2 text-sm text-fg transition-colors',
        'hover:bg-hover',
        className,
      )}
      {...rest}
    >
      {children}
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
    </button>
  );
}

/** 空状态 hero(R13):欢迎屏 + 示例 prompt(会话内首条消息前)。 */
function EmptyState({ onPick }: { onPick: (prompt: string) => void }): React.JSX.Element {
  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-4 py-10">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-on-brand shadow-2"
          aria-hidden
        >
          <Sparkles className="size-5" />
        </span>
        <h1 className="text-xl font-semibold text-fg">Hi, I'm byf</h1>
      </div>
      <p className="mt-2 max-w-md text-center text-sm text-fg-muted">
        Your agent in the browser — send a message, or start with one of these:
      </p>
      <div className="mt-6 grid w-full max-w-lg gap-2">
        {EXAMPLE_PROMPTS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onPick(prompt);
            }}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3.5 py-2.5 text-left text-sm text-fg-muted shadow-1 transition-colors hover:border-brand/50 hover:bg-surface-2 hover:text-fg"
          >
            <Icon className="size-4 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-fg">{label}</span>
              <span className="block truncate text-xs text-fg-subtle">{prompt}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
