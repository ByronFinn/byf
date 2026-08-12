import { describe, expect, it } from 'vitest';

import { WireService, type WirePersistence, type WireRecord } from '../../../../src/agent/wire';
import {
  toolsModel,
  toolsRegisterUserTool,
  toolsSetActiveTools,
  toolsUnregisterUserTool,
  toolsUpdateStore,
} from '../../../../src/agent/wire/ops/tools';

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

const REG = { name: 'myTool', description: 'a tool', parameters: { type: 'object' } };

describe('tools reducer — Map/Set state mutations', () => {
  it('register adds to userTools + enabledTools', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(toolsRegisterUserTool(REG));

    expect(wire.getModel(toolsModel).userTools.get('myTool')).toEqual(REG);
    expect(wire.getModel(toolsModel).enabledTools.has('myTool')).toBe(true);
  });

  it('unregister removes from userTools + enabledTools', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(toolsRegisterUserTool(REG));
    wire.dispatch(toolsUnregisterUserTool({ name: 'myTool' }));

    expect(wire.getModel(toolsModel).userTools.has('myTool')).toBe(false);
    expect(wire.getModel(toolsModel).enabledTools.has('myTool')).toBe(false);
  });

  it('set_active_tools splits non-MCP vs MCP names (matches tool/index.ts:297-298)', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(toolsSetActiveTools({ names: ['myTool', 'mcp__github__*', 'builtin.read'] }));

    const state = wire.getModel(toolsModel);
    expect([...state.enabledTools]).toEqual(['myTool', 'builtin.read']);
    expect(state.mcpAccessPatterns).toEqual(['mcp__github__*']);
  });

  it('update_store accumulates keys', () => {
    const wire = new WireService({ persistence: new InMemoryWirePersistence() });
    wire.dispatch(toolsUpdateStore({ key: 'k1', value: 1 }));
    wire.dispatch(toolsUpdateStore({ key: 'k2', value: 'x' }));

    expect(wire.getModel(toolsModel).store).toEqual({ k1: 1, k2: 'x' });
  });

  it('restore round-trip rebuilds the same tools state', async () => {
    const livePersistence = new InMemoryWirePersistence();
    const live = new WireService({ persistence: livePersistence });
    live.dispatch(toolsRegisterUserTool(REG));
    live.dispatch(toolsSetActiveTools({ names: ['myTool', 'mcp__*'] }));
    live.dispatch(toolsUpdateStore({ key: 'k', value: true }));

    const replayed = new WireService({
      persistence: new InMemoryWirePersistence(livePersistence.records.slice()),
    });
    await replayed.restore();

    const state = replayed.getModel(toolsModel);
    expect(state.userTools.get('myTool')).toEqual(REG);
    expect([...state.enabledTools]).toEqual(['myTool']);
    expect(state.mcpAccessPatterns).toEqual(['mcp__*']);
    expect(state.store).toEqual({ k: true });
  });
});
