import { describe, expect, it } from 'bun:test';

import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import { AgentHarness } from '../../src/harness/agent-harness';
import { forkSession } from '../../src/harness/fork';
import { updateGoal } from '../../src/harness/goal';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * PRD-0037 #331：goal 映射（grill Q7）。
 *
 * - goal 状态 → lane 路径 custom entries（点查询还原）
 * - goal 续跑 → before_run_end 缝隙返回 followUp——同一 runId（opId）内推进
 * - fork 点之前的 goal custom entries 不被复制（fork 清空 goal，ADR-0023）
 * - 预算停止 / complete 收尾 / paused 语义
 */

const text = (t: string): ContentPart => ({ type: 'text', text: t });
const usage = (): TokenUsage => ({
  inputOther: 10,
  output: 5,
  inputCacheRead: 0,
  inputCacheCreation: 0,
});

function unwrap<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) throw new Error(`unexpected lane error: ${r.code} ${r.message}`);
  return r.value;
}

describe('goal e2e on v2 engine (PRD-0037 #331)', () => {
  it('set goal → multi-round continuation → complete; same opId throughout', async () => {
    const storage = new InMemorySessionStorage('goal-e2e');
    let call = 0;
    const harness = await AgentHarness.create({
      storage,
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: LLMChatParams): Promise<LLMChatResponse> {
          call += 1;
          const seesContinuation = params.messages.some(
            (m) =>
              typeof m.content !== 'string' &&
              m.content.some((p) => p.type === 'text' && p.text.includes('goal continuation')),
          );
          if (call >= 2) {
            // 第二轮：模型宣告完成（三权分立的工具权——直接调 updateGoal 面）
            const goal = await harness2laneGoal();
            if (goal.status === 'active' && seesContinuation) {
              await updateGoal(harness.session, 'main', goal, { status: 'complete' });
            }
          }
          await params.onTextPart?.({ type: 'text', text: `round ${call}` });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    const harness2laneGoal = async () => harness.lane().goal();
    await harness.lane().setGoal({ objective: 'finish the report' });

    const outcome = unwrap(await harness.lane().prompt([text('start working')]));
    expect(outcome.outcome).toBe('completed');
    // 多轮推进：同一 opId（同一 run），两轮 LLM 调用
    expect(call).toBe(2);
    expect(outcome.steps).toBe(2);
    // goal 终态 complete；continuation 消息写树（system_trigger）
    const goal = await harness.lane().goal();
    expect(goal.status).toBe('complete');
    const continuations = (
      await harness.session.branch({ direction: 'oldestFirst' })
    ).entries.filter((e) => e.kind === 'message' && e.message.origin?.kind === 'system_trigger');
    expect(continuations.length).toBe(1);
    // 单一 operation 记录对（同 runId 贯穿）
    const records = await storage.getRecords();
    expect(records.filter((r) => r.kind === 'operation_started').length).toBe(1);
    expect(records.filter((r) => r.kind === 'operation_finished').length).toBe(1);
    await harness.close();
  });

  it('budget exhaustion blocks the goal and stops continuation', async () => {
    let call = 0;
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('goal-budget'),
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: LLMChatParams): Promise<LLMChatResponse> {
          call += 1;
          await params.onTextPart?.({ type: 'text', text: `round ${call}` });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    await harness.lane().setGoal({ objective: 'never ending', budget: { maxTurns: 1 } });
    const outcome = unwrap(await harness.lane().prompt([text('go')]));
    expect(outcome.outcome).toBe('completed');
    const goal = await harness.lane().goal();
    expect(goal.status).toBe('blocked');
    if (goal.status === 'blocked') expect(goal.blockedReason).toContain('轮次预算耗尽');
    expect(call).toBe(1); // 预算停止：无第二轮
    await harness.close();
  });

  it('no goal means no continuation (zero behavior change)', async () => {
    let call = 0;
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('goal-none'),
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: LLMChatParams): Promise<LLMChatResponse> {
          call += 1;
          await params.onTextPart?.({ type: 'text', text: 'plain' });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    unwrap(await harness.lane().prompt([text('normal')]));
    expect(call).toBe(1);
    expect((await harness.lane().goal()).status).toBe('absent');
    await harness.close();
  });

  it('paused goal does not continue', async () => {
    let call = 0;
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('goal-paused'),
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: LLMChatParams): Promise<LLMChatResponse> {
          call += 1;
          await params.onTextPart?.({ type: 'text', text: 'r' });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    await harness.lane().setGoal({ objective: 'x' });
    // 模型暂停（工具权）
    const goal = await harness.lane().goal();
    if (goal.status === 'active') {
      await updateGoal(harness.session, 'main', goal, { status: 'paused' });
    }
    unwrap(await harness.lane().prompt([text('go')]));
    expect(call).toBe(1); // paused：不续跑
    expect((await harness.lane().goal()).status).toBe('paused');
    await harness.close();
  });

  it('fork drops goal custom entries (ADR-0023)', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('goal-fork-src'),
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: LLMChatParams): Promise<LLMChatResponse> {
          await params.onTextPart?.({ type: 'text', text: 'ok' });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    unwrap(await harness.lane().prompt([text('context')]));
    await harness.lane().setGoal({ objective: 'should not survive fork' });
    const forked = await forkSession(harness);
    const child = await AgentHarness.create({
      storage: forked.session.storageRef,
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat() {
          throw new Error('no llm needed');
        },
      },
    });
    expect((await child.lane().goal()).status).toBe('absent'); // fork 清空 goal
    await child.close();
    await harness.close();
  });
});
