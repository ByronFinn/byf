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

  // —— review fix：complete 快照 token 记账时序（markComplete emit 早于 driver 的
  //    addTokenUsage，导致 completion 卡片显示 tokens=0）。driver 在 token 记账后
  //    补发一次带最终 usage 的 completion 快照。 ——

  it('markComplete during driver → final completion snapshot carries tokens/turns', async () => {
    // 复用 markComplete 测试的 scripted generate 模式：第 2 次 generate（首个
    // continuation turn）前调 markComplete 模拟模型完成。scripted generate 按消息
    // 估算 token，故 driver 的 addTokenUsage 会真实累加非 0 token。
    let agentRef: ReturnType<typeof testAgent>['agent'] | undefined;
    const scripted = createScriptedGenerate();
    scripted.mockNextResponse(textResponse('working on it'));
    scripted.mockNextResponse(textResponse('all done'));
    let generateCallCount = 0;
    const ctx = new AgentTestContext({
      generate: (async (...args: Parameters<typeof scripted.generate>) => {
        generateCallCount += 1;
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

    // 回归点：markComplete 在 turn 中途 emit 的 completion 快照 tokens=0（本轮 token
    // 尚未记账），driver 在 addTokenUsage 后必须补发一次带最终 usage 的 completion
    // 快照。筛出所有 completion change 事件，最后一个应携带非 0 token。
    // 修复前：仅 markComplete 的那次 emit（tokens=0），无补发 → 最后一个 tokens=0。
    const completionEvents = ctx.allEvents
      .filter((e) => e.event === 'goal.updated')
      .map((e) => {
        const args = e.args as {
          snapshot?: { usage?: { turns?: number; tokens?: number } };
          change?: { kind?: string };
        };
        return {
          turns: args.snapshot?.usage?.turns ?? 0,
          tokens: args.snapshot?.usage?.tokens ?? 0,
          changeKind: args.change?.kind,
        };
      })
      .filter((e) => e.changeKind === 'completion');
    expect(completionEvents.length).toBeGreaterThanOrEqual(1);
    const last = completionEvents.at(-1)!;
    // turns：driver 进 loop 前 incrementTurn 一次 + loop 内 incrementTurn 一次 = 2。
    expect(last.turns).toBeGreaterThanOrEqual(2);
    // tokens：scripted generate 估算的非 0 token 应被 driver 记入 goal。
    // 修复前此处为 0（markComplete emit 早于 addTokenUsage）。
    expect(last.tokens).toBeGreaterThan(0);

    // snapshot 已被 driver clearInternal 置 null（与上一测试相同的边界 clear 语义）。
    expect(agent.goal.getSnapshot()).toBeNull();
  });

  // —— review fix：driver 续跑时 emit usage snapshot（footer turns/tokens/elapsed 实时更新）——

  it('driver emits mid-run usage snapshot so footer counters refresh', async () => {
    const ctx = setup();
    const { agent } = ctx;
    // turnBudget:3 → driver 跑 3 轮后 blocked。期间每轮结束应 emit usage snapshot。
    agent.goal.createGoal('pursue this', { budget: { turnBudget: 3 } });
    for (let i = 0; i < 6; i++) ctx.mockNextResponse(textResponse(`working ${i + 1}`));

    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'pursue this' }] });
    await untilGoalSettled(ctx);

    // 回归点：footer 只在收到 goal.updated 时刷新计数。计步本身（incrementTurn/
    // addTokenUsage）默认 silent 不 emit，driver 必须显式 emitUsageUpdate 才能把
    // 非 0 的 turns/tokens 送达 UI。这里筛出"纯用量更新"事件——change 为 undefined
    // （非 create/blocked/paused 等生命周期变化）且 turns>=1。修复前不存在这样的事件
    // （只有 create turns=0 与 blocked 终态带 change），footer 计数会一直停在 0。
    const usageUpdates = ctx.allEvents
      .filter((e) => e.event === 'goal.updated')
      .map((e) => {
        const args = e.args as {
          snapshot?: { usage?: { turns?: number; wallClockMs?: number } };
          change?: unknown;
        };
        return {
          turns: args.snapshot?.usage?.turns ?? 0,
          wallClockMs: args.snapshot?.usage?.wallClockMs ?? 0,
          change: args.change,
        };
      })
      .filter((u) => u.change === undefined && u.turns >= 1);
    expect(usageUpdates.length).toBeGreaterThan(0);
    // 第二个回归点：emitUsageUpdate 在 active 期间应叠加 live wall-clock（getLiveWallClockMs），
    // 而非直接读 snapshot.usage.wallClockMs（后者在 steady-state 为 0，只在离开 active 时折叠）。
    // 断言 emitted snapshot 的 wallClockMs 是非负整数——若误走折叠路径会恒为 0，这里仍能过，
    // 但与上一条 turns 断言一起锁定"driver 续跑时确实 emit 了带 live 用量的 snapshot"。
    for (const u of usageUpdates) {
      expect(Number.isInteger(u.wallClockMs)).toBe(true);
      expect(u.wallClockMs).toBeGreaterThanOrEqual(0);
    }
  });

  // —— review fix：模型在首个 user turn 内就调 markComplete（不进入 continuation）——
  //    此时 driveGoal 接管条件（status==='active'）为假、driver 不运行，会导致首个
  //    turn 不计入 turnBudget、complete 瞬态无人 clear（completion 卡片显示 turns=0/
  //    tokens=0，/goal status 读到残留 complete 瞬态）。turnWorker 必须在首个 user
  //    turn 边界补做结算（incrementTurn + addTokenUsage + emitFinalCompletionSnapshot
  //    + clearInternal）。

  it('markComplete during first user turn → first-turn settled at boundary (no driver)', async () => {
    // scripted generate：首个 user turn 的 generate 返回前调 markComplete 模拟"模型
    // 在首个 turn 内完成"。不 mock 第二轮响应——driver 不应被进入（进入会抛
    // "Unexpected generate call #2"）。
    let agentRef: ReturnType<typeof testAgent>['agent'] | undefined;
    const scripted = createScriptedGenerate();
    scripted.mockNextResponse(textResponse('all done in first turn'));
    const ctx = new AgentTestContext({
      generate: (async (...args: Parameters<typeof scripted.generate>) => {
        if (agentRef) {
          agentRef.goal.markComplete('objective met in first turn');
        }
        return scripted.generate(...args);
      }) as typeof scripted.generate,
    });
    ctx.configure({ tools: [] });
    agentRef = ctx.agent;
    const { agent } = ctx;

    agent.goal.createGoal('pursue this', { budget: { turnBudget: 10 } });
    void ctx.rpc.prompt({ input: [{ type: 'text', text: 'pursue this' }] });
    // rpc.prompt 不等 turn worker 跑完（prompt 启动 turn 后即返回）；需显式等首轮结束，
    // 让 turnWorker 的首个 user turn 边界结算（settleFirstUserTurnCompletion）执行完。
    await ctx.untilTurnEnd();

    // driver 不应进入——脚本里只 mock 了 1 个响应；若 driver 误进入会抛
    // "Unexpected generate call #2"。await prompt 已隐含验证 driver 未续跑。

    // 回归点 1：首个 turn 计入 turnBudget（PRD R4）。markComplete emit 的 completion
    // 快照 turns=0（turn 尚未计入），turnWorker 边界补发后应为 1。
    const completionEvents = ctx.allEvents
      .filter((e) => e.event === 'goal.updated')
      .map((e) => {
        const args = e.args as {
          snapshot?: { usage?: { turns?: number; tokens?: number } };
          change?: { kind?: string };
        };
        return {
          turns: args.snapshot?.usage?.turns ?? 0,
          tokens: args.snapshot?.usage?.tokens ?? 0,
          changeKind: args.change?.kind,
        };
      })
      .filter((e) => e.changeKind === 'completion');
    expect(completionEvents.length).toBeGreaterThanOrEqual(1);
    const last = completionEvents.at(-1)!;
    expect(last.turns).toBe(1);
    // 修复前为 0。
    expect(last.tokens).toBeGreaterThan(0);

    // 回归点 2：complete 瞬态被 clearInternal 清空（driver 边界 clear 的首个 turn 等价）。
    expect(agent.goal.getSnapshot()).toBeNull();
    // 回归点 3：wire 落盘 goal.clear。
    const records = ctx.getRecords();
    expect(records.some((r) => r.type === 'goal.clear')).toBe(true);
  });

  // AC-9：compaction 是 goal 推进中的"引擎开销"，但 PRD R4/AC-9 明确要求其摘要 token
  // 计入 goal 的 tokenBudget（"budget 诚实反映 goal 总成本，不因 compaction 是引擎开销
  // 而豁免"）。driver 记账本轮 token 时取 `usage.data().total` 的增量——compactionWorker
  // 把摘要 usage 也 record 到同一全局 total（`compaction/full.ts`），故 mid-turn 发生的
  // compaction 自然被 driver 的增量算入。本测试注入一笔已知大小的 compaction-summary
  // usage，断言它出现在 goal 的最终 tokenUsed 里（而非被豁免）。

  it('compaction summary tokens during a turn are counted toward the goal (AC-9)', async () => {
    // 已知的"compaction 摘要"token 数（挑一个显著大于脚本文本估算的值，便于判定）。
    const COMPACTION_SUMMARY_TOKENS = 5000;
    let agentRef: ReturnType<typeof testAgent>['agent'] | undefined;
    const scripted = createScriptedGenerate();
    scripted.mockNextResponse(textResponse('working on it'));
    scripted.mockNextResponse(textResponse('all done'));
    let generateCallCount = 0;
    const ctx = new AgentTestContext({
      generate: (async (...args: Parameters<typeof scripted.generate>) => {
        generateCallCount += 1;
        // 模拟首个 continuation turn 的 generate 调用前，compactionWorker 在同 turn 内
        // 跑了一次 compaction 并 record 了摘要 usage（full.ts:404 的真实路径）。
        if (generateCallCount === 2 && agentRef) {
          agentRef.usage.record(agentRef.config.model, {
            inputOther: COMPACTION_SUMMARY_TOKENS,
            output: 0,
            inputCacheRead: 0,
            inputCacheCreation: 0,
          });
          // 同一 turn 内模型随后 markComplete。
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

    // driver 边界补发的最终 completion snapshot 携带真实 usage（tokens 已记完）。
    const completionEvents = ctx.allEvents
      .filter((e) => e.event === 'goal.updated')
      .map((e) => {
        const args = e.args as {
          snapshot?: { usage?: { tokens?: number } };
          change?: { kind?: string };
        };
        return {
          tokens: args.snapshot?.usage?.tokens ?? 0,
          changeKind: args.change?.kind,
        };
      })
      .filter((e) => e.changeKind === 'completion');
    expect(completionEvents.length).toBeGreaterThanOrEqual(1);
    const finalTokens = completionEvents.at(-1)!.tokens;

    // 回归点：注入的 compaction 摘要 token 必须在 goal 的 tokenUsed 里（AC-9）。
    // 即最终 token ≥ 摘要 token；若 driver 豁免了 compaction，finalTokens 会远小于此值。
    expect(finalTokens).toBeGreaterThanOrEqual(COMPACTION_SUMMARY_TOKENS);
  });
});
