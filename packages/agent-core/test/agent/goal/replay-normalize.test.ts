import { localKaos } from '@byfriends/kaos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
 * AC-6：进程重启（Agent.resume）后 goal 降级。
 * active → paused（reason `Paused after agent resume`）；paused/blocked 保留；
 * absent 保留；预算累积计数保留；wall-clock 锚点清零。
 */
describe('GoalMode replay normalization (AC-6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeResumedAgent(records: readonly AgentRecord[]): Agent {
    const rpc = {
      emitEvent: vi.fn(),
      requestApproval: vi.fn(),
      requestQuestion: vi.fn(),
      toolCall: vi.fn(),
    } as unknown as SDKAgentRPC;
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
    return agent;
  }

  const baseSnapshot = (overrides: Partial<GoalSnapshot> = {}): GoalSnapshot => ({
    objective: 'obj',
    status: 'active',
    budget: { turnBudget: 5 },
    usage: { turns: 2, tokens: 500, wallClockMs: 4000 },
    createdAt: 1000,
    ...overrides,
  });

  it('active goal degrades to paused with resume reason', async () => {
    const agent = makeResumedAgent([
      { type: 'goal.create', objective: 'obj', budget: { turnBudget: 5 }, createdAt: 1000 },
      { type: 'goal.update', snapshot: baseSnapshot({ status: 'active' }) },
    ]);
    await agent.resume();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('paused');
    expect(snapshot?.pausedReason).toBe('Paused after agent resume');
    expect(snapshot?.objective).toBe('obj');
  });

  it('paused goal is preserved (no re-degradation)', async () => {
    const agent = makeResumedAgent([
      { type: 'goal.create', objective: 'obj', budget: {}, createdAt: 1000 },
      {
        type: 'goal.update',
        snapshot: baseSnapshot({ status: 'paused', pausedReason: 'user paused' }),
      },
    ]);
    await agent.resume();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('paused');
    expect(snapshot?.pausedReason).toBe('user paused');
  });

  it('blocked goal is preserved', async () => {
    const agent = makeResumedAgent([
      { type: 'goal.create', objective: 'obj', budget: {}, createdAt: 1000 },
      {
        type: 'goal.update',
        snapshot: baseSnapshot({ status: 'blocked', blockedReason: 'dep missing' }),
      },
    ]);
    await agent.resume();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('blocked');
    expect(snapshot?.blockedReason).toBe('dep missing');
  });

  it('absent goal stays absent', async () => {
    const agent = makeResumedAgent([
      { type: 'goal.create', objective: 'obj', budget: {}, createdAt: 1000 },
      { type: 'goal.clear' },
    ]);
    await agent.resume();

    expect(agent.goal.getSnapshot()).toBeNull();
  });

  it('budget counts (turns/tokens/wallClockMs) are preserved after resume', async () => {
    const agent = makeResumedAgent([
      { type: 'goal.create', objective: 'obj', budget: {}, createdAt: 1000 },
      {
        type: 'goal.update',
        snapshot: baseSnapshot({
          status: 'active',
          usage: { turns: 7, tokens: 2300, wallClockMs: 9000 },
        }),
      },
    ]);
    await agent.resume();

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.usage).toEqual({ turns: 7, tokens: 2300, wallClockMs: 9000 });
  });

  it('wall-clock anchor cleared: liveWallClockMs does not grow after resume', async () => {
    const agent = makeResumedAgent([
      { type: 'goal.create', objective: 'obj', budget: {}, createdAt: 1000 },
      {
        type: 'goal.update',
        snapshot: baseSnapshot({
          status: 'active',
          usage: { turns: 1, tokens: 100, wallClockMs: 4000 },
        }),
      },
    ]);
    await agent.resume();

    // 降级为 paused，wallClockMs 保留 4000
    expect(agent.goal.getSnapshot()?.usage.wallClockMs).toBe(4000);
    const liveAtResume = agent.goal.getLiveWallClockMs();
    // 推进时间，live 不应增长（锚点已清零 + paused 不计时）
    vi.setSystemTime(new Date('2026-01-01T00:01:00Z').getTime());
    expect(agent.goal.getLiveWallClockMs()).toBe(liveAtResume);
  });
});
