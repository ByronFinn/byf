import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';
import { testAgent } from '../harness/agent';

describe('ConfigState restore handler', () => {
  describe('restoreRecord method', () => {
    it('should restore config.update records', () => {
      const { agent } = testAgent();

      // Ensure config implements RecordRestoreHandler
      const config = agent.config as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'config.update',
        cwd: '/test/path',
        modelAlias: 'test-model',
        systemPrompt: 'You are a test agent',
        thinkingLevel: 'high',
      };

      expect(() => {
        config.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the config was restored
      expect(agent.config.cwd).toBe('/test/path');
      expect(agent.config.modelAlias).toBe('test-model');
      expect(agent.config.systemPrompt).toBe('You are a test agent');
      expect(agent.config.thinkingLevel).toBe('high');
    });

    it('should restore config with partial data', () => {
      const { agent } = testAgent();

      const config = agent.config as unknown as RecordRestoreHandler;

      const partialRecord: AgentRecord = {
        type: 'config.update',
        systemPrompt: 'Updated prompt',
      };

      config.restoreRecord(partialRecord);

      // Verify only the specified field was updated
      expect(agent.config.systemPrompt).toBe('Updated prompt');
      expect(agent.config.cwd).toBe('');
      expect(agent.config.modelAlias).toBeUndefined();
    });
  });
});
