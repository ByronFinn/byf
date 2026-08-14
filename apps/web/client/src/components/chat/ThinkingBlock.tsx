import { Brain, ChevronRight } from 'lucide-react';
import { useState } from 'react';

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 首末行摘要:单行截断;多行「首 → 末」。 */
function thinkingSummary(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return '';
  if (lines.length === 1) return truncate(lines[0] ?? '', 120);
  return `${truncate(lines[0] ?? '', 48)} → ${truncate(lines.at(-1) ?? '', 48)}`;
}

/**
 * 思考块(R12):折叠 + 首末行摘要 + Brain 图标;活跃步(thinking 流式中)
 * 图标点亮品牌色。
 */
export function ThinkingBlock(props: { text: string; active: boolean }): React.JSX.Element {
  const { text, active } = props;
  const [open, setOpen] = useState(false);
  const summary = thinkingSummary(text);

  return (
    <div className="rounded-lg border border-border bg-surface-1/60 text-xs">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-fg-muted transition-colors hover:bg-hover hover:text-fg"
      >
        <Brain className={`size-3.5 shrink-0 ${active ? 'text-brand' : ''}`} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{open ? 'Thinking' : summary || 'Thinking'}</span>
        <ChevronRight
          className={`size-3.5 shrink-0 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2 text-xs whitespace-pre-wrap text-fg-muted">
          {text}
        </div>
      )}
    </div>
  );
}
