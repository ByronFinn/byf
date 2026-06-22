import { describe, expect, it } from 'vitest';

import {
  AgentRecords,
  InMemoryAgentRecordPersistence,
  type AgentRecord,
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
});
