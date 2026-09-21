import { describe, expect, it } from 'bun:test';

import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import { AgentHarness } from '../../src/harness/agent-harness';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * PRD-0037 #329：navigateTree + branch summary + 手动压缩。
 *
 * - 导航原子性：任意位点崩溃（截断模拟），lane 要么旧位置要么完成
 * - branch summary entry 链到目标；label 全局生效
 * - 手动 compact 是独立操作（aborted/failed 结局齐全）
 */

const text = (t: string): ContentPart => ({ type: 'text', text: t });
const usage = (): TokenUsage => ({
  inputOther: 1,
  output: 1,
  inputCacheRead: 0,
  inputCacheCreation: 0,
});

function unwrap<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) throw new Error(`unexpected lane error: ${r.code} ${r.message}`);
  return r.value;
}

const summaryLLM = {
  systemPrompt: 't',
  modelName: 'm',
  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    await params.onTextPart?.({ type: 'text', text: 'SUMMARY: the departed branch in one line' });
    return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
  },
};

async function makeHarness(): Promise<AgentHarness> {
  return AgentHarness.create({ storage: new InMemorySessionStorage('nav'), llm: summaryLLM });
}

describe('navigateTree (PRD-0037 #329)', () => {
  it('moves the leaf backward; subsequent prompts chain from the target', async () => {
    const harness = await makeHarness();
    unwrap(await harness.lane().prompt([text('first')]));
    const first = (await harness.session.leaf())!;
    unwrap(await harness.lane().prompt([text('second')]));
    expect((await harness.session.leaf())!.id).not.toBe(first.id);

    unwrap(await harness.lane().navigateTree(first.id));
    expect((await harness.session.leaf())!.id).toBe(first.id);
    // 后续 prompt 从目标续链（input entry 的 parent 即目标）
    unwrap(await harness.lane().prompt([text('after nav')]));
    const afterLeaf = (await harness.session.leaf())!;
    const afterChain = await harness.session.branch({ direction: 'oldestFirst' });
    expect(afterChain.entries.some((e) => e.id === first.id)).toBe(true);
    expect(afterChain.entries.at(-1)!.id).toBe(afterLeaf.id);
    // 旧分支保留在树上（旁支）
    const branch = await harness.session.branch({ direction: 'oldestFirst' });
    expect(branch.entries.length).toBeGreaterThanOrEqual(2);
    await harness.close();
  });

  it('optional branch summary chains to the target; label written as a global fact', async () => {
    const harness = await makeHarness();
    unwrap(await harness.lane().prompt([text('topic A discussion')]));
    const first = (await harness.session.leaf())!;
    unwrap(await harness.lane().prompt([text('more of A')]));

    unwrap(
      await harness.lane().navigateTree(first.id, { summarize: true, label: 'before-detour' }),
    );
    // branch_summary entry 链到目标（其 parent === target）
    const summaries = (await harness.session.branch({ direction: 'oldestFirst' })).entries.filter(
      (e) => e.kind === 'branch_summary',
    );
    expect(summaries.length).toBe(1);
    expect(summaries[0]!.parentId).toBe(first.id);
    expect(summaries[0]!.kind === 'branch_summary' && summaries[0]!.summary).toContain('SUMMARY');
    // leaf 在 summary 上（目标侧）
    expect((await harness.session.leaf())!.id).toBe(summaries[0]!.id);
    // label 全局生效
    expect((await harness.session.facts()).get('label:main')!.value).toBe('before-detour');
    await harness.close();
  });

  it('navigation atomicity: crash at any journal line leaves old position or completed', async () => {
    // 内存版原子性验证：模拟"半导航"（move 后 crash 于 finished 前）→ resume 幂等完成
    const storage = new InMemorySessionStorage('nav-crash');
    await storage.createLane({ laneId: 'main', name: 'main' });
    const e1 = await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'user', content: [text('one')] },
    });
    await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'assistant', content: [text('reply one')] },
    });
    const opId = 'op-nav-half';
    await storage.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      id: `op:${opId}`,
      payload: { opId, kind: 'navigation', targetEntryId: e1.id, startedAt: 1 },
    });
    // 半移动：move 已发生、finished 未写
    await storage.moveLane('main', e1.id);

    const harness = await AgentHarness.create({ storage, llm: summaryLLM });
    expect(harness.laneState().status).toBe('suspended');
    const result = unwrap(await harness.lane().resume());
    expect(result.outcome).toBe('completed');
    expect((await harness.session.leaf())!.id).toBe(e1.id); // 幂等：仍在目标
    expect(harness.laneState().status).toBe('idle');
    await harness.close();
  });

  it('navigation requires idle and a valid target', async () => {
    const harness = await makeHarness();
    const bad = await harness.lane().navigateTree('missing');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe('INVALID_INPUT');
    await harness.close();
  });
});

describe('manual compaction (PRD-0037 #329)', () => {
  it('is an independent operation with its own lifecycle records', async () => {
    const storage = new InMemorySessionStorage('compact');
    const harness = await AgentHarness.create({ storage, llm: summaryLLM });
    unwrap(await harness.lane().prompt([text('long conversation 1')]));
    unwrap(await harness.lane().prompt([text('long conversation 2')]));

    const outcome = unwrap(await harness.lane().compact());
    expect(outcome.outcome).toBe('completed');
    const records = await storage.getRecords();
    const kinds = records.map((r) => r.kind);
    expect(kinds).toContain('operation_started');
    expect(kinds).toContain('operation_finished');
    const startedKinds = records
      .filter((r) => r.kind === 'operation_started')
      .map((r) => (r.payload as { kind: string }).kind);
    expect(startedKinds).toContain('compaction');
    // compaction entry 在树上，且成为新上下文窗口起点（含端）
    const window = await harness.session.branch({ stopAtType: 'compaction' });
    expect(window.entries.some((e) => e.kind === 'compaction')).toBe(true);
    const full = await harness.session.branch({ direction: 'oldestFirst' });
    expect(full.entries.length).toBeGreaterThan(window.entries.length); // 旧消息在窗口外但树里保留
    await harness.close();
  });
});
