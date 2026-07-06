import { localKaos } from '@byfriends/kaos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Agent } from '../../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../../src/agent/records/persistence';
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
 * AC-5：wall-clock budget——锚点、折叠、累积保留、liveWallClockMs、超限判断。
 * 用 fake timers 控制 Date.now()。
 */
describe('GoalMode wall-clock budget (AC-5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeGoalAgent(): Agent {
    const rpc = {
      emitEvent: vi.fn(),
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
    return agent;
  }

  it('active goal: getLiveWallClockMs grows as time advances', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj');
    expect(agent.goal.getLiveWallClockMs()).toBe(0);

    vi.setSystemTime(new Date('2026-01-01T00:00:05Z').getTime()); // +5s
    expect(agent.goal.getLiveWallClockMs()).toBe(5000);

    vi.setSystemTime(new Date('2026-01-01T00:00:10Z').getTime()); // +10s
    expect(agent.goal.getLiveWallClockMs()).toBe(10000);
  });

  it('pause folds elapsed into wallClockMs; liveWallClockMs stops growing while paused', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj');
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z').getTime()); // +5s active
    agent.goal.pause();

    // pause 折叠：snapshot.usage.wallClockMs = 5000
    expect(agent.goal.getSnapshot()?.usage.wallClockMs).toBe(5000);
    // paused 期间 live 不再增长
    vi.setSystemTime(new Date('2026-01-01T00:00:20Z').getTime()); // +15s more
    expect(agent.goal.getLiveWallClockMs()).toBe(5000);
  });

  it('resume re-anchors; liveWallClockMs = accumulated + new interval', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj');
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z').getTime()); // +5s
    agent.goal.pause();
    vi.setSystemTime(new Date('2026-01-01T00:00:20Z').getTime()); // paused 15s
    agent.goal.resume();
    // resume 时锚定，live = 5000（累积）+ 0（刚锚定）
    expect(agent.goal.getLiveWallClockMs()).toBe(5000);

    vi.setSystemTime(new Date('2026-01-01T00:00:23Z').getTime()); // +3s in new active interval
    expect(agent.goal.getLiveWallClockMs()).toBe(8000);
  });

  it('normalizeAfterReplay clears anchor but preserves accumulated wallClockMs', async () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj');
    vi.setSystemTime(new Date('2026-01-01T00:00:07Z').getTime()); // +7s active
    agent.goal.pause(); // wallClockMs 折叠为 7000

    // 模拟 replay：手动调 normalizeAfterReplay（AC-6 会自动调，这里直接测 wall-clock 效果）。
    // paused 状态下 wallClockMs 已是 7000。
    expect(agent.goal.getSnapshot()?.usage.wallClockMs).toBe(7000);
    agent.goal.normalizeAfterReplay();
    // 累积值保留
    expect(agent.goal.getSnapshot()?.usage.wallClockMs).toBe(7000);
  });

  it('computeBudgetReport: wallClockBudgetMs exceeded → overBudget with wallClockMs dimension', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj', { budget: { wallClockBudgetMs: 5000 } });
    vi.setSystemTime(new Date('2026-01-01T00:00:06Z').getTime()); // +6s > 5s budget

    const report = agent.goal.computeBudgetReport();
    expect(report.overBudget).toBe(true);
    expect(report.exceededDimensions).toContain('wallClockMs');
  });

  it('computeBudgetReport uses live wall-clock mid-turn (before fold)', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj', { budget: { wallClockBudgetMs: 3000 } });
    // 还在 active、未 pause（未折叠）。computeBudgetReport 应基于 live 值判断。
    vi.setSystemTime(new Date('2026-01-01T00:00:04Z').getTime()); // +4s > 3s

    const report = agent.goal.computeBudgetReport();
    expect(report.overBudget).toBe(true);
  });

  // —— 回归点：/goal status、GetGoal 工具等"按需读取"路径走 getSnapshot()，
  //    active 期间也必须读到 live wall-clock，否则 elapsed 恒显示 0s（与 footer
  //    本地外推的 173s 不一致）。修复前 getSnapshot 原样返回 this.snapshot，其
  //    usage.wallClockMs 在 active 期间恒为 0（只在离开 active 时折叠）。

  it('getSnapshot overlays live wall-clock while active (status path reads real elapsed)', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj');
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z').getTime()); // +5s active

    const snapshot = agent.goal.getSnapshot();
    // 按需读取方（/goal status、GetGoal）应看到 5s，而非 0。
    expect(snapshot?.usage.wallClockMs).toBe(5000);
    expect(snapshot?.status).toBe('active');
  });

  it('getSnapshot overlay tracks time as it advances while active', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj');
    vi.setSystemTime(new Date('2026-01-01T00:00:03Z').getTime()); // +3s
    expect(agent.goal.getSnapshot()?.usage.wallClockMs).toBe(3000);

    vi.setSystemTime(new Date('2026-01-01T00:00:10Z').getTime()); // +10s
    expect(agent.goal.getSnapshot()?.usage.wallClockMs).toBe(10000);
  });

  it('getSnapshot preserves folded value after pause (no double-count on resume)', () => {
    const agent = makeGoalAgent();
    agent.goal.createGoal('obj');
    vi.setSystemTime(new Date('2026-01-01T00:00:05Z').getTime()); // +5s active
    agent.goal.pause(); // 折叠：wallClockMs = 5000

    // paused 期间不再 overlay，getSnapshot 返回折叠后的定值。
    vi.setSystemTime(new Date('2026-01-01T00:00:20Z').getTime()); // +15s paused
    expect(agent.goal.getSnapshot()?.usage.wallClockMs).toBe(5000);
    expect(agent.goal.getSnapshot()?.status).toBe('paused');
  });
});
