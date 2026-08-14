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
    <div className="my-1.5 rounded-lg border border-border bg-surface-1 text-sm">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            done
              ? part.isError
                ? 'bg-state-error'
                : 'bg-state-success'
              : 'animate-pulse bg-state-warning'
          }`}
          aria-hidden
        />
        <span className="font-mono text-fg">{part.name}</span>
        {summary !== null && <span className="truncate text-fg-muted">{summary}</span>}
        <span className="ml-auto text-xs text-fg-subtle">{done ? 'done' : 'running'}</span>
      </button>
      {open && resultText.length > 0 && (
        <pre className="max-h-80 overflow-auto border-t border-border bg-bg px-3 py-2 text-xs text-fg">
          {resultText}
        </pre>
      )}
    </div>
  );
}
