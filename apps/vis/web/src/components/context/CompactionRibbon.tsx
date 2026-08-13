import type { ProjectedMessage } from '../../types';

interface CompactionRibbonProps {
  /** The synthetic compaction-summary message emitted by the projector. */
  message: ProjectedMessage;
}

/**
 * 标记 `context.apply_compaction` 记录把早期消息折叠为单个摘要位置的水平
 * 丝带。接收 `source === 'compaction_summary'` 的 `ProjectedMessage`,
 * 使我们可以内联渲染摘要文本。
 */
export function CompactionRibbon({ message }: CompactionRibbonProps) {
  const summary = extractSummary(message);
  return (
    <div className="my-3 flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-[var(--color-compaction)] opacity-50" />
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-compaction)]">
          prior context compacted · line {message.lineNo}
        </span>
        <span className="h-px flex-1 bg-[var(--color-compaction)] opacity-50" />
      </div>
      {summary.length > 0 ? (
        <pre className="whitespace-pre-wrap break-words font-mono text-[12px] text-fg-2">
          {summary}
        </pre>
      ) : null}
    </div>
  );
}

function extractSummary(message: ProjectedMessage): string {
  for (const part of message.message.content) {
    if (part.type === 'text') return part.text;
  }
  return '';
}
