import { describe, expect, it } from 'vitest';

import type { AgentRecord } from '../../../src/agent/records/types';
import { testAgent } from '../harness/agent';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';

describe('ToolManager restore handler', () => {
  describe('restoreRecord method', () => {
    it('should restore tools.register_user_tool records', () => {
      const { agent } = testAgent();

      // Ensure tools implements RecordRestoreHandler
      const tools = agent.tools as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'tools.register_user_tool',
        name: 'test-tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      expect(() => {
        tools.restoreRecord(testRecord);
      }).not.toThrow();

      // Verify the tool was registered
      const data = agent.tools.data();
      expect(data.some(t => t.name === 'test-tool')).toBe(true);
    });

    it('should restore tools.unregister_user_tool records', () => {
      const { agent } = testAgent();

      // First register a tool
      const tools = agent.tools as unknown as RecordRestoreHandler;

      const registerRecord: AgentRecord = {
        type: 'tools.register_user_tool',
        name: 'temp-tool',
        description: 'A temporary tool',
        parameters: {
          type: 'object',
          properties: {},
        },
      };

      tools.restoreRecord(registerRecord);

      // Verify the tool was registered
      expect(agent.tools.data().some(t => t.name === 'temp-tool')).toBe(true);

      // Now unregister it
      const unregisterRecord: AgentRecord = {
        type: 'tools.unregister_user_tool',
        name: 'temp-tool',
      };

      tools.restoreRecord(unregisterRecord);

      // Verify the tool was unregistered
      expect(agent.tools.data().some(t => t.name === 'temp-tool')).toBe(false);
    });

    it('should restore tools.set_active_tools records', () => {
      const { agent } = testAgent();

      // Configure the agent with a provider first
      const ctx = testAgent();
      ctx.configure();

      const tools = ctx.agent.tools as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'tools.set_active_tools',
        names: ['Bash', 'Read', 'Write'],
      };

      tools.restoreRecord(testRecord);

      // Verify the active tools were set
      const data = ctx.agent.tools.data();
      expect(data.filter(t => t.active).map(t => t.name).sort()).toEqual(['Bash', 'Read', 'Write']);
    });

    it('should restore tools.update_store records', () => {
      const { agent } = testAgent();

      const tools = agent.tools as unknown as RecordRestoreHandler;

      const testRecord: AgentRecord = {
        type: 'tools.update_store',
        key: 'todo' as never,
        value: ['test-value'] as never,
      };

      tools.restoreRecord(testRecord);

      // Verify the store was updated
      const storeData = agent.tools.storeData();
      expect((storeData as Record<string, unknown>)['todo']).toEqual(['test-value']);
    });
  });
});