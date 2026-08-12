import { describe, expect, it } from 'vitest';

import {
  AGENT_WIRE_PROTOCOL_VERSION,
  InMemoryAgentRecordPersistence,
  type AgentRecord,
} from '../../../src/agent/records';
import { turnPrompt } from '../../../src/agent/wire/ops/turn';
import { testAgent } from '../harness/agent';

describe('WireService persistence metadata（Phase 6：AgentRecords 已删，直接测 wire）', () => {
  it('writes metadata before the first persisted record', async () => {
    const persistence = new InMemoryAgentRecordPersistence();
    const wire = testAgent({ persistence }).agent.wire;

    wire.dispatch(
      turnPrompt({ input: [{ type: 'text', text: 'hello' }], origin: { kind: 'user' } }),
    );
    await wire.flush();

    expect(persistence.records).toHaveLength(2);
    expect(persistence.records[0]).toMatchObject({
      type: 'metadata',
      protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    });
    expect(persistence.records[1]?.type).toBe('turn.prompt');
  });

  it('does not write metadata when replaying an empty stream', async () => {
    const persistence = new InMemoryAgentRecordPersistence();
    const wire = testAgent({ persistence }).agent.wire;

    await wire.restore();
    wire.dispatch(turnPrompt({ input: [{ type: 'text', text: 'one' }], origin: { kind: 'user' } }));
    await wire.flush();

    expect(persistence.records.map((record) => record.type)).toEqual(['metadata', 'turn.prompt']);
  });

  it('synthesizes a metadata envelope when replaying a non-empty stream without metadata (replay tolerance)', async () => {
    // PRD-0027 AC5：kimi 式容错 —— 无 metadata 时合成信封并按最旧版本迁移，不抛错。
    const persistence = new InMemoryAgentRecordPersistence([
      {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'one' }],
        origin: { kind: 'user' },
      },
    ]);
    const wire = testAgent({ persistence }).agent.wire;

    await wire.restore();

    expect(persistence.records[0]).toMatchObject({
      type: 'metadata',
      protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    });
    expect(persistence.records[1]?.type).toBe('turn.prompt');
  });

  it('does not duplicate metadata after replaying existing records', async () => {
    const persistence = new InMemoryAgentRecordPersistence([
      {
        type: 'metadata',
        protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
        created_at: 1,
      },
      {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'one' }],
        origin: { kind: 'user' },
      },
    ]);
    const wire = testAgent({ persistence }).agent.wire;

    await wire.restore();
    wire.dispatch(turnPrompt({ input: [{ type: 'text', text: 'two' }], origin: { kind: 'user' } }));
    await wire.flush();

    expect(persistence.records.map((record) => record.type)).toEqual([
      'metadata',
      'turn.prompt',
      'turn.prompt',
    ]);
    expect(persistence.records.filter((record) => record.type === 'metadata')).toHaveLength(1);
  });

  it('does not rewrite records that already use the current wire version', async () => {
    const persistence = new RecordingInMemoryAgentRecordPersistence([
      {
        type: 'metadata',
        protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
        created_at: 1,
      },
      {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'one' }],
        origin: { kind: 'user' },
      },
    ]);
    const wire = testAgent({ persistence }).agent.wire;

    await wire.restore();

    expect(persistence.rewrites).toEqual([]);
  });

  it('rewrites migrated records to the current wire version after replay', async () => {
    const persistence = new RecordingInMemoryAgentRecordPersistence([
      {
        type: 'metadata',
        protocol_version: '1.0',
        created_at: 1,
      },
      {
        type: 'context.append_message',
        message: {
          role: 'assistant',
          content: [],
          toolCalls: [
            {
              type: 'function',
              id: 'call_legacy_bash',
              function: {
                name: 'Bash',
                arguments: '{"command":"pwd"}',
              },
            },
          ],
        },
      } as unknown as AgentRecord,
    ]);
    const wire = testAgent({ persistence }).agent.wire;

    await wire.restore();

    expect(persistence.rewrites).toHaveLength(1);
    expect(persistence.records[0]).toMatchObject({
      type: 'metadata',
      protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    });
    const migrated = persistence.records[1] as unknown as {
      readonly message: {
        readonly toolCalls: readonly Record<string, unknown>[];
      };
    };
    expect(migrated.message.toolCalls[0]).toMatchObject({
      name: 'Bash',
      arguments: '{"command":"pwd"}',
    });
    expect(migrated.message.toolCalls[0]?.['function']).toBeUndefined();
  });

  it('warns but continues when replaying records from a newer wire version', async () => {
    const persistence = new InMemoryAgentRecordPersistence([
      {
        type: 'metadata',
        protocol_version: '9.9',
        created_at: 1,
      },
    ]);
    const wire = testAgent({ persistence }).agent.wire;

    const result = await wire.restore();
    expect(result.warning).toContain('9.9');
    expect(result.warning).toContain(AGENT_WIRE_PROTOCOL_VERSION);
  });

  it('rejects replaying records without a registered migration path', async () => {
    const persistence = new InMemoryAgentRecordPersistence([
      {
        type: 'metadata',
        protocol_version: '0.9',
        created_at: 1,
      },
    ]);
    const wire = testAgent({ persistence }).agent.wire;

    await expect(wire.restore()).rejects.toThrow('Missing wire migration for version 0.9');
  });
});

class RecordingInMemoryAgentRecordPersistence extends InMemoryAgentRecordPersistence {
  readonly rewrites: AgentRecord[][] = [];

  override rewrite(records: readonly AgentRecord[]): void {
    this.rewrites.push([...records]);
    super.rewrite(records);
  }
}
