import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { DisclosureSection } from '#/components/shared/disclosure';
import { cn } from '#/lib/utils';
import type { ContentPart, ProjectedMessage, ToolCall } from '#/types';

import { ImagePreview } from '../shared/ImagePreview';
import { Pill } from '../shared/Pill';

interface MessageBubbleProps {
  message: ProjectedMessage;
}

/** 统一折叠 affordance(have-a-try D):ChevronRight 旋转,弃用 ▸/▾ 文本箭头。 */
function Chevron({ open }: { open: boolean }): React.JSX.Element {
  return (
    <ChevronRight
      className={cn(
        'size-3.5 shrink-0 text-fg-subtle transition-transform duration-150',
        open && 'rotate-90',
      )}
      aria-hidden
    />
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const role = message.message.role;
  if (role === 'user') return <UserBubble m={message} />;
  if (role === 'assistant') return <AssistantBubble m={message} />;
  if (role === 'tool') return <ToolBubble m={message} />;
  return <SystemBubble m={message} />;
}

function baseClass(): string {
  return 'relative flex max-w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border border-l-[3px] bg-surface-1 shadow-1';
}

function UserBubble({ m }: { m: ProjectedMessage }) {
  const origin = m.message.origin;
  const originKind = origin?.kind;
  const showsOriginBadge =
    originKind === 'system_trigger' || originKind === 'injection' || originKind === 'hook_result';
  return (
    <article className={baseClass()} style={{ borderLeftColor: 'var(--color-user)' }}>
      <header className="mb-1 flex items-center gap-2 px-3 pt-2">
        <Pill tone="user" variant="solid">
          user
        </Pill>
        <span className="font-mono text-[10px] text-fg-3 tabular">line {m.lineNo}</span>
        {showsOriginBadge ? (
          <Pill tone="meta" variant="outline">
            {originKind}
          </Pill>
        ) : null}
        {m.message.isError ? (
          <Pill tone="error" variant="outline">
            error
          </Pill>
        ) : null}
      </header>
      <div className="px-3 pb-2.5">
        <MessageContent parts={m.message.content} />
      </div>
    </article>
  );
}

function AssistantBubble({ m }: { m: ProjectedMessage }) {
  const thinkPart = m.message.content.find((p) => p.type === 'think');
  const think = thinkPart && thinkPart.type === 'think' ? thinkPart.think : undefined;
  const visibleParts = m.message.content.filter((p) => p.type !== 'think');
  const toolCalls = m.message.toolCalls;
  return (
    <article className={baseClass()} style={{ borderLeftColor: 'var(--color-assistant)' }}>
      <header className="mb-1 flex items-center gap-2 px-3 pt-2">
        <Pill tone="assistant" variant="solid">
          assistant
        </Pill>
        <span className="font-mono text-[10px] text-fg-3 tabular">line {m.lineNo}</span>
        {think ? (
          <Pill tone="config" variant="outline">
            think
          </Pill>
        ) : null}
        {toolCalls.length > 0 ? (
          <Pill tone="tools" variant="outline">
            {toolCalls.length} tool call{toolCalls.length > 1 ? 's' : ''}
          </Pill>
        ) : null}
        {m.message.partial ? (
          <Pill tone="warning" variant="outline">
            partial
          </Pill>
        ) : null}
      </header>
      {think ? (
        <div className="px-3">
          <ThinkBlock text={think} />
        </div>
      ) : null}
      <div className="px-3 pb-2.5">
        <MessageContent parts={visibleParts} />
      </div>
      {toolCalls.length > 0 ? (
        <div className="border-t border-border bg-bg/30 px-2.5 py-2.5">
          <DisclosureSection tint="in" label="工具请求" note={`${toolCalls.length} calls`}>
            <div className="space-y-1.5">
              {toolCalls.map((tc) => (
                <ToolCallCard key={tc.id} call={tc} />
              ))}
            </div>
          </DisclosureSection>
        </div>
      ) : null}
    </article>
  );
}

function ToolBubble({ m }: { m: ProjectedMessage }) {
  // Tool outputs are often huge (file contents, command stdout). Collapse
  // by default so the conversation flow stays readable. Errors open by
  // default — that's the case where the user actually needs to read.
  const [open, setOpen] = useState(m.message.isError === true);
  const totalChars = m.message.content.reduce((acc, p) => {
    if (p.type === 'text') return acc + p.text.length;
    return acc;
  }, 0);
  const preview = firstTextPreview(m.message.content);
  return (
    <article className={baseClass()} style={{ borderLeftColor: 'var(--color-tool)' }}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-hover"
      >
        <Chevron open={open} />
        <Pill tone="tool" variant="solid">
          tool
        </Pill>
        {m.message.toolCallId ? (
          <span className="font-mono text-[11px] text-fg-1">
            call {m.message.toolCallId.slice(0, 12)}
          </span>
        ) : null}
        <span className="font-mono text-[10px] text-fg-3 tabular">line {m.lineNo}</span>
        {m.message.isError ? (
          <Pill tone="error" variant="outline">
            error
          </Pill>
        ) : null}
        {!open ? (
          <span className="ml-1 flex min-w-0 flex-1 items-center gap-2 font-mono text-[11px] text-fg-3">
            <span className="truncate">{preview}</span>
            <span className="shrink-0 tabular">· {totalChars.toLocaleString()} chars</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="border-t border-border bg-bg/30 px-2.5 py-2.5">
          <DisclosureSection tint="out" label="输出" note={`${totalChars.toLocaleString()} chars`}>
            <MessageContent parts={m.message.content} />
          </DisclosureSection>
        </div>
      ) : null}
    </article>
  );
}

function SystemBubble({ m }: { m: ProjectedMessage }) {
  return (
    <article className={baseClass()} style={{ borderLeftColor: 'var(--color-cat-config)' }}>
      <header className="mb-1 flex items-center gap-2 px-3 pt-2">
        <Pill tone="config" variant="solid">
          system
        </Pill>
        <span className="font-mono text-[10px] text-fg-3 tabular">line {m.lineNo}</span>
      </header>
      <div className="px-3 pb-2.5">
        <MessageContent parts={m.message.content} />
      </div>
    </article>
  );
}

function ThinkBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-1 overflow-hidden rounded-lg border border-border bg-surface-2/40">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[11px] text-fg-2 transition-colors hover:bg-hover hover:text-fg-1"
      >
        <Chevron open={open} />
        <span className="tracking-[0.08em]">思考</span>
        <span className="ml-auto text-fg-3 tabular">{text.length}ch</span>
      </button>
      {open ? (
        <pre className="border-t border-border px-2.5 py-1.5 font-mono text-[12px] break-words whitespace-pre-wrap text-fg-1">
          {text}
        </pre>
      ) : null}
    </div>
  );
}

function ToolCallCard({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const argsStr = call.arguments ?? '';
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 py-1 text-left font-mono text-[11px] transition-colors hover:bg-hover"
      >
        <Chevron open={open} />
        <Pill tone="tools" variant="soft">
          call
        </Pill>
        <span className="text-fg-0">{call.name}</span>
        <span className="min-w-0 flex-1 truncate text-fg-3">{truncate(argsStr, 80)}</span>
        <span className="ml-auto shrink-0 text-fg-3 text-[10px] tabular">
          #{call.id.slice(0, 10)}
        </span>
      </button>
      {open ? (
        <pre className="border-t border-border bg-bg/30 px-2.5 py-1.5 font-mono text-[12px] break-words whitespace-pre-wrap text-fg-1">
          {prettyJson(argsStr)}
        </pre>
      ) : null}
    </div>
  );
}

function MessageContent({ parts }: { parts: readonly ContentPart[] }): ReactNode {
  return (
    <div className="space-y-2">
      {parts.map((p, i) => {
        if (p.type === 'text') {
          return (
            <pre
              key={i}
              className="font-mono text-[12.5px] leading-[1.55] break-words whitespace-pre-wrap text-fg-0"
            >
              {p.text}
            </pre>
          );
        }
        if (p.type === 'think') {
          return <ThinkBlock key={i} text={p.think} />;
        }
        if (p.type === 'image_url') {
          return <ImagePreview key={i} url={p.imageUrl.url} />;
        }
        if (p.type === 'audio_url') {
          return (
            <div key={i} className="font-mono text-[11px] text-fg-2">
              [audio: {p.audioUrl.url}]
            </div>
          );
        }
        if (p.type === 'video_url') {
          return (
            <div key={i} className="font-mono text-[11px] text-fg-2">
              [video: {p.videoUrl.url ?? '—'}]
            </div>
          );
        }
        // Exhaustive — anything else is unexpected for ContentPart.
        return (
          <div key={i} className="font-mono text-[11px] text-fg-3">
            [{(p as { type: string }).type}]
          </div>
        );
      })}
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '…';
}

function firstTextPreview(parts: readonly ContentPart[]): string {
  for (const p of parts) {
    if (p.type === 'text' && p.text.length > 0) {
      const firstLine = p.text.split('\n', 1)[0] ?? '';
      return truncate(firstLine, 100);
    }
    if (p.type === 'image_url') return '[image]';
    if (p.type === 'audio_url') return '[audio]';
    if (p.type === 'video_url') return '[video]';
  }
  return '(empty)';
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}
