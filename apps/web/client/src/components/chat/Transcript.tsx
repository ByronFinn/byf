import { ArrowDown, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { AssistantPart, Entry } from '#/lib/chat';

import { Markdown } from './Markdown';
import { ToolCallView } from './ToolCallView';

/** 距底小于该值视为「贴底」(bottom-follow 生效阈值)。 */
const BOTTOM_THRESHOLD_PX = 80;

/**
 * 消息流 + 智能滚动(R8):贴底时新内容跟随滚到底;用户上滑看历史不被
 * 拽回;离开底部时显示 back-to-bottom 浮动按钮。用户发出新消息强制回底。
 */
export function Transcript(props: { entries: readonly Entry[]; busy: boolean }): React.JSX.Element {
  const { entries, busy } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el === null) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setAtBottom(true);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAtBottom(distance < BOTTOM_THRESHOLD_PX);
  }, []);

  const lastEntry = entries.at(-1);

  useEffect(() => {
    // bottom-follow 仅在贴底时生效;用户刚发出消息(末尾是 user)强制回底
    if (!atBottom && lastEntry?.kind !== 'user') return;
    scrollToBottom();
  }, [entries, atBottom, lastEntry, scrollToBottom]);

  return (
    <div className="relative h-full">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
          {entries.map((entry) => (
            <EntryView
              key={entry.id}
              entry={entry}
              streaming={busy && entry.id === lastEntry?.id}
            />
          ))}
        </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          onClick={() => {
            scrollToBottom(true);
          }}
          aria-label="Scroll to bottom"
          className="absolute right-4 bottom-4 flex items-center justify-center rounded-full border border-border bg-surface-2 p-2 text-fg-muted shadow-2 transition-colors hover:text-fg"
        >
          <ArrowDown className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

function EntryView(props: { entry: Entry; streaming: boolean }): React.JSX.Element | null {
  const { entry, streaming } = props;
  if (entry.kind === 'user') {
    // 用户气泡(R9):右对齐 + 品牌 token + 22px 圆角(右下小角收尾)
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-[22px] rounded-br-md bg-bubble px-4 py-2.5 text-base whitespace-pre-wrap break-words text-bubble-fg">
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === 'system') {
    return (
      <div
        className={`text-center text-xs ${entry.level === 'error' ? 'text-state-error' : 'text-fg-muted'}`}
      >
        {entry.text}
      </div>
    );
  }
  if (entry.parts.length === 0) {
    return null;
  }
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-3">
        <Sparkles className="size-3.5 text-brand" aria-hidden />
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {entry.parts.map((part, i) => (
          <PartView key={i} part={part} streaming={streaming} />
        ))}
      </div>
    </div>
  );
}

function PartView(props: { part: AssistantPart; streaming: boolean }): React.JSX.Element {
  const { part, streaming } = props;
  if (part.kind === 'text') {
    return <Markdown streaming={streaming}>{part.text}</Markdown>;
  }
  if (part.kind === 'thinking') {
    return (
      <details className="text-xs text-fg-muted">
        <summary className="cursor-pointer select-none">thinking</summary>
        <div className="mt-1 whitespace-pre-wrap opacity-80">{part.text}</div>
      </details>
    );
  }
  return <ToolCallView part={part} />;
}
