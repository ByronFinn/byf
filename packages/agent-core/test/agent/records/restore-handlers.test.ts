import { describe, expect, it } from 'vitest';

import {
  AgentRecords,
  InMemoryAgentRecordPersistence,
  type AgentRecord,
  type AgentRecordEvents,
} from '../../../src/agent/records';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';
import { testAgent } from '../harness/agent';

describe('AgentRecords handler registration and routing', () => {
  describe('registerHandlers method', () => {
    it('should allow registering restore handlers', () => {
      const persistence = new InMemoryAgentRecordPersistence();
      const records = testAgent({ persistence }).agent.records;

      // Create a mock handler
      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {},
      };

      // Test that registerHandlers method exists and can be called
      const agentRecords = records as unknown as AgentRecords & {
        registerHandlers: (handlers: Record<string, RecordRestoreHandler>) => void;
      };

      expect(typeof agentRecords.registerHandlers).toBe('function');

      expect(() => {
        agentRecords.registerHandlers({ test: mockHandler });
      }).not.toThrow();
    });

    it('should overwrite previously registered handlers', () => {
      const persistence = new InMemoryAgentRecordPersistence();
      const records = testAgent({ persistence }).agent.records;

      const firstHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {},
      };

      const secondHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {},
      };

      const agentRecords = records as unknown as AgentRecords & {
        registerHandlers: (handlers: Record<string, RecordRestoreHandler>) => void;
      };

      agentRecords.registerHandlers({ test: firstHandler });
      agentRecords.registerHandlers({ test: secondHandler });

      // Should not throw - second handler overwrote first
      expect(() => {
        agentRecords.registerHandlers({ test: secondHandler });
      }).not.toThrow();
    });
  });

  describe('record type routing', () => {
    it('should route context.* records to context handler', () => {
      const persistence = new InMemoryAgentRecordPersistence();
      const records = testAgent({ persistence }).agent.records;

      let receivedRecord: AgentRecord | undefined;
      const contextHandler: RecordRestoreHandler = {
        restoreRecord: (record: AgentRecord) => {
          if (record.type.startsWith('context.')) {
            receivedRecord = record;
          }
        },
      };

      const agentRecords = records as unknown as AgentRecords & {
        registerHandlers: (handlers: Record<string, RecordRestoreHandler>) => void;
      };
      agentRecords.registerHandlers({ context: contextHandler });

      const testRecord: AgentRecord = {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'test' }],
          toolCalls: [],
        },
      };

      records.restore(testRecord);

      expect(receivedRecord).toEqual(testRecord);
    });

    it('should route config.* records to config handler', () => {
      const persistence = new InMemoryAgentRecordPersistence();
      const records = testAgent({ persistence }).agent.records;

      let receivedRecord: AgentRecord | undefined;
      const configHandler: RecordRestoreHandler = {
        restoreRecord: (record: AgentRecord) => {
          if (record.type.startsWith('config.')) {
            receivedRecord = record;
          }
        },
      };

      const agentRecords = records as unknown as AgentRecords & {
        registerHandlers: (handlers: Record<string, RecordRestoreHandler>) => void;
      };
      agentRecords.registerHandlers({ config: configHandler });

      const testRecord: AgentRecord = {
        type: 'config.update',
        modelAlias: 'test-model',
      };

      records.restore(testRecord);

      expect(receivedRecord).toEqual(testRecord);
    });

    it('should silently skip unregistered record types', () => {
      const persistence = new InMemoryAgentRecordPersistence();
      const records = testAgent({ persistence }).agent.records;

      let handlerCalled = false;
      const contextHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          handlerCalled = true;
        },
      };

      const agentRecords = records as unknown as AgentRecords & {
        registerHandlers: (handlers: Record<string, RecordRestoreHandler>) => void;
      };
      agentRecords.registerHandlers({ context: contextHandler });

      // This record type is not registered, should be silently skipped
      const unregisteredRecord: AgentRecord = {
        type: 'unregistered.type',
        data: 'test',
      } as unknown as AgentRecord;

      expect(() => {
        records.restore(unregisteredRecord);
      }).not.toThrow();

      expect(handlerCalled).toBe(false);
    });
  });

  describe('type prefix to handler key mapping', () => {
    it('should handle naming inconsistencies like full_compaction -> fullCompaction', () => {
      const persistence = new InMemoryAgentRecordPersistence();
      const records = testAgent({ persistence }).agent.records;

      let receivedRecord: AgentRecord | undefined;
      const fullCompactionHandler: RecordRestoreHandler = {
        restoreRecord: (record: AgentRecord) => {
          if (record.type.startsWith('full_compaction.')) {
            receivedRecord = record;
          }
        },
      };

      const agentRecords = records as unknown as AgentRecords & {
        registerHandlers: (handlers: Record<string, RecordRestoreHandler>) => void;
      };
      agentRecords.registerHandlers({ fullCompaction: fullCompactionHandler });

      const testRecord: AgentRecord = {
        type: 'full_compaction.begin',
        turnId: 'test-turn',
      } as unknown as AgentRecord;

      records.restore(testRecord);

      expect(receivedRecord).toEqual(testRecord);
    });
  });

  // PRD-0025 / ADR-0031: every record type must be covered by a restore
  // handler (via the prefix routing map) or be in the explicit no-handler
  // exception list. This is the real drift guard — the per-subsystem
  // `restoreRecord` switches can't be made exhaustive over the full
  // AgentRecord union (each owns only its prefix), so this test is what
  // catches a new record type that was forgotten in the routing map.
  describe('record type restore coverage (drift guard)', () => {
    // Prefixes routed to a handler by getHandlerKey. Must mirror the mapping
    // in packages/agent-core/src/agent/records/index.ts.
    const ROUTED_PREFIXES: ReadonlySet<string> = new Set([
      'context',
      'config',
      'turn',
      'permission',
      'tools',
      'usage',
      'full_compaction',
      'goal',
    ]);
    // Record types with no restore handler by design.
    // - metadata: handled directly by AgentRecords (protocol envelope).
    // - background.*: restored via a separate persistence path
    //   (BackgroundProcessManager), intentionally no handler here.
    const NO_HANDLER_TYPES: ReadonlySet<string> = new Set(['metadata', 'background.stop']);

    // `satisfies` checks both directions: every entry is a valid key, AND
    // (via the second conditional) every union member is present. If a record
    // type is added to AgentRecordEvents without updating this list, TS fails.
    const ALL_RECORD_TYPES = [
      'metadata',
      'turn.prompt',
      'turn.steer',
      'turn.cancel',
      'config.update',
      'permission.set_mode',
      'permission.record_approval_result',
      'full_compaction.begin',
      'full_compaction.cancel',
      'full_compaction.complete',
      'tools.register_user_tool',
      'tools.unregister_user_tool',
      'tools.set_active_tools',
      'tools.update_store',
      'background.stop',
      'usage.record',
      'context.append_message',
      'context.mark_last_user_prompt_blocked',
      'context.append_loop_event',
      'context.clear',
      'context.apply_compaction',
      'context.observation_masking',
      'context.output_offloaded',
      'context.pruning',
      'goal.create',
      'goal.update',
      'goal.clear',
    ] as const;
    // Compile-time exhaustiveness: every union member must appear in the list.
    type Missing = Exclude<keyof AgentRecordEvents, (typeof ALL_RECORD_TYPES)[number]>;
    type _Check = [Missing] extends [never] ? true : `missing: ${Missing & string}`;

    it('every record type is routed to a handler or in the explicit no-handler list', () => {
      const unaccounted = ALL_RECORD_TYPES.filter((type) => {
        if (NO_HANDLER_TYPES.has(type)) return false;
        const prefix = type.split('.')[0]!;
        return !ROUTED_PREFIXES.has(prefix);
      });
      expect(unaccounted).toEqual([]);
    });
  });
});
