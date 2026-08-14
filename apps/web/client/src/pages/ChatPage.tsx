import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, ChevronDown, Folder, FolderSearch, ListChecks, Sparkles } from 'lucide-react';
import { useEffect, useReducer, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { api } from '#/api';
import { ApprovalCard } from '#/components/chat/ApprovalCard';
import { Composer } from '#/components/chat/Composer';
import { ComposerCard, type TriggerCommand } from '#/components/chat/ComposerCard';
import { PermissionChip } from '#/components/chat/PermissionChip';
import { QuestionCard } from '#/components/chat/QuestionCard';
import { StatusBar } from '#/components/chat/StatusBar';
import { normalizeThinkingLevel, ThinkingChip } from '#/components/chat/ThinkingChip';
import { Transcript } from '#/components/chat/Transcript';
import { openSettingsDialog, workspaceListKey } from '#/components/layout/SessionSidebar';
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
import { useTheme } from '#/hooks/useTheme';
import { chatReducer, initialChatState, replayToEntries } from '#/lib/chat';
import { userActivatableSkills } from '#/lib/skills';
import { errorMessage, toast } from '#/lib/toast';
import { cn } from '#/lib/utils';
import type { PermissionMode, SkillSummary, ThinkingEffort } from '#/types';

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
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(chatReducer, undefined, initialChatState);
  const [resumed, setResumed] = useState(false);
  // @ 引用的工作区根(来自 resume 的 session summary)
  const [sessionWorkDir, setSessionWorkDir] = useState<string | null>(null);
  // 会话可激活技能(slash 面板 skill 命令的数据源;与 TUI 同一数据链路)
  const [skills, setSkills] = useState<readonly SkillSummary[]>([]);
  const { choice, set } = useTheme();

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
          setSessionWorkDir(session.workDir);
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

  // 会话恢复后拉取技能列表(slash 面板 `skill:<name>` 命令数据源;与 TUI 的
  // refreshSkillCommands 同链路)。失败不阻塞会话——面板仅显示内置命令。
  useEffect(() => {
    if (!resumed) return;
    let cancelled = false;
    void api
      .listSkills(sessionId)
      .then((list) => {
        if (!cancelled) setSkills(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resumed, sessionId]);

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

  // 推理强度切换:同上(ThinkingChip 内部乐观,settle 后回读确认)。
  const onThinkingChange = (level: ThinkingEffort | 'off'): Promise<void> =>
    api.setSessionThinking(sessionId, level).then(() =>
      api.getSession(sessionId).then(({ status }) => {
        dispatch({ type: 'status-loaded', status });
      }),
    );

  // slash 命令集:web 能力的 TUI 命令投影 + 会话可用技能(skills 端点)。
  // 注意不含 init:TUI 的 /init 是 CLI 内置的 init turn 机(分析代码库生成
  // AGENTS.md),不是 skill;web 无该能力,不投影。用户自定义同名 skill 会
  // 经下方技能列表自然出现。
  const PERMISSION_CYCLE: readonly PermissionMode[] = ['manual', 'auto', 'yolo'];
  const THEME_CYCLE = ['light', 'dark', 'system'] as const;
  const builtinCommands: readonly TriggerCommand[] = [
    {
      name: 'permission',
      description: '切换权限模式',
      run: () => {
        const current = state.status?.permission ?? 'manual';
        const next =
          PERMISSION_CYCLE[(PERMISSION_CYCLE.indexOf(current) + 1) % PERMISSION_CYCLE.length]!;
        void onPermissionChange(next);
      },
    },
    { name: 'model', description: '打开设置选择默认模型', run: openSettingsDialog },
    { name: 'settings', description: '打开设置', run: openSettingsDialog },
    {
      name: 'compact',
      description: '压缩会话上下文',
      run: () => {
        void api.compactSession(sessionId).then(
          () => {
            toast.info('已开始压缩会话上下文');
          },
          (error: unknown) => {
            toast.error(`压缩会话失败:${errorMessage(error)}`);
          },
        );
      },
    },
    { name: 'new', description: '开始新会话', run: () => navigate('/') },
    {
      name: 'theme',
      description: '切换主题',
      run: () => {
        const idx = THEME_CYCLE.indexOf(choice);
        set(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!);
      },
    },
    { name: 'login', description: '添加模型 provider(或 CLI /login)', run: openSettingsDialog },
  ];
  // 技能命令:与内置命令重名时内置优先(如权限/主题);执行即 activateSkill,
  // 与 TUI 的 `/skill:<name> args` 同一语义。
  const builtinNames = new Set(builtinCommands.map((c) => c.name));
  const skillCommands: readonly TriggerCommand[] = userActivatableSkills(skills)
    .filter((s) => !builtinNames.has(s.name))
    .map((s) => ({
      name: s.name,
      description: s.description.length > 0 ? s.description : `激活技能 ${s.name}`,
      run: (args: string) => {
        void api.activateSkill(sessionId, s.name, args).then(
          () => {
            toast.success(`已激活技能「${s.name}」`);
          },
          (error: unknown) => {
            toast.error(`技能「${s.name}」激活失败:${errorMessage(error)}`);
          },
        );
      },
    }));
  const commands: readonly TriggerCommand[] = [...builtinCommands, ...skillCommands];

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
        thinkingLevel={normalizeThinkingLevel(state.status?.thinkingLevel)}
        workDir={sessionWorkDir}
        commands={commands}
        onPermissionChange={onPermissionChange}
        onThinkingChange={onThinkingChange}
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
  const location = useLocation();
  const queryClient = useQueryClient();
  // 工作区是"本次新建会话"的选择:初始为空,仅接受侧边栏导航 state 的一次性
  // 预选;不读 localStorage(旧持久化值会让 hero 默认带上上次的工作区)。
  const [dir, setDir] = useState<string | null>(() => {
    const fromState = (location.state as { workDir?: unknown } | null)?.workDir;
    return typeof fromState === 'string' && fromState.length > 0 ? fromState : null;
  });
  const [permission, setPermission] = useState<PermissionMode | null>(null);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingEffort | 'off' | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    path: string;
    error: string | null;
    busy: boolean;
  }>({ open: false, path: '', error: null, busy: false });

  // 消费导航预选(侧边栏「新建会话」带工作区):useState 初始化只覆盖首次挂载;
  // 已在 / 页时靠本 effect 响应 state 变化应用并清除(与 initialPrompt 同模式)。
  useEffect(() => {
    const fromState = (location.state as { workDir?: unknown } | null)?.workDir;
    if (typeof fromState === 'string' && fromState.length > 0) {
      setDir(fromState);
    }
    if (location.state !== null) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [location.state]);

  const { data: workspaces } = useQuery({
    queryKey: workspaceListKey(),
    queryFn: () => api.listWorkspaces(),
    staleTime: 30_000,
  });

  // 配置(默认模型 / 默认权限 / 思考档位):用户主动选择前跟随配置
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    staleTime: 60_000,
  });
  const currentPermission = permission ?? config?.defaultPermissionMode ?? 'manual';
  const defaultThinkingLevel: ThinkingEffort | 'off' | undefined =
    config?.thinking?.mode === 'on'
      ? config.thinking.effort
      : config?.thinking?.mode === 'off'
        ? 'off'
        : undefined; // auto / 未配置:跟随模型,不传 thinking
  const currentThinkingLevel = thinkingLevel ?? defaultThinkingLevel;

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
      .createSession({
        workDir: dir,
        permission: currentPermission,
        model: config?.defaultModel,
        thinking: currentThinkingLevel,
      })
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

  // slash 命令集(hero 无会话:不含 init/compact/model)
  const { choice: themeChoice, set: setTheme } = useTheme();
  const HERO_PERMISSION_CYCLE: readonly PermissionMode[] = ['manual', 'auto', 'yolo'];
  const HERO_THEME_CYCLE = ['light', 'dark', 'system'] as const;
  const heroCommands: readonly TriggerCommand[] = [
    {
      name: 'permission',
      description: '切换权限模式',
      run: () => {
        const idx = HERO_PERMISSION_CYCLE.indexOf(currentPermission);
        setPermission(HERO_PERMISSION_CYCLE[(idx + 1) % HERO_PERMISSION_CYCLE.length]!);
      },
    },
    { name: 'settings', description: '打开设置', run: openSettingsDialog },
    {
      name: 'theme',
      description: '切换主题',
      run: () => {
        const idx = HERO_THEME_CYCLE.indexOf(themeChoice);
        setTheme(HERO_THEME_CYCLE[(idx + 1) % HERO_THEME_CYCLE.length]!);
      },
    },
    { name: 'login', description: '添加模型 provider(或 CLI /login)', run: openSettingsDialog },
  ];

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
                <PermissionChip mode={currentPermission} onChange={setPermission} />
                <ThinkingChip level={currentThinkingLevel} onChange={setThinkingLevel} />
              </>
            }
            trigger={{ commands: heroCommands, workDir: dir }}
          />
        </div>
      </div>

      {addDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-scrim"
            aria-hidden
            onClick={() => {
              setAddDialog((prev) => ({ ...prev, open: false }));
            }}
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
              onChange={(e) => {
                setAddDialog((prev) => ({ ...prev, path: e.target.value }));
              }}
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
