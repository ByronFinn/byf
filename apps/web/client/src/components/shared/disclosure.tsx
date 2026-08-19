/**
 * 折叠披露共享原语(have-a-try 2026-08-19 裁决形态 D):聊天工具卡 / 子 Agent
 * 抽屉 / 检视行详情 / 上下文投影共用「头部元数据 chips + 输入/输出分区卡」的
 * 统一结构语言。元数据常驻折叠头部;展开体只放 输入(蓝)/ 输出(青) 两类分区;
 * error 收敛进输出区顶部。
 */
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '#/lib/utils';

export interface MetaItem {
  label: string;
  value: string;
  tone?: 'ok' | 'err';
}

/** 头部元数据 chips:label 暗 + value 亮,状态类值用语义色。 */
export function MetaChips({ items }: { items: readonly MetaItem[] }): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {items.map((m, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-surface-2/70 px-2 py-0.5 font-mono text-[10px] tabular"
        >
          <span className="text-fg-3">{m.label}</span>
          <span
            className={
              m.tone === 'ok'
                ? 'text-state-success'
                : m.tone === 'err'
                  ? 'text-state-error'
                  : 'text-fg-muted'
            }
          >
            {m.value}
          </span>
        </span>
      ))}
    </span>
  );
}

export type SectionTint = 'in' | 'out' | 'meta';

const TINT: Record<SectionTint, { icon: string; bg: string }> = {
  in: {
    icon: 'text-[var(--color-user)]',
    bg: 'bg-[color-mix(in_oklab,var(--color-user)_14%,transparent)]',
  },
  out: {
    icon: 'text-[var(--color-assistant)]',
    bg: 'bg-[color-mix(in_oklab,var(--color-assistant)_14%,transparent)]',
  },
  meta: { icon: 'text-fg-subtle', bg: 'bg-surface-1' },
};

const TINT_ICON: Record<SectionTint, LucideIcon> = {
  in: ArrowDownLeft,
  out: ArrowUpRight,
  meta: Info,
};

/** 输入/输出分区卡:圆底图标 + 标签 + 右侧计数/大小注记。 */
export function DisclosureSection(props: {
  tint: SectionTint;
  label: string;
  note?: string;
  icon?: LucideIcon;
  children: ReactNode;
}): React.JSX.Element {
  const Icon = props.icon ?? TINT_ICON[props.tint];
  const tint = TINT[props.tint];
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface-2/40">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
        <span
          className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', tint.bg)}
        >
          <Icon className={cn('size-3', tint.icon)} aria-hidden />
        </span>
        <span className="font-mono text-[10px] tracking-[0.08em] text-fg-3">{props.label}</span>
        {props.note !== undefined && (
          <span className="ml-auto font-mono text-[10px] tabular text-fg-3">{props.note}</span>
        )}
      </div>
      <div className="px-2.5 py-2">{props.children}</div>
    </section>
  );
}

/** 输出区顶部的错误条(error 收敛进输出区,不再散落在元数据里)。 */
export function ErrorBanner({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-state-error/30 bg-state-error/10 px-2.5 py-1.5 text-xs text-state-error">
      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
}
