import { describe, expect, it } from 'vitest';

import type { InMemoryAgentRecordPersistence } from '../../../src/agent/records/persistence';
import { ByfError, ErrorCodes } from '../../../src/errors';
import { goalEmittedStatuses, makeGoalAgent } from './harness';

/**
 * AC-1：GoalMode 状态机迁移——合法路径 + 非法报错。
 *
 * 测试通过公开接口（agent.goal.*）驱动状态机，断言三件事：
 * 1. getSnapshot() 返回正确状态。
 * 2. emitEvent 被以正确的 goal.updated 事件调用。
 * 3. wire 上记录了正确的 goal.* record 序列。
 */
describe('GoalMode state machine (AC-1)', () => {
  /** 断言 fn 抛 ByfError 且 code 匹配（不锁 message 文本，留给实现自由度）。 */
  function expectByfError(
    fn: () => void,
    code: (typeof ErrorCodes)[keyof typeof ErrorCodes],
  ): void {
    expect(fn).toThrow(ByfError);
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(ByfError);
      expect((error as ByfError).code).toBe(code);
    }
  }

  /** 从 persistence 提取 goal.* record 的 type 序列。 */
  function goalRecordTypes(p: InMemoryAgentRecordPersistence): string[] {
    return p.records.filter((r) => r.type.startsWith('goal.')).map((r) => r.type);
  }

  // —— 合法迁移 ——（场景 1-7）

  it('absent → active (createGoal)', () => {
    const { agent, emitted, persistence } = makeGoalAgent();
    agent.goal.createGoal('Ship feature X');

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('active');
    expect(snapshot?.objective).toBe('Ship feature X');
    expect(goalEmittedStatuses(emitted)).toEqual(['active']);
    expect(goalRecordTypes(persistence)).toEqual(['goal.create']);
  });

  it('active → paused (pause)', () => {
    const { agent, emitted, persistence } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.pause();

    expect(agent.goal.getSnapshot()?.status).toBe('paused');
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'paused']);
    expect(goalRecordTypes(persistence).filter((t) => t !== 'goal.create')).toContain(
      'goal.update',
    );
  });

  it('active → blocked (markBlocked)', () => {
    const { agent, emitted, persistence } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.markBlocked('missing dependency');

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('blocked');
    expect(snapshot?.blockedReason).toBe('missing dependency');
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'blocked']);
    expect(
      emitted.some((e) => (e as { change?: { kind?: string } }).change?.kind === 'blocked'),
    ).toBe(true);
    expect(goalRecordTypes(persistence)).toContain('goal.update');
  });

  it('paused → active (resume)', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.pause();
    agent.goal.resume();

    expect(agent.goal.getSnapshot()?.status).toBe('active');
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'paused', 'active']);
  });

  it('blocked → active (resume)', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.markBlocked('reason');
    agent.goal.resume();

    expect(agent.goal.getSnapshot()?.status).toBe('active');
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'blocked', 'active']);
  });

  it('active → complete (瞬态) → absent (clearInternal)', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.markComplete('done');
    // complete 是瞬态：snapshot 仍可读为 complete，completion change 已发
    expect(
      emitted.some((e) => (e as { change?: { kind?: string } }).change?.kind === 'completion'),
    ).toBe(true);
    // driver 在 turn 边界调 clearInternal → absent
    agent.goal.clearInternal();

    expect(agent.goal.getSnapshot()).toBeNull();
    // 事件序列：active → complete → null
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'complete', 'null']);
  });

  it('active → absent (cancel)', () => {
    const { agent, emitted, persistence } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.cancel();

    expect(agent.goal.getSnapshot()).toBeNull();
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'null']);
    expect(goalRecordTypes(persistence)).toContain('goal.clear');
  });

  // —— 非法迁移报错 ——（场景 8-15）

  it('createGoal on existing goal throws GOAL_ALREADY_EXISTS', () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('first');
    expectByfError(() => agent.goal.createGoal('second'), ErrorCodes.GOAL_ALREADY_EXISTS);
  });

  it('createGoal with replace:true overwrites; wire = goal.clear → goal.create; no completion event', () => {
    const { agent, emitted, persistence } = makeGoalAgent();
    agent.goal.createGoal('first');
    agent.goal.createGoal('second', { replace: true });

    expect(agent.goal.getSnapshot()?.objective).toBe('second');
    // 旧 goal 不发 completion 事件——emitted 中不应有 completion change
    expect(
      emitted.some((e) => (e as { change?: { kind?: string } }).change?.kind === 'completion'),
    ).toBe(false);
    // wire 序列：create → clear → create
    expect(goalRecordTypes(persistence)).toEqual(['goal.create', 'goal.clear', 'goal.create']);
  });

  it('resume with no goal throws GOAL_NOT_FOUND', () => {
    const { agent } = makeGoalAgent();
    expectByfError(() => agent.goal.resume(), ErrorCodes.GOAL_NOT_FOUND);
  });

  it('resume on active goal throws GOAL_NOT_RESUMABLE', () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    expectByfError(() => agent.goal.resume(), ErrorCodes.GOAL_NOT_RESUMABLE);
  });

  it('pause with no goal throws GOAL_NOT_FOUND', () => {
    const { agent } = makeGoalAgent();
    expectByfError(() => agent.goal.pause(), ErrorCodes.GOAL_NOT_FOUND);
  });

  it('cancel with no goal throws GOAL_NOT_FOUND', () => {
    const { agent } = makeGoalAgent();
    expectByfError(() => agent.goal.cancel(), ErrorCodes.GOAL_NOT_FOUND);
  });

  it('createGoal with empty objective throws GOAL_OBJECTIVE_EMPTY', () => {
    const { agent } = makeGoalAgent();
    expectByfError(() => agent.goal.createGoal('   '), ErrorCodes.GOAL_OBJECTIVE_EMPTY);
  });

  it('createGoal with too-long objective throws GOAL_OBJECTIVE_TOO_LONG', () => {
    const { agent } = makeGoalAgent();
    expectByfError(
      () => agent.goal.createGoal('x'.repeat(4001)),
      ErrorCodes.GOAL_OBJECTIVE_TOO_LONG,
    );
  });

  // —— review fix：补 BUDGET_INVALID / STATUS_INVALID / markPaused ——

  it('createGoal with negative turnBudget throws GOAL_BUDGET_INVALID', () => {
    const { agent } = makeGoalAgent();
    expectByfError(
      () => agent.goal.createGoal('obj', { budget: { turnBudget: -1 } }),
      ErrorCodes.GOAL_BUDGET_INVALID,
    );
  });

  it('createGoal with non-integer tokenBudget throws GOAL_BUDGET_INVALID', () => {
    const { agent } = makeGoalAgent();
    expectByfError(
      () => agent.goal.createGoal('obj', { budget: { tokenBudget: 1.5 } }),
      ErrorCodes.GOAL_BUDGET_INVALID,
    );
  });

  it('createGoal with zero wallClockBudgetMs throws GOAL_BUDGET_INVALID', () => {
    const { agent } = makeGoalAgent();
    expectByfError(
      () => agent.goal.createGoal('obj', { budget: { wallClockBudgetMs: 0 } }),
      ErrorCodes.GOAL_BUDGET_INVALID,
    );
  });

  it('createGoal with valid budget succeeds', () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj', {
      budget: { turnBudget: 5, tokenBudget: 1000, wallClockBudgetMs: 60000 },
    });
    expect(agent.goal.getSnapshot()?.budget).toEqual({
      turnBudget: 5,
      tokenBudget: 1000,
      wallClockBudgetMs: 60000,
    });
  });

  it('markComplete on paused goal throws GOAL_STATUS_INVALID', () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.pause();
    expectByfError(() => agent.goal.markComplete(), ErrorCodes.GOAL_STATUS_INVALID);
  });

  it('markComplete on blocked goal throws GOAL_STATUS_INVALID', () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.markBlocked('reason');
    expectByfError(() => agent.goal.markComplete(), ErrorCodes.GOAL_STATUS_INVALID);
  });

  it('markPaused sets paused with given reason (driver interrupt path)', () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.markPaused('paused after interrupt');
    expect(agent.goal.getSnapshot()?.status).toBe('paused');
    expect(agent.goal.getSnapshot()?.pausedReason).toBe('paused after interrupt');
    expect(goalEmittedStatuses(emitted)).toEqual(['active', 'paused']);
  });
});
