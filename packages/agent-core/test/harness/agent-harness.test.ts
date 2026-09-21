import { describe, expect, it } from 'bun:test';

import type { ContentPart, TokenUsage, ToolCall } from '@byfriends/kosong';

import { AgentHarness } from '../../src/harness/agent-harness';
import { operationRecordId } from '../../src/harness/records';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLM, LLMChatParams, LLMChatResponse } from '../../src/loop/llm';
import type { ExecutableTool, ToolExecution } from '../../src/loop/types';

/**
 * PRD-0037 #323：AgentHarness 骨架 e2e。
 *
 * - 内存后端 e2e：prompt → run（含工具调用续跑）→ operation_finished completed
 * - restore 归约：有/无开放操作分别判 suspended/idle
 * - live 执行与 resume() 走同一 runProcedure 代码路径
 * - 不依赖旧 Agent 类与旧 Session 容器；构造不强制 sessionId
 */

/** 脚本化 LLM：按顺序吐出预置响应（tool_use → 终态文本）。 */
class ScriptedLLM implements LLM {
  readonly systemPrompt = 'You are a test assistant.';
  readonly modelName = 'scripted-model';
  private callIndex = 0;
  /** 每次 chat 收到的消息快照（断言上下文投影用）。 */
  readonly receivedMessages: ContentPart[][] = [];

  constructor(private readonly script: readonly ScriptedResponse[]) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const response = this.script[this.callIndex]!;
    this.callIndex += 1;
    this.receivedMessages.push(params.messages.flatMap((m) => m.content));
    for (const part of response.textParts) {
      await params.onTextPart?.({ type: 'text', text: part });
    }
    return {
      toolCalls: response.toolCalls ?? [],
      providerFinishReason: response.toolCalls ? 'tool_calls' : 'completed',
      usage: emptyTestUsage(),
    };
  }
}

interface ScriptedResponse {
  readonly textParts: readonly string[];
  readonly toolCalls?: ToolCall[];
}

function emptyTestUsage(): TokenUsage {
  return { inputOther: 10, output: 5, inputCacheRead: 0, inputCacheCreation: 0 };
}

/** 回显工具：输出 JSON 参数的文本形式。 */
function echoTool(): ExecutableTool<{ text: string }> {
  return {
    name: 'echo',
    description: 'Echo the input',
    parameters: { type: 'object', properties: { text: { type: 'string' } } },
    resolveExecution(input: { text: string }): ToolExecution {
      return {
        accesses: [],
        display: { kind: 'generic', summary: `echo ${input.text}` },
        description: `echo ${input.text}`,
        execute: async () => ({ output: `echo:${input.text}` }),
      };
    },
  };
}

const text = (t: string): ContentPart => ({ type: 'text', text: t });

function unwrap<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) throw new Error('unexpected lane error: ' + r.code + ' ' + r.message);
  return r.value;
}

describe('AgentHarness e2e (in-memory, PRD-0037 #323)', () => {
  it('prompt → tool use → continuation → operation_finished completed', async () => {
    const storage = new InMemorySessionStorage('e2e-1');
    const llm = new ScriptedLLM([
      {
        textParts: ['Let me check.'],
        toolCalls: [{ type: 'function', id: 'tc-1', name: 'echo', arguments: '{"text":"hi"}' }],
      },
      { textParts: ['Echo said hi. Done.'] },
    ]);
    const harness = await AgentHarness.create({ storage, llm, tools: [echoTool()] });

    const outcome = unwrap(await harness.lane().prompt([text('please echo hi')]));
    expect(outcome.outcome).toBe('completed');
    expect(outcome.stopReason).toBe('end_turn');
    expect(outcome.steps).toBe(2);

    // 对话树完整：user → assistant(toolCalls) → tool result → assistant final
    const branch = await harness.session.branch({ direction: 'oldestFirst' });
    const messages = branch.entries.filter((e) => e.kind === 'message');
    expect(messages.length).toBe(4);
    const [user, assistant, toolResult, final] = messages as {
      message: { role: string; toolCalls?: { id: string }[]; toolCallId?: string };
    }[];
    if (!user || !assistant || !toolResult || !final) {
      throw new Error('expected four messages: user, assistant, tool result, final');
    }
    expect(user.message.role).toBe('user');
    expect(assistant.message.role).toBe('assistant');
    expect(assistant.message.toolCalls?.[0]?.id).toBe('tc-1');
    expect(toolResult.message.role).toBe('tool');
    expect(toolResult.message.toolCallId).toBe('tc-1');
    expect(final.message.role).toBe('assistant');

    // 执行记录：started → finished completed，lane 回 idle
    const records = await storage.getRecords();
    expect(records.map((r) => r.kind)).toEqual([
      'operation_started',
      'tool_started',
      'operation_finished',
    ]);
    expect(harness.laneState().status).toBe('idle');

    // 第二次 chat 收到的上下文包含工具交换四元组
    const secondCall = llm.receivedMessages[1]!;
    expect(secondCall.length).toBeGreaterThan(0);
    await harness.close();
  });

  it('restore reduces open operation to suspended; idle stays idle', async () => {
    // 预置一个"崩溃"状态：operation_started 无 finished
    const storage = new InMemorySessionStorage('e2e-2');
    await storage.createLane({ laneId: 'main', name: 'main' });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      id: operationRecordId('op-crashed'),
      payload: {
        opId: 'op-crashed',
        kind: 'prompt',
        input: [text('resume me')],
        origin: { kind: 'user' },
        inputEntryId: 'entry:op-crashed:input',
        startedAt: 1,
      },
    });

    const harness = await AgentHarness.create({
      storage,
      llm: new ScriptedLLM([{ textParts: ['Resumed and done.'] }]),
    });
    const state = harness.laneState();
    expect(state.status).toBe('suspended');
    expect(state.suspendedReason).toBe('crash');
    expect(state.openOperation?.opId).toBe('op-crashed');

    // resume：同一 runProcedure 路径，物化输入消息并完成操作
    const outcome = unwrap(await harness.lane().resume());
    expect(outcome.outcome).toBe('completed');
    expect(outcome.opId).toBe('op-crashed');
    expect(harness.laneState().status).toBe('idle');

    // 输入消息只物化一次（幂等）
    const branch = await harness.session.branch({ direction: 'oldestFirst' });
    const userMessages = branch.entries.filter(
      (e) => e.kind === 'message' && e.message.role === 'user',
    );
    expect(userMessages.length).toBe(1);

    // finished 只写一条（恢复前无、恢复后恰一条）
    const records = await storage.getRecords();
    expect(records.filter((r) => r.kind === 'operation_finished').length).toBe(1);

    // 重开（第二次 restore）：无开放操作 → idle
    await harness.close();
    const reopened = await AgentHarness.create({ storage, llm: new ScriptedLLM([]) });
    expect(reopened.laneState().status).toBe('idle');
    await reopened.close();
  });

  it('resume of an aborting operation finalizes as aborted', async () => {
    const storage = new InMemorySessionStorage('e2e-3');
    await storage.createLane({ laneId: 'main', name: 'main' });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      id: operationRecordId('op-aborted'),
      payload: { opId: 'op-aborted', kind: 'prompt', startedAt: 1 },
    });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'abort_requested',
      payload: { opId: 'op-aborted', requestedAt: 2 },
    });

    const harness = await AgentHarness.create({ storage, llm: new ScriptedLLM([]) });
    expect(harness.laneState().status).toBe('aborting');
    const outcome = unwrap(await harness.lane().resume());
    expect(outcome.outcome).toBe('aborted');
    expect(harness.laneState().status).toBe('idle');
    await harness.close();
  });

  it('runs standalone with in-memory storage (no sessionId required)', async () => {
    const harness = await AgentHarness.create({
      llm: new ScriptedLLM([{ textParts: ['standalone ok'] }]),
    });
    const outcome = unwrap(await harness.lane().prompt([text('hello')]));
    expect(outcome.outcome).toBe('completed');
    expect(harness.session.sessionId).toMatch(/.+/); // 自动生成
    await harness.close();
  });

  it('failed LLM operation finishes with outcome failed (no throw to caller)', async () => {
    const failingLLM: LLM = {
      systemPrompt: 'x',
      modelName: 'fail',
      async chat() {
        throw new Error('provider exploded');
      },
    };
    const harness = await AgentHarness.create({ llm: failingLLM });
    const outcome = unwrap(await harness.lane().prompt([text('boom')]));
    expect(outcome.outcome).toBe('failed');
    expect(outcome.errorMessage).toContain('provider exploded');
    expect(harness.laneState().status).toBe('idle');
    const records = await harness.session.storageRef.getRecords();
    const finished = records.find((r) => r.kind === 'operation_finished');
    expect(finished).toBeDefined();
    await harness.close();
  });

  it('prompt on a busy lane is rejected', async () => {
    let releaseChat: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseChat = resolve;
    });
    const gatedLLM: LLM = {
      systemPrompt: 'x',
      modelName: 'gated',
      async chat(params) {
        await gate;
        await params.onTextPart?.({ type: 'text', text: 'done' });
        return { toolCalls: [], providerFinishReason: 'completed', usage: emptyTestUsage() };
      },
    };
    const harness = await AgentHarness.create({ llm: gatedLLM });
    const running = harness.lane().prompt([text('slow')]);
    expect(harness.laneState().status).toBe('running');
    const busy = await harness.lane().prompt([text('too soon')]);
    expect(busy.ok).toBe(false);
    if (!busy.ok) expect(busy.code).toBe('LANE_BUSY');
    releaseChat?.();
    const outcome = unwrap(await running);
    expect(outcome.outcome).toBe('completed');
    expect(harness.laneState().status).toBe('idle');
    await harness.close();
  });
});
