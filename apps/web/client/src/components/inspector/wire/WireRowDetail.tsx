import { useState } from 'react';

import { formatDuration } from '#/components/chat/ToolCallView';
import {
  DisclosureSection,
  ErrorBanner,
  MetaChips,
  type MetaItem,
} from '#/components/shared/disclosure';
import { displayCommand } from '#/lib/tool-display';
import type {
  AgentRecord,
  ContentPart,
  ContextMessage,
  LoopRecordedEvent,
  ToolCall,
  WireEntry,
} from '#/types';

import { CopyButton } from '../shared/CopyButton';
import { ImagePreview } from '../shared/ImagePreview';
import { JsonViewer } from '../shared/JsonViewer';
import { SizePreview } from '../shared/SizePreview';

interface WireRowDetailProps {
  entry: WireEntry;
  /** Scroll to + expand a given line. */
  onJumpTo?: (lineNo: number) => void;
  /**
   * inline = 行内展开(保留 120px gutter 对齐缩进);details = 推入右侧详情列
   * (PRD-0035 R-D2),用正常边距,避免内容被挤到右侧。
   */
  variant?: 'inline' | 'details';
}

type JsonView = 'none' | 'raw' | 'projected';

export function WireRowDetail({ entry, variant = 'inline' }: WireRowDetailProps) {
  const [view, setView] = useState<JsonView>('none');
  // Only offer the dual view when migration actually changed something.
  // For records on the current protocol, `raw` and `data` are identical
  // and the toggle would just be visual noise.
  const migrated = !sameJson(entry.raw, entry.data);

  return (
    <div
      className={
        variant === 'details'
          ? 'px-3 py-2 font-mono text-[12px]'
          : 'pl-[120px] pr-2 py-2 font-mono text-[12px]'
      }
    >
      <div className="space-y-2">{renderFriendly(entry.data)}</div>
      <div className="mt-2 flex items-center justify-end gap-2">
        <CopyButton value={JSON.stringify(entry.raw, null, 2)} label="copy raw" />
        {migrated ? (
          <CopyButton value={JSON.stringify(entry.data, null, 2)} label="copy projected" />
        ) : null}
        <button
          type="button"
          onClick={() => {
            setView((v) => (v === 'raw' ? 'none' : 'raw'));
          }}
          className={`rounded-full border border-border px-2 py-0.5 text-[10px] transition-colors ${
            view === 'raw' ? 'bg-surface-2 text-fg-0' : 'text-fg-2 hover:bg-hover hover:text-fg-0'
          }`}
          title="What this line looks like on disk (no vis-side transforms)"
        >
          {view === 'raw' ? 'hide raw' : '{…} raw'}
        </button>
        {migrated ? (
          <button
            type="button"
            onClick={() => {
              setView((v) => (v === 'projected' ? 'none' : 'projected'));
            }}
            className={`rounded-full border border-border px-2 py-0.5 text-[10px] transition-colors ${
              view === 'projected'
                ? 'bg-surface-2 text-fg-0'
                : 'text-fg-2 hover:bg-hover hover:text-fg-0'
            }`}
            title="Same line after vis applied the agent-core migration chain"
          >
            {view === 'projected' ? 'hide projected' : '{…} projected'}
          </button>
        ) : null}
      </div>
      {view !== 'none' ? (
        <div className="mt-2 rounded-lg border border-border bg-surface-0 p-2">
          <div className="mb-1 font-mono text-[10px] tracking-[0.08em] text-fg-3">
            {view === 'raw' ? 'as written on disk' : 'after vis migration'}
            {migrated && view === 'raw' ? (
              <span className="ml-2 text-[var(--color-sev-warning)]">— differs from projected</span>
            ) : null}
          </div>
          <JsonViewer value={view === 'raw' ? entry.raw : entry.data} defaultOpenDepth={2} />
        </div>
      ) : null}
    </div>
  );
}

function sameJson(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/** have-a-try D 形态:元数据 chips 常驻,输入/输出分区卡片上下排布。 */
function renderFriendly(record: AgentRecord) {
  // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- only a subset of record kinds have a friendly rendering; the rest fall through
  switch (record.type) {
    case 'context.append_message':
      return <MessageDetail message={record.message} />;
    case 'context.append_loop_event':
      return <LoopEventDetail event={record.event} />;
    case 'turn.prompt':
    case 'turn.steer':
      return (
        <div className="space-y-2">
          <MetaChips items={[{ label: 'origin', value: record.origin.kind }]} />
          <DisclosureSection
            tint="in"
            label="输入 · prompt"
            note={`${record.input.length} part${record.input.length === 1 ? '' : 's'}`}
          >
            <div className="space-y-1.5">
              {record.input.map((part, i) => (
                <ContentPartView key={i} part={part} />
              ))}
            </div>
          </DisclosureSection>
        </div>
      );
    case 'context.apply_compaction':
    case 'full_compaction.complete':
      return (
        <div className="space-y-2">
          <MetaChips
            items={[
              { label: 'compactedCount', value: String(record.compactedCount), tone: 'ok' },
              { label: 'tokensBefore', value: record.tokensBefore.toLocaleString() },
              { label: 'tokensAfter', value: record.tokensAfter.toLocaleString() },
            ]}
          />
          <DisclosureSection
            tint="out"
            label="输出 · summary"
            note={`${record.summary.length} chars`}
          >
            <SizePreview label="summary" sizeBytes={record.summary.length} preview={record.summary}>
              <pre className="break-words whitespace-pre-wrap text-fg-1">{record.summary}</pre>
            </SizePreview>
          </DisclosureSection>
        </div>
      );
    default:
      return <JsonViewer value={record} defaultOpenDepth={2} />;
  }
}

function MessageDetail({ message }: { message: ContextMessage }) {
  const meta: MetaItem[] = [{ label: 'role', value: message.role }];
  if (message.toolCallId !== undefined && message.toolCallId.length > 0) {
    meta.push({ label: 'callId', value: `#${message.toolCallId.slice(0, 10)}` });
  }
  if (message.origin !== undefined) {
    meta.push({ label: 'origin', value: message.origin.kind });
  }
  if (message.isError === true) {
    meta.push({ label: 'isError', value: 'true', tone: 'err' });
  }
  if (message.partial === true) {
    meta.push({ label: 'partial', value: 'true' });
  }
  return (
    <div className="space-y-2">
      <MetaChips items={meta} />
      {message.toolCalls.length > 0 ? (
        <DisclosureSection
          tint="in"
          label="输入 · toolCalls"
          note={`${message.toolCalls.length} call${message.toolCalls.length === 1 ? '' : 's'}`}
        >
          <div className="space-y-1.5">
            {message.toolCalls.map((tc) => (
              <ToolCallView key={tc.id} call={tc} />
            ))}
          </div>
        </DisclosureSection>
      ) : null}
      {message.content.length > 0 ? (
        <DisclosureSection
          tint="out"
          label="输出 · content"
          note={`${message.content.length} part${message.content.length === 1 ? '' : 's'}`}
        >
          <div className="space-y-1.5">
            {message.content.map((part, i) => (
              <ContentPartView key={i} part={part} />
            ))}
          </div>
        </DisclosureSection>
      ) : null}
    </div>
  );
}

function ContentPartView({ part }: { part: ContentPart }) {
  switch (part.type) {
    case 'text':
      return (
        <div className="rounded-md border border-border bg-surface-0 p-2">
          <div className="mb-1 font-mono text-[10px] tracking-[0.08em] text-fg-3">
            text · {part.text.length}b
          </div>
          <pre className="break-words whitespace-pre-wrap text-fg-1">{part.text}</pre>
        </div>
      );
    case 'think':
      return (
        <div className="rounded-md border border-[var(--color-cat-config)]/40 bg-surface-0 p-2">
          <div className="mb-1 font-mono text-[10px] tracking-[0.08em] text-[var(--color-cat-config)]">
            think · {part.think.length}b
          </div>
          <pre className="break-words whitespace-pre-wrap text-fg-1">{part.think}</pre>
        </div>
      );
    case 'image_url':
      return <ImagePreview url={part.imageUrl.url} />;
    case 'audio_url':
      return (
        <div className="rounded-md border border-border bg-surface-0 p-2">
          <div className="mb-1 font-mono text-[10px] tracking-[0.08em] text-fg-3">audio_url</div>
          <Mono className="break-all">{part.audioUrl.url}</Mono>
        </div>
      );
    case 'video_url':
      return (
        <div className="rounded-md border border-border bg-surface-0 p-2">
          <div className="mb-1 font-mono text-[10px] tracking-[0.08em] text-fg-3">video_url</div>
          <Mono className="break-all">{part.videoUrl.url}</Mono>
        </div>
      );
    default:
      return <JsonViewer value={part} defaultOpenDepth={1} />;
  }
}

function ToolCallView({ call }: { call: ToolCall }) {
  const args = call.arguments ?? '';
  let parsed: unknown = null;
  if (typeof args === 'string' && args.length > 0) {
    try {
      parsed = JSON.parse(args);
    } catch {
      parsed = null;
    }
  }
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-cat-tools)]/40 bg-surface-0">
      <div className="flex items-center justify-between gap-2 px-2.5 py-1">
        <Mono className="text-[var(--color-cat-tools)]">{call.name}</Mono>
        <Mono className="text-[10px] text-fg-3">#{call.id}</Mono>
      </div>
      <div className="border-t border-border px-2.5 py-1.5">
        {parsed !== null ? (
          <JsonViewer value={parsed} defaultOpenDepth={1} />
        ) : (
          <pre className="break-words whitespace-pre-wrap text-fg-1">{args}</pre>
        )}
      </div>
    </div>
  );
}

function LoopEventDetail({ event }: { event: LoopRecordedEvent }) {
  switch (event.type) {
    case 'tool.call': {
      let parsed: unknown = event.args;
      if (typeof event.args === 'string') {
        try {
          parsed = JSON.parse(event.args);
        } catch {
          parsed = event.args;
        }
      }
      const meta: MetaItem[] = [
        { label: 'step', value: String(event.step) },
        { label: 'turnId', value: event.turnId },
        { label: 'callId', value: `#${event.toolCallId.slice(0, 10)}` },
      ];
      const command = displayCommand(event.display);
      return (
        <div className="space-y-2">
          <MetaChips items={meta} />
          <DisclosureSection tint="in" label="输入 · args" note="tool args">
            <div className="space-y-1.5">
              {event.description ? (
                <pre className="break-words whitespace-pre-wrap text-fg-1">{event.description}</pre>
              ) : null}
              {command !== null ? (
                <pre className="overflow-auto rounded-md bg-code px-2.5 py-2 text-xs leading-relaxed break-words whitespace-pre-wrap text-code-fg">
                  {command}
                </pre>
              ) : (
                <JsonViewer value={parsed} defaultOpenDepth={2} />
              )}
            </div>
          </DisclosureSection>
        </div>
      );
    }
    case 'tool.result': {
      const isError = event.result.isError === true;
      const output = event.result.output;
      const meta: MetaItem[] = [
        { label: 'isError', value: String(isError), tone: isError ? 'err' : 'ok' },
      ];
      if (event.startedAt !== undefined && event.endedAt !== undefined) {
        meta.push({ label: '耗时', value: formatDuration(event.endedAt - event.startedAt) });
      }
      meta.push({ label: 'parent', value: `#${event.parentUuid.slice(0, 10)}` });
      return (
        <div className="space-y-2">
          <MetaChips items={meta} />
          <DisclosureSection tint="out" label="输出 · result" note="tool output">
            <div className="space-y-1.5">
              {isError ? <ErrorBanner text={event.result.message ?? '工具执行失败'} /> : null}
              {!isError && event.result.message !== undefined ? (
                <pre className="break-words whitespace-pre-wrap text-fg-1">
                  {event.result.message}
                </pre>
              ) : null}
              {typeof output === 'string' ? (
                <SizePreview label="output" sizeBytes={output.length} preview={output}>
                  <pre className="break-words whitespace-pre-wrap text-fg-1">{output}</pre>
                </SizePreview>
              ) : Array.isArray(output) ? (
                <div className="space-y-1.5">
                  {output.map((p, i) => (
                    <ContentPartView key={i} part={p} />
                  ))}
                </div>
              ) : (
                <pre className="break-words whitespace-pre-wrap text-fg-1">
                  {JSON.stringify(output, null, 2)}
                </pre>
              )}
            </div>
          </DisclosureSection>
        </div>
      );
    }
    case 'step.begin':
    case 'step.end':
    case 'content.part':
      return <JsonViewer value={event} defaultOpenDepth={2} />;
    default:
      return <JsonViewer value={event} defaultOpenDepth={2} />;
  }
}

function Mono({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] text-fg-0 ${className}`}>{children}</span>;
}
