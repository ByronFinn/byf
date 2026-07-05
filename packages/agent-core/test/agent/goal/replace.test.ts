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
    // 旧 goal 已累积 turns=2, tokens=150
    expect(agent.goal.getSnapshot()?.usage).toEqual({ turns: 2, tokens: 150, wallClockMs: 0 });

    agent.goal.createGoal('second', { replace: true });
    expect(agent.goal.getSnapshot()?.usage).toEqual({ turns: 0, tokens: 0, wallClockMs: 0 });
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
