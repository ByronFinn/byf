import { useState } from 'react';

import type { ToolPart } from '#/lib/chat';
import { summarizeDisplay } from '#/lib/tool-display';

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function ToolCallView({ part }: { part: ToolPart }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const summary = summarizeDisplay(part.display) ?? part.description ?? null;
  const done = part.status === 'done';
  const resultText =
    part.result === undefined
      ? ''
      : truncate(
          typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2),
          4000,
        );

  return (
    <div className="my-1.5 rounded-lg border border-white/10 bg-[#11151a] text-[13px]">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            done ? (part.isError ? 'bg-rose-400' : 'bg-emerald-400') : 'animate-pulse bg-amber-400'
          }`}
          aria-hidden
        />
        <span className="font-mono text-zinc-300">{part.name}</span>
        {summary !== null && <span className="truncate text-zinc-500">{summary}</span>}
        <span className="ml-auto text-xs text-zinc-600">{done ? 'done' : 'running'}</span>
      </button>
      {open && resultText.length > 0 && (
        <pre className="max-h-80 overflow-auto border-t border-white/10 bg-black/40 px-3 py-2 text-[12px] text-zinc-300">
          {resultText}
        </pre>
      )}
    </div>
  );
}
