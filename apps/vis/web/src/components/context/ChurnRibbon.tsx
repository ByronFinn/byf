import type { ProjectedMessage } from '../../types';

interface ChurnRibbonProps {
  /** The synthetic cache-churn message emitted by the projector. */
  message: ProjectedMessage;
}

/**
 * 标记 turn 之间静态缓存前缀发生变化位置的丝带(PRD-0029 R3——
 * 破坏侧归因)。镜像 {@link CompactionRibbon} 的水平分隔线范式。
 * projector 把变化的块名与缓存作用域编码进消息文本,形如
 * `<blockName> · <cacheScope>`。
 */
export function ChurnRibbon({ message }: ChurnRibbonProps) {
  const detail = extractDetail(message);
  return (
    <div className="my-3 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--color-sev-warn)] opacity-50" />
      <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-sev-warn)]">
        prefix changed · {detail} · line {message.lineNo}
      </span>
      <span className="h-px flex-1 bg-[var(--color-sev-warn)] opacity-50" />
    </div>
  );
}

function extractDetail(message: ProjectedMessage): string {
  for (const part of message.message.content) {
    if (part.type === 'text') return part.text;
  }
  return 'unknown';
}
