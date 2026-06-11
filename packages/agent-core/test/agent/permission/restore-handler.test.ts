import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import { testAgent } from '../harness/agent';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';

describe('PermissionManager restore handler', () => {
  describe('restoreRecord method', () => {
    it('should restore permission.set_mode records', () => {
      const { agent } = testAgent();

      // Ensure permission implements RecordRestoreHandler
      const permission = agent.permission as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'permission.set_mode',
        mode: 'yolo',
      };

      expect(() => {
        permission.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the mode was restored
      expect(agent.permission.mode).toBe('yolo');
    });

    it('should restore permission.record_approval_result records', () => {
      const { agent } = testAgent();

      const permission = agent.permission as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'permission.record_approval_result',
        action: 'Bash',
        toolName: 'Bash',
        result: {
          decision: 'approved',
          scope: 'session',
          selectedLabel: 'approve',
        },
      };

      expect(() => {
        permission.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the approval result was processed
      const data = agent.permission.data();
      expect(data.mode).toBe('manual'); // Default mode
      expect(data.rules).toHaveLength(1); // Should have added a rule
      expect(data.rules[0]).toMatchObject({
        decision: 'allow',
        scope: 'session-runtime',
        pattern: 'Bash',
      });
    });

    it('should not add duplicate rules for the same action', () => {
      const { agent } = testAgent();

      const permission = agent.permission as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'permission.record_approval_result',
        action: 'Bash',
        toolName: 'Bash',
        result: {
          decision: 'approved',
          scope: 'session',
          selectedLabel: 'approve',
        },
      };

      permission.restoreRecord(testRecord);
      permission.restoreRecord(testRecord); // Same record again

      // Verify only one rule was added
      const data = agent.permission.data();
      expect(data.rules).toHaveLength(1);
    });

    it('should only add rules for approved session-scoped results', () => {
      const { agent } = testAgent();

      const permission = agent.permission as unknown as RecordRestoreHandler;

      // Rejected result should not add a rule
      const rejectedRecord: AgentRecord = {
        type: 'permission.record_approval_result',
        action: 'Bash',
        toolName: 'Bash',
        result: {
          decision: 'rejected',
          scope: 'session',
          selectedLabel: 'reject',
        },
      };

      permission.restoreRecord(rejectedRecord);

      const data = agent.permission.data();
      expect(data.rules).toHaveLength(0); // No rule added for rejected
    });
  });
});