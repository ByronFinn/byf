import type { ProjectedMessage } from '../../types';

interface ChurnRibbonProps {
  /** The synthetic cache-churn message emitted by the projector. */
  message: ProjectedMessage;
}

/**
 * Ribbon marking where the static cache prefix changed between turns
 * (PRD-0029 R3 — break-side attribution). Mirrors {@link CompactionRibbon}'s
 * horizontal-divider paradigm. The projector encodes the changed block name and
 * cache scope into the message text as `<blockName> · <cacheScope>`.
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
