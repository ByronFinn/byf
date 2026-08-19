import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { errorMessage, toast } from '#/lib/toast';
import type { PermissionMode } from '#/types';

/** 权限模式展示文案(hero 与会话内共用,语义与 agent-core 的 PermissionMode 一致)。 */
export const PERMISSION_COPY: readonly {
  value: PermissionMode;
  name: string;
  description: string;
}[] = [
  { value: 'manual', name: '手动', description: '规则集驱动决策,未匹配的工具调用会询问' },
  { value: 'auto', name: '自动', description: '调用方可完全绕过规则检查' },
  { value: 'yolo', name: 'YOLO', description: '仅 deny 规则可阻止,其余全部放行' },
];

export function permissionName(mode: PermissionMode): string {
  return PERMISSION_COPY.find((p) => p.value === mode)?.name ?? mode;
}

/**
 * 权限选择 chip(对齐 deepseek 会话内 PermissionSelect 的座位与视觉):
 * 无边框 ghost、位于输入卡片底栏左侧、菜单向上弹。
 *
 * 乐观更新语义:选择后立即展示 `pending`;`onChange` 返回的 promise settle
 * (成功/失败)或服务端状态回读(经 `mode` prop)确认后回落。不再依赖 status
 * 事件——agent-core 的 setPermission 不发 `agent.status.updated`,旧实现因此
 * 会把乐观值立刻打回,与服务端真实状态相反。
 */
export function PermissionChip(props: {
  mode: PermissionMode;
  onChange: (mode: PermissionMode) => Promise<void> | void;
}): React.JSX.Element {
  const { mode, onChange } = props;
  const [pending, setPending] = useState<PermissionMode | null>(null);

  useEffect(() => {
    if (pending !== null && mode === pending) setPending(null);
  }, [mode, pending]);

  const current = pending ?? mode;

  const choose = (next: PermissionMode): void => {
    if (next === current) return;
    setPending(next);
    const ok = (): void => {
      setPending(null);
      toast.success(`权限已切换为「${permissionName(next)}」`);
    };
    const fail = (error: unknown): void => {
      setPending(null);
      toast.error(`权限切换失败:${errorMessage(error)}`);
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
          aria-label="权限模式"
          className="flex h-7 max-w-52 items-center gap-1.5 rounded-full px-2 text-sm text-fg-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{permissionName(current)}</span>
          <ChevronDown className="size-3 shrink-0 text-fg-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64">
        <DropdownMenuLabel>权限模式</DropdownMenuLabel>
        {PERMISSION_COPY.map((p) => (
          <DropdownMenuCheckboxItem
            key={p.value}
            checked={current === p.value}
            onSelect={() => {
              choose(p.value);
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
  );
}
