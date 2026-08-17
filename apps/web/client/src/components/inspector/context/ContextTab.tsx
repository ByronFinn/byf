import { useEffect, useState } from 'react';

import { useContext } from '#/hooks/useContext';
import { useSession } from '#/hooks/useSession';
import type { TokenUsage } from '#/types';

import { Pill } from '../shared/Pill';
import { ChurnRibbon } from './ChurnRibbon';
import { CompactionRibbon } from './CompactionRibbon';
import { MessageBubble } from './MessageBubble';

interface ContextTabProps {
  sessionId: string;
  /** Override starting agentId; defaults to 'main'. */
  initialAgentId?: string;
}

export function ContextTab({ sessionId, initialAgentId = 'main' }: ContextTabProps) {
  const [agentId, setAgentId] = useState(initialAgentId);
  // Re-sync on session OR agent id change — see WireTab for the same
  // rationale (session navigation must reset a stale subagent pick).
  useEffect(() => {
    setAgentId(initialAgentId);
  }, [sessionId, initialAgentId]);
  const { data: detail } = useSession(sessionId);
  const { data: ctx, isLoading, error } = useContext(sessionId, agentId);

  const agents = detail?.agents ?? [];
  const messages = ctx?.messages ?? [];
  const session = ctx?.usage.byScope.session ?? EMPTY_USAGE;
  const config = ctx?.config ?? {};
  const permissionMode = ctx?.permission.mode ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar — agent selector + status pills */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-3 py-2">
        <label className="flex items-center gap-2 font-mono text-[11px] text-fg-2">
          <span className="text-fg-3">agent</span>
          <select
            value={agentId}
            onChange={(e) => {
              setAgentId(e.target.value);
            }}
            className="border border-border bg-surface-0 px-2 py-1 font-mono text-[12px] text-fg-0 focus:border-border-strong focus:outline-none"
          >
            {agents.length === 0 ? <option value={agentId}>{agentId}</option> : null}
            {agents.map((a) => (
              <option key={a.agentId} value={a.agentId}>
                {a.agentId} ({a.type}
                {a.parentAgentId ? ` ← ${a.parentAgentId}` : ''})
              </option>
            ))}
          </select>
        </label>
        <span className="font-mono text-[11px] text-fg-2">
          <span className="tabular text-fg-0">{messages.length}</span>
          <span className="ml-1 text-fg-3">messages</span>
        </span>
        {config.modelAlias ? (
          <span className="font-mono text-[11px] text-fg-2">
            <span className="text-fg-3">model</span>{' '}
            <span className="text-fg-0">{config.modelAlias}</span>
          </span>
        ) : null}
        {config.thinkingLevel ? (
          <span className="font-mono text-[11px] text-fg-2">
            <span className="text-fg-3">thinking</span>{' '}
            <span className="text-fg-0">{config.thinkingLevel}</span>
          </span>
        ) : null}
        {config.profileName ? (
          <span className="font-mono text-[11px] text-fg-2">
            <span className="text-fg-3">profile</span>{' '}
            <span className="text-fg-0">{config.profileName}</span>
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {permissionMode ? (
            <Pill tone="approval" variant="outline">
              permission: {permissionMode}
            </Pill>
          ) : null}
        </div>
      </div>

      {/* 4-segment token bar + 数值图例(上下文仪表盘;与 Trace 的事件时间线区分) */}
      <TokenBar usage={session} showLegend />

      {/* Message stream */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 px-3 py-4">
          {config.systemPrompt ? <SystemPromptBubble text={config.systemPrompt} /> : null}
          {isLoading ? (
            <div className="px-3 py-2 font-mono text-[12px] text-fg-3">loading context…</div>
          ) : error ? (
            <div className="px-3 py-2 font-mono text-[12px] text-[var(--color-sev-error)]">
              {error.message}
            </div>
          ) : messages.length === 0 ? (
            <div className="px-3 py-2 font-mono text-[12px] text-fg-3">
              no messages — session has only lifecycle/config records so far.
            </div>
          ) : (
            messages.map((m) => {
              if (m.source === 'compaction_summary') {
                return <CompactionRibbon key={m.lineNo} message={m} />;
              }
              if (m.source === 'cache_churn') {
                return <ChurnRibbon key={m.lineNo} message={m} />;
              }
              return <MessageBubble key={m.lineNo} message={m} />;
            })
          )}
        </div>
      </div>
    </div>
  );
}

const EMPTY_USAGE: TokenUsage = {
  inputOther: 0,
  output: 0,
  inputCacheRead: 0,
  inputCacheCreation: 0,
};

// Colors are chosen from the existing semantic palette so the bar reads
// coherently with the rest of the app:
//   inputCacheRead     = success   (cache hit — the "good" share)
//   inputOther         = info      (billed input)
//   output             = assistant (what the model produced)
//   inputCacheCreation = warning   (billed once, amortised next call)
const SEG_COLORS = {
  inputCacheRead: 'var(--color-sev-success)',
  inputOther: 'var(--color-sev-info)',
  output: 'var(--color-assistant)',
  inputCacheCreation: 'var(--color-sev-warning)',
} as const;

function TokenBar({ usage, showLegend = false }: { usage: TokenUsage; showLegend?: boolean }) {
  const total = usage.inputOther + usage.output + usage.inputCacheRead + usage.inputCacheCreation;
  if (total === 0) {
    return <div className="h-[2px] shrink-0 bg-border" />;
  }
  const seg = (n: number) => (n / total) * 100;
  const segs: Array<{ key: keyof TokenUsage; label: string }> = [
    { key: 'inputCacheRead', label: 'cache_read' },
    { key: 'inputOther', label: 'input' },
    { key: 'output', label: 'output' },
    { key: 'inputCacheCreation', label: 'cache_create' },
  ];
  const fmt = (n: number) => n.toLocaleString();
  return (
    <div className="shrink-0">
      <div
        className="flex h-[3px] w-full"
        title={
          `cache_read ${fmt(usage.inputCacheRead)} · ` +
          `input ${fmt(usage.inputOther)} · ` +
          `output ${fmt(usage.output)} · ` +
          `cache_create ${fmt(usage.inputCacheCreation)}`
        }
      >
        {segs
          .filter((s) => usage[s.key] > 0)
          .map((s) => (
            <div
              key={s.key}
              style={{
                width: `${seg(usage[s.key])}%`,
                backgroundColor: SEG_COLORS[s.key],
              }}
            />
          ))}
      </div>
      {showLegend ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 border-b border-border bg-surface-1 px-3 py-1.5">
          {segs.map((s) => (
            <span
              key={s.key}
              className="flex items-center gap-1.5 font-mono text-[10.5px] text-fg-2"
            >
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: SEG_COLORS[s.key] }}
              />
              <span className="text-fg-3">{s.label}</span>
              <span className="tabular text-fg-0">{fmt(usage[s.key])}</span>
            </span>
          ))}
          <span className="ml-auto font-mono text-[10.5px] text-fg-2">
            <span className="text-fg-3">total</span>{' '}
            <span className="tabular text-fg-0">{fmt(total)}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function SystemPromptBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <article
      className="relative flex max-w-full min-w-0 flex-col border-l-[3px] bg-surface-1"
      style={{ borderLeftColor: 'var(--color-cat-config)' }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2"
      >
        <span className="flex items-center gap-2">
          <Pill tone="config" variant="solid">
            system
          </Pill>
          <span className="font-mono text-[10px] text-fg-3 tabular">
            {text.length.toLocaleString()} chars
          </span>
        </span>
        <span className="font-mono text-[11px] text-fg-1">
          {open ? '▾ collapse' : '▸ show full'}
        </span>
      </button>
      <div className="relative min-w-0 px-3 pb-2">
        <pre
          className={[
            'min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] font-mono text-[12.5px] text-fg-0',
            open ? '' : 'max-h-[9em] overflow-hidden',
          ].join(' ')}
        >
          {text}
        </pre>
        {!open ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14"
            style={{
              background: 'linear-gradient(to bottom, transparent 0%, var(--color-surface-1) 85%)',
            }}
          />
        ) : null}
      </div>
    </article>
  );
}
