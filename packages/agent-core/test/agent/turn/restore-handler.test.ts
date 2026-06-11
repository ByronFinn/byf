import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import { testAgent } from '../harness/agent';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';

describe('TurnFlow restore handler', () => {
  describe('restoreRecord method', () => {
    it('should restore turn.prompt records', () => {
      const { agent } = testAgent();

      // Ensure turn implements RecordRestoreHandler
      const turn = agent.turn as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'test input' }],
        origin: { kind: 'user' },
      };

      expect(() => {
        turn.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the turn state was restored
      expect(agent.turn.currentId).toBe(0); // First turn has ID 0
      expect(agent.turn.hasActiveTurn).toBe(false); // Should be in 'resuming' state
    });

    it('should restore turn.steer records', () => {
      const { agent } = testAgent();

      const turn = agent.turn as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'turn.steer',
        input: [{ type: 'text', text: 'steer input' }],
        origin: { kind: 'user' },
      };

      expect(() => {
        turn.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the turn state was restored
      expect(agent.turn.currentId).toBe(0); // First turn has ID 0
    });

    it('should restore turn.cancel records', () => {
      const { agent } = testAgent();

      const turn = agent.turn as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'turn.cancel',
        turnId: 1,
      };

      expect(() => {
        turn.restoreRecord(testRecord);
      }).not.toThrow();

      // Cancel during restore should be a no-op since there's no active turn
      expect(agent.turn.hasActiveTurn).toBe(false);
    });

    it('should increment turnId for multiple turn.prompt records', () => {
      const { agent } = testAgent();

      const turn = agent.turn as unknown as RecordRestoreHandler;

      const promptRecord: AgentRecord = {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'first turn' }],
        origin: { kind: 'user' },
      };

      turn.restoreRecord(promptRecord);

      expect(agent.turn.currentId).toBe(0);

      // Second turn
      const promptRecord2: AgentRecord = {
        type: 'turn.prompt',
        input: [{ type: 'text', text: 'second turn' }],
        origin: { kind: 'user' },
      };

      turn.restoreRecord(promptRecord2);

      expect(agent.turn.currentId).toBe(1);
    });
  });
});