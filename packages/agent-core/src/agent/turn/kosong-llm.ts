/**
 * loop `LLM` 接口的 Kosong 支撑实现。
 *
 * 把新的 `loop/llm.ts` 契约桥接到 kosong 的 `generate()` 流式 API:
 *
 *   - kosong 的逐 part `onMessagePart` 转发为 loop 的逐 delta 回调
 *     (`onTextDelta`、`onThinkDelta`、`onToolCallDelta`)。
 *   - loop 的逐块回调(`onTextPart`、`onThinkPart`)只在 kosong 流排空后触发,
 *     遍历合并后的 `result.message.content`。完成的块落在 WAL 接缝上,
 *     原始 delta 永不落盘。
 *   - kosong 的 finish reason 作为 provider 诊断保留。loop 从归一化的响应
 *     形态推导循环控制,而非 provider 对 finish reason 的拼写。
 */

import {
  emptyUsage,
  generate as kosongGenerate,
  isRetryableGenerateError,
  type ChatProvider,
  type GenerateCallbacks,
  type Message,
  type ModelCapability,
  type PromptPlan,
  type ProviderCacheCapability,
  type StreamedMessagePart,
} from '@byfriends/kosong';

import type { LLM, LLMChatParams, LLMChatResponse, LLMRequestLogContext } from '../../loop';
import { buildPromptPlan } from '../../prompt-plan';
import { applyCompletionBudget, type CompletionBudgetConfig } from '../../utils/completion-budget';

export const GENERATE_REQUEST_LOG_CONTEXT = '__byfRequestLogContext';

export type GenerateOptionsWithRequestLog = {
  readonly signal?: AbortSignal;
  readonly promptPlan?: PromptPlan;
  readonly [GENERATE_REQUEST_LOG_CONTEXT]?: LLMRequestLogContext;
};

export type GenerateFn = typeof kosongGenerate;

export interface KosongLLMConfig {
  readonly provider: ChatProvider;
  readonly modelName: string;
  readonly systemPrompt: string;
  readonly capability?: ModelCapability;
  /**
   * kosong `generate()` 入口的可选覆盖。使 agent 宿主(及其测试装置)注入
   * 脚本化生成器,而无需替换整个 LLM 实现。
   */
  readonly generate?: GenerateFn;
  /**
   * 由 agent / provider 设置解析出的完成预算配置。最终上限在每次请求时
   * 根据当前消息与工具计算。
   */
  readonly completionBudgetConfig?: CompletionBudgetConfig;
}

export class KosongLLM implements LLM {
  readonly systemPrompt: string;
  readonly modelName: string;
  readonly capability?: ModelCapability;

  private readonly provider: ChatProvider;
  private readonly generate: GenerateFn;
  private readonly completionBudgetConfig: CompletionBudgetConfig | undefined;

  constructor(config: KosongLLMConfig) {
    this.provider = config.provider;
    this.modelName = config.modelName;
    this.systemPrompt = config.systemPrompt;
    this.capability = config.capability;
    this.generate = config.generate ?? kosongGenerate;
    this.completionBudgetConfig = config.completionBudgetConfig;
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    return this.chatOnce(params);
  }

  private async chatOnce(params: LLMChatParams): Promise<LLMChatResponse> {
    const callbacks = buildKosongCallbacks(params);

    // Compute and apply the per-request completion budget against a
    // throwaway shallow clone. `effectiveProvider` is local to this call
    // and never written back to `this.provider`, so retries (handled at
    // a higher layer) keep using the same long-lived provider/client.
    // The clamp must see every input the provider will serialize on the
    // wire — system prompt and tool schemas included — or a near-full
    // context can still slip past the limit.
    const effectiveProvider = applyCompletionBudget({
      provider: this.provider,
      budget: this.completionBudgetConfig,
      capability: this.capability,
      messages: params.messages,
      systemPrompt: this.systemPrompt,
      tools: params.tools,
    });

    const result = await this.generate(
      effectiveProvider,
      this.systemPrompt,
      [...params.tools],
      [...params.messages],
      callbacks,
      generateOptions(params, this.systemPrompt, effectiveProvider),
    );

    // Replay merged content parts onto loop per-block callbacks after the
    // stream drained. This preserves WAL append order and stops partial
    // parts from landing if the upstream stream aborts mid-message.
    if (params.onTextPart !== undefined || params.onThinkPart !== undefined) {
      for (const part of result.message.content) {
        if (part.type === 'text' && params.onTextPart !== undefined) {
          await params.onTextPart(part);
        } else if (part.type === 'think' && params.onThinkPart !== undefined) {
          await params.onThinkPart(part);
        }
      }
    }

    const response: LLMChatResponse = {
      toolCalls: [...result.message.toolCalls],
      ...(result.finishReason !== null ? { providerFinishReason: result.finishReason } : {}),
      ...(result.rawFinishReason !== null ? { rawFinishReason: result.rawFinishReason } : {}),
      usage: result.usage ?? emptyUsage(),
      llmFirstTokenLatencyMs: result.llmFirstTokenLatencyMs,
      llmStreamDurationMs: result.llmStreamDurationMs,
    };

    return response;
  }

  isRetryableError(error: unknown): boolean {
    return isRetryableGenerateError(error);
  }
}

function generateOptions(
  params: LLMChatParams,
  systemPrompt: string,
  provider: ChatProvider,
): GenerateOptionsWithRequestLog {
  // Build PromptPlan using provider's cache capability
  const cacheCapability = getProviderCacheCapability(provider);
  const promptPlan = buildPromptPlan(systemPrompt, cacheCapability);

  const options: GenerateOptionsWithRequestLog = {
    signal: params.signal,
    promptPlan,
  };

  if (params.requestLogContext !== undefined) {
    return {
      ...options,
      [GENERATE_REQUEST_LOG_CONTEXT]: params.requestLogContext,
    };
  }
  return options;
}

/**
 * 获取 provider 的缓存能力。
 *
 * 安全处理未实现 getCapability 或没有缓存的 provider。
 * 对非缓存 provider 返回带 `'none'` 策略的默认能力。
 */
export function getProviderCacheCapability(provider: ChatProvider): ProviderCacheCapability {
  if (typeof provider.getCapability !== 'function') {
    // Provider doesn't implement getCapability, assume no caching
    return { strategy: 'none' };
  }
  const capability = provider.getCapability();
  // If capability exists and has cache field, return it
  if (capability?.cache !== undefined) {
    return capability.cache;
  }
  // Otherwise return default 'none' strategy
  return { strategy: 'none' };
}

function buildKosongCallbacks(params: LLMChatParams): GenerateCallbacks {
  type ToolCallIdentity = { readonly toolCallId: string; readonly name: string };
  type BufferedToolCallDelta = { readonly argumentsPart?: string };

  const toolCallIdentities = new Map<number | string, ToolCallIdentity>();
  const pendingIndexedToolCallDeltas = new Map<number | string, BufferedToolCallDelta[]>();
  let lastToolCallIdentity: ToolCallIdentity | undefined;

  const emitToolCallDelta = (delta: {
    toolCallId: string;
    name: string;
    argumentsPart?: string;
  }): void => {
    if (params.onToolCallDelta === undefined) return;
    params.onToolCallDelta(delta);
  };

  return {
    onMessagePart: (part: StreamedMessagePart) => {
      if (part.type === 'text') {
        if (params.onTextDelta === undefined) return;
        params.onTextDelta(part.text);
        return;
      }
      if (part.type === 'think') {
        if (params.onThinkDelta === undefined) return;
        params.onThinkDelta(part.think);
        return;
      }
      if (part.type === 'function') {
        const identity = { toolCallId: part.id, name: part.name };
        lastToolCallIdentity = identity;
        if (part._streamIndex !== undefined) {
          toolCallIdentities.set(part._streamIndex, identity);
        }
        emitToolCallDelta({
          toolCallId: part.id,
          name: part.name,
          ...(part.arguments !== null ? { argumentsPart: part.arguments } : {}),
        });
        if (part._streamIndex !== undefined) {
          const pendingDeltas = pendingIndexedToolCallDeltas.get(part._streamIndex);
          if (pendingDeltas !== undefined) {
            pendingIndexedToolCallDeltas.delete(part._streamIndex);
            for (const delta of pendingDeltas) {
              emitToolCallDelta({
                toolCallId: identity.toolCallId,
                name: identity.name,
                ...delta,
              });
            }
          }
        }
        return;
      }
      if (part.type === 'tool_call_part') {
        const argumentsPart = part.argumentsPart;
        const delta = argumentsPart !== null ? { argumentsPart } : {};
        if (part.index !== undefined) {
          const identity = toolCallIdentities.get(part.index);
          if (identity === undefined) {
            const pendingDeltas = pendingIndexedToolCallDeltas.get(part.index) ?? [];
            pendingDeltas.push(delta);
            pendingIndexedToolCallDeltas.set(part.index, pendingDeltas);
            return;
          }
          emitToolCallDelta({
            toolCallId: identity.toolCallId,
            name: identity.name,
            ...delta,
          });
          return;
        }
        const identity = lastToolCallIdentity;
        if (identity === undefined) return;
        emitToolCallDelta({
          toolCallId: identity.toolCallId,
          name: identity.name,
          ...delta,
        });
      }
    },
  };
}

export function buildMessagesWithSystem(systemPrompt: string, history: Message[]): Message[] {
  return [
    { role: 'system', content: [{ type: 'text', text: systemPrompt }], toolCalls: [] },
    ...history,
  ];
}
