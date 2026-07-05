import { localKaos } from '@byfriends/kaos';
import { vi } from 'vitest';

import { Agent } from '../../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../../src/agent/records/persistence';
import { ProviderManager } from '../../../src/providers/provider-manager';
import type { SDKAgentRPC } from '../../../src/rpc';
import type { Environment } from '../../../src/utils/environment';

export const TEST_OS_ENV: Environment = {
  osKind: 'Linux',
  osArch: 'x86_64',
  osVersion: 'test',
  shellName: 'bash',
  shellPath: '/bin/bash',
};

export const MOCK_PROVIDER = {
  type: 'openai-completions',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

export function testProviderManager(): ProviderManager {
  return new ProviderManager({
    config: {
      providers: { test: { type: MOCK_PROVIDER.type, apiKey: MOCK_PROVIDER.apiKey } },
      models: {
        [MOCK_PROVIDER.model]: {
          provider: 'test',
          model: MOCK_PROVIDER.model,
          maxContextSize: 1_000_000,
        },
      },
    },
  });
}

/**
 * 构造一个最小可用的 goal 测试 Agent。
 * emitEvent 被 spy，返回 emitted 数组供断言。
 */
export function makeGoalAgent(): {
  agent: Agent;
  emitted: ReadonlyArray<Record<string, unknown>>;
  persistence: InMemoryAgentRecordPersistence;
} {
  const emitted: Array<Record<string, unknown>> = [];
  const rpc = {
    emitEvent: vi.fn((event: Record<string, unknown>) => {
      emitted.push(event);
    }),
    requestApproval: vi.fn(),
    requestQuestion: vi.fn(),
    toolCall: vi.fn(),
  } as unknown as SDKAgentRPC;
  const persistence = new InMemoryAgentRecordPersistence();
  const agent = new Agent({
    runtime: { kaos: localKaos, osEnv: TEST_OS_ENV },
    rpc,
    persistence,
    providerManager: testProviderManager(),
  });
  agent.config.update({ cwd: process.cwd(), modelAlias: MOCK_PROVIDER.model });
  return { agent, emitted, persistence };
}

/** 从 emitted 提取 goal.updated 事件的 snapshot.status 序列（null 记作 'null'）。 */
export function goalEmittedStatuses(events: ReadonlyArray<Record<string, unknown>>): string[] {
  return events
    .filter((e) => e['type'] === 'goal.updated')
    .map((e) => {
      const snapshot = e['snapshot'] as { status?: string } | null;
      return snapshot === null ? 'null' : (snapshot.status ?? 'unknown');
    });
}
