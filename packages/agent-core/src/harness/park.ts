import type { DeferredHandle, Message } from '@byfriends/kosong';

import type { LLM, LLMChatParams, LLMChatResponse } from '../loop/llm';
import type { AgentHarness } from './agent-harness';
import type { WireSession } from './session/session';
import type { LaneId, StoredMessage } from './storage/types';

/**
 * harness Park 闭环（PRD-0037 #336，v2 §6/§14：挂起≡崩溃）。
 *
 * - DeferredAwareLLM 包装底层 LLM：chat 返回 deferred stopReason 时抛
 *   ParkSignal（非错误控制流 unwind——run 以 suspended 结局返回，不写
 *   operation_finished）；
 * - handle 随 assistant 消息落树（StoredMessage.deferredHandle）；
 * - 挂起后存储中与崩溃 lane 不可区分（同一 restore 归约分支）；
 * - resume() 归约识别"最新自身 entry 是无后继的 deferred 助手消息"→
 *   fetchDeferred 兑换：ready 落真实结果继续、still-pending 再挂起、
 *   terminal 按失败处理（新 task_attempt，受持久计数封顶）；
 * - 兑换是无副作用读取，崩溃不欠账；重跑恢复安全。
 */

/** Park 非错误控制流信号（deferred unwind）。 */
export class ParkSignal extends Error {
  constructor(readonly handle: DeferredHandle) {
    super('park: deferred request suspended');
    this.name = 'ParkSignal';
  }
}

/** deferred 兑换的三态结果。 */
export type DeferredRedemption =
  | { readonly state: 'ready'; readonly message: Message }
  | { readonly state: 'still-pending'; readonly handle: DeferredHandle }
  | { readonly state: 'terminal'; readonly reason: string };

/** 兑换能力接口：包装 LLM 暴露底层 provider 的 fetchDeferred。 */
export interface DeferredCapableLLM extends LLM {
  redeem(handle: DeferredHandle, wait?: number): Promise<DeferredRedemption>;
  cancel(handle: DeferredHandle): Promise<void>;
}

/** 包装 LLM：deferred stopReason → ParkSignal；暴露 redeem/cancel。 */
export class DeferredAwareLLM implements DeferredCapableLLM {
  readonly systemPrompt: string;
  readonly modelName: string;

  constructor(
    private readonly inner: LLM,
    private readonly fetchDeferred:
      | ((
          model: string,
          handle: DeferredHandle,
          options?: { readonly wait?: number },
        ) => Promise<{ finishReason: string; message: Message }>)
      | undefined,
    private readonly cancelDeferred:
      | ((model: string, handle: DeferredHandle) => Promise<void>)
      | undefined,
  ) {
    this.systemPrompt = inner.systemPrompt;
    this.modelName = inner.modelName;
  }

  get hasDeferredCapability(): boolean {
    return this.fetchDeferred !== undefined;
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    const response = await this.inner.chat(params);
    const handle = (response as LLMChatResponse & { deferredHandle?: DeferredHandle })
      .deferredHandle;
    if (handle !== undefined && response.providerFinishReason === 'deferred') {
      throw new ParkSignal(handle);
    }
    return response;
  }

  async redeem(handle: DeferredHandle, wait?: number): Promise<DeferredRedemption> {
    if (!this.fetchDeferred) {
      return { state: 'terminal', reason: 'provider lacks fetchDeferred capability' };
    }
    const result = await this.fetchDeferred(this.modelName, handle, { wait });
    if (result.finishReason === 'deferred') {
      return { state: 'still-pending', handle };
    }
    if (
      result.finishReason === 'error' ||
      result.finishReason === 'expired' ||
      result.finishReason === 'unknown'
    ) {
      return { state: 'terminal', reason: `deferred handle ${result.finishReason}` };
    }
    return { state: 'ready', message: result.message };
  }

  async cancel(handle: DeferredHandle): Promise<void> {
    await this.cancelDeferred?.(this.modelName, handle);
  }
}

/** 落一条 deferred 助手消息（handle 随消息落树）。 */
export async function persistDeferredAssistant(
  session: WireSession,
  laneId: string,
  handle: DeferredHandle,
  opId: string,
): Promise<string> {
  const entry = await session.append({
    laneId,
    kind: 'message',
    message: {
      role: 'assistant',
      content: [],
      partial: true,
      deferredHandle: handle,
    } satisfies StoredMessage,
  });
  void opId;
  return entry.id;
}

/**
 * 归约识别（异步）：lane 最新 entry 是无后继的 deferred 助手消息
 * （挂起兑换点）。返回 handle 供 resume 兑换。
 */
export async function findDeferredHandleAtLeaf(
  session: WireSession,
  laneId: LaneId,
): Promise<DeferredHandle | undefined> {
  const leaf = await session.leaf(laneId);
  if (!leaf || leaf.kind !== 'message') return undefined;
  const message = leaf.message;
  if (message.role === 'assistant' && message.deferredHandle !== undefined) {
    return message.deferredHandle;
  }
  return undefined;
}

/**
 * resume 的 deferred 分支（AgentHarness.resumeDeferred 调用）：
 * 读取 leaf deferred handle → 兑换三态。
 */
export async function redeemLatestDeferred(
  harness: AgentHarness,
  llm: DeferredCapableLLM,
  handle: DeferredHandle,
  laneId: string,
): Promise<
  { state: 'ready' } | { state: 'still-pending' } | { state: 'terminal'; reason: string }
> {
  const redemption = await llm.redeem(handle);
  if (redemption.state === 'ready') {
    // 落真实结果：partial deferred 消息后继 assistant 消息
    const text = redemption.message.content
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    await harness.session.append({
      laneId,
      kind: 'message',
      message: { role: 'assistant', content: [{ type: 'text', text }] },
    });
    return { state: 'ready' };
  }
  return redemption;
}
