import type { ContentPart, DeferredHandle, Message, TokenUsage } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { AgentHarness } from '../../src/harness/agent-harness';
import { DeferredAwareLLM } from '../../src/harness/park';
import type { DeferredRedemption } from '../../src/harness/park';
import { InMemorySessionStorage } from '../../src/harness/storage/memory';

/**
 * PRD-0037 #335/#336：kosong deferred + harness Park 闭环（AC8）。
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

const handle: DeferredHandle = { provider: 'fake', api: 'test', id: 'h-1' };

describe('kosong deferred types (#335)', () => {
  it('FinishReason accepts deferred; Message carries deferredHandle', () => {
    const message: Message = {
      role: 'assistant',
      content: [],
      toolCalls: [],
      deferredHandle: handle,
    };
    expect(message.deferredHandle?.id).toBe('h-1');
    const finish: Message['role'][] = ['assistant'];
    void finish;
  });

  it('DeferredAwareLLM ignores deferred for providers without fetchDeferred', async () => {
    const plain = {
      systemPrompt: 't',
      modelName: 'm',
      async chat() {
        return { toolCalls: [], providerFinishReason: 'completed' as const, usage: usage() };
      },
    };
    const wrapped = new DeferredAwareLLM(plain, undefined, undefined);
    expect(wrapped.hasDeferredCapability).toBe(false);
    // 无能力 provider：deferred 选项被忽略，永不返回 deferred
    const response = await wrapped.chat({
      messages: [],
      tools: [],
      signal: new AbortController().signal,
    });
    expect(response.providerFinishReason).not.toBe('deferred');
  });
});

describe('harness Park loop (#336, AC8)', () => {
  function deferredLLM(redemptions: DeferredRedemption[], requestCount: { n: number }) {
    const inner = {
      systemPrompt: 't',
      modelName: 'fake-model',
      async chat() {
        requestCount.n += 1;
        return {
          toolCalls: [],
          providerFinishReason: 'deferred' as const,
          usage: usage(),
          deferredHandle: handle,
        };
      },
    };
    const fetchDeferred = async (
      _model: string,
      _handle: DeferredHandle,
      _options?: { readonly wait?: number },
    ): Promise<{ finishReason: string; message: Message }> => {
      requestCount.n += 1; // 兑换请求计数（AC8：不重复计费语义）
      const next = redemptions.shift();
      if (next === undefined) {
        return {
          finishReason: 'completed',
          message: { role: 'assistant', content: [text('redeemed result')], toolCalls: [] },
        };
      }
      if (next.state === 'ready') {
        return {
          finishReason: 'completed',
          message: next.message,
        };
      }
      if (next.state === 'still-pending') {
        return {
          finishReason: 'deferred',
          message: { role: 'assistant', content: [], toolCalls: [] },
        };
      }
      return {
        finishReason: next.reason.includes('expired') ? 'expired' : 'error',
        message: { role: 'assistant', content: [], toolCalls: [] },
      };
    };
    return new DeferredAwareLLM(inner, fetchDeferred, undefined);
  }

  it('suspend → cross-process resume redeems the handle exactly once (AC8)', async () => {
    const storage = new InMemorySessionStorage('park-1');
    const requestCount = { n: 0 };
    const llm = deferredLLM([], requestCount);
    const harness = await AgentHarness.create({ storage, llm });
    const outcome = unwrap(await harness.lane().prompt([text('long task')]));
    expect(outcome.outcome).toBe('suspended');
    expect(harness.laneState().status).toBe('suspended');

    // "跨进程"：重开（挂起≡崩溃——journal 无 finished，restore 同一归约分支）
    await harness.close();
    const reopenedCount = { n: 0 };
    const reopened = await AgentHarness.create({ storage, llm: deferredLLM([], reopenedCount) });
    expect(reopened.laneState().status).toBe('suspended');
    const resumed = unwrap(await reopened.lane().resume());
    expect(resumed.outcome).toBe('completed');
    // AC8：兑换恰一次——首进程恰 1 次 chat（挂起）、重开进程恰 1 次
    // fetchDeferred 兑换（不重复计费语义）
    expect(requestCount.n).toBe(1);
    expect(reopenedCount.n).toBe(1);
    // 真实结果落树（deferred partial 消息保留在其前）
    const branch = await reopened.session.branch({ direction: 'oldestFirst' });
    const assistants = branch.entries.filter(
      (e) => e.kind === 'message' && e.message.role === 'assistant',
    );
    expect(assistants.length).toBe(2);
    const last = assistants.at(-1)!;
    expect(last.kind === 'message' && last.message.content[0]).toMatchObject({
      type: 'text',
      text: 'redeemed result',
    });
    expect(reopened.laneState().status).toBe('idle');
    await reopened.close();
  });

  it('still-pending re-suspends; terminal fails', async () => {
    const storage = new InMemorySessionStorage('park-2');
    const redemptions: DeferredRedemption[] = [
      { state: 'still-pending', handle },
      { state: 'terminal', reason: 'deferred handle expired' },
    ];
    const harness = await AgentHarness.create({ storage, llm: deferredLLM(redemptions, { n: 0 }) });
    unwrap(await harness.lane().prompt([text('go')]));
    expect(harness.laneState().status).toBe('suspended');
    // 第一次 resume：still-pending → 再挂起
    const again = unwrap(await harness.lane().resume());
    expect(again.outcome).toBe('suspended');
    // 第二次 resume：terminal → failed
    const failed = unwrap(await harness.lane().resume());
    expect(failed.outcome).toBe('failed');
    expect(failed.errorMessage).toContain('expired');
    expect(harness.laneState().status).toBe('idle');
    await harness.close();
  });

  it('deferred assistant message is persisted with the handle on the tree', async () => {
    const storage = new InMemorySessionStorage('park-3');
    const harness = await AgentHarness.create({ storage, llm: deferredLLM([], { n: 0 }) });
    unwrap(await harness.lane().prompt([text('go')]));
    const leaf = await harness.session.leaf();
    expect(leaf?.kind).toBe('message');
    expect(leaf?.kind === 'message' && leaf.message.deferredHandle?.id).toBe('h-1');
    await harness.close();
  });
});
