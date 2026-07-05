/**
 * PRD-0019 #202 — goal 工具 + loopTools 两层门控。
 *
 * 覆盖 ACs：
 *   - AC-1（部分）/AC-3：UpdateGoal complete/blocked 行为正确。
 *   - AC-4（部分）：SetGoalBudget 设 budget 后 snapshot 反映。
 *   - AC-10：sub agent 不注册任何 goal 工具（注册层门控）。
 *   - 无 goal 时 loopTools 隐藏 SetGoalBudget/UpdateGoal，CreateGoal/GetGoal 可见。
 *   - UpdateGoal 不设 stopTurn，返回普通 success。
 *   - 参数非法报对应错误码（GOAL_OBJECTIVE_EMPTY / GOAL_OBJECTIVE_TOO_LONG /
 *     GOAL_STATUS_INVALID / GOAL_BUDGET_INVALID）。
 *
 * 工具层只验证「调用 → GoalMode 状态 + 返回结构」；driver 边界 clear 在 #201
 * 测，loopTools 门控在此测。
 */

import { localKaos } from '@byfriends/kaos';
import { describe, expect, it } from 'vitest';

import { Agent } from '../../../src/agent';
import { InMemoryAgentRecordPersistence } from '../../../src/agent/records/persistence';
import { ErrorCodes } from '../../../src/errors';
import {
  CreateGoalInputSchema,
  CreateGoalTool,
  GetGoalTool,
  SetGoalBudgetInputSchema,
  SetGoalBudgetTool,
  UpdateGoalInputSchema,
  UpdateGoalTool,
} from '../../../src/tools/builtin/goal';
import { executeTool } from '../../tools/fixtures/execute-tool';
import { MOCK_PROVIDER, TEST_OS_ENV, makeGoalAgent, testProviderManager } from './harness';

const signal = new AbortController().signal;

// —— 工具层（无 Agent，验证返回结构 + 错误码） ——

describe('CreateGoalTool', () => {
  it('creates an active goal and returns success (no stopTurn)', async () => {
    const { agent } = makeGoalAgent();
    const tool = new CreateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { objective: 'Ship feature X' },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result).not.toHaveProperty('stopTurn');
    expect(result.output).toContain('Goal created');
    expect(agent.goal.getSnapshot()?.status).toBe('active');
    expect(agent.goal.getSnapshot()?.objective).toBe('Ship feature X');
  });

  it('creates with initial budget', async () => {
    const { agent } = makeGoalAgent();
    const tool = new CreateGoalTool(agent);

    await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {
        objective: 'obj',
        budget: { turn_budget: 3, token_budget: 1000, wall_clock_budget_ms: 60_000 },
      },
      signal,
    });

    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.budget).toEqual({
      turnBudget: 3,
      tokenBudget: 1000,
      wallClockBudgetMs: 60_000,
    });
  });

  it('respects replace:true', async () => {
    const { agent } = makeGoalAgent();
    const tool = new CreateGoalTool(agent);
    agent.goal.createGoal('first');

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { objective: 'second', replace: true },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(agent.goal.getSnapshot()?.objective).toBe('second');
  });

  it('returns error result (not throw) for empty objective', async () => {
    const { agent } = makeGoalAgent();
    const tool = new CreateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { objective: '   ' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_OBJECTIVE_EMPTY);
  });

  it('returns error result for over-long objective', async () => {
    const { agent } = makeGoalAgent();
    const tool = new CreateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { objective: 'x'.repeat(4001) },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_OBJECTIVE_TOO_LONG);
  });

  it('returns error result for already-existing goal without replace', async () => {
    const { agent } = makeGoalAgent();
    const tool = new CreateGoalTool(agent);
    agent.goal.createGoal('first');

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { objective: 'second' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_ALREADY_EXISTS);
  });

  it('rejects invalid budget (negative token_budget)', async () => {
    const { agent } = makeGoalAgent();
    const tool = new CreateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { objective: 'obj', budget: { token_budget: -5 } },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_BUDGET_INVALID);
  });

  it('schema rejects empty objective', () => {
    expect(CreateGoalInputSchema.safeParse({ objective: '' }).success).toBe(false);
    expect(CreateGoalInputSchema.safeParse({ objective: 'ok' }).success).toBe(true);
  });
});

describe('GetGoalTool', () => {
  it('returns the live snapshot when a goal exists', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('read me', { budget: { turnBudget: 2 } });
    const tool = new GetGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('read me');
    expect(result.output).toContain('active');
  });

  it('returns error when no goal exists', async () => {
    const { agent } = makeGoalAgent();
    const tool = new GetGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain('No active goal');
  });
});

describe('SetGoalBudgetTool (AC-4 partial)', () => {
  it('updates only the supplied budget dimension', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj', { budget: { turnBudget: 5, tokenBudget: 1000 } });
    const tool = new SetGoalBudgetTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { turn_budget: 3 },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    const budget = agent.goal.getSnapshot()?.budget;
    // turn_budget changed; token_budget preserved; wallClockBudgetMs stays unset.
    expect(budget).toEqual({ turnBudget: 3, tokenBudget: 1000, wallClockBudgetMs: undefined });
  });

  it('requires at least one budget field', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const tool = new SetGoalBudgetTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: {},
      signal,
    });

    expect(result.isError).toBe(true);
  });

  it('returns error when no goal exists', async () => {
    const { agent } = makeGoalAgent();
    const tool = new SetGoalBudgetTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { turn_budget: 3 },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_NOT_FOUND);
  });

  it('rejects invalid budget value', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const tool = new SetGoalBudgetTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { wall_clock_budget_ms: 0 },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_BUDGET_INVALID);
  });

  it('schema accepts partial input', () => {
    expect(SetGoalBudgetInputSchema.safeParse({ turn_budget: 1 }).success).toBe(true);
    expect(SetGoalBudgetInputSchema.safeParse({}).success).toBe(true);
    expect(SetGoalBudgetInputSchema.safeParse({ turn_budget: -1 }).success).toBe(false);
  });
});

describe('UpdateGoalTool (AC-1/AC-3 partial)', () => {
  it('complete: enters complete transient, emits completion change, no stopTurn', async () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const tool = new UpdateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { status: 'complete', reason: 'shipped it' },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result).not.toHaveProperty('stopTurn');
    expect(result.output).toContain('Goal complete');
    expect(result.output).toContain('shipped it');
    // 瞬态：snapshot 仍可读为 complete。
    expect(agent.goal.getSnapshot()?.status).toBe('complete');
    // completion change 已 emit。
    expect(
      emitted.some((e) => (e as { change?: { kind?: string } }).change?.kind === 'completion'),
    ).toBe(true);
  });

  it('complete without active goal returns error (status invalid)', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.pause();
    const tool = new UpdateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { status: 'complete' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_STATUS_INVALID);
  });

  it('blocked: enters blocked with reason (AC-3)', async () => {
    const { agent, emitted } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const tool = new UpdateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { status: 'blocked', reason: 'missing dependency' },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(result.output).toContain('blocked');
    expect(result.output).toContain('missing dependency');
    const snapshot = agent.goal.getSnapshot();
    expect(snapshot?.status).toBe('blocked');
    expect(snapshot?.blockedReason).toBe('missing dependency');
    // AC-3：emitted goal.updated 事件必须携带 change.kind==='blocked' + reason。
    expect(
      emitted.some((e) => (e as { change?: { kind?: string } }).change?.kind === 'blocked'),
    ).toBe(true);
    expect(
      emitted.some(
        (e) => (e as { change?: { reason?: string } }).change?.reason === 'missing dependency',
      ),
    ).toBe(true);
  });

  it('paused: enters paused', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const tool = new UpdateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { status: 'paused', reason: 'parking for user input' },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(agent.goal.getSnapshot()?.status).toBe('paused');
  });

  it('active: resumes from paused', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.pause();
    const tool = new UpdateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { status: 'active' },
      signal,
    });

    expect(result).toMatchObject({ isError: false });
    expect(agent.goal.getSnapshot()?.status).toBe('active');
  });

  it('idempotent: same status returns plain success', async () => {
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    const tool = new UpdateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { status: 'active' },
      signal,
    });

    // 已是 active —— 不报错，直接返回。
    expect(result).toMatchObject({ isError: false });
  });

  it('returns error when no goal exists', async () => {
    const { agent } = makeGoalAgent();
    const tool = new UpdateGoalTool(agent);

    const result = await executeTool(tool, {
      turnId: 't1',
      toolCallId: 'call_1',
      args: { status: 'complete' },
      signal,
    });

    expect(result.isError).toBe(true);
    expect(result.output).toContain(ErrorCodes.GOAL_NOT_FOUND);
  });

  it('schema accepts valid status enum', () => {
    expect(UpdateGoalInputSchema.safeParse({ status: 'complete' }).success).toBe(true);
    expect(UpdateGoalInputSchema.safeParse({ status: 'weird' }).success).toBe(false);
  });
});

// —— 注册层 + loopTools 两层门控 (AC-10) ——

function makeAgentWithType(type: 'main' | 'sub' | 'independent'): Agent {
  const persistence = new InMemoryAgentRecordPersistence();
  const emitted: Array<Record<string, unknown>> = [];
  const rpc = {
    emitEvent: (event: Record<string, unknown>) => {
      emitted.push(event);
    },
  } as never;
  const agent = new Agent({
    runtime: { kaos: localKaos, osEnv: TEST_OS_ENV },
    rpc,
    persistence,
    providerManager: testProviderManager(),
    type,
  });
  agent.config.update({ cwd: process.cwd(), modelAlias: MOCK_PROVIDER.model });
  agent.tools.initializeBuiltinTools();
  return agent;
}

describe('goal tool registration + loopTools gating (AC-10)', () => {
  it('main agent registers all 4 goal tools', () => {
    const agent = makeAgentWithType('main');
    const names = new Set(agent.tools.data().map((t) => t.name));
    expect(names.has('CreateGoal')).toBe(true);
    expect(names.has('GetGoal')).toBe(true);
    expect(names.has('SetGoalBudget')).toBe(true);
    expect(names.has('UpdateGoal')).toBe(true);
  });

  it('sub agent registers no goal tools (registration-layer gate)', () => {
    const agent = makeAgentWithType('sub');
    const names = new Set(agent.tools.data().map((t) => t.name));
    expect(names.has('CreateGoal')).toBe(false);
    expect(names.has('GetGoal')).toBe(false);
    expect(names.has('SetGoalBudget')).toBe(false);
    expect(names.has('UpdateGoal')).toBe(false);
  });

  it('independent agent registers no goal tools', () => {
    const agent = makeAgentWithType('independent');
    const names = new Set(agent.tools.data().map((t) => t.name));
    expect(names.has('CreateGoal')).toBe(false);
    expect(names.has('GetGoal')).toBe(false);
  });

  it('loopTools hides SetGoalBudget/UpdateGoal when no goal; CreateGoal/GetGoal visible', () => {
    const agent = makeAgentWithType('main');
    agent.tools.setActiveTools(['CreateGoal', 'GetGoal', 'SetGoalBudget', 'UpdateGoal', 'Read']);
    const names = new Set(agent.tools.loopTools.map((t) => t.name));
    expect(names.has('CreateGoal')).toBe(true);
    expect(names.has('GetGoal')).toBe(true);
    expect(names.has('SetGoalBudget')).toBe(false);
    expect(names.has('UpdateGoal')).toBe(false);
  });

  it('loopTools shows all 4 goal tools once a goal exists', () => {
    const agent = makeAgentWithType('main');
    agent.tools.setActiveTools(['CreateGoal', 'GetGoal', 'SetGoalBudget', 'UpdateGoal']);
    agent.goal.createGoal('obj');

    const names = new Set(agent.tools.loopTools.map((t) => t.name));
    expect(names.has('CreateGoal')).toBe(true);
    expect(names.has('GetGoal')).toBe(true);
    expect(names.has('SetGoalBudget')).toBe(true);
    expect(names.has('UpdateGoal')).toBe(true);
  });

  it('loopTools hides mutation tools again after goal is cleared', () => {
    const agent = makeAgentWithType('main');
    agent.tools.setActiveTools(['CreateGoal', 'GetGoal', 'SetGoalBudget', 'UpdateGoal']);
    agent.goal.createGoal('obj');
    expect(new Set(agent.tools.loopTools.map((t) => t.name)).has('UpdateGoal')).toBe(true);

    agent.goal.cancel();
    const names = new Set(agent.tools.loopTools.map((t) => t.name));
    expect(names.has('SetGoalBudget')).toBe(false);
    expect(names.has('UpdateGoal')).toBe(false);
    expect(names.has('CreateGoal')).toBe(true);
  });
});

// —— outcome-prompts ——

describe('outcome-prompts', () => {
  it('renderCompletionSummary includes objective + reason + usage', async () => {
    const { renderCompletionSummary } =
      await import('../../../src/tools/builtin/goal/outcome-prompts');
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('ship it', { budget: { turnBudget: 5 } });
    agent.goal.markComplete('done and shipped');

    const line = renderCompletionSummary(agent.goal.getSnapshot()!, 'done and shipped');
    expect(line).toContain('ship it');
    expect(line).toContain('done and shipped');
    expect(line).toMatch(/turns=\d+/);
  });

  it('renderBlockedReason includes the blocked reason', async () => {
    const { renderBlockedReason } = await import('../../../src/tools/builtin/goal/outcome-prompts');
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('obj');
    agent.goal.markBlocked('missing dep');

    const line = renderBlockedReason(agent.goal.getSnapshot()!);
    expect(line).toContain('missing dep');
    expect(line).toContain('blocked');
  });

  it('renderStatusLine includes objective + status', async () => {
    const { renderStatusLine } = await import('../../../src/tools/builtin/goal/outcome-prompts');
    const { agent } = makeGoalAgent();
    agent.goal.createGoal('the obj', { budget: { turnBudget: 3 } });

    const line = renderStatusLine(agent.goal.getSnapshot()!);
    expect(line).toContain('the obj');
    expect(line).toContain('active');
    expect(line).toMatch(/turns left/);
  });
});

// 编译期断言：错误码存在
const _codes: typeof ErrorCodes = ErrorCodes;
void _codes;
