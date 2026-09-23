import { describe, expect, it } from 'bun:test';

import type { ContentPart, TextPart, TokenUsage } from '@byfriends/kosong';

import { AgentHarness } from '../../src/harness/agent-harness';
import {
  deriveChildSessionId,
  forkSession,
  HarnessSubagentSpawner,
  synthesizeOrphanToolResults,
} from '../../src/harness/fork';
import { operationRecordId, toolStartedRecordId } from '../../src/harness/records';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * PRD-0037 #330：fork 重写（v2 §16）+ 确定性子会话 id + 子代理迁移。
 */

const text = (t: string): TextPart => ({ type: 'text', text: t });
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

describe('deriveChildSessionId (#330)', () => {
  it('is deterministic and collision-free', () => {
    const a = deriveChildSessionId('parent-1', 'tc-1');
    const aAgain = deriveChildSessionId('parent-1', 'tc-1');
    const b = deriveChildSessionId('parent-1', 'tc-2');
    const c = deriveChildSessionId('parent-2', 'tc-1');
    expect(a).toBe(aAgain); // safe replay 重挂接同一子会话
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a.startsWith('sub-')).toBe(true);
  });
});

describe('forkSession (#330)', () => {
  it('copies entries only; target idle; source untouched; parent link recorded', async () => {
    const storage = new InMemorySessionStorage('src');
    const harness = await AgentHarness.create({ storage, llm: llm('hi') });
    unwrap(await harness.lane().prompt([text('first')]));
    const first = (await harness.session.leaf())!;
    unwrap(await harness.lane().prompt([text('second')]));
    await harness.session.setFact({ name: 'title', value: 'My Session' });

    const forked = await forkSession(harness, { entryId: first.id });
    expect(forked.copiedEntries).toBe(2); // fork 点 = user + assistant
    // 目标 idle：prompt 直接可用
    const target = await AgentHarness.create({
      storage: forked.session.storageRef,
      llm: llm('forked ok'),
    });
    expect(target.laneState().status).toBe('idle');
    unwrap(await target.lane().prompt([text('go')]));
    // parent 链接 + name 复制
    const facts = await forked.session.facts();
    expect((facts.get('parentSession')!.value as { sessionId: string }).sessionId).toBe('src');
    expect(facts.get('title')!.value).toBe('My Session');
    // 源未动
    expect((await harness.session.branch({ direction: 'oldestFirst' })).entries.length).toBe(4);
    await target.close();
    await harness.close();
  });
});

describe('orphan tool calls (#330)', () => {
  it('synthesizeOrphanToolResults fills unanswered tool calls in the projection', () => {
    const messages = [
      { role: 'user' as const, content: [text('q')] as ContentPart[], toolCalls: [] },
      {
        role: 'assistant' as const,
        content: [],
        toolCalls: [
          { type: 'function' as const, id: 'tc-answered', name: 'a', arguments: '{}' },
          { type: 'function' as const, id: 'tc-orphan', name: 'b', arguments: '{}' },
        ],
      },
      {
        role: 'tool' as const,
        content: [text('real result')] as ContentPart[],
        toolCalls: [],
        toolCallId: 'tc-answered',
      },
    ];
    const projected = synthesizeOrphanToolResults(messages);
    // 孤儿获得合成空结果，已应答的不重复
    const toolMessages = projected.filter((m) => m.role === 'tool');
    expect(toolMessages.length).toBe(2);
    expect(projected.some((m) => m.role === 'tool' && m.toolCallId === 'tc-orphan')).toBe(true);
  });

  it('fork from mid-tool-batch tip remains promptable (synthetic results reach provider)', async () => {
    // 构造源：assistant 带 toolCalls 但无结果（工具批中途 tip）
    const storage = new InMemorySessionStorage('midbatch');
    await storage.createLane({ laneId: 'main', name: 'main' });
    await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'user', content: [text('do things')] },
    });
    const assistant = await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: {
        role: 'assistant',
        content: [],
        toolCalls: [{ type: 'function', id: 'tc-x', name: 'bash', arguments: '{}' }],
      },
    });
    const source = await AgentHarness.create({ storage, llm: llm('unused') });
    const forked = await forkSession(source, { entryId: assistant.id });

    const seen: ContentPart[][] = [];
    const target = await AgentHarness.create({
      storage: forked.session.storageRef,
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
    const result = unwrap(await target.lane().prompt([text('continue')]));
    expect(result.outcome).toBe('completed');
    // provider 看到了合成空结果（孤儿不再悬空）
    const flat = seen[0]!.map((p) => (p.type === 'text' ? p.text : '')).join('');
    expect(flat).toContain('[no result');
    await target.close();
    await source.close();
  });
});

describe('subagent via fork (#330)', () => {
  it('spawn → independent run → result backfill; deterministic re-attach', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('parent'),
      llm: llm('child result: 42'),
    });
    unwrap(await harness.lane().prompt([text('parent context')]));
    const spawner = new HarnessSubagentSpawner(harness, { llm: llm('child result: 42') });

    const first = await spawner.spawn('tc-spawn-1', [text('compute the answer')]);
    expect(first.outcome).toBe('completed');
    expect(first.output).toContain('42');
    expect(first.sessionId).toBe(deriveChildSessionId('parent', 'tc-spawn-1'));

    // safe replay：同一 toolCallId 重放 → 同一子会话 id（不产生双胞胎）
    const replay = await spawner.spawn('tc-spawn-1', [text('compute again')]);
    expect(replay.sessionId).toBe(first.sessionId);
    await harness.close();
  });
});
