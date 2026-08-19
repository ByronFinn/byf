import { describe, expect, test } from 'vitest';

import { deriveTimeline, deriveTimelineTurns, timelineFocusLineNos } from '../src/lib/timeline';
import type { AgentRecord, WireEntry } from '../src/types';

function rec(data: AgentRecord, extra?: Record<string, unknown>): WireEntry {
  return { lineNo: 0, data: { ...data, ...extra } as AgentRecord, raw: null };
}

function withLineNo(entries: readonly WireEntry[], start = 1): readonly WireEntry[] {
  return entries.map((e, i) => ({ ...e, lineNo: start + i }));
}

describe('deriveTimelineTurns', () => {
  test('fold: user turn + model step + tool call/result', () => {
    const entries = withLineNo([
      rec({ type: 'turn.prompt', input: [{ type: 'text', text: 'hi' }], origin: 'user' }),
      rec({
        type: 'context.append_loop_event',
        event: { type: 'step.begin', uuid: 'u1', turnId: 't1', step: 1 },
      }),
      rec({
        type: 'context.append_loop_event',
        event: {
          type: 'tool.call',
          uuid: 'u2',
          turnId: 't1',
          step: 1,
          stepUuid: 'u1',
          toolCallId: 'c1',
          name: 'Bash',
          args: {},
        },
      }),
      rec({
        type: 'context.append_loop_event',
        event: {
          type: 'tool.result',
          parentUuid: 'u2',
          toolCallId: 'c1',
          result: { ok: true, data: '' },
        },
      }),
    ]);
    const turns = deriveTimelineTurns(entries);
    expect(turns).toHaveLength(1);
    const cells = turns[0].cells;
    expect(cells.map((c) => c.kind)).toEqual(['user', 'message', 'tool']);
    expect(cells[0]).toMatchObject({ lineNo: 1, opensTurn: true });
    expect(cells[1]).toMatchObject({ kind: 'message', text: 'Step 1', lineNo: 2 });
    expect(cells[2]).toMatchObject({ kind: 'tool', text: 'Bash', lineNo: 3, isError: false });
  });

  test('tool.result with isError marks the tool span error', () => {
    const entries = withLineNo([
      rec({
        type: 'context.append_loop_event',
        event: {
          type: 'tool.call',
          uuid: 'u2',
          turnId: 't1',
          step: 1,
          stepUuid: 'u1',
          toolCallId: 'c1',
          name: 'Read',
          args: {},
        },
      }),
      rec({
        type: 'context.append_loop_event',
        event: {
          type: 'tool.result',
          parentUuid: 'u2',
          toolCallId: 'c1',
          result: { ok: false, isError: true, output: '', message: 'boom' },
        },
      }),
    ]);
    const turns = deriveTimelineTurns(entries);
    expect(turns[0].cells[0]).toMatchObject({ kind: 'tool', isError: true });
  });

  test('orphan tool.result creates no cell', () => {
    const entries = withLineNo([
      rec({
        type: 'context.append_loop_event',
        event: {
          type: 'tool.result',
          parentUuid: 'u0',
          toolCallId: 'ghost',
          result: { ok: true, data: '' },
        },
      }),
    ]);
    expect(deriveTimelineTurns(entries)).toEqual([]);
  });

  test('steer starts a new turn (both turns split by user cells)', () => {
    const entries = withLineNo([
      rec({ type: 'turn.prompt', input: [{ type: 'text', text: 'hi' }], origin: 'user' }),
      rec({
        type: 'context.append_loop_event',
        event: { type: 'step.begin', uuid: 'u1', turnId: 't1', step: 1 },
      }),
      rec({ type: 'turn.steer', input: [{ type: 'text', text: 'go on' }], origin: 'agent' }),
      rec({
        type: 'context.append_loop_event',
        event: { type: 'step.begin', uuid: 'u2', turnId: 't2', step: 1 },
      }),
    ]);
    const turns = deriveTimelineTurns(entries);
    expect(turns).toHaveLength(2);
    expect(turns[0].turn).toBe(1);
    expect(turns[1].turn).toBe(2);
    expect(turns[1].cells.map((c) => c.kind)).toEqual(['user', 'message']);
  });

  test('cells without a prompt anchor land in a null turn', () => {
    const entries = withLineNo([
      rec({
        type: 'context.append_loop_event',
        event: { type: 'step.begin', uuid: 'u1', turnId: 't1', step: 1 },
      }),
    ]);
    const turns = deriveTimelineTurns(entries);
    expect(turns).toHaveLength(1);
    expect(turns[0].turn).toBeNull();
    expect(turns[0].cells).toHaveLength(1);
  });

  test('compaction begin/complete folds into one compacted cell with duration', () => {
    const entries = withLineNo([
      rec({ type: 'turn.prompt', input: [{ type: 'text', text: 'hi' }], origin: 'user', time: 0 }),
      rec({ type: 'full_compaction.begin', createdAt: 1000, time: 1000 }),
      rec({
        type: 'full_compaction.complete',
        summary: [],
        removedMessages: 3,
        createdAt: 4000,
        time: 4000,
      }),
    ]);
    const turns = deriveTimelineTurns(entries);
    const compacted = turns[0].cells.find((c) => c.kind === 'compacted');
    expect(compacted).toMatchObject({ kind: 'compacted', startedAt: 1000 });
    expect(compacted!.timeSeconds).toBe(3);
  });

  test('system records fold into system cells on lane 0', () => {
    const entries = withLineNo([
      rec({ type: 'config.update', patch: {} }),
      rec({ type: 'permission.set_mode', mode: 'yolo' }),
    ]);
    const turns = deriveTimelineTurns(entries);
    expect(turns[0].cells.map((c) => c.kind)).toEqual(['system', 'system']);
  });
});

describe('deriveTimeline', () => {
  test('sequence mode: three lanes, turn boundary at first user cell', () => {
    const turns = deriveTimelineTurns(
      withLineNo([
        rec({ type: 'turn.prompt', input: [{ type: 'text', text: 'hi' }], origin: 'user' }),
        rec({
          type: 'context.append_loop_event',
          event: { type: 'step.begin', uuid: 'u1', turnId: 't1', step: 1 },
        }),
        rec({
          type: 'context.append_loop_event',
          event: {
            type: 'tool.call',
            uuid: 'u2',
            turnId: 't1',
            step: 1,
            stepUuid: 'u1',
            toolCallId: 'c1',
            name: 'Bash',
            args: {},
          },
        }),
      ]),
    );
    const model = deriveTimeline(turns, 'sequence');
    expect(model).not.toBeNull();
    expect(model!.spans.map((s) => s.lane)).toEqual([0, 1, 2]);
    expect(model!.spans.map((s) => s.lineNo)).toEqual([1, 2, 3]);
    expect(model!.turnBoundaries).toEqual([{ turn: 1, time: 0 }]);
  });

  test('sequence mode: null turn contributes no boundary', () => {
    const turns = deriveTimelineTurns(
      withLineNo([
        rec({
          type: 'context.append_loop_event',
          event: {
            type: 'tool.call',
            uuid: 'u2',
            turnId: 't1',
            step: 1,
            stepUuid: 'u1',
            toolCallId: 'c1',
            name: 'Bash',
            args: {},
          },
        }),
      ]),
    );
    const model = deriveTimeline(turns, 'sequence');
    expect(model!.turnBoundaries).toEqual([]);
  });

  test('empty turns yield null', () => {
    expect(deriveTimeline([], 'sequence')).toBeNull();
    expect(deriveTimeline(deriveTimelineTurns([]), 'duration')).toBeNull();
  });

  test('duration mode maps startedAt+timeSeconds to a compressed domain', () => {
    const turns = deriveTimelineTurns(
      withLineNo([
        rec({
          type: 'turn.prompt',
          input: [{ type: 'text', text: 'hi' }],
          origin: 'user',
          time: 0,
        }),
        rec(
          {
            type: 'context.append_loop_event',
            event: { type: 'step.begin', uuid: 'u1', turnId: 't1', step: 1 },
          },
          { time: 100 },
        ),
        rec(
          {
            type: 'context.append_loop_event',
            event: {
              type: 'step.end',
              uuid: 'u1',
              turnId: 't1',
              step: 1,
              llmFirstTokenLatencyMs: 100,
              llmStreamDurationMs: 900,
            },
          },
          { time: 1000 },
        ),
      ]),
    );
    const model = deriveTimeline(turns, 'duration');
    expect(model).not.toBeNull();
    // duration 压缩空闲：user[0,0) 之后紧跟 message，message 起点被压缩到 0。
    const spans = model!.spans.toSorted((a, b) => a.start - b.start);
    expect(spans[0]).toMatchObject({ lane: 0, start: 0, end: 0 });
    expect(spans[1]).toMatchObject({ lane: 1, start: 0, end: 900 });
  });
});

describe('timelineFocusLineNos', () => {
  test('focus interval returns intersecting wire line numbers', () => {
    const turns = deriveTimelineTurns(
      withLineNo([
        rec({ type: 'turn.prompt', input: [{ type: 'text', text: 'hi' }], origin: 'user' }),
        rec({
          type: 'context.append_loop_event',
          event: { type: 'step.begin', uuid: 'u1', turnId: 't1', step: 1 },
        }),
        rec({
          type: 'context.append_loop_event',
          event: {
            type: 'tool.call',
            uuid: 'u2',
            turnId: 't1',
            step: 1,
            stepUuid: 'u1',
            toolCallId: 'c1',
            name: 'Bash',
            args: {},
          },
        }),
      ]),
    );
    const focus = timelineFocusLineNos(turns, { start: 1, end: 2 }, 'sequence');
    expect(focus.has(1)).toBe(true);
    expect(focus.has(2)).toBe(true);
    expect(focus.has(3)).toBe(false);
  });
});
