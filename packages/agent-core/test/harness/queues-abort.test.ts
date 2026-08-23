import type { ContentPart, TokenUsage } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { AgentHarness } from '../../src/harness/agent-harness';
import { operationRecordId, toolStartedRecordId } from '../../src/harness/records';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLM, LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * PRD-0037 #325：checkpoint + 三队列 + abort reconcile。
 *
 * - mid-step 追加延迟到 checkpoint（beforeStep 先于 buildMessages）
 * - steer/followUp/nextRun 三队列：接受即持久、消费点写树
 * - abort 后无悬空 tool.call；steer 不跨 cancel 存活且 payload 归还（修 D4）
 * - deferred writes（事实）在 abort 中存活
 */

const text = (t: string): ContentPart => ({ type: 'text', text: t });
const usage = (): TokenUsage => ({
  inputOther: 1,
  output: 1,
  inputCacheRead: 0,
  inputCacheCreation: 0,
});

/** 多步 LLM：第一步挂起等 gate，后续步收尾。 */
class GatedLLM implements LLM {
  readonly systemPrompt = 't';
  readonly modelName = 'm';
  readonly chats: ContentPart[][] = [];
  private call = 0;

  constructor(private readonly steps: number) {}

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    this.chats.push(params.messages.flatMap((m) => m.content));
    this.call += 1;
    await params.onTextPart?.({ type: 'text', text: `step ${this.call}` });
    const done = this.call >= this.steps;
    return {
      toolCalls: done ? [] : [],
      providerFinishReason: done ? 'completed' : 'end_turn',
      usage: usage(),
    };
  }
}

function neverLLM(): LLM {
  return {
    systemPrompt: 't',
    modelName: 'm',
    async chat() {
      throw new Error('llm must not be called');
    },
  };
}

describe('queues and checkpoint (PRD-0037 #325)', () => {
  it('steer is persisted on accept and written to tree at checkpoint (before next step build)', async () => {
    const storage = new InMemorySessionStorage('q1');
    let releaseStep: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      releaseStep = r;
    });
    const llm: LLM = {
      systemPrompt: 't',
      modelName: 'm',
      async chat(params) {
        if (params.messages.length <= 1) {
          await gate; // 第一步先挂起，期间发起 steer
        }
        await params.onTextPart?.({ type: 'text', text: 'ok' });
        return { toolCalls: [], providerFinishReason: 'completed', usage: usage() };
      },
    };
    const harness = await AgentHarness.create({ storage, llm });
    const lane = harness.lane();
    const running = lane.prompt([text('start')]);
    await lane.steer([text('turn left')]);
    // 接受即持久：queue_enqueued 已落盘
    const enqueued = await storage.getRecords({ kinds: ['queue_enqueued'] });
    expect(enqueued.length).toBe(1);
    expect((enqueued[0]!.payload as { queue: string }).queue).toBe('steer');
    releaseStep?.();
    const outcome = await running;
    expect(outcome.outcome).toBe('completed');
    // 消费点写树：steer 内容出现在对话树（第二 step 的上下文包含它）
    const branch = await harness.session.branch({ direction: 'oldestFirst' });
    const steerEntries = branch.entries.filter(
      (e) => e.kind === 'message' && e.message.origin?.kind === 'injection',
    );
    expect(steerEntries.length).toBe(1);
    const steerText = steerEntries[0]!.kind === 'message' && steerEntries[0]!.message.content[0];
    expect(steerText && steerText.type === 'text' && steerText.text).toBe('turn left');
    await harness.close();
  });

  it('steer requires a running operation', async () => {
    const harness = await AgentHarness.create({ llm: new GatedLLM(1) });
    let rejected = false;
    try {
      await harness.lane().steer([text('x')]);
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
    await harness.close();
  });

  it('deferred write applies at checkpoint, not at defer time (R4 append-only context)', async () => {
    const storage = new InMemorySessionStorage('q2');
    const llm: LLM = {
      systemPrompt: 't',
      modelName: 'm',
      async chat(params) {
        // 第一步时 defer 一个写；此刻它绝不能出现在上下文里
        const deferredInContext = params.messages.some((m) =>
          m.content.some((p) => p.type === 'text' && p.text.includes('deferred-fact')),
        );
        if (!deferredInContext) {
          // 仅在第一步触发一次 defer
          if (!this.triggered) this.triggered = true;
        }
        await params.onTextPart?.({ type: 'text', text: 'ok' });
        return { toolCalls: [], providerFinishReason: 'completed', usage: usage() };
      },
      triggered: false,
    };
    const harness = await AgentHarness.create({ storage, llm });
    const lane = harness.lane();
    const running = lane.prompt([text('go')]);
    await lane.deferWrite({ customType: 'fact.note', data: 'deferred-fact' });
    const outcome = await running;
    expect(outcome.outcome).toBe('completed');
    // checkpoint 后 deferred write 已应用（custom entry 在树里）
    const branch = await harness.session.branch({});
    const customs = branch.entries.filter((e) => e.kind === 'custom');
    expect(customs.length).toBe(1);
    expect(customs[0]!.kind === 'custom' && customs[0]!.customType).toBe('fact.note');
    await harness.close();
  });

  it('followUp drains as the next operation; consumed at write point', async () => {
    const storage = new InMemorySessionStorage('q3');
    const harness = await AgentHarness.create({ storage, llm: new GatedLLM(1) });
    const lane = harness.lane();
    await lane.prompt([text('first')]);
    await lane.followUp([text('second round')]);
    const outcomes = await lane.drain();
    expect(outcomes.length).toBe(1);
    // followUp 输入成为第二操作的用户消息
    const branch = await harness.session.branch({ direction: 'oldestFirst' });
    const userTexts = branch.entries
      .filter((e) => e.kind === 'message' && e.message.role === 'user')
      .map((e) =>
        e.kind === 'message' && e.message.content[0]?.type === 'text'
          ? e.message.content[0].text
          : '',
      );
    expect(userTexts).toContain('second round');
    // 再次 drain：队列已空
    expect((await lane.drain()).length).toBe(0);
    await harness.close();
  });

  it('nextRun survives abort and drains later', async () => {
    const storage = new InMemorySessionStorage('q4');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const llm: LLM = {
      systemPrompt: 't',
      modelName: 'm',
      async chat(params) {
        await gate;
        await params.onTextPart?.({ type: 'text', text: 'done' });
        return { toolCalls: [], providerFinishReason: 'completed', usage: usage() };
      },
    };
    const harness = await AgentHarness.create({ storage, llm });
    const lane = harness.lane();
    const running = lane.prompt([text('will abort')]);
    await lane.nextRun([text('after crash')]);
    await lane.abort();
    release?.();
    const outcome = await running;
    expect(outcome.outcome).toBe('aborted');
    // nextRun 存活
    const state = lane.state();
    expect(state.queues.nextRun.length).toBe(1);
    // steer/followUp 已死（归还路径见 abort 测试）
    expect(state.queues.steer.length).toBe(0);
    // drain 消费 nextRun
    const drained = await lane.drain();
    expect(drained.length).toBe(1);
    expect(drained[0]!.outcome).toBe('completed');
    await harness.close();
  });
});

describe('abort reconcile (PRD-0037 #325)', () => {
  it('restore-side abort: dangling tools get synthetic interrupted results; closing message; deferred writes survive', async () => {
    const storage = new InMemorySessionStorage('q5');
    await storage.createLane({ laneId: 'main', name: 'main' });
    const opId = 'op-dangle';
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
    // 模拟崩溃于工具执行中：assistant entry 已写、tool_started 已持久、无结果
    await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      id: `entry:${opId}:a1:1`,
      message: {
        role: 'assistant',
        content: [],
        toolCalls: [{ type: 'function', id: 'tc-dangle', name: 'bash', arguments: '{}' }],
      },
    });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'tool_started',
      id: toolStartedRecordId(`entry:${opId}:a1:1`, 0),
      payload: {
        assistantEntryId: `entry:${opId}:a1:1`,
        toolIndex: 0,
        toolCallId: 'tc-dangle',
        name: 'bash',
        args: {},
        replay: 'never',
        resultEntryId: `entry:${opId}:a1:1:r0`,
        opId,
        startedAt: 2,
      },
    });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'write_deferred',
      id: 'dw:1',
      payload: {
        append: { kind: 'custom', customType: 'fact.keep', data: 'v', id: 'entry:dw1' },
        deferredAt: 3,
      },
    });
    await storage.appendRecord({
      laneId: 'main',
      kind: 'abort_requested',
      payload: { opId, requestedAt: 4 },
    });

    const harness = await AgentHarness.create({ storage, llm: neverLLM() });
    expect(harness.laneState().status).toBe('aborting');
    const outcome = await harness.lane().resume();
    expect(outcome.outcome).toBe('aborted');
    // 无悬空 tool.call：合成 interrupted 结果已写树
    const result = await storage.getEntry(`entry:${opId}:a1:1:r0`);
    expect(result?.kind).toBe('message');
    expect(result?.kind === 'message' && result.message.toolCallId).toBe('tc-dangle');
    // 收尾 assistant 消息存在
    const branch = await harness.session.branch({});
    const closing = branch.entries.find(
      (e) => e.kind === 'message' && e.message.role === 'assistant' && e.message.partial === true,
    );
    expect(closing).toBeDefined();
    // deferred write 在 abort 路径仍应用
    expect(await storage.getEntry('entry:dw1')).toBeDefined();
    expect(harness.laneState().status).toBe('idle');
    await harness.close();
  });

  it('live abort: steer/followUp die with payloads returned; steer does not survive cancel (D4 fixed)', async () => {
    const storage = new InMemorySessionStorage('q6');
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const llm: LLM = {
      systemPrompt: 't',
      modelName: 'm',
      async chat() {
        await gate;
        return { toolCalls: [], providerFinishReason: 'completed', usage: usage() };
      },
    };
    const harness = await AgentHarness.create({ storage, llm });
    const lane = harness.lane();
    const running = lane.prompt([text('main')]);
    await lane.steer([text('late steer')]);
    await lane.followUp([text('planned next')]);
    await lane.abort();
    release?.();
    const outcome = await running;
    expect(outcome.outcome).toBe('aborted');
    // payload 归还调用方
    const dead = outcome.deadQueuePayloads ?? [];
    expect(dead.map((p) => p.queue).toSorted()).toEqual(['followUp', 'steer']);
    expect(
      dead.some((p) => p.input.some((c) => c.type === 'text' && c.text === 'late steer')),
    ).toBe(true);
    // 队列已清空：后续 drain 无事可做（nextRun 未入队）
    expect((await lane.drain()).length).toBe(0);
    expect(lane.state().queues.steer.length).toBe(0);
    await harness.close();
  });
});
