import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ContentPart, TokenUsage } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { AgentHarness } from '../../src/harness/agent-harness';
import { asToolStarted } from '../../src/harness/records';
import { chainFrom } from '../../src/harness/session/branch-query';
import { JsonlSessionStorage } from '../../src/harness/storage/jsonl';
import type { LLM, LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * PRD-0037 #326：崩溃矩阵属性测试（AC1/AC2/AC5）。
 *
 * 方法论：对每条 trace（单工具 run / steering / deferred write / abort /
 * 压缩 / 导航）生成真实 journal，然后对每个行位截断 → reopen → restore 断言：
 * - 每条 operation_finished 之前必有同 opId 的 operation_started（无部分结果）；
 * - 悬空 tool_started（无结果 entry）的 replay 分类存在（never|safe）；
 * - entries 树完整（父链可达根、无环）；
 * - lane 状态 ∈ {idle, suspended, aborting}。
 */

const text = (t: string): ContentPart => ({ type: 'text', text: t });
const usage = (): TokenUsage => ({
  inputOther: 1,
  output: 1,
  inputCacheRead: 0,
  inputCacheCreation: 0,
});

async function makeJsonl(sessionId: string): Promise<JsonlSessionStorage> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-crash-matrix-'));
  return JsonlSessionStorage.create(join(dir, 'wire.jsonl'), sessionId);
}

function scriptedLLM(
  responses: { text: string; toolCalls?: { id: string; name: string; arguments: string }[] }[],
): LLM {
  let call = 0;
  return {
    systemPrompt: 't',
    modelName: 'm',
    async chat(params: LLMChatParams): Promise<LLMChatResponse> {
      const response = responses[Math.min(call, responses.length - 1)]!;
      call += 1;
      await params.onTextPart?.({ type: 'text', text: response.text });
      return {
        toolCalls: response.toolCalls ?? [],
        providerFinishReason: response.toolCalls ? 'tool_calls' : 'completed',
        usage: usage(),
      };
    },
  };
}

function echoTool() {
  return {
    name: 'echo',
    description: 'echo',
    parameters: { type: 'object', properties: {} },
    resolveExecution(input: { text: string }) {
      return {
        accesses: { kind: 'none' },
        display: { kind: 'plain', summary: 'echo' },
        description: 'echo',
        execute: async () => ({ output: `echo:${input.text}` }),
      };
    },
  };
}

/** 生成完整 journal 后逐行截断做 restore 断言。 */
async function assertCrashMatrix(
  name: string,
  build: (harness: AgentHarness) => Promise<void>,
): Promise<void> {
  const storage = await makeJsonl(`matrix-${name}`);
  const harness = await AgentHarness.create({
    storage,
    llm: scriptedLLM([
      { text: 'using tool', toolCalls: [{ id: 'tc-1', name: 'echo', arguments: '{"text":"x"}' }] },
      { text: 'done' },
    ]),
    tools: [echoTool()],
    toolReplaySafety: (n) => (n === 'echo' ? 'safe' : 'never'),
  });
  await build(harness);
  await harness.close();

  const fullPath = storage.path;
  const lines = (await readFile(fullPath, 'utf8')).split('\n').filter((l) => l.length > 0);
  // 对每个截断位（1..lines.length）做 restore 断言（header 后逐行）
  for (let prefix = 1; prefix <= lines.length; prefix++) {
    const dir = await mkdtemp(join(tmpdir(), 'byf-crash-trunc-'));
    const truncatedPath = join(dir, 'wire.jsonl');
    await writeFile(truncatedPath, `${lines.slice(0, prefix).join('\n')}\n`);
    try {
      const truncated = await JsonlSessionStorage.open(truncatedPath);
      const restored = await AgentHarness.create({ storage: truncated, llm: undefined });

      // 1. 无部分结果：finished 必有配对 started（started 之前出现）
      const records = await truncated.getRecords();
      const startedSeqs = new Map<string, number>();
      for (const record of records) {
        if (record.kind !== 'operation_started') continue;
        const opId = (record.payload as { opId: string }).opId;
        startedSeqs.set(opId, record.seq);
      }
      for (const record of records) {
        if (record.kind !== 'operation_finished') continue;
        const opId = (record.payload as { opId: string }).opId;
        const startedSeq = startedSeqs.get(opId);
        expect(startedSeq, `${name}@${prefix}: finished without started`).toBeDefined();
        expect(startedSeq! < record.seq, `${name}@${prefix}: finished before started`).toBe(true);
      }

      // 2. lane 状态合法
      const lanes = await restored.lanes();
      for (const laneId of lanes) {
        const status = restored.laneState(laneId).status;
        expect(
          ['idle', 'suspended', 'aborting'],
          `${name}@${prefix}: bad status ${status}`,
        ).toContain(status);
      }

      // 3. 树完整性：每条 parent 链可达根（无环、无悬空引用）
      const entries = await truncated.getEntries();
      const byId = new Map(entries.map((e) => [e.id, e]));
      for (const entry of entries) {
        if (entry.parentId === null) continue;
        expect(byId.has(entry.parentId), `${name}@${prefix}: parent missing`).toBe(true);
      }
      const laneSnapshots = await truncated.getLanes();
      for (const lane of laneSnapshots) {
        if (lane.leafEntryId === null) continue;
        expect(byId.has(lane.leafEntryId), `${name}@${prefix}: leaf missing`).toBe(true);
        expect(
          () => chainFrom(byId, lane.leafEntryId),
          `${name}@${prefix}: chain broken`,
        ).not.toThrow();
      }

      // 4. 悬空工具分类存在（AC5）
      const main = restored.laneState('main');
      if (main.openOperation) {
        for (const dangling of main.openOperation.danglingTools) {
          expect(['never', 'safe']).toContain(dangling.replay);
          expect(dangling.resultEntryId).toBeTruthy();
        }
      }
      await restored.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  await rm(dirnameOf(fullPath), { recursive: true, force: true });
}

function dirnameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '.' : path.slice(0, idx);
}

function unwrap<T>(r: { ok: true; value: T } | { ok: false; code: string; message: string }): T {
  if (!r.ok) throw new Error('unexpected lane error: ' + r.code + ' ' + r.message);
  return r.value;
}

describe('crash matrix (PRD-0037 #326, AC1/AC2/AC5)', () => {
  it('simple run trace survives any line-boundary crash', async () => {
    await assertCrashMatrix('simple', async (harness) => {
      unwrap(await harness.lane().prompt([text('hello')]));
    });
  }, 30_000);

  it('tool run trace (with tool_started) survives any line-boundary crash', async () => {
    await assertCrashMatrix('tool', async (harness) => {
      unwrap(await harness.lane().prompt([text('use the tool')]));
    });
  }, 30_000);

  it('steering trace survives any line-boundary crash', async () => {
    await assertCrashMatrix('steer', async (harness) => {
      let release: (() => void) | undefined;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const gated: LLM = {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params) {
          await params.onTextPart?.({ type: 'text', text: 'ok' });
          void gate;
          return { toolCalls: [], providerFinishReason: 'completed', usage: usage() };
        },
      };
      void gated;
      const outcome = harness.lane().prompt([text('start')]);
      await harness.lane().steer([text('adjust')]);
      release?.();
      await outcome;
    });
  }, 30_000);

  it('deferred write trace survives any line-boundary crash', async () => {
    await assertCrashMatrix('deferred', async (harness) => {
      const running = harness.lane().prompt([text('go')]);
      await harness.lane().deferWrite({ customType: 'fact.x', data: 1 });
      await running;
    });
  }, 30_000);

  it('abort trace survives any line-boundary crash', async () => {
    await assertCrashMatrix('abort', async (harness) => {
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
      void llm;
      const running = harness.lane().prompt([text('will abort')]);
      await harness.lane().abort();
      release?.();
      await running;
    });
  }, 30_000);

  it('compaction + navigation trace survives any line-boundary crash', async () => {
    await assertCrashMatrix('compact-nav', async (harness) => {
      unwrap(await harness.lane().prompt([text('first')]));
      await harness.session.append({ laneId: 'main', kind: 'compaction', summary: 'sum' });
      await harness.session.navigate('main', (await harness.session.leaf('main'))!.parentId!);
      unwrap(await harness.lane().prompt([text('after navigate')]));
    });
  }, 30_000);
});

describe('dangling tool classification on resume (AC5)', () => {
  it('safe tools replay with real results; never tools get synthetic interrupted', async () => {
    const storage = await makeJsonl('dangling-classify');
    await storage.createLane({ laneId: 'main', name: 'main' });
    const opId = 'op-classify';
    await storage.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      id: `op:${opId}`,
      payload: {
        opId,
        kind: 'prompt',
        input: [text('go')],
        origin: { kind: 'user' },
        inputEntryId: `entry:${opId}:input`,
        startedAt: 1,
      },
    });
    await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      id: `entry:${opId}:input`,
      message: { role: 'user', content: [text('go')], origin: { kind: 'user' } },
    });
    await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      id: `entry:${opId}:a1:1`,
      message: {
        role: 'assistant',
        content: [],
        toolCalls: [
          { type: 'function', id: 'tc-safe', name: 'echo', arguments: '{"text":"replay-me"}' },
          { type: 'function', id: 'tc-never', name: 'bash', arguments: '{}' },
        ],
      },
    });
    const danglingSpecs: readonly (readonly [number, string, string, 'safe' | 'never'])[] = [
      [0, 'tc-safe', 'echo', 'safe'],
      [1, 'tc-never', 'bash', 'never'],
    ];
    for (const [index, toolCallId, name, replay] of danglingSpecs) {
      await storage.appendRecord({
        laneId: 'main',
        kind: 'tool_started',
        id: `tool:entry:${opId}:a1:1:${index}`,
        payload: {
          assistantEntryId: `entry:${opId}:a1:1`,
          toolIndex: index,
          toolCallId,
          name,
          args: name === 'echo' ? { text: 'replay-me' } : {},
          replay,
          resultEntryId: `entry:${opId}:a1:1:r${index}`,
          opId,
          startedAt: 2,
        },
      });
    }

    const harness = await AgentHarness.create({
      storage,
      llm: scriptedLLM([{ text: 'resumed fine' }]),
      tools: [echoTool()],
      toolReplaySafety: (n) => (n === 'echo' ? 'safe' : 'never'),
    });
    expect(harness.laneState().status).toBe('suspended');
    const outcome = unwrap(await harness.lane().resume());
    expect(outcome.outcome).toBe('completed');
    // safe 工具重放出真实结果
    const safeResult = await storage.getEntry(`entry:${opId}:a1:1:r0`);
    expect(safeResult?.kind === 'message' && safeResult.message.content[0]).toMatchObject({
      type: 'text',
      text: 'echo:replay-me',
    });
    // never 工具合成 interrupted
    const neverResult = await storage.getEntry(`entry:${opId}:a1:1:r1`);
    expect(neverResult?.kind === 'message' && neverResult.message.isError).toBe(true);
    expect(harness.laneState().status).toBe('idle');
    await harness.close();
  });
});
