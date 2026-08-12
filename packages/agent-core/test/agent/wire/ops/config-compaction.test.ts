import { describe, expect, it } from 'vitest';

import { WireService, type WirePersistence, type WireRecord } from '../../../../src/agent/wire';
import { backgroundModel, backgroundStop } from '../../../../src/agent/wire/ops/background';
import { configModel, configUpdate } from '../../../../src/agent/wire/ops/config';
import {
  fullCompactionBegin,
  fullCompactionCancel,
  fullCompactionComplete,
  fullCompactionModel,
} from '../../../../src/agent/wire/ops/full-compaction';

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

describe('config reducer — 6 scalar fields merge', () => {
  it('merges only present fields; modelAlias/profileName use hasOwn (explicit undefined clears)', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(configUpdate({ cwd: '/x', modelAlias: 'gpt-4', thinkingLevel: 'high' }));

    const s1 = wire.getModel(configModel);
    expect(s1.cwd).toBe('/x');
    expect(s1.modelAlias).toBe('gpt-4');
    expect(s1.thinkingLevel).toBe('high');
    expect(s1.profileName).toBeUndefined();

    // 显式 modelAlias:undefined 应清除（Object.hasOwn 语义）。
    wire.dispatch(configUpdate({ modelAlias: undefined }));
    expect(wire.getModel(configModel).modelAlias).toBeUndefined();
    // cwd 未传，保留。
    expect(wire.getModel(configModel).cwd).toBe('/x');
  });

  it('restore round-trip rebuilds the same config state', async () => {
    const livePersistence = new InMemoryWirePersistence();
    const live = new WireService({ persistence: livePersistence });
    live.dispatch(configUpdate({ profileName: 'p1', additionalDirs: ['/a', '/b'] }));

    const replayed = new WireService({
      persistence: new InMemoryWirePersistence(livePersistence.records.slice()),
    });
    await replayed.restore();

    expect(replayed.getModel(configModel).profileName).toBe('p1');
    expect(replayed.getModel(configModel).additionalDirs).toEqual(['/a', '/b']);
  });
});

describe('full_compaction reducer — compactionCountInTurn', () => {
  it('manual resets count to 0; auto increments', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(fullCompactionBegin({ source: 'auto' }));
    expect(wire.getModel(fullCompactionModel).compactionCountInTurn).toBe(1);
    wire.dispatch(fullCompactionBegin({ source: 'auto' }));
    expect(wire.getModel(fullCompactionModel).compactionCountInTurn).toBe(2);
    wire.dispatch(fullCompactionBegin({ source: 'manual' }));
    expect(wire.getModel(fullCompactionModel).compactionCountInTurn).toBe(0);
  });

  it('cancel and complete are no-ops on the count', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(fullCompactionBegin({ source: 'auto' }));
    wire.dispatch(fullCompactionCancel({}));
    wire.dispatch(
      fullCompactionComplete({
        summary: 's',
        compactedCount: 3,
        tokensBefore: 100,
        tokensAfter: 40,
      }),
    );

    expect(wire.getModel(fullCompactionModel).compactionCountInTurn).toBe(1);
  });
});

describe('background reducer — no-op persisted audit op', () => {
  it('persists background.stop but apply is no-op (state stays empty)', () => {
    const persistence = new InMemoryWirePersistence();
    const wire = new WireService({ persistence });
    wire.dispatch(backgroundStop({ taskId: 't1' }));

    // 落盘（审计）。
    expect(persistence.records.some((r) => r.type === 'background.stop')).toBe(true);
    // apply no-op：Model 状态恒空。
    expect(wire.getModel(backgroundModel)).toEqual({});
  });
});
