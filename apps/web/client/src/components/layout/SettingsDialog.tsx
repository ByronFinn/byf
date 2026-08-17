import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Copy, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '#/api';
import { configApi } from '#/api';
import { PERMISSION_COPY } from '#/components/chat/PermissionChip';
import {
  THINKING_EFFORTS,
  THINKING_EFFORT_LABEL,
  THINKING_MODES,
  THINKING_MODE_LABEL,
} from '#/components/chat/ThinkingChip';
import { ConfigFileSection } from '#/components/settings/ConfigFileSection';
import { ProvidersSection } from '#/components/settings/ProvidersSettings';
import { Button } from '#/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { useTheme } from '#/hooks/useTheme';
import { relativeTimeLabel } from '#/lib/relative-time';
import { errorMessage, toast } from '#/lib/toast';
import { cn } from '#/lib/utils';
import type { SessionSummary, UpdateConfigBody } from '#/types';

const CONFIG_KEY = ['config'] as const;

/** 设置弹层(对齐 deepseek 的 SettingsRoot):左侧导航 + 右侧内容,按 byf 能力裁两栏。 */
export function SettingsDialog(props: { onClose: () => void }): React.JSX.Element {
  const { onClose } = props;
  // R-C5：五段导航 + 归档管理（对齐 deepseek SettingsRoot 的左侧导航结构）
  const [section, setSection] = useState<
    'general' | 'models' | 'permission' | 'runtime' | 'configfile' | 'archives'
  >('general');
  // R-E5 / AC-A8：检测 config.toml 是否含注释/未知结构——表单保存会规范化文件。
  const [hasComments, setHasComments] = useState(false);
  const [commentsChecked, setCommentsChecked] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // R-E5：打开时读取 raw 文本，简化检测「含 # 注释行」。
  useEffect(() => {
    let cancelled = false;
    configApi
      .getConfigDocument()
      .then((doc) => {
        if (cancelled) return;
        setHasComments(doc.text.split('\n').some((l) => l.trimStart().startsWith('#')));
        setCommentsChecked(true);
      })
      .catch(() => {
        if (!cancelled) setCommentsChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const navItem = (active: boolean): string =>
    cn(
      'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
      active ? 'bg-active text-fg' : 'text-fg-muted hover:bg-hover hover:text-fg',
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="设置"
        className="relative flex h-[680px] w-[960px] max-w-[94vw] max-h-[88vh] overflow-hidden rounded-xl border border-border bg-popover shadow-3"
      >
        <nav
          className="w-40 shrink-0 border-r border-border bg-surface-2 p-2"
          aria-label="设置分区"
        >
          <button
            type="button"
            className={navItem(section === 'general')}
            onClick={() => {
              setSection('general');
            }}
          >
            通用
          </button>
          <button
            type="button"
            className={navItem(section === 'models')}
            onClick={() => {
              setSection('models');
            }}
          >
            模型与 Provider
          </button>
          <button
            type="button"
            className={navItem(section === 'permission')}
            onClick={() => {
              setSection('permission');
            }}
          >
            权限
          </button>
          <button
            type="button"
            className={navItem(section === 'runtime')}
            onClick={() => {
              setSection('runtime');
            }}
          >
            运行与服务
          </button>
          <button
            type="button"
            className={navItem(section === 'configfile')}
            onClick={() => {
              setSection('configfile');
            }}
          >
            配置文件
          </button>
          <button
            type="button"
            className={navItem(section === 'archives')}
            onClick={() => {
              setSection('archives');
            }}
          >
            归档管理
          </button>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          {commentsChecked && hasComments && section !== 'configfile' && (
            <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs text-fg-muted">
              ⚠ config.toml 含注释或未知结构：表单保存会<b className="text-fg-1">规范化文件</b>
              （丢失注释）； 如需保留请使用「配置文件」页保存（raw 全保真）。
            </div>
          )}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {section === 'general' ? (
              <GeneralSection />
            ) : section === 'models' ? (
              <ProvidersSection />
            ) : section === 'permission' ? (
              <PermissionSection />
            ) : section === 'runtime' ? (
              <RuntimeSection />
            ) : section === 'configfile' ? (
              <div className="h-full">
                <ConfigFileSection />
              </div>
            ) : (
              <ArchivesSection onClose={onClose} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 归档管理(PRD-0034 R-A3):按工作区分组列出归档会话,支持恢复 / 进入。 */
function ArchivesSection(props: { onClose: () => void }): React.JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['archived-sessions'],
    queryFn: () => api.listArchivedSessions(),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => api.patchSession(id, { archived: false }),
    onSuccess: () => {
      toast.success('会话已恢复到主列表');
      void queryClient.invalidateQueries({ queryKey: ['archived-sessions'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
    onError: (error: Error) => {
      toast.error(errorMessage(error));
    },
  });

  const byWorkspace = new Map<string, SessionSummary[]>();
  for (const session of data ?? []) {
    const list = byWorkspace.get(session.workDir) ?? [];
    list.push(session);
    byWorkspace.set(session.workDir, list);
  }

  return (
    <section aria-label="归档管理">
      <h2 className="text-sm font-semibold text-fg">归档管理</h2>
      <p className="mt-1 text-xs text-fg-subtle">
        归档会话默认从侧边栏隐藏;恢复后回到主列表(其工作区若被移除会自动重新登记)。
      </p>
      {isLoading && <p className="mt-3 text-xs text-fg-subtle">加载中…</p>}
      {!isLoading && (data ?? []).length === 0 && (
        <p className="mt-3 text-xs text-fg-subtle">暂无归档会话</p>
      )}
      {[...byWorkspace.entries()].map(([workDir, sessions]) => (
        <div key={workDir} className="mt-4">
          <h3 className="text-xs font-medium text-fg-muted">{workDir}</h3>
          <ul className="mt-1.5 space-y-1">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {session.title ?? session.lastPrompt ?? session.id}
                </span>
                <span className="shrink-0 text-xs text-fg-subtle">
                  {relativeTimeLabel(session.updatedAt)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={restoreMutation.isPending}
                  onClick={() => {
                    restoreMutation.mutate(session.id);
                  }}
                >
                  恢复
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    props.onClose();
                    void navigate(`/sessions/${session.id}`);
                  }}
                >
                  进入
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** 通用设置:默认模型 / 默认权限 / 默认思考 / 外观 / 配置文件。 */
function GeneralSection(): React.JSX.Element {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => api.getConfig(),
    staleTime: 60_000,
  });
  const patch = useMutation({
    mutationFn: (body: UpdateConfigBody) => api.setConfig(body),
    onSuccess: (cfg) => {
      queryClient.setQueryData(CONFIG_KEY, cfg);
      toast.success('设置已保存');
    },
    onError: (error: unknown) => {
      toast.error(`保存设置失败:${errorMessage(error)}`);
    },
  });
  const { choice, set } = useTheme();
  const [copied, setCopied] = useState(false);

  const apply = (body: UpdateConfigBody): void => {
    patch.mutate(body);
  };

  const modelId = (id: string): string => {
    const model = config?.models.find((m) => m.id === id);
    return model === undefined ? id : (model.displayName ?? model.id);
  };

  const copyPath = (): void => {
    if (config === undefined) return;
    void navigator.clipboard.writeText(config.configPath).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    });
  };

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-sm font-semibold text-fg">默认模型</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">仅对新会话生效;当前会话用下方会话内切换。</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2 justify-start gap-2">
              {config?.defaultModel !== undefined
                ? modelId(config.defaultModel)
                : '未设置(自动选择)'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>模型</DropdownMenuLabel>
            {(config?.models ?? []).map((m) => (
              <DropdownMenuCheckboxItem
                key={m.id}
                checked={config?.defaultModel === m.id}
                onSelect={() => {
                  apply({ defaultModel: m.id });
                }}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-fg">{m.displayName ?? m.id}</span>
                  <span className="text-xs text-fg-subtle">
                    {m.provider} / {m.model}
                  </span>
                </span>
              </DropdownMenuCheckboxItem>
            ))}
            {(config?.models ?? []).length === 0 && (
              <p className="px-2 py-1 text-xs text-fg-subtle">
                暂无模型,请在「模型」页添加或运行 CLI /login。
              </p>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-fg">默认权限</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">新会话的权限初始值。</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2 justify-start gap-2">
              {PERMISSION_COPY.find((p) => p.value === (config?.defaultPermissionMode ?? 'manual'))
                ?.name ?? '手动'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>权限模式</DropdownMenuLabel>
            {PERMISSION_COPY.map((p) => (
              <DropdownMenuCheckboxItem
                key={p.value}
                checked={(config?.defaultPermissionMode ?? 'manual') === p.value}
                onSelect={() => {
                  apply({ defaultPermissionMode: p.value });
                }}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-fg">{p.name}</span>
                  <span className="text-xs text-fg-subtle">{p.description}</span>
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-fg">思考</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          新会话的思考模式与推理强度;会话内可在输入区底部随时切换。
        </p>
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-fg-muted">思考模式</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="justify-between gap-6">
                  {THINKING_MODE_LABEL[config?.thinking?.mode ?? 'auto']}
                  <ChevronDown className="size-3 text-fg-subtle" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {THINKING_MODES.map((m) => (
                  <DropdownMenuCheckboxItem
                    key={m}
                    checked={(config?.thinking?.mode ?? 'auto') === m}
                    onSelect={() => {
                      apply({ thinking: { mode: m } });
                    }}
                  >
                    {THINKING_MODE_LABEL[m]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div
            className={cn(
              'flex items-center justify-between gap-2',
              (config?.thinking?.mode ?? 'auto') !== 'on' && 'opacity-40',
            )}
          >
            <span className="text-sm text-fg-muted">推理强度</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-between gap-6"
                  disabled={(config?.thinking?.mode ?? 'auto') !== 'on'}
                >
                  {config?.thinking?.effort !== undefined
                    ? THINKING_EFFORT_LABEL[config.thinking.effort]
                    : '中'}
                  <ChevronDown className="size-3 text-fg-subtle" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {THINKING_EFFORTS.map((e) => (
                  <DropdownMenuCheckboxItem
                    key={e}
                    checked={config?.thinking?.effort === e}
                    onSelect={() => {
                      apply({ thinking: { effort: e } });
                    }}
                  >
                    {THINKING_EFFORT_LABEL[e]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-fg">外观</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="mt-2 justify-start gap-2">
              {choice === 'light' && <Sun className="size-4" aria-hidden />}
              {choice === 'dark' && <Moon className="size-4" aria-hidden />}
              {choice === 'system' && <Monitor className="size-4" aria-hidden />}
              {choice === 'light' ? '浅色' : choice === 'dark' ? '深色' : '跟随系统'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-40">
            {(
              [
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
                { value: 'system', label: '跟随系统' },
              ] as const
            ).map(({ value, label }) => (
              <DropdownMenuCheckboxItem
                key={value}
                checked={choice === value}
                onSelect={() => {
                  set(value);
                }}
              >
                {label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-fg">配置文件</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          模型与权限等设置持久化在 byf 配置文件中,也可直接用编辑器修改。
        </p>
        {config !== undefined && (
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-fg-muted">
              {config.configPath}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyPath}
              className="gap-1.5"
            >
              {copied ? (
                <Check className="size-3.5 text-state-success" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? '已复制' : '复制路径'}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}

/** 权限（R-C5 占位骨架；详细规则编辑走 TUI/CLI 与配置文件页）。 */
function PermissionSection(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-fg">权限</h3>
        <p className="mt-1 text-sm text-fg-muted">
          工具执行的权限门控（manual / yolo / auto 与规则）。权限规则编辑请使用「配置文件」页或
          CLI（/permission）。
        </p>
      </div>
      <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-fg-muted">
        权限层是 UX 防护而非安全边界（ADR-0033）；不受信任务的隔离属于用户容器/VM。
      </div>
    </div>
  );
}

/** 运行与服务（R-C5 占位骨架）。 */
function RuntimeSection(): React.JSX.Element {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-fg">运行与服务</h3>
        <p className="mt-1 text-sm text-fg-muted">
          Web 工作台的监听地址、鉴权与文件端点配置。启动参数由 `byf web` 命令行控制（-H / --port /
          WEB_AUTH_TOKEN）。
        </p>
      </div>
    </div>
  );
}
