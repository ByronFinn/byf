import { describe, expect, it } from 'vitest';

import { InMemoryAgentRecordPersistence, type AgentRecord } from '../../../src/agent/records';
import {
  OP_REGISTRY,
  WireService,
  createWireMetadataRecord,
  wireRecordToPayload,
  type WirePersistence,
  type WireRecord,
} from '../../../src/agent/wire';
import { turnModel, turnPrompt } from '../../../src/agent/wire/ops/turn';
// import 触发全部业务 Op 注册（context.* 在 Phase 5 起已注册，仅 observation_masking 遗留）。
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

const MASKING_RECORD: WireRecord = {
  type: 'context.observation_masking',
  maskedCount: 2,
  tokensBefore: 1000,
  tokensAfter: 800,
  time: 1,
};

describe('WireService logRecord 路由（Phase 6：AgentRecords facade 已删，行为归 wire 引擎）', () => {
  it('routes registered-op records through dispatch (persist + apply + metadata envelope)', () => {
    const persistence = new InMemoryAgentRecordPersistence();
    const { agent } = testAgent({ persistence });

    agent.wire.dispatch(
      turnPrompt({ input: [{ type: 'text', text: 'hello' }], origin: { kind: 'user' } }),
    );

    // 持久化 + metadata 信封（逐字节兼容）。
    expect(persistence.records.map((record) => record.type)).toEqual(['metadata', 'turn.prompt']);
    // apply 更新了 model 状态（turnId 0）。
    expect(agent.wire.getModel(turnModel).turnId).toBe(0);
  });

  it('routes context records through dispatch (Phase 5：context.* 已注册 Op)', () => {
    const persistence = new InMemoryAgentRecordPersistence();
    const { agent } = testAgent({ persistence });

    agent.wire.dispatch({
      type: 'context.append_message',
      payload: { message: USER_MESSAGE },
      descriptor: OP_REGISTRY.get('context.append_message')!,
    } as never);

    // 持久化 + metadata 信封。
    expect(persistence.records.map((record) => record.type)).toEqual([
      'metadata',
      'context.append_message',
    ]);
    // apply 更新了共享 model 状态（history 折叠进 context model）。
    expect(agent.context.history).toHaveLength(1);
  });

  it('persistRaw 落盘未注册记录（context.observation_masking），restore 由 legacyRoute 兜底', async () => {
    const routed: string[] = [];
    const persistence = new InMemoryWirePersistence([createWireMetadataRecord(1), MASKING_RECORD]);
    const wire = new WireService({
      persistence,
      legacyRoute: (record) => routed.push(record.type),
    });

    await wire.restore();

    expect(routed).toEqual(['context.observation_masking']);
    expect(wire.phase).toBe('ready');
  });

  it('propagates legacyRoute errors through restore (Agent.resume catches)', async () => {
    const wire = new WireService({
      persistence: new InMemoryWirePersistence([createWireMetadataRecord(1), MASKING_RECORD]),
      legacyRoute: () => {
        throw new Error('Test restoration error');
      },
    });

    await expect(wire.restore()).rejects.toThrow('Test restoration error');
  });

  it('restoring 相位：replay 期间 phase=restoring，之后 ready（replayBuilder 的收集窗口）', async () => {
    let wire: WireService;
    const observed: boolean[] = [];
    wire = new WireService({
      persistence: new InMemoryWirePersistence([createWireMetadataRecord(1), MASKING_RECORD]),
      legacyRoute: () => {
        observed.push(wire.phase === 'restoring');
      },
    });

    expect(wire.phase).toBe('new');
    await wire.restore();
    expect(observed).toEqual([true]);
    expect(wire.phase).toBe('ready');
  });

  it('wireRecordToPayload 提取 payload（dispatch 用）', () => {
    const payload = wireRecordToPayload({
      type: 'turn.prompt',
      input: [{ type: 'text', text: 'x' }],
      origin: { kind: 'user' },
      time: 123,
    } as unknown as WireRecord);
    expect(payload).toEqual({ input: [{ type: 'text', text: 'x' }], origin: { kind: 'user' } });
  });
});
