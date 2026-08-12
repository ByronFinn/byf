import { describe, expect, it } from 'vitest';

import { WireService, type WirePersistence, type WireRecord } from '../../../../src/agent/wire';
import { usageModel, usageRecord } from '../../../../src/agent/wire/ops/usage';

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

const U = { inputOther: 10, output: 5, inputCacheRead: 0, inputCacheCreation: 0 };

describe('usage reducer — session-hardcoded semantics', () => {
  it('accumulates byModel across records for the same model', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(usageRecord({ model: 'gpt', usage: U, usageScope: 'session' }));
    wire.dispatch(usageRecord({ model: 'gpt', usage: U, usageScope: 'session' }));

    expect(wire.getModel(usageModel).byModel['gpt']).toEqual({
      inputOther: 20,
      output: 10,
      inputCacheRead: 0,
      inputCacheCreation: 0,
    });
  });

  it('ignores usageScope — turn scope still only updates byModel (no currentTurn)', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(usageRecord({ model: 'gpt', usage: U, usageScope: 'turn' }));

    // 即使 payload 标 turn，reducer 也只更新 byModel（session 硬编码语义）。
    expect(wire.getModel(usageModel).byModel['gpt']).toEqual(U);
  });

  it('restore round-trip rebuilds the same byModel via silent replay', async () => {
    const livePersistence = new InMemoryWirePersistence();
    const live = new WireService({ persistence: livePersistence });
    live.dispatch(usageRecord({ model: 'a', usage: U }));
    live.dispatch(usageRecord({ model: 'a', usage: U }));
    live.dispatch(usageRecord({ model: 'b', usage: U }));

    const replayed = new WireService({
      persistence: new InMemoryWirePersistence(livePersistence.records.slice()),
    });
    await replayed.restore();

    expect(replayed.getModel(usageModel).byModel['a']?.inputOther).toBe(20);
    expect(replayed.getModel(usageModel).byModel['b']?.inputOther).toBe(10);
  });
});
