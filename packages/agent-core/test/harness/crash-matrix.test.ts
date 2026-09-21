import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ContentPart, Message, TokenUsage, ToolCall } from '@byfriends/kosong';

import { AgentHarness } from '../../src/harness/agent-harness';
import { asToolStarted } from '../../src/harness/records';
import { chainFrom } from '../../src/harness/session/branch-query';
import { JsonlSessionStorage } from '../../src/harness/storage/jsonl';
import type { LLM, LLMChatParams, LLMChatResponse } from '../../src/loop/llm';
import type { ToolExecution } from '../../src/loop/types';

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

function scriptedLLM(responses: { text: string; toolCalls?: ToolCall[] }[]): LLM {
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
    resolveExecution(input: { text: string }): ToolExecution {
      return {
        accesses: [],
        display: { kind: 'generic', summary: 'echo' },
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
      {
        text: 'using tool',
        toolCalls: [{ type: 'function', id: 'tc-1', name: 'echo', arguments: '{"text":"x"}' }],
      },
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
        const leafEntryId = lane.leafEntryId;
        if (leafEntryId === null) continue;
        expect(byId.has(leafEntryId), `${name}@${prefix}: leaf missing`).toBe(true);
        expect(() => chainFrom(byId, leafEntryId), `${name}@${prefix}: chain broken`).not.toThrow();
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

// ────────────────────────────────────────────────────────────────────────────
// PRD-0038 R3 / AC-3.2：截断式故障注入的可重放契约
//
// 对标依据：OpenHands `test_event_log_index_gaps_detection` 同名契约。上一节
// `assertCrashMatrix` 只断言 journal 的**结构不变量**（finished 必有 started、
// 父链可达、lane 状态合法），不回答"截断之后重建出来的东西是什么、重放会不会
// 再执行一遍已落盘的 action、发给 provider 的请求会不会带悬空 tool_call"。
//
// 全程真实临时目录 + 真实 JSONL 文件，不 mock 文件系统。
// ────────────────────────────────────────────────────────────────────────────

const TRUNC_PREFIX = 'byf-ac32-trunc-';

function journalLines(text: string): string[] {
  return text.split('\n').filter((line) => line.length > 0);
}

interface JournalLineShape {
  kind?: string;
  id?: string;
  e?: { kind?: string; message?: Message };
  r?: { kind?: string };
}

function parsedLine(line: string): JournalLineShape {
  return JSON.parse(line) as JournalLineShape;
}

function countKind(lines: readonly string[], kind: string): number {
  return lines.filter((line) => parsedLine(line).kind === kind).length;
}

/** 保留前缀里最后一条该 kind 行的 id（= 最后持久化事件的标识）。 */
function lastIdOfKind(lines: readonly string[], kind: string): string | undefined {
  for (let index = lines.length - 1; index >= 0; index--) {
    const obj = parsedLine(lines[index]!);
    if (obj.kind === kind) return obj.id;
  }
  return undefined;
}

/** 携带某个 tool call 的 assistant entry 行号。 */
function lineIndexOfAssistantCall(lines: readonly string[], toolCallId: string): number {
  return lines.findIndex((line) => {
    const obj = parsedLine(line);
    if (obj.kind !== 'entry' || obj.e?.kind !== 'message') return false;
    const calls = obj.e.message?.toolCalls ?? [];
    return calls.some((call) => call.id === toolCallId);
  });
}

/** 某个 tool call 的结果 entry 行号。 */
function lineIndexOfToolResult(lines: readonly string[], toolCallId: string): number {
  return lines.findIndex((line) => {
    const obj = parsedLine(line);
    if (obj.kind !== 'entry' || obj.e?.kind !== 'message') return false;
    return obj.e.message?.role === 'tool' && obj.e.message?.toolCallId === toolCallId;
  });
}

/**
 * 第一条"意图已落盘、assistant 消息还没落盘"的 `tool_started` 行号。
 *
 * 写序就是如此：`tool_started`（意图 + 预分配 id）先于 assistant entry（效果结果）
 * 追加——见 `CONTEXT.md`「意图先行」。因此崩在这一对行之间是最难看的截断位：磁盘上
 * 有一条指向**不存在 entry** 的悬空工具记录，恢复时若不补出 assistant 消息，provider
 * 会看到一个没有主人的 tool 结果并 400 拒绝（会话砖化）。AC-3.2 的 (iv) 只覆盖了
 * "assistant 已落盘"的那个截断位，这个截断位没有任何测试。
 */
function lineIndexOfOrphanToolStarted(lines: readonly string[]): number {
  return lines.findIndex((line, index) => {
    const obj = parsedLine(line);
    if (obj.kind !== 'record' || obj.r?.kind !== 'tool_started') return false;
    const payload = asToolStarted((obj.r as { payload?: unknown }).payload);
    if (payload === undefined) return false;
    // assistant entry 在本行之后（或根本不在）= 意图先行窗口
    return !lines
      .slice(0, index)
      .some((candidate) => parsedLine(candidate).id === payload.assistantEntryId);
  });
}

function toolCallIdsOf(
  message: { readonly toolCalls?: readonly ToolCall[] } | undefined,
): string[] {
  if (message === undefined) return [];
  return (message.toolCalls ?? []).map((call) => call.id);
}

/**
 * provider 请求合法性：每个 assistant 的 toolCall 都必须有紧随其后的 tool 结果，
 * 即"不含悬空 tool_call"。这是 OpenAI/Anthropic 侧 400 拒绝的直接成因，也是
 * 会话砖化（bricking）的入口。
 */
function danglingToolCalls(messages: readonly Message[]): string[] {
  const dangling: string[] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]!;
    if (message.role !== 'assistant') continue;
    const calls = toolCallIdsOf(message);
    if (calls.length === 0) continue;
    const answered = new Set<string>();
    for (let next = index + 1; next < messages.length; next++) {
      const candidate = messages[next]!;
      if (candidate.role !== 'tool') break;
      if (candidate.toolCallId !== undefined) answered.add(candidate.toolCallId);
    }
    for (const call of calls) if (!answered.has(call)) dangling.push(call);
  }
  return dangling;
}

/**
 * 反方向的同一类非法：tool 结果出现在任何声明它的 assistant 之前。请求里有它
 * 一样被 provider 400 拒绝，且它只会来自"意图先行窗口"的截断——补完 assistant
 * 这件事做错了，就在这里暴露。
 */
function orphanToolResults(messages: readonly Message[]): string[] {
  const declared = new Set<string>();
  const orphans: string[] = [];
  for (const message of messages) {
    for (const call of toolCallIdsOf(message)) declared.add(call);
    if (message.role !== 'tool' || message.toolCallId === undefined) continue;
    if (!declared.has(message.toolCallId)) orphans.push(message.toolCallId);
  }
  return orphans;
}

/**
 * 脚本化驱动：按"已请求但未应答"决定下一个 tool call，因此对重放次数不敏感
 * （resume 后从磁盘重建的 messages 自然决定它走到哪一步）。
 */
function toolBatchLLM(toolName: string, captured: Message[][]): LLM {
  return {
    systemPrompt: 't',
    modelName: 'm',
    async chat(params: LLMChatParams): Promise<LLMChatResponse> {
      captured.push(params.messages.map((message) => structuredClone(message)));
      const answered = new Set(
        params.messages
          .filter((message) => message.role === 'tool')
          .map((message) => message.toolCallId),
      );
      const next = ['tc-1', 'tc-2'].find((id) => !answered.has(id));
      if (next === undefined) {
        await params.onTextPart?.({ type: 'text', text: 'all done' });
        return { toolCalls: [], providerFinishReason: 'completed', usage: usage() };
      }
      await params.onTextPart?.({ type: 'text', text: `calling ${next}` });
      return {
        toolCalls: [
          {
            type: 'function',
            id: next,
            name: toolName,
            arguments: JSON.stringify({ text: next }),
          },
        ],
        providerFinishReason: 'tool_calls',
        usage: usage(),
      };
    },
  };
}

/** 记录每次真实执行，用于断言"日志中已存在的 action 不被再次执行"。 */
function countingTool(name: string, executions: string[]) {
  return {
    name,
    description: name,
    parameters: { type: 'object', properties: {} },
    resolveExecution(input: { text: string }): ToolExecution {
      return {
        accesses: [],
        display: { kind: 'generic', summary: name },
        description: name,
        execute: async () => {
          executions.push(input.text);
          return { output: `${name}:${input.text}` };
        },
      };
    },
  };
}

const TOOL_NAME = 'ac32_echo';

/** 跑一次"两个工具批次 + 收尾文本"的真实 run，产出真实 journal。 */
async function buildTruncationSource(sessionId: string): Promise<{
  dir: string;
  path: string;
  lines: string[];
}> {
  const dir = await mkdtemp(join(tmpdir(), TRUNC_PREFIX));
  const path = join(dir, 'wire.jsonl');
  const executions: string[] = [];
  const storage = await JsonlSessionStorage.create(path, sessionId);
  const harness = await AgentHarness.create({
    storage,
    llm: toolBatchLLM(TOOL_NAME, []),
    tools: [countingTool(TOOL_NAME, executions)],
    toolReplaySafety: () => 'never',
  });
  unwrap(await harness.lane().prompt([text('run two tool batches')]));
  await harness.close();
  const lines = journalLines(await readFile(path, 'utf8'));
  return { dir, path, lines };
}

/** 把 header + 前 N 行写入新目录的 wire.jsonl，模拟断电后的磁盘。 */
async function writeTruncatedJournal(
  headerLine: string,
  retained: readonly string[],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), TRUNC_PREFIX));
  const path = join(dir, 'wire.jsonl');
  await writeFile(path, `${[headerLine, ...retained].join('\n')}\n`, 'utf-8');
  return path;
}

describe('truncation fault injection (PRD-0038 AC-3.2)', () => {
  it('(i)(ii) rebuilds exactly the longest contiguous prefix at every cut point', async () => {
    const source = await buildTruncationSource('ac32-prefix');
    const header = source.lines[0]!;
    const body = source.lines.slice(1);
    expect(body.length, 'source journal must be non-trivial').toBeGreaterThan(4);

    for (let cut = 1; cut <= body.length; cut++) {
      const retained = body.slice(0, cut);
      const path = await writeTruncatedJournal(header, retained);
      try {
        const storage = await JsonlSessionStorage.open(path);
        const harness = await AgentHarness.create({ storage, llm: undefined });
        const entries = await storage.getEntries();
        const records = await storage.getRecords();

        // (i) 重建长度 = 最长连续前缀：条目/记录数与保留行数逐类相等，
        //     既不凭空多（重放已落盘 action）也不凭空少（吞掉已确认事件）。
        expect(entries.length, `cut=${String(cut)}: entries rebuilt length`).toBe(
          countKind(retained, 'entry'),
        );
        expect(records.length, `cut=${String(cut)}: records rebuilt length`).toBe(
          countKind(retained, 'record'),
        );

        // (ii) 最后一条 = 最后持久化事件
        const lastEntry = entries.toSorted((a, b) => a.seq - b.seq).at(-1);
        const expectedLastEntryId = lastIdOfKind(retained, 'entry');
        expect(lastEntry?.id, `cut=${String(cut)}: last entry id`).toBe(expectedLastEntryId);
        const lastRecord = records.at(-1);
        expect(lastRecord?.id, `cut=${String(cut)}: last record id`).toBe(
          lastIdOfKind(retained, 'record'),
        );

        await harness.close();
      } finally {
        await rm(dirnameOf(path), { recursive: true, force: true });
      }
    }
    await rm(source.dir, { recursive: true, force: true });
  }, 60_000);

  it('(i) drops a torn trailing line as unconfirmed and physically truncates it', async () => {
    const source = await buildTruncationSource('ac32-torn');
    const header = source.lines[0]!;
    const body = source.lines.slice(1);
    const complete = body.slice(0, body.length - 1);
    const torn = body.at(-1)!.slice(0, Math.floor(body.at(-1)!.length / 2));
    const path = await writeTruncatedJournal(header, [...complete, torn]);
    // 半行：无换行终结
    await writeFile(path, `${[header, ...complete].join('\n')}\n${torn}`);

    try {
      const storage = await JsonlSessionStorage.open(path);
      const harness = await AgentHarness.create({ storage, llm: undefined });
      const entries = await storage.getEntries();
      const records = await storage.getRecords();

      expect(entries.length).toBe(countKind(complete, 'entry'));
      expect(records.length).toBe(countKind(complete, 'record'));

      // 撕裂行被物理截断，而不是留在磁盘上被下次追加拼成坏行
      const onDisk = await readFile(path, 'utf8');
      expect(onDisk.endsWith(torn)).toBe(false);
      expect(onDisk.endsWith('\n')).toBe(true);
      expect(journalLines(onDisk).length).toBe(1 + complete.length);

      await harness.close();
    } finally {
      await rm(dirnameOf(path), { recursive: true, force: true });
      await rm(source.dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('(iii) does not re-execute an action whose result is already persisted', async () => {
    const source = await buildTruncationSource('ac32-once');
    const header = source.lines[0]!;
    const body = source.lines.slice(1);
    const resultIndex = lineIndexOfToolResult(body, 'tc-1');
    expect(resultIndex, 'tc-1 result must be persisted').toBeGreaterThan(-1);
    // 停在 tc-1 结果之后：tc-1 是"已存在的 action"，tc-2 尚未开始
    const retained = body.slice(0, resultIndex + 1);
    const path = await writeTruncatedJournal(header, retained);

    const executions: string[] = [];
    const captured: Message[][] = [];
    try {
      const storage = await JsonlSessionStorage.open(path);
      const harness = await AgentHarness.create({
        storage,
        llm: toolBatchLLM(TOOL_NAME, captured),
        tools: [countingTool(TOOL_NAME, executions)],
        toolReplaySafety: () => 'never',
      });
      unwrap(await harness.lane().resume());

      // 只有 tc-2 该被执行，且只一次
      expect(executions, '已落盘的 tc-1 不得再次执行；tc-2 也只该执行一次').toEqual(['tc-2']);

      // 每个 tool call 在重开后的树里最多只有一条结果 entry（幂等 id 不得互相覆盖）
      const allEntries = await storage.getEntries();
      for (const toolCallId of ['tc-1', 'tc-2']) {
        const results = allEntries.filter(
          (entry) =>
            entry.kind === 'message' &&
            entry.message.role === 'tool' &&
            entry.message.toolCallId === toolCallId,
        );
        expect(results.length, `${toolCallId} 的结果 entry 数量`).toBe(1);
      }

      // 重启不得让 provider 看到"一字不差的重发"——重发意味着上一步的执行结果
      // 被 id 冲突吞掉，副作用已经发生但历史里没有它
      for (let index = 1; index < captured.length; index++) {
        const previous = JSON.stringify(captured[index - 1]);
        const current = JSON.stringify(captured[index]);
        expect(
          current === previous,
          `provider request #${String(index + 1)} 与上一条完全相同（重放把已执行的动作又发了一遍）`,
        ).toBe(false);
      }
      await harness.close();
    } finally {
      await rm(dirnameOf(path), { recursive: true, force: true });
      await rm(source.dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('(iv) backfills a synthesized observation and the next request has no dangling tool_call', async () => {
    const source = await buildTruncationSource('ac32-orphan');
    const header = source.lines[0]!;
    const body = source.lines.slice(1);
    const assistantIndex = lineIndexOfAssistantCall(body, 'tc-1');
    expect(assistantIndex, 'assistant entry carrying tc-1 must exist').toBeGreaterThan(-1);
    // 停在 assistant 消息之后：tool_started 已落盘、结果未落盘 = 崩溃在工具执行中
    const retained = body.slice(0, assistantIndex + 1);
    const path = await writeTruncatedJournal(header, retained);

    const executions: string[] = [];
    const captured: Message[][] = [];
    try {
      const storage = await JsonlSessionStorage.open(path);
      const harness = await AgentHarness.create({
        storage,
        llm: toolBatchLLM(TOOL_NAME, captured),
        tools: [countingTool(TOOL_NAME, executions)],
        // 有副作用工具：不可重放，必须合成 observation 而不是再跑一遍
        toolReplaySafety: () => 'never',
      });
      expect(harness.laneState().status).toBe('suspended');
      unwrap(await harness.lane().resume());

      // 回填的 observation 落在会话里（不是只在内存里糊过去）
      const synthesized = (await storage.getEntries()).filter(
        (entry) =>
          entry.kind === 'message' &&
          entry.message.role === 'tool' &&
          entry.message.toolCallId === 'tc-1',
      );
      expect(synthesized.length).toBe(1);
      expect(synthesized[0]!.kind === 'message' && synthesized[0]!.message.isError).toBe(true);

      // 副作用工具未被重放
      expect(executions).not.toContain('tc-1');

      // 每个发往 provider 的请求都不含悬空 tool_call
      expect(captured.length, 'resume 必须真的问过 provider').toBeGreaterThan(0);
      for (const [index, messages] of captured.entries()) {
        expect(
          danglingToolCalls(messages),
          `provider request #${String(index + 1)} carries dangling tool_call(s)`,
        ).toEqual([]);
      }
      await harness.close();
    } finally {
      await rm(dirnameOf(path), { recursive: true, force: true });
      await rm(source.dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('(iii)(iv) survives the intent-before-effect cut, where no assistant entry exists yet', async () => {
    const source = await buildTruncationSource('ac32-intent-window');
    const header = source.lines[0]!;
    const body = source.lines.slice(1);
    const orphanIndex = lineIndexOfOrphanToolStarted(body);
    expect(
      orphanIndex,
      'source journal must contain a tool_started whose assistant entry is written later',
    ).toBeGreaterThan(-1);
    // 截断落在"意图已落盘、效果未落盘"之间：磁盘上只有一条指向不存在 entry 的记录
    const retained = body.slice(0, orphanIndex + 1);
    const danglingPayload = asToolStarted(
      (parsedLine(retained.at(-1)!).r as { payload?: unknown }).payload,
    )!;
    const toolCallId = danglingPayload.toolCallId;
    expect(
      retained.some((line) => parsedLine(line).id === danglingPayload.assistantEntryId),
      '前提：assistant entry 不在保留前缀里',
    ).toBe(false);

    const path = await writeTruncatedJournal(header, retained);
    const executions: string[] = [];
    const captured: Message[][] = [];
    try {
      const storage = await JsonlSessionStorage.open(path);
      const harness = await AgentHarness.create({
        storage,
        llm: toolBatchLLM(TOOL_NAME, captured),
        tools: [countingTool(TOOL_NAME, executions)],
        // 副作用工具：这条意图代表"效果可能已经发生"，绝不能再跑一次
        toolReplaySafety: () => 'never',
      });

      // 恢复必须把它识别为悬空意图，而不是静默当成"这一轮没发生过"
      const main = harness.laneState('main');
      expect(main.status).toBe('suspended');
      const dangling = main.openOperation?.danglingTools ?? [];
      expect(
        dangling.map((tool) => tool.toolCallId),
        '没有 assistant entry 的 tool_started 仍必须出现在待处置清单里',
      ).toContain(toolCallId);

      unwrap(await harness.lane().resume());

      // 补出的 assistant 必须存在，且声明了这个 tool call
      const entries = await storage.getEntries();
      const assistant = entries.find((entry) => entry.id === danglingPayload.assistantEntryId);
      expect(assistant, '恢复必须补齐 owner assistant entry').toBeDefined();
      expect(
        toolCallIdsOf(assistant?.kind === 'message' ? assistant.message : undefined),
      ).toContain(toolCallId);

      // 结果 entry 恰好一条（预分配 id 幂等，不得互相覆盖也不得重复）
      const results = entries.filter(
        (entry) =>
          entry.kind === 'message' &&
          entry.message.role === 'tool' &&
          entry.message.toolCallId === toolCallId,
      );
      expect(results.length).toBe(1);
      expect(results[0]!.kind === 'message' && results[0]!.message.isError).toBe(true);

      // 这条意图对应的 action 不得被再次执行
      expect(executions, 'tool_started 已落盘的 action 不得重跑').not.toContain(toolCallId);
      expect(
        executions.length,
        `每个 tool call 至多执行一次（实测 ${JSON.stringify(executions)}）`,
      ).toBe(new Set(executions).size);

      // 两个方向的非法都必须为零：既无悬空 tool_call，也无无主 tool 结果
      expect(captured.length).toBeGreaterThan(0);
      for (const [index, messages] of captured.entries()) {
        const label = `provider request #${String(index + 1)}`;
        expect(danglingToolCalls(messages), `${label} carries dangling tool_call(s)`).toEqual([]);
        expect(orphanToolResults(messages), `${label} carries orphan tool result(s)`).toEqual([]);
      }
      await harness.close();
    } finally {
      await rm(dirnameOf(path), { recursive: true, force: true });
      await rm(source.dir, { recursive: true, force: true });
    }
  }, 60_000);
});

// ────────────────────────────────────────────────────────────────────────────
// PRD-0038 R3 / AC-3.4：重放安全边界被声明（行为侧）
//
// "事件日志可重放" ≠ "工具副作用可回滚"。二元 never|safe 分不清两件事：
//   - 本机有副作用（Write/Edit）：崩在中间可能留下半改动的文件；
//   - 远程不可逆（下单、发消息、支付）：日志能重放，远端状态不能回滚。
// 三档分类必须在 restore 时可查询，并且**合成的 observation 必须把这条边界说
// 清楚**——同一段 `[interrupted]` 让模型以为"什么都没发生"，正是事故来源。
// 契约层的词汇表导出断言在 packages/node-sdk/test/session-identity-contract.test.ts。
// ────────────────────────────────────────────────────────────────────────────

/** 契约层的三档分类（期望值，不接受实现自拟）。 */
const REPLAY_CLASSES = {
  readOnly: 'read-only',
  sideEffect: 'side-effect',
  remoteIrreversible: 'remote-irreversible',
} as const;

describe('replay safety boundary is declared on restore (PRD-0038 AC-3.4)', () => {
  it('distinguishes read-only replay from local side effects and irreversible remote calls', async () => {
    const storage = await makeJsonl('ac34-classes');
    await storage.createLane({ laneId: 'main', name: 'main' });
    const opId = 'op-ac34';
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
    const assistantEntryId = `entry:${opId}:a1:1`;
    const calls = [
      { toolCallId: 'tc-read', name: 'read_thing', replay: REPLAY_CLASSES.readOnly },
      { toolCallId: 'tc-local', name: 'write_thing', replay: REPLAY_CLASSES.sideEffect },
      { toolCallId: 'tc-remote', name: 'send_email', replay: REPLAY_CLASSES.remoteIrreversible },
    ];
    await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      id: assistantEntryId,
      message: {
        role: 'assistant',
        content: [],
        toolCalls: calls.map((call) => ({
          type: 'function',
          id: call.toolCallId,
          name: call.name,
          arguments: '{"text":"payload"}',
        })),
      },
    });
    for (const [index, call] of calls.entries()) {
      await storage.appendRecord({
        laneId: 'main',
        kind: 'tool_started',
        id: `tool:${assistantEntryId}:${index}`,
        payload: {
          assistantEntryId,
          toolIndex: index,
          toolCallId: call.toolCallId,
          name: call.name,
          args: { text: 'payload' },
          replay: call.replay,
          resultEntryId: `${assistantEntryId}:r${index}`,
          opId,
          startedAt: 2,
        },
      });
    }

    const executions: string[] = [];
    const namedTool = (name: string) => ({
      name,
      description: name,
      parameters: { type: 'object', properties: {} },
      resolveExecution(input: { text: string }): ToolExecution {
        return {
          accesses: [],
          display: { kind: 'generic', summary: name },
          description: name,
          execute: async () => {
            executions.push(name);
            return { output: `${name}:${input.text}` };
          },
        };
      },
    });
    const harness = await AgentHarness.create({
      storage,
      llm: scriptedLLM([{ text: 'resumed' }]),
      tools: calls.map((call) => namedTool(call.name)),
      // 分类由契约层提供；这里按工具名给出三档
      toolReplaySafety: (toolName) => {
        if (toolName === 'read_thing') return REPLAY_CLASSES.readOnly as never;
        if (toolName === 'write_thing') return REPLAY_CLASSES.sideEffect as never;
        return REPLAY_CLASSES.remoteIrreversible as never;
      },
    });

    // (a) 分类在 restore 后的 lane 状态里可查询
    const dangling = harness.laneState('main').openOperation?.danglingTools ?? [];
    expect(dangling.map((tool) => tool.name).toSorted()).toEqual([
      'read_thing',
      'send_email',
      'write_thing',
    ]);
    expect(Object.fromEntries(dangling.map((tool) => [tool.name, tool.replay]))).toEqual({
      read_thing: REPLAY_CLASSES.readOnly,
      write_thing: REPLAY_CLASSES.sideEffect,
      send_email: REPLAY_CLASSES.remoteIrreversible,
    });

    const outcome = unwrap(await harness.lane().resume());
    expect(outcome.outcome).toBe('completed');

    // (b) 只读工具重放出真实结果；两类不可重放工具一次都不执行
    expect(executions).toEqual(['read_thing']);

    const readResult = await storage.getEntry(`${assistantEntryId}:r0`);
    expect(readResult?.kind === 'message' && readResult.message.content[0]).toMatchObject({
      type: 'text',
      text: 'read_thing:payload',
    });

    const localResult = await storage.getEntry(`${assistantEntryId}:r1`);
    const remoteResult = await storage.getEntry(`${assistantEntryId}:r2`);
    expect(localResult?.kind === 'message').toBe(true);
    expect(localResult?.kind === 'message' && localResult.message.isError).toBe(true);
    expect(remoteResult?.kind === 'message').toBe(true);
    expect(remoteResult?.kind === 'message' && remoteResult.message.isError).toBe(true);

    const textOf = (entry: typeof localResult): string =>
      entry?.kind === 'message'
        ? entry.message.content
            .filter((part) => part.type === 'text')
            .map((part) => (part as { text: string }).text)
            .join('')
        : '';
    const localText = textOf(localResult);
    const remoteText = textOf(remoteResult);

    // (c) 三条边界必须被说清楚，且不得暗示文件级/事务级回滚
    for (const synthesized of [localText, remoteText]) {
      expect(synthesized.length, '合成 observation 不能是空串').toBeGreaterThan(0);
      for (const rollbackImplication of ['rolled back', 'reverted', 'undone', '已回滚', '已撤销']) {
        expect(synthesized).not.toContain(rollbackImplication);
      }
    }
    // 同一段通用文案无法同时表达"本机可能留下半改动"和"远端不可逆"
    expect(
      remoteText,
      '远程不可逆的 observation 必须与本机副作用可区分（现在两者共用 [interrupted]）',
    ).not.toBe(localText);
    expect(remoteText, '远程不可逆必须把"效果可能已经在远端发生"讲给模型听').not.toMatch(
      /^\s*\[interrupted\]\s*$/,
    );

    // (d) 回填之后发给 provider 的请求不含悬空 tool_call
    expect(harness.laneState('main').status).toBe('idle');
    await harness.close();
  });
});
