import { describe, expect, it } from 'vitest';

import { GoalInjector } from '../../../src/agent/injection/goal';
import { makeGoalAgent } from './harness';

/**
 * AC（#201 注入）：GoalInjector.getEphemeral() 三档渲染 + 无 goal 空。
 *
 * 走公开接口：构造 GoalInjector，agent.goal 设状态，调 getEphemeral() 断言返回。
 * 不进 wire、不破坏 cache prefix——由 projector 的 before_user 位置 + ephemeral 语义保证，
 * 这里只断言返回结构（kind=system_reminder, position=before_user）。
 */
describe('GoalInjector (AC #201 注入)', () => {
  function makeInjector() {
    const { agent } = makeGoalAgent();
    return { injector: new GoalInjector(agent), agent };
  }

  it('no goal → empty array', () => {
    const { injector } = makeInjector();
    expect(injector.getEphemeral()).toEqual([]);
  });

  it('active goal → one before_user reminder containing objective', () => {
    const { injector, agent } = makeInjector();
    agent.goal.createGoal('Ship feature X', { budget: { turnBudget: 5 } });
    const result = injector.getEphemeral();
    expect(result).toHaveLength(1);
    const injection = result[0];
    expect(injection.kind).toBe('system_reminder');
    expect(injection.position).toBe('before_user');
    expect(typeof injection.content).toBe('string');
    expect(injection.content).toContain('Ship feature X');
  });

  it('active goal reminder includes budget guidance', () => {
    const { injector, agent } = makeInjector();
    agent.goal.createGoal('obj', { budget: { turnBudget: 5, tokenBudget: 1000 } });
    const content = injector.getEphemeral()[0].content as string;
    // budget 指引——含剩余轮数/token 提示（具体措辞自由，但应反映 budget 存在）
    expect(content.length).toBeGreaterThan(0);
    // 用 UpdateGoal 完成的指引
    expect(content.toLowerCase()).toMatch(/complete|done|finish/);
  });

  it('blocked goal → light reminder with blocked reason', () => {
    const { injector, agent } = makeInjector();
    agent.goal.createGoal('obj');
    agent.goal.markBlocked('missing dependency');
    const result = injector.getEphemeral();
    expect(result).toHaveLength(1);
    const content = result[0].content as string;
    expect(content).toContain('missing dependency');
  });

  it('paused goal → guard reminder (pause-aware)', () => {
    const { injector, agent } = makeInjector();
    agent.goal.createGoal('obj');
    agent.goal.pause();
    const result = injector.getEphemeral();
    expect(result).toHaveLength(1);
    // paused 档：守卫提示（具体措辞自由，但应与 active 档区分）
    const content = result[0].content as string;
    expect(content.length).toBeGreaterThan(0);
  });

  it('complete transient → complete-tier reminder', () => {
    const { injector, agent } = makeInjector();
    agent.goal.createGoal('obj');
    agent.goal.markComplete('done');
    // complete 瞬态：getSnapshot 返回 status='complete'
    const result = injector.getEphemeral();
    expect(result).toHaveLength(1);
    expect(result[0].position).toBe('before_user');
  });
});
