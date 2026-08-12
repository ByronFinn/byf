import { describe, expect, it } from 'vitest';

import {
  AgentRecords,
  InMemoryAgentRecordPersistence,
  type AgentRecord,
} from '../../../src/agent/records';
import {
  WireService,
  createWireMetadataRecord,
  type WirePersistence,
  type WireRecord,
} from '../../../src/agent/wire';
import { turnModel } from '../../../src/agent/wire/ops/turn';
import { testAgent } from '../harness/agent';

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

const USER_MESSAGE = {
  role: 'user',
  content: [{ type: 'text', text: 'test' }],
  toolCalls: [],
};

describe('AgentRecords facade — logRecord routing', () => {
  it('routes registered-op records through dispatch (persist + apply + metadata envelope)', () => {
    const persistence = new InMemoryAgentRecordPersistence();
    const { agent } = testAgent({ persistence });

    agent.records.logRecord({
      type: 'turn.prompt',
      input: [{ type: 'text', text: 'hello' }],
      origin: { kind: 'user' },
    });

    // 持久化 + metadata 信封（逐字节兼容）。
    expect(persistence.records.map((record) => record.type)).toEqual(['metadata', 'turn.prompt']);
    // apply 更新了 model 状态（turnId 0）。
    expect(agent.wire.getModel(turnModel).turnId).toBe(0);
  });

  it('routes context records through persistRaw (persist only, no apply)', () => {
    const persistence = new InMemoryAgentRecordPersistence();
    const { agent } = testAgent({ persistence });

    agent.records.logRecord({
      type: 'context.append_message',
      message: USER_MESSAGE,
    } as unknown as AgentRecord);

    // 持久化 + metadata 信封。
    expect(persistence.records.map((record) => record.type)).toEqual([
      'metadata',
      'context.append_message',
    ]);
    // context 无 Op —— persistRaw 不跑 apply，不产生 model。
  });

  it('is a no-op while restoring', async () => {
    const persistence = new InMemoryAgentRecordPersistence([
      {
        type: 'metadata',
        protocol_version: '1.1',
        created_at: 1,
      },
      {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'one' }],
        origin: { kind: 'user' },
      },
    ]);
    const { agent } = testAgent({ persistence });

    // 用 legacyRoute 观察 replay 期间的 logRecord —— 应被 restoring 抑制。
    const records = agent.records;
    await records.replay();

    expect(persistence.records).toHaveLength(2); // 无新 record（无重复）
    expect(records.restoring).toBe(false);
  });
});

describe('AgentRecords facade — restoring flag', () => {
  it('is true during restore (legacyRoute runs mid-replay) and false after', async () => {
    let wire: WireService;
    const observed: boolean[] = [];
    wire = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'context.append_message', message: USER_MESSAGE, time: 1 },
      ]),
      legacyRoute: () => {
        observed.push(wire.phase === 'restoring');
      },
    });
    const records = new AgentRecords(wire);

    expect(records.restoring).toBe(false);
    await records.replay();
    expect(observed).toEqual([true]);
    expect(records.restoring).toBe(false);
  });
});

describe('AgentRecords facade — legacyRoute during restore', () => {
  it('routes unregistered (context.*) records to legacyRoute instead of skipping', async () => {
    const routed: string[] = [];
    const wire = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'context.append_message', message: USER_MESSAGE, time: 1 },
        { type: 'context.clear', time: 2 },
      ]),
      legacyRoute: (record) => routed.push(record.type),
    });
    const records = new AgentRecords(wire);

    await records.replay();

    expect(routed).toEqual(['context.append_message', 'context.clear']);
  });

  it('propagates legacyRoute errors through restore (Agent.resume catches)', async () => {
    const wire = new WireService({
      persistence: new InMemoryWirePersistence([
        createWireMetadataRecord(1),
        { type: 'context.append_message', message: USER_MESSAGE, time: 1 },
      ]),
      legacyRoute: () => {
        throw new Error('Test restoration error');
      },
    });
    const records = new AgentRecords(wire);

    await expect(records.replay()).rejects.toThrow('Test restoration error');
  });
});
