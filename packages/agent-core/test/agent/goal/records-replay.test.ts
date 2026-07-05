import { localKaos } from '@byfriends/kaos';
import { describe, expect, it, vi } from 'vitest';

import { Agent } from '../../../src/agent';
import type { GoalSnapshot } from '../../../src/agent/goal/types';
import { AGENT_WIRE_PROTOCOL_VERSION } from '../../../src/agent/records/migration';
import { InMemoryAgentRecordPersistence } from '../../../src/agent/records/persistence';
import type { AgentRecord } from '../../../src/agent/records/types';
import { ProviderManager } from '../../../src/providers/provider-manager';
import type { SDKAgentRPC } from '../../../src/rpc';
import type { Environment } from '../../../src/utils/environment';

const TEST_OS_ENV: Environment = {
  osKind: 'Linux',
  osArch: 'x86_64',
  osVersion: 'test',
  shellName: 'bash',
  shellPath: '/bin/bash',
};

const MOCK_PROVIDER = {
  type: 'openai-completions',
  apiKey: 'test-key',
  model: 'mock-model',
} as const;

function testProviderManager(): ProviderManager {
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
 * AC-2：goal records 经 replay 重建状态。
 *
 * 预填 goal.* records 到 InMemoryAgentRecordPersistence，调 records.replay()，
 * 验证 goal.getSnapshot() 反映 replay 重建的最终状态。
 */
describe('GoalMode records replay (AC-2)', () => {
  function makeAgentWithRecords(records: readonly AgentRecord[]): {
    agent: Agent;
    emitted: ReadonlyArray<Record<string, unknown>>;
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
    // 用 metadata + 给定 records 预填，模拟真实 wire。
    const persistence = new InMemoryAgentRecordPersistence([
      { type: 'metadata', protocol_version: AGENT_WIRE_PROTOCOL_VERSION, created_at: 1 },
      ...records,
    ] as readonly AgentRecord[]);
    const agent = new Agent({
      runtime: { kaos: localKaos, osEnv: TEST_OS_ENV },
      rpc,
      persistence,
      providerManager: testProviderManager(),
    });
    agent.config.update({ cwd: process.cwd(), modelAlias: MOCK_PROVIDER.model });
    return { agent, emitted };
  }

  function goalCreateRecord(objective: string, createdAt = 1000): AgentRecord {
    return { type: 'goal.create', objective, budget: { turnBudget: 5 }, createdAt };
  }

  function goalUpdateRecord(snapshot: GoalSnapshot): AgentRecord {
    return { type: 'goal.update', snapshot };
  }

  const baseSnapshot = (overrides: Partial<GoalSnapshot> = {}): GoalSnapshot => ({
    objective: 'obj',
    status: 'active',
    budget: { turnBudget: 5 },
    usage: { turns: 0, tokens: 0, wallClockMs: 0 },
    createdAt: 1000,
    ...overrides,
  });

  it('single goal.create rebuilds active goal', async () => {
    const { agent } = makeAgentWithRecords([goalCreateRecord('ship feature', 1234)]);
    await agent.records.replay();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('active');
    expect(snapshot?.objective).toBe('ship feature');
    expect(snapshot?.createdAt).toBe(1234);
    expect(snapshot?.budget.turnBudget).toBe(5);
    expect(snapshot?.usage).toEqual({ turns: 0, tokens: 0, wallClockMs: 0 });
  });

  it('goal.create + goal.update(paused) rebuilds paused goal', async () => {
    const { agent } = makeAgentWithRecords([
      goalCreateRecord('obj'),
      goalUpdateRecord(baseSnapshot({ status: 'paused', pausedReason: 'user paused' })),
    ]);
    await agent.records.replay();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('paused');
    expect(snapshot?.pausedReason).toBe('user paused');
  });

  it('goal.create + goal.update(blocked) rebuilds blocked goal with reason', async () => {
    const { agent } = makeAgentWithRecords([
      goalCreateRecord('obj'),
      goalUpdateRecord(baseSnapshot({ status: 'blocked', blockedReason: 'missing dep' })),
    ]);
    await agent.records.replay();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('blocked');
    expect(snapshot?.blockedReason).toBe('missing dep');
  });

  it('goal.create + goal.clear rebuilds to absent', async () => {
    const { agent } = makeAgentWithRecords([goalCreateRecord('obj'), { type: 'goal.clear' }]);
    await agent.records.replay();

    expect(agent.goal.getSnapshot()).toBeNull();
  });

  it('goal.create + goal.update(usage accumulated) preserves budget evolution', async () => {
    const { agent } = makeAgentWithRecords([
      goalCreateRecord('obj'),
      goalUpdateRecord(baseSnapshot({ usage: { turns: 3, tokens: 1500, wallClockMs: 12000 } })),
    ]);
    await agent.records.replay();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.usage).toEqual({ turns: 3, tokens: 1500, wallClockMs: 12000 });
  });

  it('full lifecycle: create → blocked → active → clear replays to absent', async () => {
    const { agent } = makeAgentWithRecords([
      goalCreateRecord('obj'),
      goalUpdateRecord(baseSnapshot({ status: 'blocked', blockedReason: 'r1' })),
      goalUpdateRecord(baseSnapshot({ status: 'active', blockedReason: undefined })),
      { type: 'goal.clear' },
    ]);
    await agent.records.replay();

    expect(agent.goal.getSnapshot()).toBeNull();
  });

  it('replay does not emit goal.updated events (restoring suppresses emit)', async () => {
    const { agent, emitted } = makeAgentWithRecords([
      goalCreateRecord('obj'),
      goalUpdateRecord(baseSnapshot({ status: 'paused' })),
      { type: 'goal.clear' },
    ]);
    await agent.records.replay();

    // replay 期间 records.restoring=true，emitEvent 应被抑制——不发任何 goal.updated。
    expect(emitted.filter((e) => e['type'] === 'goal.updated')).toHaveLength(0);
  });
});
