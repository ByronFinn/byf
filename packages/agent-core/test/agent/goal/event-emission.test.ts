import { describe, expect, it } from 'vitest';

import { makeGoalAgent } from './harness';

/**
 * AC-4：GoalUpdatedEvent——snapshot 变化必发，纯计步默认 silent，emitUsageUpdate 显式发。
 */
describe('GoalUpdatedEvent emission (AC-4)', () => {
  function goalUpdatedEvents(
    events: ReadonlyArray<Record<string, unknown>>,
  ): Array<{ snapshot: unknown; change?: unknown }> {
    return events
      .filter((e) => e['type'] === 'goal.updated')
      .map((e) => ({ snapshot: e['snapshot'], change: e['change'] }));
  }

  it('incrementTurn is silent by default (no extra goal.updated)', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const beforeCount = goalUpdatedEvents(emitted).length;
    agent.goal.incrementTurn();
    agent.goal.incrementTurn();

    expect(goalUpdatedEvents(emitted).length).toBe(beforeCount);
  });

  it('addTokenUsage is silent by default (no extra goal.updated)', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const beforeCount = goalUpdatedEvents(emitted).length;
    agent.goal.addTokenUsage({ input: 100, output: 50 });
    agent.goal.addTokenUsage({ input: 200, output: 30 });

    expect(goalUpdatedEvents(emitted).length).toBe(beforeCount);
  });

  it('emitUsageUpdate emits current snapshot without change', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.incrementTurn();
    agent.goal.addTokenUsage({ input: 100, output: 50 });
    const beforeCount = goalUpdatedEvents(emitted).length;

    agent.goal.emitUsageUpdate();

    const events = goalUpdatedEvents(emitted);
    expect(events.length).toBe(beforeCount + 1);
    const last = events.at(-1)!;
    // turns/tokens 是确定性计步，断言精确值；wallClockMs 在 active 期间由 emitUsageUpdate
    // 叠加 live wall-clock（getLiveWallClockMs），随真实时间增长，断言非负整数即可——
    // 断言 === 0 会因时钟分辨率 flake（修复 emitUsageUpdate 后该值不再恒为 0）。
    const usage = (
      last.snapshot as { usage: { turns: number; tokens: number; wallClockMs: number } }
    ).usage;
    expect(usage.turns).toBe(1);
    expect(usage.tokens).toBe(150);
    expect(Number.isInteger(usage.wallClockMs)).toBe(true);
    expect(usage.wallClockMs).toBeGreaterThanOrEqual(0);
    expect(last.change).toBeUndefined();
  });

  it('snapshot transitions (incl. cancel→null) always emit goal.updated', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.cancel();

    const statuses = goalUpdatedEvents(emitted).map((e) => {
      const snapshot = e.snapshot as { status?: string } | null;
      return snapshot === null ? 'null' : (snapshot.status ?? 'unknown');
    });
    // create 发 active，cancel 发 null——每次 snapshot 变化必发。
    expect(statuses).toEqual(['active', 'null']);
  });

  it('emitUsageUpdate is no-op when no goal', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.emitUsageUpdate();
    expect(goalUpdatedEvents(emitted)).toHaveLength(0);
  });

  // —— review fix (M2 A 方案)：计步 silent 写 record 不 emit ——

  it('incrementTurn is silent (no event) but writes goal.update record', () => {
    const { agent, emitted, persistence } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const eventsBefore = goalUpdatedEvents(emitted).length;
    agent.goal.incrementTurn();
    // 不 emit
    expect(goalUpdatedEvents(emitted).length).toBe(eventsBefore);
    // 但写 record
    const goalRecords = persistence.records.filter((r) => r.type.startsWith('goal.'));
    expect(goalRecords.at(-1)!.type).toBe('goal.update');
    expect(
      (goalRecords.at(-1) as { snapshot: { usage: { turns: number } } }).snapshot.usage.turns,
    ).toBe(1);
  });

  it('addTokenUsage is silent (no event) but writes goal.update record', () => {
    const { agent, emitted, persistence } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const eventsBefore = goalUpdatedEvents(emitted).length;
    agent.goal.addTokenUsage({ input: 100, output: 50 });
    // 不 emit
    expect(goalUpdatedEvents(emitted).length).toBe(eventsBefore);
    // 但写 record
    const goalRecords = persistence.records.filter((r) => r.type.startsWith('goal.'));
    expect(
      (goalRecords.at(-1) as { snapshot: { usage: { tokens: number } } }).snapshot.usage.tokens,
    ).toBe(150);
  });
});
