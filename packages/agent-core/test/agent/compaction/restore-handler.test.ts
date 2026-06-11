import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import { testAgent } from '../harness/agent';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';

describe('FullCompaction restore handler', () => {
  describe('restoreRecord method', () => {
    it('should restore full_compaction.begin records', () => {
      const { agent } = testAgent();

      // Ensure fullCompaction implements RecordRestoreHandler
      const fullCompaction = agent.fullCompaction as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'full_compaction.begin',
        turnId: 1,
        source: 'manual',
      } as unknown as AgentRecord;

      expect(() => {
        fullCompaction.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the compaction state was updated
      expect(agent.fullCompaction.compactedHistory).toHaveLength(0); // No history yet
    });

    it('should restore full_compaction.cancel records', () => {
      const { agent } = testAgent();

      const fullCompaction = agent.fullCompaction as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'full_compaction.cancel',
      };

      expect(() => {
        fullCompaction.restoreRecord(testRecord);
      }).not.toThrow();

      // Cancel during restore should be a no-op since there's no active compaction
      expect(agent.fullCompaction.compactedHistory).toHaveLength(0);
    });

    it('should restore full_compaction.complete records', () => {
      const { agent } = testAgent();

      const fullCompaction = agent.fullCompaction as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'full_compaction.complete',
        compactedCount: 5,
        summary: 'Compacted summary',
        tokensAfter: 1000,
      };

      expect(() => {
        fullCompaction.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the compaction history was updated
      // The complete method stores a text snapshot, not the result
      expect(agent.fullCompaction.compactedHistory).toHaveLength(1);
      expect(agent.fullCompaction.compactedHistory[0]).toHaveProperty('text');
      expect(typeof agent.fullCompaction.compactedHistory[0].text).toBe('string');
    });

    it('should restore multiple full_compaction.complete records', () => {
      const { agent } = testAgent();

      const fullCompaction = agent.fullCompaction as unknown as RecordRestoreHandler;

      const testRecord1: AgentRecord = {
        type: 'full_compaction.complete',
        compactedCount: 3,
        summary: 'First compaction',
        tokensAfter: 800,
      };

      const testRecord2: AgentRecord = {
        type: 'full_compaction.complete',
        compactedCount: 5,
        summary: 'Second compaction',
        tokensAfter: 600,
      };

      fullCompaction.restoreRecord(testRecord1);
      fullCompaction.restoreRecord(testRecord2);

      // Verify both compaction records were restored
      // The complete method stores text snapshots, not the results
      expect(agent.fullCompaction.compactedHistory).toHaveLength(2);
      expect(agent.fullCompaction.compactedHistory[0]).toHaveProperty('text');
      expect(agent.fullCompaction.compactedHistory[1]).toHaveProperty('text');
      expect(typeof agent.fullCompaction.compactedHistory[0].text).toBe('string');
      expect(typeof agent.fullCompaction.compactedHistory[1].text).toBe('string');
    });
  });
});