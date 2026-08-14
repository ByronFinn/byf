import { ArrowDown } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { groupParts, type Entry, type RenderPart } from '#/lib/chat';

import { Markdown } from './Markdown';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallView, ToolGroupView } from './ToolCallView';

/** 距底小于该值视为「贴底」(bottom-follow 生效阈值)。 */
const BOTTOM_THRESHOLD_PX = 80;

/**
 * 消息流 + 智能滚动(R8):贴底时新内容跟随滚到底;用户上滑看历史不被
 * 拽回;离开底部时显示 back-to-bottom 浮动按钮。用户发出新消息强制回底。
 */
export function Transcript(props: { entries: readonly Entry[]; busy: boolean }): React.JSX.Element {
  const { entries, busy } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  // 程序化回底进行中:平滑滚动的中间位置不算"离开底部",避免按钮闪烁
  const scrollingToBottom = useRef(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (el === null) return;
    scrollingToBottom.current = smooth;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    // smooth 路径不立即置 atBottom:由 onScroll 在抵达底部时收敛,否则状态翻转
    // 会触发 follow effect 立即以 auto 覆盖平滑滚动
    if (!smooth) setAtBottom(true);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < BOTTOM_THRESHOLD_PX) {
      scrollingToBottom.current = false;
      setAtBottom(true);
    } else if (!scrollingToBottom.current) {
      setAtBottom(false);
    }
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
  // 步骤时间轴(R16 / ADR 0035 D4):thinking / tool / text 各成一步,
  // 左侧竖线 + 圆点,活跃步(流式中的最后一步)辉光。
  // 工具归组(PRD-0034 R-B2)是渲染层投影:相邻同 kind 折叠为摘要行。
  const renderParts = groupParts(entry.parts);
  const last = renderParts.length - 1;
  return (
    <div className="relative space-y-2.5 pl-6">
      <span
        className="absolute top-3.5 bottom-3 left-[5px] w-0.5 bg-gradient-to-b from-border-strong to-transparent"
        aria-hidden
      />
      {renderParts.map((part, i) => (
        <div key={i} className="relative">
          <span
            className={`absolute top-1.5 -left-6 size-3 rounded-full border ${
              streaming && i === last
                ? 'border-transparent bg-brand ring-4 ring-brand/15'
                : 'border-border-strong bg-surface-2'
            }`}
            aria-hidden
          />
          <PartView part={part} active={streaming && i === last} streaming={streaming} />
        </div>
      ))}
    </div>
  );
}

function PartView(props: {
  part: RenderPart;
  active: boolean;
  streaming: boolean;
}): React.JSX.Element {
  const { part, active, streaming } = props;
  if (part.kind === 'text') {
    return <Markdown streaming={streaming}>{part.text}</Markdown>;
  }
  if (part.kind === 'thinking') {
    return <ThinkingBlock text={part.text} active={active} />;
  }
  if (part.kind === 'tool-group') {
    return <ToolGroupView group={part} />;
  }
  return <ToolCallView part={part} />;
}
