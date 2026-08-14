import { Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { AssistantPart, Entry } from '#/lib/chat';

import { Markdown } from './Markdown';
import { ToolCallView } from './ToolCallView';

export function Transcript(props: { entries: readonly Entry[]; busy: boolean }): React.JSX.Element {
  const { entries, busy } = props;
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [entries]);

  const lastId = entries.at(-1)?.id;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {entries.map((entry) => (
          <EntryView key={entry.id} entry={entry} streaming={busy && entry.id === lastId} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EntryView(props: { entry: Entry; streaming: boolean }): React.JSX.Element | null {
  const { entry, streaming } = props;
  if (entry.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-bubble px-3 py-2 text-sm text-bubble-fg">
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
