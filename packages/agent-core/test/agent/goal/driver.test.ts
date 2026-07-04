import { describe, expect, it } from 'vitest';

import { GOAL_CONTINUATION_ORIGIN } from '../../../src/agent/goal/constants';
import { AgentTestContext, testAgent } from '../harness/agent';
import { createScriptedGenerate } from '../harness/scripted-generate';

/**
 * AC（#201 驱动）：driveGoal 续跑闭环。
 *
 * 用 testAgent harness mock LLM 返回纯文本（不调工具），验证：
 * - driver 在 turn 结束时读 goal 状态决定续跑/停止
 * - turnBudget 达上限 → markBlocked 停止
 * - Esc 中断 → cancelled → pauseOnInterrupt → paused
 * - continuation turn 进 wire，origin=goal_continuation
 *
 * complete 路径（markComplete 后 driver 边界 clear）依赖 UpdateGoal 工具（#202），
 * 本批用 turnBudget 作停止条件覆盖 driver 机制。
 */
describe('driveGoal (AC #201 驱动)', () => {
  function setup() {
    const ctx = testAgent();
    ctx.configure({ tools: [] });
    return ctx;
  }

  /**
   * 轮询 untilTurnEnd 直到 goal 离开 active（终态或 null），或达到 maxTurns 上限。
   * driver 在 turnWorker 内部连续跑 continuation turn，每个 emit turn.ended；
   * 外部 await rpc.prompt 后 driver 仍在后台，需循环等它落定。
   */
  async function untilGoalSettled(ctx: ReturnType<typeof testAgent>, maxTurns = 10): Promise<void> {
    for (let i = 0; i < maxTurns; i++) {
      const { agent } = ctx;
      const status = agent.goal.getSnapshot()?.status;
      if (status !== 'active') return;
      try {
        await ctx.untilTurnEnd();
      } catch (error) {
        // driver 已退出（无活跃 turn）——但若是其它异常需暴露，不能静默吞。
        if (error instanceof Error && /No active turn/i.test(error.message)) return;
        throw error;
      }
    }
  }

  function textResponse(text: string) {
    return { type: 'text' as const, text };
  }

  it('turnBudget reached → driver markBlocked and stops', async () => {
    const ctx = setup();
    const { agent } = ctx;
    // 创建带 turnBudget:2 的 goal
    agent.goal.createGoal('pursue this', { budget: { turnBudget: 2 } });
    // mock 3 轮纯文本响应（driver 应在第 2 轮后停止，第 3 轮不会发起）
    for (let i = 0; i < 6; i++) ctx.mockNextResponse(textResponse(`working ${i + 1}`));

    // 通过 rpc.prompt 发起首个 turn（origin=user），driver 接管续跑
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'pursue this' }] });
    await untilGoalSettled(ctx);

    // turnBudget 达上限 → markBlocked
    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('blocked');
    expect(snapshot?.blockedReason).toMatch(/budget/i);
  });

  it('Esc interrupt during driver → cancelled → goal paused', async () => {
    const ctx = setup();
    const { agent } = ctx;
    agent.goal.createGoal('pursue this', { budget: { turnBudget: 10 } });
    ctx.mockNextResponse(textResponse('working 1'));
    // 第 2 轮响应前中断
    ctx.mockNextResponse(textResponse('working 2'));

    void ctx.rpc.prompt({
      input: [{ type: 'text', text: 'pursue this' }],
    });
    // 等首轮结束
    await ctx.untilTurnEnd();
    // 中断（模拟 Esc）——cancel 当前 continuation turn
    agent.turn.cancel(agent.turn.currentId ?? 0);
    await untilGoalSettled(ctx);

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('paused');
  });

  it('continuation turns record turn.prompt with goal_continuation origin on wire', async () => {
    const ctx = setup();
    const { agent } = ctx;
    agent.goal.createGoal('pursue this', { budget: { turnBudget: 2 } });
    ctx.mockNextResponse(textResponse('working 1'));
    ctx.mockNextResponse(textResponse('working 2'));

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'pursue this' }] });
    await untilGoalSettled(ctx);

    // wire 上应有首个 user-origin turn.prompt + 至少一个 goal_continuation origin 的 turn.prompt/steer
    const turnPrompts = ctx.getRecords().filter((r) => r.type === 'turn.prompt');
    const origins = turnPrompts.map(
      (r) => (r as { origin: { kind: string; name?: string } }).origin,
    );
    // 首个是 user
    expect(origins[0]?.kind).toBe('user');
    // 后续有 goal_continuation
    const continuation = origins.find(
      (o) => o.kind === 'system_trigger' && o.name === 'goal_continuation',
    );
    expect(continuation).toBeDefined();
    // 确认常量一致
    expect(GOAL_CONTINUATION_ORIGIN).toEqual({
      kind: 'system_trigger',
      name: 'goal_continuation',
    });
  });

  // —— review fix P1：tokenBudget 维度生效（driver 每轮累加 turn token） ——

  it('tokenBudget reached → driver markBlocked (token dimension enforced)', async () => {
    const ctx = setup();
    const { agent } = ctx;
    // tokenBudget 设极小，首轮 mock 含足够 token 即应触发
    agent.goal.createGoal('pursue this', { budget: { tokenBudget: 1 } });
    for (let i = 0; i < 4; i++) ctx.mockNextResponse(textResponse(`working ${i + 1}`));

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'pursue this' }] });
    await untilGoalSettled(ctx);

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('blocked');
    expect(snapshot?.blockedReason).toMatch(/budget/i);
  });

  // —— review fix P3：无 budget 时 driver 走迭代上限兜底，不无限循环 ——

  it('no budget → driver stops at iteration cap (no infinite loop)', async () => {
    const ctx = setup();
    const { agent } = ctx;
    // 不设任何 budget
    agent.goal.createGoal('pursue this');
    // mock 足够多响应（兜底上限 50，mock 60 覆盖）
    for (let i = 0; i < 60; i++) ctx.mockNextResponse(textResponse(`working ${i + 1}`));

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'pursue this' }] });
    // untilGoalSettled 默认 maxTurns=10 不够，显式给大值
    await untilGoalSettled(ctx, 60);

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('blocked');
    expect(snapshot?.blockedReason).toMatch(/iteration limit/i);
  });

  // —— review fix Test Major#1：complete 路径 driver 边界 clear ——

  it('markComplete during driver → driver clears goal at boundary', async () => {
    // 用自定义 generate 包装 scripted：第 1 个响应（首个 user turn）纯文本；
    // 第 2 个响应（首个 continuation turn）返回前调 markComplete 模拟"模型完成"。
    // testAgent 的 generate 选项闭包捕获 agentRef，构造后赋值。
    let agentRef: ReturnType<typeof testAgent>['agent'] | undefined;
    const scripted = createScriptedGenerate();
    scripted.mockNextResponse(textResponse('working on it'));
    scripted.mockNextResponse(textResponse('all done'));
    let generateCallCount = 0;
    const ctx = new AgentTestContext({
      generate: (async (...args: Parameters<typeof scripted.generate>) => {
        generateCallCount += 1;
        // 第 2 次 generate（首个 continuation turn）返回前，模拟模型完成。
        if (generateCallCount === 2 && agentRef) {
          agentRef.goal.markComplete('objective met');
        }
        return scripted.generate(...args);
      }) as typeof scripted.generate,
    });
    ctx.configure({ tools: [] });
    agentRef = ctx.agent;
    const { agent } = ctx;

    agent.goal.createGoal('pursue this', { budget: { turnBudget: 10 } });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'pursue this' }] });
    await untilGoalSettled(ctx, 10);

    // driver 边界读到 complete 瞬态 → clearInternal → snapshot null
    expect(agent.goal.getSnapshot()).toBeNull();
    // wire 含 goal.clear record（driver 边界清空落盘）
    const records = ctx.getRecords();
    expect(records.some((r) => r.type === 'goal.clear')).toBe(true);
  });
});
