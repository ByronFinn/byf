import type { ContentPart, TokenUsage } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { AgentHarness } from '../../src/harness/agent-harness';
import { asToolStarted, operationRecordId } from '../../src/harness/records';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLM, LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * PRD-0037 #324：意图先行记录全集 + 预分配 id + fsync 分级。
 *
 * - tool_started：assistantEntryId+toolIndex 持久身份、effective args、
 *   预分配 result entry id、replay 安全标记；entry 与记录互相关联
 * - task_attempt：1-based 持久计数，崩溃-重启不可重置；耗尽落错误
 *   assistant 消息 + operation_finished failed（AC3）
 * - appendIfMissing：预分配 id 恢复重入安全（AC4，存储层契约已覆盖）
 * - 接受边界记录 durability 分级（fsync-before-resolve 语义由 JSONL 后端消费）
 */

class OneToolLLM implements LLM {
  readonly systemPrompt = 'test';
  readonly modelName = 'scripted';
  readonly chats: ContentPart[][] = [];

  constructor(private readonly textOut: string) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    this.chats.push(params.messages.flatMap((m) => m.content));
    await params.onTextPart?.({ type: 'text', text: this.textOut });
    return {
      toolCalls: [{ id: 'tc-1', name: 'echo', arguments: '{"text":"x"}' }],
      providerFinishReason: 'tool_calls',
      usage: testUsage(),
    };
  }
}

function testUsage(): TokenUsage {
  return { inputOther: 1, output: 1, inputCacheRead: 0, inputCacheCreation: 0 };
}

const text = (t: string): ContentPart => ({ type: 'text', text: t });

async function openSuspendedSession(
  storage: InMemorySessionStorage,
  opId: string,
  extra?: { attempt?: number; maxAttempts?: number },
): Promise<void> {
  await storage.createLane({ laneId: 'main', name: 'main' });
  await storage.appendRecord({
    laneId: 'main',
    kind: 'operation_started',
    id: operationRecordId(opId),
    payload: {
      opId,
      kind: 'prompt',
      input: [text('go')],
      origin: { kind: 'user' },
      inputEntryId: `entry:${opId}:input`,
      startedAt: 1,
    },
  });
  if (extra?.attempt !== undefined) {
    await storage.appendRecord({
      laneId: 'main',
      kind: 'task_attempt',
      id: `attempt:${opId}:${extra.attempt}`,
      payload: { opId, attempt: extra.attempt, maxAttempts: extra.maxAttempts ?? 3, at: 2 },
    });
  }
}

describe('tool_started records (PRD-0037 #324)', () => {
  it('links assistant entry, tool result entry, and replay safety', async () => {
    const storage = new InMemorySessionStorage('t1');
    const harness = await AgentHarness.create({
      storage,
      llm: new OneToolLLM('checking'),
      maxSteps: 1,
      toolReplaySafety: (name) => (name === 'echo' ? 'safe' : 'never'),
    });
    await harness.lane().prompt([text('run echo')]);

    const records = await storage.getRecords({ kinds: ['tool_started'] });
    expect(records.length).toBe(1);
    const payload = asToolStarted(records[0]!.payload);
    expect(payload).toBeDefined();
    expect(payload!.name).toBe('echo');
    expect(payload!.toolCallId).toBe('tc-1');
    expect(payload!.replay).toBe('safe');
    expect(payload!.args).toEqual({ text: 'x' });

    // assistant entry 与 result entry 均以预分配 id 落盘
    const assistant = await storage.getEntry(payload!.assistantEntryId);
    expect(assistant?.kind).toBe('message');
    expect(assistant?.kind === 'message' && assistant.message.toolCalls?.length).toBe(1);
    const result = await storage.getEntry(payload!.resultEntryId);
    expect(result?.kind).toBe('message');
    expect(result?.kind === 'message' && result.message.toolCallId).toBe('tc-1');
    await harness.close();
  });

  it('indexes parallel tool calls by provider order', async () => {
    const storage = new InMemorySessionStorage('t2');
    const llm: LLM = {
      systemPrompt: 't',
      modelName: 'm',
      async chat(params) {
        await params.onTextPart?.({ type: 'text', text: 'two calls' });
        return {
          toolCalls: [
            { id: 'tc-a', name: 'echo', arguments: '{"text":"a"}' },
            { id: 'tc-b', name: 'echo', arguments: '{"text":"b"}' },
          ],
          providerFinishReason: 'tool_calls',
          usage: testUsage(),
        };
      },
    };
    const harness = await AgentHarness.create({ storage, llm, maxSteps: 1 });
    await harness.lane().prompt([text('parallel')]);

    const toolRecords = (await storage.getRecords({ kinds: ['tool_started'] })).map((r) =>
      asToolStarted(r.payload),
    );
    expect(toolRecords.length).toBe(2);
    expect(toolRecords[0]!.toolIndex).toBe(0);
    expect(toolRecords[1]!.toolIndex).toBe(1);
    expect(toolRecords[0]!.assistantEntryId).toBe(toolRecords[1]!.assistantEntryId);
    expect(toolRecords[0]!.resultEntryId).not.toBe(toolRecords[1]!.resultEntryId);
    await harness.close();
  });
});

describe('task_attempt persistent counting (AC3)', () => {
  it('resume appends monotonically increasing attempts', async () => {
    const storage = new InMemorySessionStorage('t3');
    await openSuspendedSession(storage, 'op-count', { attempt: 1 });
    const harness = await AgentHarness.create({
      storage,
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat() {
          throw new Error('still broken');
        },
      },
      maxResumeAttempts: 3,
    });
    expect(harness.laneState().openOperation?.attempts).toBe(1);
    const second = await harness.lane().resume();
    expect(second.outcome).toBe('failed');
    const attempts = await storage.getRecords({ kinds: ['task_attempt'] });
    expect(attempts.map((r) => (r.payload as { attempt: number }).attempt)).toEqual([1, 2]);
    await harness.close();
  });

  it('exhausted attempts finalize with error assistant message + failed (AC3)', async () => {
    const storage = new InMemorySessionStorage('t4');
    await openSuspendedSession(storage, 'op-exhaust', { attempt: 3, maxAttempts: 3 });
    const harness = await AgentHarness.create({
      storage,
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat() {
          throw new Error('never called');
        },
      },
      maxResumeAttempts: 3,
    });
    const state = harness.laneState();
    expect(state.status).toBe('suspended');
    expect(state.openOperation?.attempts).toBe(3);
    const outcome = await harness.lane().resume();
    expect(outcome.outcome).toBe('failed');
    expect(outcome.errorMessage).toContain('耗尽');
    // 错误 assistant 消息已落盘
    const branch = await harness.session.branch({});
    const errorMessages = branch.entries.filter(
      (e) => e.kind === 'message' && e.message.role === 'assistant' && e.message.isError,
    );
    expect(errorMessages.length).toBe(1);
    expect(harness.laneState().status).toBe('idle');
    await harness.close();
  });

  it('crash-restart loop cannot reset the counter (restore keeps history)', async () => {
    const storage = new InMemorySessionStorage('t5');
    await openSuspendedSession(storage, 'op-loop', { attempt: 2 });
    // 反复"崩溃重启"：每次 create() 重放全部 records，attempts 不会被清零
    for (let i = 0; i < 3; i++) {
      const harness = await AgentHarness.create({ storage, llm: undefined });
      expect(harness.laneState().openOperation?.attempts).toBe(2);
      await harness.close();
    }
  });
});

describe('record durability grading (PRD-0037 #324)', () => {
  it('boundary kinds are marked boundary; others bulk', async () => {
    const storage = new InMemorySessionStorage('t6');
    await storage.createLane({ laneId: 'main', name: 'main' });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      id: 'op-b',
      payload: { opId: 'b', kind: 'prompt', startedAt: 1 },
      durability: 'boundary',
    });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'tool_started',
      payload: {},
      durability: 'bulk',
    });
    const records = await storage.getRecords();
    // 分级是落盘提示：JSONL 后端在 fsync 层消费；内存后端接受并忽略。
    expect(records.length).toBe(2);
  });
});
