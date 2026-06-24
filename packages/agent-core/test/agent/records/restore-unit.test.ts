import { describe, expect, it, vi } from 'vitest';

import { AgentRecords, InMemoryAgentRecordPersistence } from '../../../src/agent/records';
import type { AgentRecord } from '../../../src/agent/records/types';
import type { RecordRestoreHandler } from '../../../src/agent/restore-handler';
import { testAgent } from '../harness/agent';

describe('AgentRecords.restore() unit tests', () => {
  describe('路由逻辑测试', () => {
    it('应该将context.*记录路由到context处理器', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let receivedRecord: AgentRecord | undefined;
      const mockContextHandler: RecordRestoreHandler = {
        restoreRecord: (record: AgentRecord) => {
          if (record.type.startsWith('context.')) {
            receivedRecord = record;
          }
        },
      };

      records.registerHandlers({ context: mockContextHandler });

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

    it('应该将config.*记录路由到config处理器', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let receivedRecord: AgentRecord | undefined;
      const mockConfigHandler: RecordRestoreHandler = {
        restoreRecord: (record: AgentRecord) => {
          if (record.type.startsWith('config.')) {
            receivedRecord = record;
          }
        },
      };

      records.registerHandlers({ config: mockConfigHandler });

      const testRecord: AgentRecord = {
        type: 'config.update',
        modelAlias: 'test-model',
      };

      records.restore(testRecord);

      expect(receivedRecord).toEqual(testRecord);
    });

    it('应该将full_compaction.*记录路由到fullCompaction处理器', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let receivedRecord: AgentRecord | undefined;
      const mockFullCompactionHandler: RecordRestoreHandler = {
        restoreRecord: (record: AgentRecord) => {
          if (record.type.startsWith('full_compaction.')) {
            receivedRecord = record;
          }
        },
      };

      records.registerHandlers({ fullCompaction: mockFullCompactionHandler });

      const testRecord: AgentRecord = {
        type: 'full_compaction.begin',
        turnId: 1,
        source: 'manual',
      } as unknown as AgentRecord;

      records.restore(testRecord);

      expect(receivedRecord).toEqual(testRecord);
    });
  });

  describe('静默跳过测试', () => {
    it('应该静默跳过未注册的记录类型', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let handlerCalled = false;
      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          handlerCalled = true;
        },
      };

      records.registerHandlers({ context: mockHandler });

      // 未注册的记录类型
      const unregisteredRecord: AgentRecord = {
        type: 'unregistered.type',
        data: 'test',
      } as unknown as AgentRecord;

      expect(() => {
        records.restore(unregisteredRecord);
      }).not.toThrow();

      expect(handlerCalled).toBe(false);
    });

    it('应该静默跳过metadata记录', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let handlerCalled = false;
      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          handlerCalled = true;
        },
      };

      records.registerHandlers({ context: mockHandler });

      const metadataRecord: AgentRecord = {
        type: 'metadata',
        protocol_version: '1.1',
        created_at: Date.now(),
      };

      expect(() => {
        records.restore(metadataRecord);
      }).not.toThrow();

      expect(handlerCalled).toBe(false);
    });

    it('应该静默跳过background.stop记录', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let handlerCalled = false;
      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          handlerCalled = true;
        },
      };

      records.registerHandlers({ context: mockHandler });

      const backgroundRecord: AgentRecord = {
        type: 'background.stop',
        taskId: 'test-task',
      } as unknown as AgentRecord;

      expect(() => {
        records.restore(backgroundRecord);
      }).not.toThrow();

      expect(handlerCalled).toBe(false);
    });
  });

  describe('错误处理测试', () => {
    it('应该让处理器错误传播到Agent.resume()处理', () => {
      const { agent } = testAgent();
      const records = agent.records;

      const mockError = new Error('Test restoration error');
      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          throw mockError;
        },
      };

      records.registerHandlers({ context: mockHandler });

      const testRecord: AgentRecord = {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'test' }],
          toolCalls: [],
        },
      };

      // restore()会传播错误，错误在Agent.resume()中被捕获
      expect(() => {
        records.restore(testRecord);
      }).toThrow('Test restoration error');
    });

    it('应该在第一个错误时停止处理', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let callCount = 0;
      const erroringHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          callCount++;
          throw new Error('Handler error');
        },
      };

      records.registerHandlers({ context: erroringHandler });

      const testRecord: AgentRecord = {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'test' }],
          toolCalls: [],
        },
      };

      expect(() => {
        records.restore(testRecord);
      }).toThrow('Handler error');

      expect(callCount).toBe(1); // 只调用了一次处理器
    });
  });

  describe('restoring标志测试', () => {
    it('应该在恢复期间设置restoring标志', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let restoringFlagDuringCall = false;
      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          restoringFlagDuringCall = records.restoring;
        },
      };

      records.registerHandlers({ context: mockHandler });

      const testRecord: AgentRecord = {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'test' }],
          toolCalls: [],
        },
      };

      records.restore(testRecord);

      expect(restoringFlagDuringCall).toBe(true);
    });

    it('应该在恢复后清除restoring标志', () => {
      const { agent } = testAgent();
      const records = agent.records;

      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {},
      };

      records.registerHandlers({ context: mockHandler });

      const testRecord: AgentRecord = {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'test' }],
          toolCalls: [],
        },
      };

      expect(records.restoring).toBe(false);

      records.restore(testRecord);

      expect(records.restoring).toBe(false);
    });
  });

  describe('命名不一致处理测试', () => {
    it('应该正确处理full_compaction到fullCompaction的映射', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let handlerKey: string | undefined;
      const mockHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          // 这个测试验证映射逻辑
          handlerKey = 'fullCompaction';
        },
      };

      records.registerHandlers({ fullCompaction: mockHandler });

      const testRecord: AgentRecord = {
        type: 'full_compaction.begin',
        turnId: 1,
      } as unknown as AgentRecord;

      records.restore(testRecord);

      expect(handlerKey).toBe('fullCompaction');
    });
  });

  describe('处理器覆盖测试', () => {
    it('应该允许覆盖已注册的处理器', () => {
      const { agent } = testAgent();
      const records = agent.records;

      let firstHandlerCalled = false;
      let secondHandlerCalled = false;

      const firstHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          firstHandlerCalled = true;
        },
      };

      const secondHandler: RecordRestoreHandler = {
        restoreRecord: (_record: AgentRecord) => {
          secondHandlerCalled = true;
        },
      };

      records.registerHandlers({ context: firstHandler });
      records.registerHandlers({ context: secondHandler });

      const testRecord: AgentRecord = {
        type: 'context.append_message',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'test' }],
          toolCalls: [],
        },
      };

      records.restore(testRecord);

      expect(firstHandlerCalled).toBe(false);
      expect(secondHandlerCalled).toBe(true);
    });
  });
});
