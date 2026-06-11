import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import { testAgent } from '../harness/agent';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';

describe('UsageRecorder restore handler', () => {
  describe('restoreRecord method', () => {
    it('should restore usage.record records', () => {
      const { agent } = testAgent();

      // Ensure usage implements RecordRestoreHandler
      const usage = agent.usage as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'usage.record',
        model: 'test-model',
        usage: {
          inputCacheCreation: 100,
          inputCacheRead: 50,
          inputOther: 200,
          output: 150,
        },
        usageScope: 'session',
      };

      expect(() => {
        usage.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the usage was restored
      const data = agent.usage.data();
      expect(data.byModel).toBeDefined();
      expect(data.byModel?.['test-model']).toEqual({
        inputCacheCreation: 100,
        inputCacheRead: 50,
        inputOther: 200,
        output: 150,
      });
      expect(data.total).toEqual({
        inputCacheCreation: 100,
        inputCacheRead: 50,
        inputOther: 200,
        output: 150,
      });
    });

    it('should restore usage with turn scope as session scope', () => {
      const { agent } = testAgent();

      const usage = agent.usage as unknown as RecordRestoreHandler;

      const turnRecord: AgentRecord = {
        type: 'usage.record',
        model: 'test-model',
        usage: {
          inputCacheCreation: 50,
          inputCacheRead: 25,
          inputOther: 100,
          output: 75,
        },
        usageScope: 'turn',
      };

      usage.restoreRecord(turnRecord);

      // During restore, turn scope is converted to session scope
      // so currentTurn should not be set
      const data = agent.usage.data();
      expect(data.currentTurn).toBeUndefined();
      expect(data.byModel?.['test-model']).toEqual({
        inputCacheCreation: 50,
        inputCacheRead: 25,
        inputOther: 100,
        output: 75,
      });
    });

    it('should accumulate multiple usage records for the same model', () => {
      const { agent } = testAgent();

      const usage = agent.usage as unknown as RecordRestoreHandler;

      const record1: AgentRecord = {
        type: 'usage.record',
        model: 'test-model',
        usage: {
          inputCacheCreation: 100,
          inputCacheRead: 50,
          inputOther: 200,
          output: 150,
        },
        usageScope: 'session',
      };

      const record2: AgentRecord = {
        type: 'usage.record',
        model: 'test-model',
        usage: {
          inputCacheCreation: 50,
          inputCacheRead: 25,
          inputOther: 100,
          output: 75,
        },
        usageScope: 'session',
      };

      usage.restoreRecord(record1);
      usage.restoreRecord(record2);

      // Verify the usage was accumulated
      const data = agent.usage.data();
      expect(data.byModel?.['test-model']).toEqual({
        inputCacheCreation: 150,
        inputCacheRead: 75,
        inputOther: 300,
        output: 225,
      });
    });
  });
});