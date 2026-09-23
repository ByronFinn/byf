import { describe, expect, it } from 'bun:test';

import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import { AgentHarness } from '../../src/harness/agent-harness';
import { operationRecordId, toolStartedRecordId } from '../../src/harness/records';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * review 修复回归测试（review-fix 批次）：
 * - C1：compact 成功后 lane 可继续操作（runtime 清理）
 * - C2：工具执行窗口崩溃（无 assistant entry）→ resume 合成 assistant 不砖化
 * - M2：followUp 在操作正常结束后存活（drain 消费）
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

const llm = (out: string) => ({
  systemPrompt: 't',
  modelName: 'm',
  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    await params.onTextPart?.({ type: 'text', text: out });
    return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
  },
});

describe('review-fix regressions', () => {
  it('C1: compact 成功后 lane 不被锁死（runtime 清理）', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('c1'),
      llm: llm('ok'),
    });
    unwrap(await harness.lane().prompt([text('first')]));
    const compacted = unwrap(await harness.lane().compact());
    expect(compacted.outcome).toBe('completed');
    // 修复前：runtime 残留 → 一切操作 LANE_BUSY、waitForIdle 超时
    expect(harness.laneState().status).toBe('idle');
    const next = await harness.lane().prompt([text('after compact')]);
    expect(next.ok).toBe(true);
    if (next.ok) expect(next.value.outcome).toBe('completed');
    expect((await harness.lane().waitForIdle({ timeoutMs: 2000 })).ok).toBe(true);
    await harness.close();
  });

  it('C2: 工具窗口崩溃（无 assistant entry）resume 合成 assistant；后续 prompt 不砖化', async () => {
    const storage = new InMemorySessionStorage('c2');
    await storage.createLane({ laneId: 'main', name: 'main' });
    const opId = 'op-midbatch';
    await storage.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      id: operationRecordId(opId),
      payload: {
        opId,
        kind: 'prompt',
        input: [text('run tool')],
        origin: { kind: 'user' },
        inputEntryId: `entry:${opId}:input`,
        startedAt: 1,
      },
    });
    await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      id: `entry:${opId}:input`,
      message: { role: 'user', content: [text('run tool')], origin: { kind: 'user' } },
    });
    // 崩溃于工具执行窗口：tool_started 已持久、assistant entry 未落盘、无结果
    await storage.appendRecord({
      laneId: 'main',
      kind: 'tool_started',
      id: toolStartedRecordId(`entry:${opId}:a1:1`, 0),
      payload: {
        assistantEntryId: `entry:${opId}:a1:1`,
        toolIndex: 0,
        toolCallId: 'tc-crash',
        name: 'bash',
        args: { cmd: 'ls' },
        replay: 'never',
        resultEntryId: `entry:${opId}:a1:1:r0`,
        opId,
        startedAt: 2,
      },
    });

    const seen: ContentPart[][] = [];
    const harness = await AgentHarness.create({
      storage,
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: LLMChatParams): Promise<LLMChatResponse> {
          seen.push(
            params.messages.flatMap((m) => (typeof m.content === 'string' ? [] : m.content)),
          );
          await params.onTextPart?.({ type: 'text', text: 'recovered' });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    expect(harness.laneState().status).toBe('suspended');
    const outcome = unwrap(await harness.lane().resume());
    expect(outcome.outcome).toBe('completed');
    // 合成的 assistant entry（含 toolCalls，partial）已落盘
    const assistant = await storage.getEntry(`entry:${opId}:a1:1`);
    expect(assistant?.kind).toBe('message');
    expect(assistant?.kind === 'message' && assistant.message.partial).toBe(true);
    expect(assistant?.kind === 'message' && assistant.message.toolCalls?.[0]?.id).toBe('tc-crash');
    // provider 拿到的投影：assistant toolCalls + 合成结果成对（不再砖化）
    const flat = seen[0]!.map((p) => (p.type === 'text' ? p.text : ''));
    expect(flat.join('\n')).toContain('[interrupted]');
    await harness.close();
  });

  it('M2: followUp 在操作正常结束后存活并被 drain 消费', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('m2'),
      llm: llm('ok'),
    });
    const running = harness.lane().prompt([text('first')]);
    unwrap(await harness.lane().followUp([text('after first')]));
    unwrap(await running);
    // 正常完成不清 followUp（修复前被 reducer 静默销毁）
    expect(harness.laneState().queues.followUp.length).toBe(1);
    const drained = unwrap(await harness.lane().drain());
    expect(drained.length).toBe(1);
    expect(drained[0]!.outcome).toBe('completed');
    await harness.close();
  });
});
