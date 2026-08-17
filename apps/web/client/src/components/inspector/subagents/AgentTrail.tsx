import { useState } from 'react';

import { useSession } from '#/hooks/useSession';
import { useWire } from '#/hooks/useWire';
import type { AgentInfo, WireEntry } from '#/types';

import { JsonViewer } from '../shared/JsonViewer';
import { TypeBadge } from '../wire/TypeBadge';

interface AgentTrailProps {
  sessionId: string;
  agentId: string;
}

/**
 * 子代理轨迹(deepseek 式):点击 Agents 树节点后,在右侧 details 展示该
 * agent 的 wire 记录摘要列表,点击行内联展开原始 JSON —— 不打断当前上下文。
 */
export function AgentTrail({ sessionId, agentId }: AgentTrailProps) {
  const { data: session } = useSession(sessionId);
  const { data: wire, isLoading, error } = useWire(sessionId, agentId);
  const [openLine, setOpenLine] = useState<number | null>(null);

  const info = (session?.agents ?? []).find((a: AgentInfo) => a.agentId === agentId);
  const entries: WireEntry[] = (wire?.records ?? []) as WireEntry[];

  return (
    <div className="flex h-full flex-col">
      {info !== undefined ? (
        <div className="shrink-0 border-b border-border bg-surface-1 px-3 py-2">
          <div className="font-mono text-[12px] text-fg-0">{info.agentId}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10.5px] text-fg-3">
            <span>{info.type}</span>
            {info.parentAgentId !== null ? <span>← {info.parentAgentId}</span> : null}
            <span className="tabular">{entries.length} recs</span>
            {info.wireProtocolVersion !== null ? <span>v{info.wireProtocolVersion}</span> : null}
          </div>
        </div>
      ) : null}
      {isLoading ? (
        <div className="p-4 font-mono text-[12px] text-fg-3">loading wire…</div>
      ) : error ? (
        <div className="p-4 font-mono text-[12px] text-[var(--color-sev-error)]">
          {error.message}
        </div>
      ) : entries.length === 0 ? (
        <div className="p-4 font-mono text-[12px] text-fg-3">no wire records for this agent</div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {entries.map((e) => (
            <div key={e.lineNo} className="border-b border-border/60">
              <button
                type="button"
                onClick={() => {
                  setOpenLine((v) => (v === e.lineNo ? null : e.lineNo));
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-surface-1"
              >
                <span className="shrink-0 font-mono text-[10px] text-fg-3 tabular">
                  #{e.lineNo}
                </span>
                <TypeBadge type={e.data.type} />
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-fg-2">
                  {summarize(e)}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-fg-3">
                  {openLine === e.lineNo ? '▾' : '▸'}
                </span>
              </button>
              {openLine === e.lineNo ? (
                <div className="border-t border-border/60 bg-surface-0 px-3 py-2">
                  <JsonViewer value={e.data} defaultOpenDepth={1} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function summarize(entry: WireEntry): string {
  const d = entry.data as { type: string } & {
    message?: { role?: string };
    event?: { type?: string };
    text?: string;
  };
  if (d.type === 'context.append_message' && d.message?.role !== undefined) {
    const parts = (d.message as { content?: Array<{ type: string; text?: string }> }).content;
    const text = parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim();
    return `${d.message.role}: ${(text ?? '').slice(0, 120)}`;
  }
  if (d.type === 'context.append_loop_event' && d.event?.type !== undefined) {
    return d.event.type;
  }
  if (typeof d.text === 'string') return d.text.slice(0, 120);
  try {
    return JSON.stringify(d).slice(0, 120);
  } catch {
    return d.type;
  }
}
