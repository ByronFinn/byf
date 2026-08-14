import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Copy, KeyRound, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '#/api';
import { PERMISSION_COPY } from '#/components/chat/PermissionChip';
import {
  THINKING_EFFORTS,
  THINKING_EFFORT_LABEL,
  THINKING_MODES,
  THINKING_MODE_LABEL,
} from '#/components/chat/ThinkingChip';
import { Button } from '#/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { useTheme } from '#/hooks/useTheme';
import { errorMessage, toast } from '#/lib/toast';
import { cn } from '#/lib/utils';
import type { UpdateConfigBody } from '#/types';

const CONFIG_KEY = ['config'] as const;

/** 设置弹层(对齐 deepseek 的 SettingsRoot):左侧导航 + 右侧内容,按 byf 能力裁两栏。 */
export function SettingsDialog(props: { onClose: () => void }): React.JSX.Element {
  const { onClose } = props;
  const [section, setSection] = useState<'general' | 'models'>('general');

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

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
        className="relative flex h-[480px] w-[640px] max-w-[92vw] overflow-hidden rounded-xl border border-border bg-popover shadow-3"
      >
        <nav
          className="w-40 shrink-0 border-r border-border bg-surface-2 p-2"
          aria-label="设置分区"
        >
          <button
            type="button"
            className={navItem(section === 'general')}
            onClick={() => setSection('general')}
          >
            通用设置
          </button>
          <button
            type="button"
            className={navItem(section === 'models')}
            onClick={() => setSection('models')}
          >
            模型
          </button>
        </nav>
        <div className="min-w-0 flex-1 overflow-y-auto p-4">
          {section === 'general' ? <GeneralSection /> : <ModelsSection />}
        </div>
      </div>
    </div>
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

/** 模型:默认模型选择 + 模型/供应商列表 + 移除供应商。 */
function ModelsSection(): React.JSX.Element {
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
  const remove = useMutation({
    mutationFn: (providerId: string) => api.removeProvider(providerId),
    onSuccess: (cfg) => {
      queryClient.setQueryData(CONFIG_KEY, cfg);
      toast.success('已移除 provider');
    },
    onError: (error: unknown) => {
      toast.error(`移除 provider 失败:${errorMessage(error)}`);
    },
  });
  // 内联二次确认:providerId → 是否处于确认态
  const [confirming, setConfirming] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <section>
        <h2 className="text-sm font-semibold text-fg">模型</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          当前配置的模型别名;点击「设为默认」后新会话使用它。
        </p>
        <ul className="mt-2 space-y-1">
          {(config?.models ?? []).map((m) => {
            const isDefault = config?.defaultModel === m.id;
            return (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{m.displayName ?? m.id}</span>
                  <span className="block truncate font-mono text-xs text-fg-subtle">
                    {m.provider} / {m.model}
                  </span>
                </span>
                {isDefault ? (
                  <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">
                    默认
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={patch.isPending}
                    onClick={() => {
                      patch.mutate({ defaultModel: m.id });
                    }}
                  >
                    设为默认
                  </Button>
                )}
              </li>
            );
          })}
          {(config?.models ?? []).length === 0 && (
            <p className="text-xs text-fg-subtle">
              暂无模型。请用 CLI 运行 /login 添加 provider 与模型。
            </p>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-fg">Provider</h2>
        <p className="mt-0.5 text-xs text-fg-subtle">
          添加 provider 请在 CLI 运行 /login;此处可移除。
        </p>
        <ul className="mt-2 space-y-1">
          {(config?.providers ?? []).map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-2 rounded-md border border-border bg-surface-1 px-2.5 py-1.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-fg">{p.id}</span>
                <span className="block truncate font-mono text-xs text-fg-subtle">
                  {p.type}
                  {p.baseUrl !== undefined ? ` · ${p.baseUrl}` : ''}
                </span>
              </span>
              <span
                className={cn(
                  'flex shrink-0 items-center gap-1 text-xs',
                  p.hasApiKey ? 'text-state-success' : 'text-state-warning',
                )}
              >
                <KeyRound className="size-3" aria-hidden />
                {p.hasApiKey ? '已配置密钥' : '未配置密钥'}
              </span>
              {confirming === p.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => {
                      remove.mutate(p.id);
                      setConfirming(null);
                    }}
                  >
                    确认移除
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={remove.isPending}
                    onClick={() => {
                      setConfirming(null);
                    }}
                  >
                    取消
                  </Button>
                </span>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`移除 ${p.id}`}
                  className="shrink-0 text-fg-muted hover:text-state-error"
                  onClick={() => {
                    setConfirming(p.id);
                  }}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              )}
            </li>
          ))}
          {(config?.providers ?? []).length === 0 && (
            <p className="text-xs text-fg-subtle">暂无 provider。</p>
          )}
        </ul>
      </section>
    </div>
  );
}
