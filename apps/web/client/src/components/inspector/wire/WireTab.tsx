import { useVirtualizer } from '@tanstack/react-virtual';
import { Clock } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { useDetailsSetter } from '#/components/layout/details-context';
import { useWire } from '#/hooks/useWire';
import { computeIssues, topSeverity } from '#/lib/issues';
import {
  deriveTimelineTurns,
  timelineFocusLineNos,
  type TimelineMode,
  type TimelineRange,
} from '#/lib/timeline';
import type { AgentRecord, WireEntry } from '#/types';

import { IssuesDrawer } from './IssuesDrawer';
import { TrajectoryTimeline } from './TrajectoryTimeline';
import { WireRow, type PairHint } from './WireRow';
import { WireRowDetail } from './WireRowDetail';

interface PairRecord {
  callLineNo: number | null;
  resultLineNo: number | null;
}

/** Scan all entries and pair every `tool.call` with its `tool.result`
 *  by `toolCallId`. Used to render the inline "→ #N" / "← #N" cross-
 *  references and to drive the hover-pair highlight. */
function computePairMap(entries: readonly WireEntry[]): Map<string, PairRecord> {
  const map = new Map<string, PairRecord>();
  const ensure = (id: string): PairRecord => {
    const existing = map.get(id);
    if (existing) return existing;
    const fresh: PairRecord = { callLineNo: null, resultLineNo: null };
    map.set(id, fresh);
    return fresh;
  };
  for (const entry of entries) {
    if (entry.data.type !== 'context.append_loop_event') continue;
    const ev = entry.data.event;
    if (ev.type === 'tool.call') {
      ensure(ev.toolCallId).callLineNo = entry.lineNo;
    } else if (ev.type === 'tool.result') {
      ensure(ev.toolCallId).resultLineNo = entry.lineNo;
    }
  }
  return map;
}

function pairInfoFor(record: AgentRecord, map: Map<string, PairRecord>): PairHint | undefined {
  if (record.type !== 'context.append_loop_event') return undefined;
  const ev = record.event;
  if (ev.type !== 'tool.call' && ev.type !== 'tool.result') return undefined;
  const entry = map.get(ev.toolCallId);
  if (entry === undefined) return undefined;
  return {
    toolCallId: ev.toolCallId,
    kind: ev.type === 'tool.call' ? 'call' : 'result',
    callLineNo: entry.callLineNo,
    resultLineNo: entry.resultLineNo,
  };
}

interface WireTabProps {
  sessionId: string;
  /** 作用域由 InspectTab 的 ScopeSelector 统一控制（受控 prop）。 */
  agentId: string;
}

export function WireTab({ sessionId, agentId }: WireTabProps) {
  const { data: wire, isLoading, error } = useWire(sessionId, agentId);
  const parentRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hoveredPairId, setHoveredPairId] = useState<string | null>(null);
  // 时间轴（TrajectoryTimeline）状态：等宽/真实时长模式 + 聚焦区间 + 选中行。
  const [actualDuration, setActualDuration] = useState(false);
  const [timelineRange, setTimelineRange] = useState<TimelineRange | null>(null);
  const [timelineSelectedLineNo, setTimelineSelectedLineNo] = useState<number | null>(null);

  const entries: WireEntry[] = useMemo(() => {
    return (wire?.records ?? []) as WireEntry[];
  }, [wire?.records]);
  const warnings = wire?.warnings ?? [];

  const pairMap = useMemo(() => computePairMap(entries), [entries]);
  // 时间轴（input/model/tools 三轨总览）数据来源：wire 折叠为轨迹账本。
  const timelineTurns = useMemo(() => deriveTimelineTurns(entries), [entries]);
  const timelineMode: TimelineMode = actualDuration ? 'duration' : 'sequence';
  // 聚焦区间命中的 wire 行号：区间内行保留亮度、区间外变暗。
  const focusLineNos = useMemo(
    () =>
      timelineRange === null
        ? null
        : timelineFocusLineNos(timelineTurns, timelineRange, timelineMode),
    [timelineTurns, timelineRange, timelineMode],
  );
  // Precompute the per-entry PairHint so the object identity is stable
  // across hover state changes. Without this, every hover would create
  // fresh pair objects and bust WireRow's memo for every tool row.
  const pairByLineNo = useMemo(() => {
    const m = new Map<number, PairHint>();
    for (const entry of entries) {
      const p = pairInfoFor(entry.data, pairMap);
      if (p !== undefined) m.set(entry.lineNo, p);
    }
    return m;
  }, [entries, pairMap]);
  const onHoverPair = useCallback((id: string | null) => {
    setHoveredPairId(id);
  }, []);

  const filtered = useMemo(() => {
    if (search.length === 0) return entries;
    const needle = search.toLowerCase();
    return entries.filter((e) => {
      if (e.data.type.toLowerCase().includes(needle)) return true;
      try {
        return JSON.stringify(e.data).toLowerCase().includes(needle);
      } catch {
        return false;
      }
    });
  }, [entries, search]);
  // 搜索命中行号（时间轴对未命中 span 变暗，与 ledger 搜索同源）。
  const searchMatchLineNos = useMemo(() => {
    if (search.length === 0) return null;
    return new Set(filtered.map((e) => e.lineNo));
  }, [filtered, search]);

  const issues = useMemo(() => computeIssues(entries, warnings), [entries, warnings]);
  const issuesSeverity = topSeverity(issues);

  const virt = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
    getItemKey: (i) => filtered[i]?.lineNo ?? i,
  });

  const setDetails = useDetailsSetter();
  // 折叠与查看分离（交互契约见 details-context）：行点击只做行内披露，
  // 行尾「查看」图标才把记录推入抽屉（R-D2 / AC-A12）。
  const toggle = useCallback((lineNo: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(lineNo)) next.delete(lineNo);
      else next.add(lineNo);
      return next;
    });
  }, []);
  const inspect = useCallback(
    (entry: WireEntry) => {
      setDetails(<WireRowDetail entry={entry} variant="details" />, {
        reveal: true,
        title: `轨迹 · 第 ${entry.lineNo} 行`,
      });
    },
    [setDetails],
  );

  const filteredLineIdx = useMemo(() => {
    const m = new Map<number, number>();
    for (let i = 0; i < filtered.length; i += 1) {
      const e = filtered[i];
      if (e !== undefined) m.set(e.lineNo, i);
    }
    return m;
  }, [filtered]);

  const jumpToLine = useCallback(
    (lineNo: number) => {
      const idx = filteredLineIdx.get(lineNo);
      if (idx === undefined) return;
      virt.scrollToIndex(idx, { align: 'center' });
      setExpanded((prev) => (prev.has(lineNo) ? prev : new Set(prev).add(lineNo)));
    },
    [filteredLineIdx, virt],
  );

  const expandAll = () => {
    setExpanded(new Set(filtered.map((e) => e.lineNo)));
  };
  const collapseAll = () => {
    setExpanded(new Set());
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Toolbar（agent 作用域已在 InspectTab 的 ScopeSelector 统一控制） */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-1 px-3 py-2">
        <input
          type="text"
          placeholder="search records (substring)"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
          }}
          className="w-80 border border-border bg-surface-0 px-2 py-1 font-mono text-[12px] text-fg-0 placeholder:text-fg-3 focus:border-border-strong focus:outline-none"
        />
        <button
          type="button"
          className="flex items-center gap-1.5 rounded border border-border px-2 py-0.5 font-mono text-[11px] text-fg-2 hover:border-border-strong hover:text-fg-0"
          aria-pressed={actualDuration}
          title={actualDuration ? '等宽模式：每个 span 等宽排列' : '真实时长：span 宽度按实际耗时'}
          onClick={() => {
            setActualDuration((v) => !v);
            setTimelineRange(null);
          }}
        >
          <Clock className="size-3" aria-hidden />
          <span>{actualDuration ? '等宽' : '时长'}</span>
        </button>
        <div className="ml-auto flex items-center gap-3 font-mono text-[11px] text-fg-2">
          <span className="tabular">
            {filtered.length} / {entries.length} ev
          </span>
          {issues.length > 0 && issuesSeverity !== null ? (
            <button
              onClick={() => {
                setDrawerOpen(true);
              }}
              title={`${issues.length} issue${issues.length > 1 ? 's' : ''} — click to inspect`}
              className="flex items-center gap-1 border px-2 py-0.5"
              style={{
                borderColor: `var(--color-sev-${issuesSeverity})`,
                color: `var(--color-sev-${issuesSeverity})`,
                backgroundColor: `color-mix(in oklab, var(--color-sev-${issuesSeverity}) 10%, transparent)`,
              }}
            >
              <span>
                {issuesSeverity === 'error' ? '⚠' : issuesSeverity === 'warning' ? '⚠' : 'ℹ'}
              </span>
              <span className="tabular">{issues.length}</span>
            </button>
          ) : null}
          <button
            onClick={expandAll}
            className="border border-border px-2 py-0.5 text-fg-2 hover:border-border-strong hover:text-fg-0"
          >
            expand all
          </button>
          <button
            onClick={collapseAll}
            className="border border-border px-2 py-0.5 text-fg-2 hover:border-border-strong hover:text-fg-0"
          >
            collapse
          </button>
        </div>
      </div>

      {/* 轨迹时间轴总览（Input/Model/Tools 三轨，deepseek-harness 式）：
          拖选聚焦区间、点击跳转 wire 行、滚轮缩放。有搜索词时隐藏——
          时间轴的 domain 是完整 wire，与过滤后的列表不对齐。 */}
      {search.length === 0 && timelineTurns.length > 0 ? (
        <TrajectoryTimeline
          turns={timelineTurns}
          mode={timelineMode}
          range={timelineRange}
          selectedLineNo={timelineSelectedLineNo}
          searchMatchLineNos={searchMatchLineNos}
          onRangeChange={setTimelineRange}
          onRecordSelect={(lineNo) => {
            setTimelineRange(null);
            setTimelineSelectedLineNo(lineNo);
            jumpToLine(lineNo);
          }}
          onRecordFocus={(lineNo) => {
            jumpToLine(lineNo);
          }}
        />
      ) : null}

      {warnings.length > 0 ? (
        <div className="shrink-0 border-b border-[var(--color-sev-warning)] bg-[color-mix(in_oklab,var(--color-sev-warning)_8%,transparent)] px-3 py-1 font-mono text-[11px] text-[var(--color-sev-warning)]">
          {warnings.length} warning{warnings.length > 1 ? 's' : ''} · first: {warnings[0]}
        </div>
      ) : null}

      {isLoading ? (
        <div className="p-6 font-mono text-[12px] text-fg-3">wire 加载中…</div>
      ) : error ? (
        <div className="p-6 font-mono text-[12px] text-[var(--color-sev-error)]">
          {error.message}
        </div>
      ) : (
        <div ref={parentRef} className="min-h-0 flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 font-mono text-[12px] text-fg-3">
              no records match the current filter
            </div>
          ) : (
            <div
              style={{
                height: virt.getTotalSize(),
                position: 'relative',
              }}
            >
              {virt.getVirtualItems().map((vi) => {
                const e = filtered[vi.index];
                if (!e) return null;
                const pair = pairByLineNo.get(e.lineNo);
                const highlighted = pair !== undefined && hoveredPairId === pair.toolCallId;
                return (
                  <div
                    key={vi.key}
                    data-index={vi.index}
                    ref={virt.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    <WireRow
                      entry={e}
                      expanded={expanded.has(e.lineNo)}
                      onToggle={toggle}
                      onInspect={inspect}
                      onJumpTo={jumpToLine}
                      pair={pair}
                      highlighted={highlighted}
                      onHoverPair={onHoverPair}
                      timelineDimmed={focusLineNos !== null && !focusLineNos.has(e.lineNo)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {drawerOpen ? (
        <IssuesDrawer
          issues={issues}
          onClose={() => {
            setDrawerOpen(false);
          }}
          onJumpTo={jumpToLine}
          isLineVisible={(lineNo) => filteredLineIdx.has(lineNo)}
        />
      ) : null}
    </div>
  );
}
