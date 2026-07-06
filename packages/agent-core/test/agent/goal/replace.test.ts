import { describe, expect, it } from 'vitest';

import { goalEmittedStatuses, makeGoalAgent } from './harness';

/**
 * AC-3：replace 序列 = 原子 cancel 旧 + create 新。
 *
 * wire 序列 goal.clear → goal.create（AC-1 已覆盖），这里测增量：
 * emitted 事件序列、新 budget 生效、新 goal usage 归零（隔离）、无 completion change。
 */
describe('GoalMode replace (AC-3)', () => {
  it('replace emits active → null → active event sequence; final objective is new', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('first');
    agent.goal.createGoal('second', { replace: true });

    expect(agent.goal.getSnapshot()?.objective).toBe('second');
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'null', 'active']);
  });

  it('replace with new budget applies the new budget (old budget discarded)', () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('first', { budget: { turnBudget: 5 } });
    agent.goal.createGoal('second', { budget: { turnBudget: 10 }, replace: true });

    expect(agent.goal.getSnapshot()?.budget.turnBudget).toBe(10);
  });

  it('replace resets usage to zero (old goal accumulated usage not carried over)', () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('first');
    agent.goal.incrementTurn();
    agent.goal.incrementTurn();
    agent.goal.addTokenUsage({ input: 100, output: 50 });
    // 旧 goal 已累积 turns=2, tokens=150（wallClockMs 是 active 期间 overlay 的 live
    // 值，非累积计数，本断言只关增量计数隔离，不锁 live 时长）。
    const oldUsage = agent.goal.getSnapshot()?.usage;
    expect(oldUsage?.turns).toBe(2);
    expect(oldUsage?.tokens).toBe(150);

    agent.goal.createGoal('second', { replace: true });
    // 新 goal 增量计数归零（隔离）。wallClockMs 同为 0：新 goal 刚 create，锚点 = now，
    // live = accumulated(0) + (now - now) = 0。
    const newUsage = agent.goal.getSnapshot()?.usage;
    expect(newUsage?.turns).toBe(0);
    expect(newUsage?.tokens).toBe(0);
    expect(newUsage?.wallClockMs).toBe(0);
  });

  it('replace does not emit completion change for the old goal', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('first');
    agent.goal.createGoal('second', { replace: true });

    const hasCompletion = emitted.some(
      (e) => (e as { change?: { kind?: string } }).change?.kind === 'completion',
    );
    expect(hasCompletion).toBe(false);
  });
});
