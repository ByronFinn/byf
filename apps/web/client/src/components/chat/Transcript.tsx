import { useEffect, useRef } from 'react';

import type { AssistantPart, Entry } from '#/lib/chat';

import { Markdown } from './Markdown';
import { ToolCallView } from './ToolCallView';

export function Transcript({ entries }: { entries: readonly Entry[] }): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [entries]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {entries.map((entry) => (
          <EntryView key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function EntryView({ entry }: { entry: Entry }): React.JSX.Element | null {
  if (entry.kind === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-emerald-600/90 px-3 py-2 text-sm text-white">
          {entry.text}
        </div>
      </div>
    );
  }
  if (entry.kind === 'system') {
    return (
      <div
        className={`text-center text-xs ${entry.level === 'error' ? 'text-rose-400' : 'text-zinc-500'}`}
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
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs">
        ✦
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {entry.parts.map((part, i) => (
          <PartView key={i} part={part} />
        ))}
      </div>
    </div>
  );
}

function PartView({ part }: { part: AssistantPart }): React.JSX.Element {
  if (part.kind === 'text') {
    return <Markdown>{part.text}</Markdown>;
  }
  if (part.kind === 'thinking') {
    return (
      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer select-none">thinking</summary>
        <div className="mt-1 whitespace-pre-wrap opacity-80">{part.text}</div>
      </details>
    );
  }
  return <ToolCallView part={part} />;
}
