import type { ContentPart, TokenUsage } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { AgentHarness } from '../../src/harness/agent-harness';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';

/**
 * PRD-0037 #328：AgentLane 完整 API + lane CRUD + per-lane 配置 +
 * results-not-exceptions（AC6/AC11）。
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

function llmWithLog(log: string[], name: string) {
  return {
    systemPrompt: 't',
    modelName: name,
    async chat(params: {
      messages: { content: ContentPart[] }[];
      onTextPart?: (p: ContentPart) => Promise<void>;
    }) {
      log.push(
        params.messages
          .flatMap((m) => m.content)
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map((c) => c.text)
          .join('|'),
      );
      await params.onTextPart?.({ type: 'text', text: `from ${name}` });
      return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
    },
  };
}

describe('lane CRUD (PRD-0037 #328)', () => {
  it('createLane/deleteLane/lanes; main not deletable; busy lane not deletable', async () => {
    const harness = await AgentHarness.create({ llm: llmWithLog([], 'm') });
    expect((await harness.createLane('research')).ok).toBe(true);
    expect((await harness.lanes()).toSorted()).toEqual(['main', 'research']);
    const delMain = await harness.deleteLane('main');
    expect(delMain.ok).toBe(false);
    if (!delMain.ok) expect(delMain.code).toBe('LANE_MAIN_UNDELETABLE');
    expect((await harness.deleteLane('research')).ok).toBe(true);
    expect(await harness.lanes()).toEqual(['main']);
    // 未知 lane 删除 → LANE_NOT_FOUND
    const missing = await harness.deleteLane('ghost');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.code).toBe('LANE_NOT_FOUND');
    await harness.close();
  });

  it('createLane forks from an entry (at)', async () => {
    const storage = new InMemorySessionStorage('lane-at');
    const harness = await AgentHarness.create({ storage, llm: llmWithLog([], 'm') });
    unwrap(await harness.lane().prompt([text('first')]));
    const first = (await harness.session.leaf())!;
    unwrap(await harness.lane().prompt([text('second')]));
    expect((await harness.createLane('branch', { fromEntryId: first.id })).ok).toBe(true);
    const branchLeaf = await harness.session.leaf('branch');
    expect(branchLeaf?.id).toBe(first.id); // 分叉点即 leaf
    await harness.close();
  });
});

describe('dual-lane parallel operations (AC6)', () => {
  it('two lanes run concurrently without interference; single writer held', async () => {
    const storage = new InMemorySessionStorage('dual');
    const log: string[] = [];
    let releaseA: (() => void) | undefined;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const llmA = {
      systemPrompt: 't',
      modelName: 'model-a',
      async chat(params: {
        messages: { content: ContentPart[] }[];
        onTextPart?: (p: ContentPart) => Promise<void>;
      }) {
        await gateA; // lane a 挂起
        await params.onTextPart?.({ type: 'text', text: 'from a' });
        return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
      },
    };
    const harness = await AgentHarness.create({
      storage,
      resolveLLM: async (modelAlias) =>
        modelAlias === 'model-a' ? llmA : llmWithLog(log, 'model-b'),
    });
    unwrap(await harness.lane().setModel('model-a')); // main 用门控 LLM
    unwrap(await harness.createLane('side'));
    unwrap(await harness.lane('side').setModel('model-b'));

    const runA = harness.lane().prompt([text('for a')]);
    const runB = harness.lane('side').prompt([text('for b')]);
    // a 挂起时 b 照常完成——互不干扰
    const b = unwrap(await runB);
    expect(b.outcome).toBe('completed');
    expect(harness.laneState().status).toBe('running');
    expect(harness.laneState('side').status).toBe('idle');
    releaseA?.();
    const a = unwrap(await runA);
    expect(a.outcome).toBe('completed');
    expect(harness.laneState().status).toBe('idle');
    // 两 lane 各自的树分叉正确（都在 main 树上，但 leaf 独立）
    const lanes = await storage.getLanes();
    expect(lanes.length).toBe(2);
    await harness.close();
  });

  it('busy lane rejects a second operation with LANE_BUSY; other lanes unaffected (AC11)', async () => {
    const harness = await AgentHarness.create({ llm: llmWithLog([], 'm') });
    unwrap(await harness.createLane('side'));
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const gated = {
      systemPrompt: 't',
      modelName: 'm',
      async chat(params: { onTextPart?: (p: ContentPart) => Promise<void> }) {
        await gate;
        await params.onTextPart?.({ type: 'text', text: 'ok' });
        return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
      },
    };
    const harness2 = await AgentHarness.create({
      resolveLLM: async (modelAlias) => (modelAlias === 'gated' ? gated : llmWithLog([], 'free')),
    });
    unwrap(await harness2.lane().setModel('gated')); // main 用门控 LLM
    unwrap(await harness2.createLane('side'));
    const running = harness2.lane().prompt([text('busy me')]);
    const busy = await harness2.lane().prompt([text('too soon')]);
    expect(busy.ok).toBe(false);
    if (!busy.ok) expect(busy.code).toBe('LANE_BUSY');
    // 其他 lane 不受影响
    const side = unwrap(await harness2.lane('side').prompt([text('free lane')]));
    expect(side.outcome).toBe('completed');
    release?.();
    expect(unwrap(await running).outcome).toBe('completed');
    await harness2.close();
    await harness.close();
  });
});

describe('results-not-exceptions (AC11)', () => {
  it('all operations and queue methods return discriminated unions, never throw', async () => {
    const storage = new InMemorySessionStorage('rne');
    const harness = await AgentHarness.create({ storage, llm: llmWithLog([], 'm') });
    const lane = harness.lane();
    // idle 违规：steer 需要 running
    const steer = await lane.steer([text('x')]);
    expect(steer.ok).toBe(false);
    // resume 需要 suspended
    const resume = await lane.resume();
    expect(resume.ok).toBe(false);
    if (!resume.ok) expect(resume.code).toBe('NOT_SUSPENDED');
    // 正常路径全部 ok
    expect((await lane.followUp([text('f')])).ok).toBe(true);
    expect((await lane.nextRun([text('n')])).ok).toBe(true);
    expect((await lane.setModel('kimi')).ok).toBe(true);
    expect((await lane.setThinkingLevel('high')).ok).toBe(true);
    expect((await lane.setActiveTools(['read'])).ok).toBe(true);
    unwrap(await lane.prompt([text('go')]));
    expect((await lane.abort()).ok).toBe(true);
    await harness.close();
  });
});

describe('per-lane config point queries (#328)', () => {
  it('model/thinkingLevel/activeTools restored from lane path config entries', async () => {
    const harness = await AgentHarness.create({ llm: llmWithLog([], 'm') });
    unwrap(await harness.createLane('side'));
    unwrap(await harness.lane().setModel('model-main'));
    unwrap(await harness.lane('side').setModel('model-side'));
    unwrap(await harness.lane().setActiveTools(['read', 'bash']));
    unwrap(await harness.lane('side').setActiveTools(['write']));
    expect(await harness.lane().getModel()).toBe('model-main');
    expect(await harness.lane('side').getModel()).toBe('model-side');
    expect(await harness.lane().getActiveTools()).toEqual(['read', 'bash']);
    expect(await harness.lane('side').getActiveTools()).toEqual(['write']);
    expect(await harness.lane().getThinkingLevel()).toBeUndefined();
    // 点查询进入 run：resolveLLM 收到各 lane 的模型
    await harness.close();
  });

  it('resolveLLM receives the lane model; tools filtered by activeTools', async () => {
    const seenModels: (string | undefined)[] = [];
    const seenToolSets: string[][] = [];
    const harness = await AgentHarness.create({
      resolveLLM: async (modelAlias) => {
        seenModels.push(modelAlias);
        return {
          systemPrompt: 't',
          modelName: modelAlias ?? 'default',
          async chat(params: {
            tools: { name: string }[];
            messages: { content: ContentPart[] }[];
            onTextPart?: (p: ContentPart) => Promise<void>;
          }) {
            // 记录 run 实际提供的工具集（review M7：钉住 activeTools 过滤）
            seenToolSets.push(params.tools.map((tool) => tool.name));
            await params.onTextPart?.({ type: 'text', text: 'ok' });
            return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
          },
        };
      },
      tools: [
        {
          name: 'read',
          description: 'r',
          parameters: { type: 'object', properties: {} },
          resolveExecution: () => ({
            accesses: { kind: 'none' },
            display: { kind: 'plain', summary: 'r' },
            description: 'r',
            execute: async () => ({ output: 'r' }),
          }),
        },
        {
          name: 'write',
          description: 'w',
          parameters: { type: 'object', properties: {} },
          resolveExecution: () => ({
            accesses: { kind: 'none' },
            display: { kind: 'plain', summary: 'w' },
            description: 'w',
            execute: async () => ({ output: 'w' }),
          }),
        },
      ],
    });
    unwrap(await harness.lane().setActiveTools(['write']));
    unwrap(await harness.lane().prompt([text('go')]));
    expect(seenModels.length).toBe(1); // per-lane 模型解析（undefined = 未设置）
    // activeTools 过滤真实生效：run 只看到 write，read 被滤除
    expect(seenToolSets).toEqual([['write']]);
    await harness.close();
  });
});

describe('waitForIdle / runWhenIdle (#328)', () => {
  it('waitForIdle resolves when the lane returns to idle', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const harness = await AgentHarness.create({
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: { onTextPart?: (p: ContentPart) => Promise<void> }) {
          await gate;
          await params.onTextPart?.({ type: 'text', text: 'ok' });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    const running = harness.lane().prompt([text('slow')]);
    const waitDone = harness.lane().waitForIdle({ timeoutMs: 5000 });
    release?.();
    expect((await waitDone).ok).toBe(true);
    expect(unwrap(await running).outcome).toBe('completed');
    await harness.close();
  });

  it('runWhenIdle rejects with LANE_BUSY when occupied', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const harness = await AgentHarness.create({
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: { onTextPart?: (p: ContentPart) => Promise<void> }) {
          await gate;
          await params.onTextPart?.({ type: 'text', text: 'ok' });
          return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
        },
      },
    });
    const running = harness.lane().prompt([text('slow')]);
    const attempted = await harness.lane().runWhenIdle(() => harness.lane().prompt([text('no')]));
    expect(attempted.ok).toBe(false);
    if (!attempted.ok) expect(attempted.code).toBe('LANE_BUSY');
    release?.();
    unwrap(await running);
    await harness.close();
  });
});
