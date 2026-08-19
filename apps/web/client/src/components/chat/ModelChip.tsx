import { useQuery } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '#/api';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { errorMessage, toast } from '#/lib/toast';

const CONFIG_KEY = ['config'] as const;

/**
 * 模型选择 chip(输入卡片底栏右侧座位,原静态展示位升级为可切换):
 * 列表来自 config.models 别名,选择经 onChange 下发——会话页调用
 * `PATCH /sessions/:id/model`(模型持久化在会话配置,每个会话独立);
 * hero 页仅暂存本次新建会话的 model 覆盖,不改全局默认。
 *
 * 乐观更新语义同 PermissionChip:agent-core 的 setModel 不发
 * `agent.status.updated`,settle 后由页面回读 status 确认。
 */
export function ModelChip(props: {
  model: string | undefined;
  onChange: (model: string) => Promise<void> | void;
}): React.JSX.Element {
  const { model, onChange } = props;
  const [pending, setPending] = useState<string | null>(null);
  const { data: config } = useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => api.getConfig(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (pending !== null && model === pending) setPending(null);
  }, [model, pending]);

  const models = config?.models ?? [];
  const current = pending ?? model;
  const currentView = models.find((m) => m.id === current);

  const choose = (next: string): void => {
    if (next === current) return;
    setPending(next);
    const label = models.find((m) => m.id === next)?.displayName ?? next;
    const ok = (): void => {
      setPending(null);
      toast.success(`模型已切换为「${label}」`);
    };
    const fail = (error: unknown): void => {
      setPending(null);
      toast.error(`模型切换失败:${errorMessage(error)}`);
    };
    try {
      const result = onChange(next);
      if (result instanceof Promise) {
        void result.then(ok, fail);
      } else {
        ok();
      }
    } catch (error) {
      fail(error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="模型"
          title={
            currentView !== undefined ? `${currentView.provider} / ${currentView.model}` : undefined
          }
          className="flex h-7 max-w-44 items-center gap-1.5 rounded-full px-2 font-mono text-xs text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <span className="truncate">
            {currentView?.displayName ?? currentView?.id ?? current ?? '自动选择'}
          </span>
          <ChevronDown className="size-3 shrink-0 text-fg-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-64">
        <DropdownMenuLabel>模型</DropdownMenuLabel>
        {models.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.id}
            checked={current === m.id}
            onSelect={() => {
              choose(m.id);
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
        {models.length === 0 && (
          <p className="px-2 py-1 text-xs text-fg-subtle">暂无模型别名,请在设置中添加 Provider。</p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
