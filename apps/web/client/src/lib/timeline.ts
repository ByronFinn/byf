/**
 * 轨迹时间轴（Chrome-Network 式总览）的数据层，移植自 deepseek-harness
 * `ui-trajectory` 的 `layout.ts` + `timeline.ts`（MIT），交互与视觉同步移植到
 * `TrajectoryTimeline.tsx`。
 *
 * 两级模型：
 * 1. `deriveTimelineTurns` —— 把 wire 记录折叠为 turn → cells 的轨迹账本
 *    （对应 deepseek 的 conversation fold）：`turn.prompt/steer` → user、
 *    `config/permission` → system、`context.append_message` → context、
 *    `step.begin…step.end` → message（含 TTFT/解码时长）、`tool.call…result`
 *    → tool、`full_compaction` → compacted。
 * 2. `deriveTimeline` —— 把账本投影到水平时间轴（sequence 等宽 / duration
 *    压缩空闲的真实时长 / time 等宽真实时刻 / actual 完整墙钟），三条轨道：
 *    Input(lane 0) / Model(lane 1) / Tools(lane 2)。测试见 `test/timeline.test.ts`。
 */
import type { WireEntry } from '#/types';

/** 轨迹记录的封闭 kind 集（对齐 deepseek-harness TrajectoryCellKind）。 */
export type TimelineCellKind = 'system' | 'user' | 'context' | 'compacted' | 'message' | 'tool';

/** 模型步骤的时延事实（TTFT / 解码），来自 step.end 的 LLM 时延字段。 */
export interface AssistantMetricDetail {
  readonly timingRecorded: boolean;
  readonly stepStartTime: number | null;
  readonly firstTokenTime: number | null;
  readonly completedTime: number | null;
}

/** 折叠后的单条轨迹记录（一行账本 / 时间轴上一个 span）。 */
export interface TimelineCell {
  /** 1-based 记录序（账本顺序）。 */
  readonly index: number;
  readonly kind: TimelineCellKind;
  /** 摘要标签（工具名 / 配置摘要）。 */
  readonly text: string;
  /** 来源 wire 行号（跳转定位）。 */
  readonly lineNo: number;
  readonly isError: boolean;
  /** 自身时长（秒）；未知为 null（进行中）。 */
  readonly timeSeconds: number | null;
  /** 实际开始的 Unix epoch ms；未知为 null。 */
  readonly startedAt: number | null;
  /** user 记录是否开启新 turn。 */
  readonly opensTurn?: boolean;
  readonly assistantMetrics?: AssistantMetricDetail;
}

/** 一个 turn 的 cells（turn.prompt/steer 开启）。 */
export interface TimelineTurn {
  readonly turn: number | null;
  readonly cells: readonly TimelineCell[];
}

/** 时间轴的水平投影模式。 */
export type TimelineMode = 'sequence' | 'duration' | 'time' | 'actual';

/** 当前投影域上的闭区间选择。 */
export interface TimelineRange {
  readonly start: number;
  readonly end: number;
}

/** 投影到时间轴后的单个 span。 */
export interface TimelineSpan extends TimelineRange {
  readonly index: number;
  readonly lineNo: number;
  readonly isError: boolean;
  readonly kind: TimelineCellKind;
  readonly label: string;
  /** 0 = Input / 1 = Model / 2 = Tools。 */
  readonly lane: number;
}

/** turn 边界（竖线）。 */
export interface TimelineTurnBoundary {
  readonly turn: number;
  readonly time: number;
}

/** 全域时间轴模型。 */
export interface TimelineModel extends TimelineRange {
  readonly spans: readonly TimelineSpan[];
  readonly turnBoundaries: readonly TimelineTurnBoundary[];
}

/**
 * 格式化时间轴时长为整毫秒标签（千分位）。
 */
export function formatTimelineOffset(milliseconds: number): string {
  const integer = String(Math.round(milliseconds));
  return `${integer.replaceAll(/\B(?=(\d{3})+(?!\d))/g, ',')} ms`;
}

function finiteTime(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function laneFor(kind: TimelineCellKind): number {
  if (kind === 'tool') return 2;
  if (kind === 'message' || kind === 'compacted') return 1;
  return 0;
}

/** 进行中的折叠状态（开着的 step / tool / compaction 待闭合）。 */
interface OpenCell {
  cell: TimelineCell;
}

/**
 * 把 wire 记录折叠为轨迹账本：turns → cells。
 * @param entries 当前作用域（agent）的 wire 记录（按行序）。
 */
export function deriveTimelineTurns(entries: readonly WireEntry[]): readonly TimelineTurn[] {
  const cells: TimelineCell[] = [];
  // 账本按「turn 首个 cell」切 turn：与 wire 的 turn.prompt/steer 锚点对齐。
  const turnFirstCells: number[] = [];

  const push = (cell: Omit<TimelineCell, 'index'>): TimelineCell => {
    const full = { ...cell, index: cells.length + 1 };
    cells.push(full);
    return full;
  };

  const openSteps = new Map<string, OpenCell>(); // stepUuid → message
  const openTools = new Map<string, OpenCell>(); // toolCallId → tool
  let openCompaction: OpenCell | null = null;

  const closeCell = (
    open: OpenCell,
    endedAt: number | null,
    patch?: Partial<TimelineCell>,
  ): void => {
    const start = open.cell.startedAt;
    const timeSeconds =
      start !== null && endedAt !== null && endedAt >= start
        ? (endedAt - start) / 1000
        : open.cell.timeSeconds;
    const idx = cells.indexOf(open.cell);
    if (idx >= 0) {
      // 重建对象会令 open.cell 引用失效，后续 indexOf 不再命中；补丁并入同一
      // 次重建，调用方不要再用 open.cell 续查。
      cells[idx] = { ...open.cell, timeSeconds, ...patch };
    }
  };

  for (const entry of entries) {
    const r = entry.data;
    const time = finiteTime(r.time);

    if (r.type === 'turn.prompt' || r.type === 'turn.steer') {
      turnFirstCells.push(cells.length + 1);
      push({
        kind: 'user',
        text: r.type === 'turn.prompt' ? '用户输入' : '转向',
        lineNo: entry.lineNo,
        isError: false,
        timeSeconds: 0,
        startedAt: time,
        opensTurn: true,
      });
      continue;
    }
    if (r.type === 'config.update' || r.type === 'permission.set_mode') {
      push({
        kind: 'system',
        text: r.type === 'config.update' ? '配置更新' : '权限变更',
        lineNo: entry.lineNo,
        isError: false,
        timeSeconds: 0,
        startedAt: time,
      });
      continue;
    }
    if (r.type === 'context.append_message') {
      push({
        kind: 'context',
        text: '上下文注入',
        lineNo: entry.lineNo,
        isError: false,
        timeSeconds: 0,
        startedAt: time,
      });
      continue;
    }
    if (r.type === 'full_compaction.begin') {
      openCompaction = {
        cell: push({
          kind: 'compacted',
          text: '上下文压缩',
          lineNo: entry.lineNo,
          isError: false,
          timeSeconds: null,
          startedAt: time,
        }),
      };
      continue;
    }
    if (r.type === 'full_compaction.complete' || r.type === 'full_compaction.cancel') {
      if (openCompaction !== null) {
        closeCell(
          openCompaction,
          time,
          r.type === 'full_compaction.cancel' ? { isError: true } : {},
        );
        openCompaction = null;
      } else {
        push({
          kind: 'compacted',
          text: '上下文压缩',
          lineNo: entry.lineNo,
          isError: r.type === 'full_compaction.cancel',
          timeSeconds: null,
          startedAt: time,
        });
      }
      continue;
    }
    if (r.type !== 'context.append_loop_event') continue;
    const ev = r.event;

    if (ev.type === 'step.begin') {
      openSteps.set(ev.uuid, {
        cell: push({
          kind: 'message',
          text: `Step ${ev.step}`,
          lineNo: entry.lineNo,
          isError: false,
          timeSeconds: null,
          startedAt: time,
        }),
      });
    } else if (ev.type === 'step.end') {
      const open = openSteps.get(ev.uuid);
      openSteps.delete(ev.uuid);
      if (open === undefined) continue;
      const stepStart = open.cell.startedAt;
      const streamMs =
        typeof ev.llmStreamDurationMs === 'number' && Number.isFinite(ev.llmStreamDurationMs)
          ? ev.llmStreamDurationMs
          : stepStart !== null && time !== null
            ? time - stepStart
            : null;
      const ttftMs =
        typeof ev.llmFirstTokenLatencyMs === 'number' && Number.isFinite(ev.llmFirstTokenLatencyMs)
          ? ev.llmFirstTokenLatencyMs
          : null;
      const completed =
        time ?? (stepStart !== null && streamMs !== null ? stepStart + streamMs : null);
      closeCell(open, completed, {
        assistantMetrics: {
          timingRecorded: ttftMs !== null && streamMs !== null && stepStart !== null,
          stepStartTime: stepStart,
          firstTokenTime: ttftMs !== null && stepStart !== null ? stepStart + ttftMs : null,
          completedTime: completed,
        },
      });
    } else if (ev.type === 'tool.call') {
      openTools.set(ev.toolCallId, {
        cell: push({
          kind: 'tool',
          text: ev.name,
          lineNo: entry.lineNo,
          isError: false,
          timeSeconds: null,
          startedAt: finiteTime(ev.startedAt) ?? time,
        }),
      });
    } else if (ev.type === 'tool.result') {
      const open = openTools.get(ev.toolCallId);
      openTools.delete(ev.toolCallId);
      if (open === undefined) continue; // 孤儿 result：无轨迹 span（issues 面板覆盖）
      closeCell(
        open,
        finiteTime(ev.endedAt) ?? time,
        ev.result.isError === true ? { isError: true } : {},
      );
    }
  }

  if (cells.length === 0) return [];
  // turn 切分：turnFirstCells 记录各 turn 首个 cell 的 1-based index。
  const turns: TimelineTurn[] = [];
  let cursor = 0;
  for (let i = 0; i < turnFirstCells.length; i += 1) {
    const from = turnFirstCells[i]! - 1;
    const to = (turnFirstCells[i + 1] ?? cells.length + 1) - 1;
    turns.push({ turn: i + 1, cells: cells.slice(from, to) });
    cursor = to;
  }
  if (cursor < cells.length) {
    // 无 prompt 锚点的尾部 cells（如子代理作用域）：并入一个 null turn。
    turns.push({ turn: null, cells: cells.slice(cursor) });
  }
  return turns;
}

/**
 * 把账本投影为时间轴模型。
 * @param turns 折叠后的轨迹账本。
 * @param mode sequence（等宽序号）/ duration（真实时长+压缩空闲）/ time（等宽
 *        真实时刻）/ actual（完整墙钟）。
 * @returns 模型；无可投影记录时 null。
 */
export function deriveTimeline(
  turns: readonly TimelineTurn[],
  mode: TimelineMode = 'sequence',
): TimelineModel | null {
  if (mode !== 'sequence') {
    return deriveTimedTimeline(
      turns,
      mode === 'duration' || mode === 'actual',
      mode === 'duration',
    );
  }
  const spans: TimelineSpan[] = [];
  const turnBoundaries: TimelineTurnBoundary[] = [];

  for (const turn of turns) {
    if (turn.cells.length === 0) continue;
    if (turn.turn !== null) {
      turnBoundaries.push({ turn: turn.turn, time: spans.length });
    }
    for (const [offset, cell] of turn.cells.entries()) {
      spans.push({
        start: spans.length + offset,
        end: spans.length + offset + 1,
        index: cell.index,
        lineNo: cell.lineNo,
        isError: cell.isError,
        kind: cell.kind,
        label: cell.text,
        lane: laneFor(cell.kind),
      });
    }
  }

  if (spans.length === 0) return null;
  return { start: 0, end: spans.length, spans, turnBoundaries };
}

function cellRange(cell: TimelineCell): TimelineRange | null {
  if (cell.startedAt === null) return null;
  const durationMs =
    cell.timeSeconds !== null && Number.isFinite(cell.timeSeconds)
      ? Math.max(0, cell.timeSeconds * 1000)
      : 0;
  return { start: cell.startedAt, end: cell.startedAt + durationMs };
}

function deriveTimedTimeline(
  turns: readonly TimelineTurn[],
  actualDuration: boolean,
  compressIdle: boolean,
): TimelineModel | null {
  const timedTurns = turns.flatMap((turn) => {
    const rawSpans = turn.cells.flatMap((cell): TimelineSpan[] => {
      const range = cellRange(cell);
      return range === null
        ? []
        : [
            {
              ...range,
              index: cell.index,
              lineNo: cell.lineNo,
              isError: cell.isError,
              kind: cell.kind,
              label: cell.text,
              lane: laneFor(cell.kind),
            },
          ];
    });
    return rawSpans.length === 0 ? [] : [{ turn: turn.turn, rawSpans }];
  });
  const rawSpans = timedTurns.flatMap((turn) => turn.rawSpans);
  if (rawSpans.length === 0) return null;

  const removedIdleBySpan = new Map<TimelineSpan, number>();
  let removedIdle = 0;
  let coveredUntil: number | null = null;
  for (const span of [...rawSpans].toSorted(
    (left, right) => left.start - right.start || left.end - right.end,
  )) {
    if (compressIdle && coveredUntil !== null && span.start > coveredUntil) {
      removedIdle += span.start - coveredUntil;
    }
    removedIdleBySpan.set(span, removedIdle);
    coveredUntil = coveredUntil === null ? span.end : Math.max(coveredUntil, span.end);
  }

  const spans: TimelineSpan[] = [];
  const turnBoundaries: TimelineTurnBoundary[] = [];
  for (const turn of timedTurns) {
    const projected = turn.rawSpans.map((span): TimelineSpan => {
      const offset = removedIdleBySpan.get(span) ?? 0;
      return {
        ...span,
        start: span.start - offset,
        end: (actualDuration ? span.end : span.start) - offset,
      };
    });
    spans.push(...projected);
    if (turn.turn !== null) {
      turnBoundaries.push({
        turn: turn.turn,
        time: Math.min(...projected.map((span) => span.start)),
      });
    }
  }

  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
    spans,
    turnBoundaries,
  };
}

/**
 * 选中区间内活跃的 wire 行号集合（账本聚焦）。
 */
export function timelineFocusLineNos(
  turns: readonly TimelineTurn[],
  range: TimelineRange,
  mode: TimelineMode = 'sequence',
): ReadonlySet<number> {
  const model = deriveTimeline(turns, mode);
  return new Set(
    model?.spans
      .filter((span) => span.start <= range.end && span.end >= range.start)
      .map((span) => span.lineNo),
  );
}
