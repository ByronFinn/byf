import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  AGENT_WIRE_PROTOCOL_VERSION,
  type DeepReadonly,
  type ModelDef,
  DuplicateOpError,
  WireError,
  OP_REGISTRY,
  OrderedHookSlot,
  type WirePersistence,
  type WireRecord,
  WireService,
  createWireMetadataRecord,
  defineModel,
  isWireMetadataRecord,
  isWireRecord,
  opToWireRecord,
  wireRecordToPayload,
} from '../../../src/agent/wire';

// —— 测试用 in-memory WirePersistence ——

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

// —— 测试用合成 model / op（全局注册：import = register） ——

const trace: string[] = [];

const CounterModel = defineModel('test.counter', () => ({ value: 0 }));
const OtherModel = defineModel('test.other', () => ({ value: 0 }));
const TransientModel = defineModel('test.transient', () => ({ marked: false }));

declare module '../../../src/agent/wire/types' {
  interface PersistedOpMap {
    'test.counter.add': typeof counterAdd;
    'test.counter.mutate': typeof mutateCounter;
    'test.other.set': typeof otherSet;
  }
  interface TransientOpMap {
    'test.transient.mark': typeof transientMark;
  }
}

const counterAdd = CounterModel.defineOp('test.counter.add', {
  schema: z.object({ by: z.number() }),
  apply: (s, p) => {
    trace.push('apply.counter');
    return { value: s.value + p.by };
  },
  toEvent: (_payload, state) => ({ type: 'test.counter_changed', value: state.value }),
});

const mutateCounter = CounterModel.defineOp('test.counter.mutate', {
  schema: z.object({}),
  apply: (s) => {
    (s as { value: number }).value = 123;
    return s;
  },
});

const otherSet = OtherModel.defineOp('test.other.set', {
  schema: z.object({ value: z.number() }),
  apply: (_s, p) => {
    trace.push('apply.other');
    return { value: p.value };
  },
});

const transientMark = TransientModel.defineOp('test.transient.mark', {
  schema: z.object({ hit: z.boolean() }),
  apply: (s, p) => ({ marked: s.marked || p.hit }),
  persist: false,
  toEvent: (_payload, state) => ({ type: 'test.transient_marked', marked: state.marked }),
});

// cross-reducer：CounterModel 的 add 也累加进 DerivedModel（演示 cross-reducer 能力）
const DerivedModel = defineModel('test.derived', () => ({ total: 0 }), {
  reducers: {
    'test.counter.add': (s, p: { by: number }) => ({ total: s.total + p.by }),
  },
});

function freshService(opts: { records?: WireRecord[]; events?: unknown[] } = {}): {
  wire: WireService;
  persistence: InMemoryWirePersistence;
} {
  const persistence = new InMemoryWirePersistence(opts.records ?? []);
  const wire = new WireService({
    persistence,
    publishEvent: (event) => opts.events?.push(event),
  });
  return { wire, persistence };
}

describe('WireService — dispatch / model state', () => {
  it('dispatches a single op into model state and the journal', () => {
    const { wire, persistence } = freshService();
    wire.dispatch(counterAdd({ by: 3 }));

    expect(wire.getModel(CounterModel)).toEqual({ value: 3 });
    // 首条 record 前自动补 metadata 信封（复刻 records/index.ts logRecord）。
    expect(persistence.records).toHaveLength(2);
    expect(persistence.records[0]).toMatchObject({
      type: 'metadata',
      protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    });
    expect(persistence.records[1]).toEqual({
      type: 'test.counter.add',
      by: 3,
      time: expect.any(Number),
    });
  });

  it('applies a multi-op group across its models in order', () => {
    trace.length = 0;
    const { wire } = freshService();
    wire.dispatch(counterAdd({ by: 1 }), otherSet({ value: 42 }));

    expect(trace).toEqual(['apply.counter', 'apply.other']);
    expect(wire.getModel(CounterModel)).toEqual({ value: 1 });
    expect(wire.getModel(OtherModel)).toEqual({ value: 42 });
  });

  it('keeps persist order = dispatch order in the journal', () => {
    const { wire, persistence } = freshService();
    wire.dispatch(counterAdd({ by: 1 }), otherSet({ value: 2 }), counterAdd({ by: 3 }));

    // metadata + 3 records, in dispatch order.
    expect(persistence.records.map((r) => r.type)).toEqual([
      'metadata',
      'test.counter.add',
      'test.other.set',
      'test.counter.add',
    ]);
  });
});

describe('WireService — cross-reducer', () => {
  it('runs cross-reducers on live dispatch (derived state folds automatically)', () => {
    const { wire } = freshService();
    wire.dispatch(counterAdd({ by: 2 }), counterAdd({ by: 3 }));

    expect(wire.getModel(CounterModel)).toEqual({ value: 5 });
    expect(wire.getModel(DerivedModel)).toEqual({ total: 5 });
  });
});

describe('WireService — freeze / purity (AC3)', () => {
  it('freezes state: getModel is frozen and mutation throws in strict mode', () => {
    const { wire } = freshService();
    wire.dispatch(counterAdd({ by: 2 }));
    const state = wire.getModel(CounterModel);

    expect(Object.isFrozen(state)).toBe(true);
    expect(() => {
      (state as { value: number }).value = 99;
    }).toThrow(TypeError);
    expect(wire.getModel(CounterModel)).toEqual({ value: 2 });
  });

  it('throws when an apply mutates its already-frozen incoming state', () => {
    const { wire } = freshService();
    wire.dispatch(counterAdd({ by: 1 }));

    expect(() => {
      wire.dispatch(mutateCounter({}));
    }).toThrow(TypeError);
    expect(wire.getModel(CounterModel)).toEqual({ value: 1 });
  });
});

describe('WireService — restore / replay (AC4 / AC5)', () => {
  it('replays silently: apply runs, no event or persist, onDidRestore once', async () => {
    const events: unknown[] = [];
    const { wire, persistence } = freshService({ events });
    wire.dispatch(counterAdd({ by: 5 }));
    const records = persistence.records.slice();

    // 全新 service 从落盘 records restore。
    const replayEvents: unknown[] = [];
    const replayPersistence = new InMemoryWirePersistence(records);
    const replayed = new WireService({
      persistence: replayPersistence,
      publishEvent: (event) => replayEvents.push(event),
    });
    let restored = 0;
    replayed.hooks.onDidRestore.register('test', () => {
      restored += 1;
    });

    await replayed.restore();

    expect(replayed.getModel(CounterModel)).toEqual({ value: 5 });
    expect(replayEvents).toEqual([]); // silent：不派发事件
    expect(restored).toBe(1); // onDidRestore 跑一次
    // silent：不重复落盘（records 数量不变）。
    expect(replayPersistence.records).toHaveLength(records.length);
  });

  it('runs cross-reducers during silent restore (derived state rebuilds)', async () => {
    const { wire, persistence } = freshService();
    wire.dispatch(counterAdd({ by: 4 }));
    const records = persistence.records.slice();

    const replayed = new WireService({ persistence: new InMemoryWirePersistence(records) });
    await replayed.restore();

    expect(replayed.getModel(CounterModel)).toEqual({ value: 4 });
    expect(replayed.getModel(DerivedModel)).toEqual({ total: 4 });
  });

  it('applies each record before requesting the next during restore', async () => {
    let streamed!: WireService;
    const streamingPersistence: WirePersistence = {
      read: async function* () {
        yield createWireMetadataRecord(1);
        yield { type: 'test.counter.add', by: 2, time: 1 };
        expect(streamed.getModel(CounterModel)).toEqual({ value: 2 });
        yield { type: 'test.counter.add', by: 3, time: 2 };
      },
      append: () => {},
      rewrite: () => {},
      flush: async () => {},
      close: async () => {},
    };
    streamed = new WireService({ persistence: streamingPersistence });
    await streamed.restore();

    expect(streamed.getModel(CounterModel)).toEqual({ value: 5 });
  });

  it('reports unknown record types during replay and skips them (AC5)', async () => {
    const skipped: WireError[] = [];
    const replayPersistence = new InMemoryWirePersistence([
      createWireMetadataRecord(1),
      { type: 'test.counter.add', by: 2, time: 1 },
      { type: 'no.such.op', foo: 1, time: 2 },
      { type: 'test.counter.add', by: 3, time: 3 },
    ]);
    const replayed = new WireService({
      persistence: replayPersistence,
      onSkippedRecord: (error) => skipped.push(error),
    });

    await replayed.restore();

    expect(replayed.getModel(CounterModel)).toEqual({ value: 5 });
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.code).toBe('wire.unknown_record');
    // index 是非 metadata record 中的序号（0-based）：counter.add=0, no.such.op=1。
    expect(skipped[0]?.details).toEqual({ type: 'no.such.op', index: 1 });
  });

  it('reports malformed payload (schema parse fail) and skips it (AC5)', async () => {
    const skipped: WireError[] = [];
    const replayed = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'test.counter.add', by: 'not-a-number', time: 1 },
        { type: 'test.counter.add', by: 7, time: 2 },
      ]),
      onSkippedRecord: (error) => skipped.push(error),
    });

    await replayed.restore();

    expect(replayed.getModel(CounterModel)).toEqual({ value: 7 });
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.code).toBe('wire.unknown_record');
    // 第一条非 metadata record 即损坏 → index 0。
    expect(skipped[0]?.details).toEqual({ type: 'test.counter.add', index: 0 });
  });

  it('skips malformed (non-WireRecord) lines and keeps the journal readable', async () => {
    const skipped: WireError[] = [];
    const replayed = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'test.counter.add', by: 1, time: 1 },
        { notType: true } as unknown as WireRecord,
        42 as unknown as WireRecord,
        { type: 'test.counter.add', by: 1, time: 3 },
      ]),
      onSkippedRecord: (error) => skipped.push(error),
    });

    await replayed.restore();

    expect(replayed.getModel(CounterModel)).toEqual({ value: 2 });
    expect(skipped).toHaveLength(2);
  });

  it('fails restore when an onDidRestore hook fails', async () => {
    const expected = new Error('restore participant failed');
    const { wire, persistence } = freshService();
    wire.dispatch(counterAdd({ by: 1 }));
    const replayed = new WireService({
      persistence: new InMemoryWirePersistence(persistence.records.slice()),
    });
    replayed.hooks.onDidRestore.register('failing', () => {
      throw expected;
    });

    await expect(replayed.restore()).rejects.toBe(expected);
  });

  it('rethrows restore error; dispatch stays available after failed (matches old logRecord semantics)', async () => {
    const replayed = new WireService({
      persistence: new InMemoryWirePersistence([
        { type: 'metadata', protocol_version: '0.9', created_at: 1 } as WireRecord,
      ]),
    });

    // resolveWireMigrations 对无迁移链的更旧版本抛错。
    await expect(replayed.restore()).rejects.toThrow(/Missing wire migration for version 0.9/);
    // L1：restore 失败后写路径保持可用（旧路径 replay 失败后 logRecord 仍工作），
    // 仅 restore 期间（phase='restoring'）禁止 dispatch。
    expect(() => {
      replayed.dispatch(counterAdd({ by: 1 }));
    }).not.toThrow();
    expect(replayed.getModel(CounterModel)).toEqual({ value: 1 });
  });
});

describe('WireService — phase guard', () => {
  it('throws when dispatch is called during restore', async () => {
    let phaseDispatched = false;
    let wire: WireService;
    const streamingPersistence: WirePersistence = {
      read: async function* () {
        yield createWireMetadataRecord(1);
        yield { type: 'test.counter.add', by: 1, time: 1 };
        // 试图在 restore 期间 dispatch —— 应被相位守卫拒绝。
        expect(() => {
          wire.dispatch(counterAdd({ by: 9 }));
        }).toThrow(WireError);
        phaseDispatched = true;
      },
      append: () => {},
      rewrite: () => {},
      flush: async () => {},
      close: async () => {},
    };
    wire = new WireService({ persistence: streamingPersistence });
    await wire.restore();

    expect(phaseDispatched).toBe(true);
    expect(wire.getModel(CounterModel)).toEqual({ value: 1 });
  });
});

describe('WireService — transient op (AC7 capability)', () => {
  it('does not persist a transient op but still applies state + fires event', () => {
    const events: unknown[] = [];
    const { wire, persistence } = freshService({ events });
    // 先来一条 persisted record（触发 metadata 信封），再 dispatch transient op。
    wire.dispatch(counterAdd({ by: 1 }));
    const persistedBefore = persistence.records.length;
    wire.dispatch(transientMark({ hit: true }));

    expect(wire.getModel(TransientModel)).toEqual({ marked: true });
    expect(persistence.records).toHaveLength(persistedBefore); // 不落盘
    expect(events).toContainEqual({ type: 'test.transient_marked', marked: true });
  });
});

describe('WireService — seal / metadata', () => {
  it('seal() writes metadata to an empty journal and is idempotent', async () => {
    const persistence = new InMemoryWirePersistence();
    const wire = new WireService({ persistence });

    await wire.seal();
    expect(persistence.records).toHaveLength(1);
    expect(isWireMetadataRecord(persistence.records[0])).toBe(true);
    expect(persistence.records[0]).toMatchObject({
      type: 'metadata',
      protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    });

    // 第二次 seal 不再追加（非空 journal → no-op）。
    await wire.seal();
    expect(persistence.records).toHaveLength(1);
  });

  it('restore() backfills metadata for an empty journal', async () => {
    const persistence = new InMemoryWirePersistence();
    const wire = new WireService({ persistence });

    await wire.restore();

    expect(persistence.records).toHaveLength(1);
    expect(persistence.records[0]).toMatchObject({
      type: 'metadata',
      protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    });
  });

  // —— M1 regression：restore / seal 后再 dispatch 不得重复写 metadata 信封 ——

  it('does not write a duplicate metadata after restore then dispatch', async () => {
    const { wire, persistence } = freshService();
    wire.dispatch(counterAdd({ by: 5 }));
    const records = persistence.records.slice();

    const replayPersistence = new InMemoryWirePersistence(records);
    const replayed = new WireService({ persistence: replayPersistence });
    await replayed.restore();
    // restore 后再 live dispatch：journal 里 metadata 仍只有一条。
    replayed.dispatch(counterAdd({ by: 1 }));

    const metadataCount = replayPersistence.records.filter((r) => r.type === 'metadata').length;
    expect(metadataCount).toBe(1);
  });

  it('does not write a duplicate metadata after seal then dispatch', async () => {
    const persistence = new InMemoryWirePersistence();
    const wire = new WireService({ persistence });

    await wire.seal();
    wire.dispatch(counterAdd({ by: 1 }));

    const metadataCount = persistence.records.filter((r) => r.type === 'metadata').length;
    expect(metadataCount).toBe(1);
    expect(persistence.records.map((r) => r.type)).toEqual(['metadata', 'test.counter.add']);
  });
});

describe('WireService — boundaries', () => {
  it('getModel returns the frozen initial state before any dispatch', () => {
    const { wire } = freshService();
    const state = wire.getModel(CounterModel);

    expect(state).toEqual({ value: 0 });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('dispatch with no ops is a no-op', () => {
    const { wire, persistence } = freshService();
    wire.dispatch();

    expect(persistence.records).toHaveLength(0);
    expect(wire.getModel(CounterModel)).toEqual({ value: 0 });
  });

  it('rejects a second restore() call (phase guard)', async () => {
    const { wire } = freshService();
    await wire.restore();

    await expect(wire.restore()).rejects.toThrow(WireError);
  });

  it('allows dispatch after a successful restore (phase ready)', async () => {
    const { wire, persistence } = freshService();
    wire.dispatch(counterAdd({ by: 2 }));
    const records = persistence.records.slice();

    const replayed = new WireService({ persistence: new InMemoryWirePersistence(records) });
    await replayed.restore();
    // restore 成功后 phase=ready，dispatch 应正常工作。
    expect(() => {
      replayed.dispatch(counterAdd({ by: 1 }));
    }).not.toThrow();
    expect(replayed.getModel(CounterModel)).toEqual({ value: 3 });
  });
});

describe('record codec — byte compatibility (AC6)', () => {
  it('opToWireRecord spreads object payload and fills time (matches logRecord shape)', () => {
    const op = counterAdd({ by: 3 });
    const record = opToWireRecord(op, 12345);

    expect(record).toEqual({ type: 'test.counter.add', by: 3, time: 12345 });
    // 字节序：type 在前，payload 字段居中，time 在后（与 logRecord 的 {...record, time} 一致）。
    expect(Object.keys(record)).toEqual(['type', 'by', 'time']);
  });

  it('opToWireRecord output is byte-identical to the records/index.ts:39-40 stamping', () => {
    // 旧路径 stamping 契约（records/index.ts:39-40）：record.time 缺失时 { ...record, time: T }。
    // 这里直接编码该契约作为对照，证明 opToWireRecord 与之逐字节一致。
    const payload = { objective: 'ship it', createdAt: 100 };
    const op = { type: 'goal.create', payload, descriptor: {} } as unknown as Parameters<
      typeof opToWireRecord
    >[0];
    const T = 4242;

    const fromOp = opToWireRecord(op, T);
    const fromOldPath = { type: 'goal.create', ...payload, time: T };

    expect(JSON.stringify(fromOp)).toBe(JSON.stringify(fromOldPath));
    expect(Object.keys(fromOp)).toEqual(['type', 'objective', 'createdAt', 'time']);
  });

  it('opToWireRecord preserves an explicit time and is the inverse of wireRecordToPayload', () => {
    const op = counterAdd({ by: 3 });
    const record = opToWireRecord({ ...op }, 9999);
    expect(record.time).toBe(9999);

    const payload = wireRecordToPayload(record);
    expect(payload).toEqual({ by: 3 });
  });

  it('isWireRecord accepts plain objects with a string type, rejects others', () => {
    expect(isWireRecord({ type: 'x' })).toBe(true);
    expect(isWireRecord({ type: 3 })).toBe(false);
    expect(isWireRecord(null)).toBe(false);
    expect(isWireRecord([1, 2])).toBe(false);
    expect(isWireRecord({ foo: 1 })).toBe(false);
  });
});

describe('OrderedHookSlot', () => {
  it('runs hooks in registration order and dedups by id', async () => {
    const slot = new OrderedHookSlot();
    const seen: string[] = [];
    slot.register('a', () => {
      seen.push('a');
    });
    slot.register('b', () => {
      seen.push('b');
    });
    slot.register('a', () => {
      seen.push('a2');
    }); // 覆盖 a

    await slot.run(undefined);

    expect(seen).toEqual(['a2', 'b']);
  });
});

describe('op registry', () => {
  it('throws DuplicateOpError when re-registering an existing type', () => {
    expect(() =>
      CounterModel.defineOp('test.counter.add', {
        schema: z.object({}),
        apply: (state) => state,
      }),
    ).toThrow(DuplicateOpError);
  });

  it('has registered the test ops into OP_REGISTRY', () => {
    expect(OP_REGISTRY.has('test.counter.add')).toBe(true);
    expect(OP_REGISTRY.get('test.counter.add')?.persist).toBeUndefined();
    expect(OP_REGISTRY.get('test.transient.mark')?.persist).toBe(false);
  });
});

// DeepReadonly 仅做编译期断言（运行时无操作）。
type _AssertDeepReadonly = DeepReadonly<{ list: number[]; nested: { a: string } }>;
