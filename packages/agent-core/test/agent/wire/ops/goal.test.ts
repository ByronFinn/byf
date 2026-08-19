import { describe, expect, it } from 'vitest';

import type { GoalSnapshot } from '../../../../src/agent/goal/types';
import {
  OP_REGISTRY,
  WireService,
  createWireMetadataRecord,
  opToWireRecord,
  type WirePersistence,
  type WireRecord,
} from '../../../../src/agent/wire';
// import 触发 goal Op 注册（import = register）。
import {
  goalClear,
  goalCreate,
  goalModel,
  goalUpdate,
  goalUpdated,
} from '../../../../src/agent/wire/ops/goal';

class InMemoryWirePersistence implements WirePersistence {
  readonly records: WireRecord[] = [];
  constructor(records: readonly WireRecord[] = []) {
    this.records.push(...records);
  }
  async *read(): AsyncIterable<WireRecord> {
    for (const record of this.records) yield record;
  }
  append(record: WireRecord): void {
    this.records.push(record);
  }
  rewrite(records: readonly WireRecord[]): void {
    this.records.splice(0, this.records.length, ...records);
  }
  async flush(): Promise<void> {}
  async close(): Promise<void> {}
}

const ACTIVE: GoalSnapshot = {
  objective: 'ship PRD-0027',
  status: 'active',
  budget: { turnBudget: 5 },
  usage: { turns: 0, tokens: 0, wallClockMs: 0 },
  createdAt: 1000,
};

describe('goal reducer — pure apply mirrors restoreRecord (范本)', () => {
  it('registers goal ops into OP_REGISTRY with persisted persistence', () => {
    expect(OP_REGISTRY.has('goal.create')).toBe(true);
    expect(OP_REGISTRY.has('goal.update')).toBe(true);
    expect(OP_REGISTRY.has('goal.clear')).toBe(true);
    // 默认 persisted（无 persist:false）。
    expect(OP_REGISTRY.get('goal.create')?.persist).toBeUndefined();
  });

  it('goal.create builds the initial active snapshot (matches restoreRecord:294-303)', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(
      goalCreate({ objective: ACTIVE.objective, budget: ACTIVE.budget, createdAt: 1000 }),
    );

    expect(wire.getModel(goalModel).snapshot).toEqual({
      objective: 'ship PRD-0027',
      status: 'active',
      budget: { turnBudget: 5 },
      usage: { turns: 0, tokens: 0, wallClockMs: 0 },
      createdAt: 1000,
    });
  });

  it('goal.create with absent budget defaults to {} (matches record.budget ?? {})', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(goalCreate({ objective: 'no budget', createdAt: 1 }));

    expect(wire.getModel(goalModel).snapshot?.budget).toEqual({});
  });

  it('goal.update overwrites the snapshot; goal.clear nulls it (matches restoreRecord:305-312)', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(goalCreate({ objective: 'x', createdAt: 1 }));

    const updated: GoalSnapshot = {
      objective: 'x',
      status: 'paused',
      pausedReason: 'Paused after agent resume',
      budget: {},
      usage: { turns: 3, tokens: 100, wallClockMs: 5000 },
      createdAt: 1,
    };
    wire.dispatch(goalUpdate({ snapshot: updated }));
    expect(wire.getModel(goalModel).snapshot).toEqual(updated);

    wire.dispatch(goalClear({}));
    expect(wire.getModel(goalModel).snapshot).toBeNull();
  });
});

describe('goal reducer — restore round-trip (AC1 precursor)', () => {
  it('replays persisted goal records into the same snapshot via silent restore', async () => {
    // 先用 live dispatch 产出 journal（含 metadata 信封）。
    const livePersistence = new InMemoryWirePersistence();
    const live = new WireService({ persistence: livePersistence });
    live.dispatch(
      goalCreate({ objective: ACTIVE.objective, budget: ACTIVE.budget, createdAt: 1000 }),
    );
    live.dispatch(
      goalUpdate({
        snapshot: {
          ...ACTIVE,
          status: 'paused',
          pausedReason: 'Paused after agent resume',
          usage: { turns: 2, tokens: 50, wallClockMs: 3000 },
        },
      }),
    );
    const journal = livePersistence.records.slice();

    // 全新 service 从 journal restore —— silent 重放应重建相同 snapshot。
    const replayed = new WireService({ persistence: new InMemoryWirePersistence(journal) });
    await replayed.restore();

    expect(replayed.getModel(goalModel).snapshot).toEqual({
      ...ACTIVE,
      status: 'paused',
      pausedReason: 'Paused after agent resume',
      usage: { turns: 2, tokens: 50, wallClockMs: 3000 },
    });
  });

  it('opToWireRecord(goal) is byte-compatible with the existing logRecord shape', () => {
    const op = goalCreate({ objective: 'x', budget: { turnBudget: 2 }, createdAt: 7 });
    const record = opToWireRecord(op, 4242);
    // 旧路径：{ type, ...payload, time }（records/index.ts:39-40）。
    expect(JSON.stringify(record)).toBe(
      JSON.stringify({
        type: 'goal.create',
        objective: 'x',
        budget: { turnBudget: 2 },
        createdAt: 7,
        time: 4242,
      }),
    );
  });

  it('skips a goal record whose payload fails schema (replay tolerance)', async () => {
    const skipped: unknown[] = [];
    const replayed = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'goal.create', objective: 42, createdAt: 1, time: 1 },
        { type: 'goal.create', objective: 'ok', createdAt: 2, time: 2 },
      ]),
      onSkippedRecord: (error) => skipped.push(error),
    });

    await replayed.restore();

    expect(replayed.getModel(goalModel).snapshot?.objective).toBe('ok');
    expect(skipped).toHaveLength(1);
  });
});

describe('goal.updated — transient 事件载体（PRD-0027 Phase 6 待办决议）', () => {
  it('registers as a transient op (persist: false)', () => {
    expect(OP_REGISTRY.has('goal.updated')).toBe(true);
    expect(OP_REGISTRY.get('goal.updated')?.persist).toBe(false);
  });

  it('dispatch derives the goal.updated event from payload without persisting or touching state', () => {
    const events: unknown[] = [];
    const persistence = new InMemoryWirePersistence();
    const wire = new WireService({
      persistence,
      publishEvent: (event) => events.push(event),
    });

    wire.dispatch(goalCreate({ objective: 'x', createdAt: 1 }));
    // live snapshot：complete 瞬态 overlay（status='complete'）+ 实时 wallClockMs。
    const live: GoalSnapshot = {
      ...ACTIVE,
      status: 'complete',
      usage: { ...ACTIVE.usage, wallClockMs: 15000 },
    };
    wire.dispatch(
      goalUpdated({ snapshot: live, change: { kind: 'completion', reason: 'shipped' } }),
    );

    expect(events).toEqual([
      { type: 'goal.updated', snapshot: live, change: { kind: 'completion', reason: 'shipped' } },
    ]);
    // persist:false —— journal 无车辆记录。
    expect(persistence.records.map((r) => r.type)).not.toContain('goal.updated');
    // apply identity —— model snapshot 仍是 goal.create 建的 active。
    expect(wire.getModel(goalModel).snapshot?.status).toBe('active');
  });

  it('restore of a goal.updated record is a silent no-op (replay tolerance)', async () => {
    const events: unknown[] = [];
    const skipped: unknown[] = [];
    const replayed = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'goal.updated', snapshot: { ...ACTIVE, status: 'complete' }, time: 1 },
      ]),
      publishEvent: (event) => events.push(event),
      onSkippedRecord: (error) => skipped.push(error),
    });

    await replayed.restore();

    expect(events).toEqual([]); // silent：不派发事件。
    expect(skipped).toHaveLength(0); // schema 接受，不算坏记录。
    expect(replayed.getModel(goalModel).snapshot).toBeNull(); // apply no-op。
  });

  it('rejects a malformed change payload on restore (schema is the fact source)', async () => {
    const skipped: unknown[] = [];
    const replayed = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'goal.updated', snapshot: { ...ACTIVE }, change: { kind: 'nope' }, time: 1 },
      ]),
      onSkippedRecord: (error) => skipped.push(error),
    });

    await replayed.restore();

    expect(skipped).toHaveLength(1);
  });
});
