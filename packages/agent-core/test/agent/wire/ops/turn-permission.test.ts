import { describe, expect, it } from 'vitest';

import { WireService, type WirePersistence, type WireRecord } from '../../../../src/agent/wire';
import {
  permissionModel,
  permissionRecordApprovalResult,
  permissionSetMode,
} from '../../../../src/agent/wire/ops/permission';
import { turnCancel, turnModel, turnPrompt, turnSteer } from '../../../../src/agent/wire/ops/turn';

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

const INPUT = [{ type: 'text', text: 'hi' }];

describe('turn reducer — turnId counter', () => {
  it('starts at -1; each prompt and steer increments by 1', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    expect(wire.getModel(turnModel).turnId).toBe(-1);

    wire.dispatch(turnPrompt({ input: INPUT, origin: { kind: 'user' } }));
    expect(wire.getModel(turnModel).turnId).toBe(0);
    wire.dispatch(turnSteer({ input: INPUT, origin: { kind: 'user' } }));
    expect(wire.getModel(turnModel).turnId).toBe(1);
    wire.dispatch(turnPrompt({ input: INPUT, origin: { kind: 'user' } }));
    expect(wire.getModel(turnModel).turnId).toBe(2);
  });

  it('turn.cancel is a no-op on turnId', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(turnPrompt({ input: INPUT, origin: { kind: 'user' } }));
    wire.dispatch(turnCancel({}));

    expect(wire.getModel(turnModel).turnId).toBe(0);
  });

  it('restore round-trip rebuilds the same turnId', async () => {
    const livePersistence = new InMemoryWirePersistence();
    const live = new WireService({ persistence: livePersistence });
    live.dispatch(turnPrompt({ input: INPUT, origin: { kind: 'user' } }));
    live.dispatch(turnSteer({ input: INPUT, origin: { kind: 'user' } }));
    live.dispatch(turnPrompt({ input: INPUT, origin: { kind: 'user' } }));

    const replayed = new WireService({
      persistence: new InMemoryWirePersistence(livePersistence.records.slice()),
    });
    await replayed.restore();

    expect(replayed.getModel(turnModel).turnId).toBe(2);
  });
});

describe('permission reducer — mode + approved actions', () => {
  it('set_mode overwrites modeOverride', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    expect(wire.getModel(permissionModel).modeOverride).toBeUndefined();

    wire.dispatch(permissionSetMode({ mode: 'yolo' }));
    expect(wire.getModel(permissionModel).modeOverride).toBe('yolo');
    wire.dispatch(permissionSetMode({ mode: 'auto' }));
    expect(wire.getModel(permissionModel).modeOverride).toBe('auto');
  });

  it('record_approval_result adds action to sessionApprovedActions, dedupes', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    const rec = {
      turnId: 0,
      toolCallId: 'c1',
      toolName: 'Bash',
      action: 'Bash(ls)',
      result: 'allow',
    };
    wire.dispatch(permissionRecordApprovalResult(rec));
    wire.dispatch(permissionRecordApprovalResult({ ...rec, toolCallId: 'c2' })); // same action

    expect([...wire.getModel(permissionModel).sessionApprovedActions]).toEqual(['Bash(ls)']);
  });

  it('restore round-trip rebuilds mode + approved actions', async () => {
    const livePersistence = new InMemoryWirePersistence();
    const live = new WireService({ persistence: livePersistence });
    live.dispatch(permissionSetMode({ mode: 'manual' }));
    live.dispatch(
      permissionRecordApprovalResult({
        turnId: 0,
        toolCallId: 'c1',
        toolName: 'Bash',
        action: 'Bash(rm)',
        result: 'deny',
      }),
    );

    const replayed = new WireService({
      persistence: new InMemoryWirePersistence(livePersistence.records.slice()),
    });
    await replayed.restore();

    expect(replayed.getModel(permissionModel).modeOverride).toBe('manual');
    expect([...replayed.getModel(permissionModel).sessionApprovedActions]).toEqual(['Bash(rm)']);
  });
});
