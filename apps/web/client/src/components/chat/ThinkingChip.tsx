import { useQuery } from '@tanstack/react-query';
import { Brain, ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '#/api';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu';
import { errorMessage, toast } from '#/lib/toast';
import { cn } from '#/lib/utils';
import type { ThinkingEffort, ThinkingMode } from '#/types';

export const THINKING_EFFORTS: readonly ThinkingEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

export const THINKING_EFFORT_LABEL: Record<ThinkingEffort, string> = {
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最高',
};

export const THINKING_MODES: readonly ThinkingMode[] = ['auto', 'on', 'off'];

export const THINKING_MODE_LABEL: Record<ThinkingMode, string> = {
  auto: '自动(模型决定)',
  on: '开启',
  off: '关闭',
};

/** 归一化服务端 thinkingLevel(string)→ 档位联合;未知值(旧数据)视为未加载。 */
export function normalizeThinkingLevel(
  level: string | undefined,
): ThinkingEffort | 'off' | undefined {
  if (
    level === 'off' ||
    level === 'low' ||
    level === 'medium' ||
    level === 'high' ||
    level === 'xhigh' ||
    level === 'max'
  ) {
    return level;
  }
  return undefined;
}

/** 会话内推理强度 chip(对齐原型 verdict B):composer 底栏独立 seat,一维档位。 */
export function ThinkingChip(props: {
  /** 会话当前档位('off' = 关闭)。 */
  level: ThinkingEffort | 'off' | undefined;
  onChange: (level: ThinkingEffort | 'off') => Promise<void> | void;
}): React.JSX.Element {
  const { level, onChange } = props;
  // 全局默认档位(设置弹层「思考」行):chip 高亮展示当前档位,并支持「跟随默认」
  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: () => api.getConfig(),
    staleTime: 60_000,
  });
  const defaultLevel: ThinkingEffort | 'off' | undefined =
    config?.thinking?.mode === 'on'
      ? config.thinking.effort
      : config?.thinking?.mode === 'off'
        ? 'off'
        : undefined; // auto:跟随模型,chip 不提供「跟随默认」目标
  const [pending, setPending] = useState<ThinkingEffort | 'off' | null>(null);

  useEffect(() => {
    if (pending !== null && level === pending) setPending(null);
  }, [level, pending]);

  const current = pending ?? level;
  const label =
    current === undefined ? '思考' : current === 'off' ? '关闭' : THINKING_EFFORT_LABEL[current];

  const choose = (next: ThinkingEffort | 'off'): void => {
    if (next === current) return;
    setPending(next);
    const ok = (): void => {
      setPending(null);
      toast.success(
        next === 'off' ? '思考已关闭' : `思考强度已切换为「${THINKING_EFFORT_LABEL[next]}」`,
      );
    };
    const fail = (error: unknown): void => {
      setPending(null);
      toast.error(`思考档位切换失败:${errorMessage(error)}`);
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
          aria-label="思考档位"
          className={cn(
            'flex h-7 max-w-44 items-center gap-1.5 rounded-full px-2 text-sm transition-colors hover:bg-hover',
            level === undefined ? 'text-fg-subtle' : 'text-fg-muted hover:text-fg',
          )}
        >
          <Brain className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 shrink-0 text-fg-subtle" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-44">
        <DropdownMenuLabel>思考档位</DropdownMenuLabel>
        {defaultLevel !== undefined && (
          <DropdownMenuCheckboxItem
            checked={level === undefined || level === defaultLevel}
            onSelect={() => {
              choose(defaultLevel);
            }}
          >
            跟随默认
            <span className="ml-auto text-xs text-fg-subtle">
              ({defaultLevel === 'off' ? '关闭' : THINKING_EFFORT_LABEL[defaultLevel]})
            </span>
          </DropdownMenuCheckboxItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={level === 'off'}
          onSelect={() => {
            choose('off');
          }}
        >
          关闭
        </DropdownMenuCheckboxItem>
        {THINKING_EFFORTS.map((effort) => (
          <DropdownMenuCheckboxItem
            key={effort}
            checked={level === effort}
            onSelect={() => {
              choose(effort);
            }}
          >
            {THINKING_EFFORT_LABEL[effort]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
