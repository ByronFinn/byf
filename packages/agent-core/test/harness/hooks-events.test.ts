import { describe, expect, it } from 'bun:test';

import type { ContentPart, Message, TokenUsage } from '@byfriends/kosong';

import { HookEngine } from '../../src/agent/hooks/engine';
import { AgentHarness } from '../../src/harness/agent-harness';
import { watch, watchSession } from '../../src/harness/events';
import type { V2Event } from '../../src/harness/events';
import { V2HookRegistry } from '../../src/harness/hooks';
import { bridgeShellHooks } from '../../src/harness/shell-hook-bridge';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';
import type { LLMChatParams, LLMChatResponse } from '../../src/loop/llm';

/**
 * PRD-0037 #332/#333/#334：v2 hooks 目录 + shell hooks 桥 + events/watch。
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

describe('v2 hooks directory (PRD-0037 #332)', () => {
  it('before_run block rejects the run; persisted output lands in operation_started', async () => {
    const storage = new InMemorySessionStorage('h1');
    const harness = await AgentHarness.create({ storage, llm: llm('x') });
    harness.hooks.register('before_run', () => ({ persisted: { note: 'injected-by-hook' } }));
    unwrap(await harness.lane().prompt([text('first')]));
    const started = (await storage.getRecords({ kinds: ['operation_started'] }))[0]!;
    expect((started.payload as { hookPersisted?: { note: string } }).hookPersisted?.note).toBe(
      'injected-by-hook',
    );

    // block 拒绝第二条
    harness.hooks.register('before_run', () => ({ block: true, reason: 'no more' }));
    const blocked = await harness.lane().prompt([text('second')]);
    expect(blocked.ok).toBe(false);
    await harness.close();
  });

  it('before_tool is fail-closed; other hooks skip on error with handler_error', async () => {
    const registry = new V2HookRegistry();
    const errors: string[] = [];
    registry.register('before_tool', () => {
      throw new Error('handler exploded');
    });
    registry.register('before_run', () => {
      throw new Error('handler exploded');
    });
    registry.onHandlerError = (e) => errors.push(`${e.hookPoint}:${e.message}`);
    // before_tool handler 抛错 → fail-closed block
    const toolResult = await registry.run('before_tool', {
      laneId: 'main',
      hookPoint: 'before_tool',
      toolCallId: 'tc',
      name: 'bash',
      args: {},
    });
    expect(toolResult).toMatchObject({ block: true });
    // before_run handler 抛错 → 跳过 + handler_error，不抛出
    const runResult = await registry.run('before_run', {
      laneId: 'main',
      hookPoint: 'before_run',
      input: [],
    });
    expect(runResult).toBeUndefined();
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('before_run');
  });

  it('transform_context chains handlers (each sees previous output)', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('h2'),
      llm: llm('x'),
    });
    const seen: string[][] = [];
    harness.hooks.register('transform_context', (input) => {
      if (input.hookPoint !== 'transform_context') return undefined;
      seen.push(
        input.messages.map((m) => (m.content[0] as { text: string } | undefined)?.text ?? ''),
      );
      return { messages: input.messages.map((m) => ({ ...m, content: [text('A')] })) };
    });
    harness.hooks.register('transform_context', (input) => {
      if (input.hookPoint !== 'transform_context') return undefined;
      seen.push(
        input.messages.map((m) => (m.content[0] as { text: string } | undefined)?.text ?? ''),
      );
      return { messages: input.messages.map((m) => ({ ...m, content: [text('B')] })) };
    });
    const out = await harness.hooks.transform('main', [
      { role: 'user', content: [text('orig')], toolCalls: [] },
    ] as Message[]);
    expect(out[0]!.content[0]).toMatchObject({ type: 'text', text: 'B' });
    expect(seen[0]).toEqual(['orig']);
    expect(seen[1]).toEqual(['A']); // 第二个 handler 看到第一个的输出
    await harness.close();
  });

  it('before_tool in a run blocks tool execution with synthetic error result', async () => {
    const storage = new InMemorySessionStorage('h3');
    let call = 0;
    const harness = await AgentHarness.create({
      storage,
      llm: {
        systemPrompt: 't',
        modelName: 'm',
        async chat(params: LLMChatParams): Promise<LLMChatResponse> {
          call += 1;
          await params.onTextPart?.({ type: 'text', text: 'using tool' });
          return {
            toolCalls:
              call === 1
                ? [{ type: 'function', id: 'tc-1', name: 'echo', arguments: '{"text":"x"}' }]
                : [],
            providerFinishReason: call === 1 ? ('tool_calls' as const) : ('completed' as const),
            usage: usage(),
          };
        },
      },
      tools: [
        {
          name: 'echo',
          description: 'e',
          parameters: { type: 'object', properties: {} },
          resolveExecution: () => ({
            accesses: [],
            display: { kind: 'generic', summary: 'e' },
            description: 'e',
            execute: async () => ({ output: 'should-not-run' }),
          }),
        },
      ],
    });
    harness.hooks.register('before_tool', () => ({ block: true, reason: 'not allowed' }));
    const outcome = unwrap(await harness.lane().prompt([text('go')]));
    expect(outcome.outcome).toBe('completed');
    // 工具未真实执行：结果为合成错误
    const branch = await harness.session.branch({ direction: 'oldestFirst' });
    const toolMessages = branch.entries.filter(
      (e) => e.kind === 'message' && e.message.role === 'tool',
    );
    expect(toolMessages.length).toBe(1);
    const toolText = toolMessages[0]!.kind === 'message' && toolMessages[0]!.message.content[0];
    expect(toolText && toolText.type === 'text' && toolText.text).toContain('not allowed');
    await harness.close();
  });
});

describe('shell hooks bridge (PRD-0037 #333)', () => {
  it('bridges PreToolUse block through before_tool', async () => {
    const engine = new HookEngine(
      [
        {
          event: 'PreToolUse',
          matcher: 'echo',
          command: 'exit 2', // block 语义
          timeout: 5,
        },
      ],
      { cwd: '/tmp', sessionId: 's1' },
    );
    const registry = new V2HookRegistry();
    bridgeShellHooks({ engine, registry });
    const result = await registry.run('before_tool', {
      laneId: 'main',
      hookPoint: 'before_tool',
      toolCallId: 'tc',
      name: 'echo',
      args: {},
    });
    expect(result).toMatchObject({ block: true });
  });

  it('bridges UserPromptSubmit stdout into persisted injection', async () => {
    const engine = new HookEngine(
      [{ event: 'UserPromptSubmit', command: 'echo hello-from-hook', timeout: 5 }],
      { cwd: '/tmp', sessionId: 's1' },
    );
    const registry = new V2HookRegistry();
    bridgeShellHooks({ engine, registry });
    const result = (await registry.run('before_run', {
      laneId: 'main',
      hookPoint: 'before_run',
      input: [text('hi')],
    })) as { persisted?: { injected: string } } | undefined;
    expect(result?.persisted?.injected).toContain('hello-from-hook');
  });
});

describe('events and watch (PRD-0037 #334, AC7)', () => {
  it('snapshot → start() flush → live: exactly once, ordered, no loss', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('w1'),
      llm: llm('ok'),
    });
    unwrap(await harness.lane().prompt([text('before watch')]));
    const handle = await watch(harness);
    expect(handle.snapshot.lanes.length).toBe(1);
    expect(handle.snapshot.lanes[0]!.transcript.length).toBeGreaterThan(0); // 中途 attach 可渲染

    // 快照后、start 前产生事件（进缓冲）
    const live: V2Event[] = [];
    unwrap(await harness.lane().prompt([text('buffered run')]));
    const unsubscribe = handle.start((event) => live.push(event));
    // 直播事件
    unwrap(await harness.lane().prompt([text('live run')]));
    unsubscribe();
    const runStarts = live.filter((e) => e.type === 'run_start');
    const runEnds = live.filter((e) => e.type === 'run_end');
    // 恰一次：缓冲的一条（run_start/run_end）+ 直播一条
    expect(runStarts.length).toBe(2);
    expect(runEnds.length).toBe(2);
    // 有序：seq 严格递增
    for (let i = 1; i < live.length; i++) {
      expect(live[i]!.seq).toBeGreaterThan(live[i - 1]!.seq);
    }
    await harness.close();
  });

  it('watchSession subscribes session-wide; throwing listener is isolated', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('w2'),
      llm: llm('ok'),
    });
    const events: V2Event[] = [];
    const unsubscribe = await watchSession(harness, (event) => {
      if (event.type === 'run_start') throw new Error('listener exploded'); // 抛错被吞
      events.push(event);
    });
    unwrap(await harness.lane().prompt([text('go')]));
    unsubscribe();
    // 抛错的 run_start 被隔离，run_end 正常到达
    expect(events.some((e) => e.type === 'run_end')).toBe(true);
    expect(events.some((e) => e.type === 'run_start')).toBe(false);
    await harness.close();
  });

  it('multi-lane watch: events during snapshot capture are never lost', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('w4'),
      llm: llm('ok'),
    });
    unwrap(await harness.createLane('side'));
    unwrap(await harness.lane('side').prompt([text('seed side')]));
    const handle = await watch(harness);
    // 快照之后、start 之前在两个 lane 上产生事件
    unwrap(await harness.lane().prompt([text('main run')]));
    unwrap(await harness.lane('side').prompt([text('side run')]));
    const live: V2Event[] = [];
    const unsubscribe = handle.start((event) => live.push(event));
    unsubscribe();
    // 两个 lane 的 run 事件都在（无丢失）
    const runStarts = live.filter((e) => e.type === 'run_start');
    expect(runStarts.length).toBe(2);
    expect(new Set(runStarts.map((e) => e.laneId)).size).toBe(2);
    await harness.close();
  });

  it('discard drops the buffer', async () => {
    const harness = await AgentHarness.create({
      storage: new InMemorySessionStorage('w3'),
      llm: llm('ok'),
    });
    const handle = await watch(harness);
    unwrap(await harness.lane().prompt([text('buffered')]));
    handle.discard();
    const live: V2Event[] = [];
    const unsubscribe = handle.start((event) => live.push(event));
    unsubscribe();
    expect(live.length).toBe(0); // 缓冲已丢弃
    await harness.close();
  });
});
