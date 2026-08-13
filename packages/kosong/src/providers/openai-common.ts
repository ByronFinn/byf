import {
  APIConnectionError as OpenAIConnectionError,
  APIConnectionTimeoutError as OpenAITimeoutError,
  APIError as OpenAIAPIError,
  OpenAIError,
} from 'openai';

import { ChatProviderError, parseRetryAfterMs } from '#/errors';
import { extractText } from '#/message';
import type { ContentPart, Message } from '#/message';
import type { FinishReason, ThinkingEffort } from '#/provider';
import type { Tool } from '#/tool';
import type { TokenUsage } from '#/usage';

import {
  convertProviderError,
  extractCacheUsage,
  makeFinishReasonNormalizer,
} from './provider-common';
export interface OpenAIContentPart {
  type: string;
  text?: string;
  image_url?: { url: string; id?: string | null };
  audio_url?: { url: string; id?: string | null };
  video_url?: { url: string; id?: string | null };
}

/**
 * 把 kosong `ContentPart` 转换为 OpenAI 兼容内容 part。
 * think part 返回 `null`(作为 reasoning_content 单独处理)。
 */
export function convertContentPart(part: ContentPart): OpenAIContentPart | null {
  switch (part.type) {
    case 'text':
      return { type: 'text', text: part.text };
    case 'think':
      // Think parts are handled separately as reasoning_content — skip them here.
      return null;
    case 'image_url':
      return {
        type: 'image_url',
        image_url:
          part.imageUrl.id === undefined
            ? { url: part.imageUrl.url }
            : { url: part.imageUrl.url, id: part.imageUrl.id },
      };
    case 'audio_url':
      return {
        type: 'audio_url',
        audio_url:
          part.audioUrl.id === undefined
            ? { url: part.audioUrl.url }
            : { url: part.audioUrl.url, id: part.audioUrl.id },
      };
    case 'video_url':
      return {
        type: 'video_url',
        video_url:
          part.videoUrl.id === undefined
            ? { url: part.videoUrl.url }
            : { url: part.videoUrl.url, id: part.videoUrl.id },
      };
    default:
      throw new Error(`Unknown content part type: ${(part as ContentPart).type}`);
  }
}
export interface OpenAIToolParam {
  type: string;
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

/**
 * 把 kosong `Tool` 转换为 OpenAI 工具格式。
 */
export function toolToOpenAI(tool: Tool): OpenAIToolParam {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  };
}
/**
 * 把 OpenAI SDK 错误(或原始 Error)转换为 kosong `ChatProviderError`。
 *
 * 把 SDK 特定类(`APIConnectionTimeoutError`、`APIConnectionError`、
 * `APIError`)解包为 `(message, status?, requestId?)`,然后委托给共享的
 * {@link convertProviderError} 分类阶梯。基础 `APIError` 启发式
 * (无状态、无 body)仍回退到基于消息的分类。
 */
export function convertOpenAIError(error: unknown): ChatProviderError {
  // v6: APIConnectionTimeoutError extends APIConnectionError, check timeout first
  if (error instanceof OpenAITimeoutError) {
    return convertProviderError(error, { status: undefined });
  }
  if (error instanceof OpenAIConnectionError) {
    return convertProviderError(error, { status: undefined });
  }
  // APIError with a status code => status error
  if (error instanceof OpenAIAPIError && typeof error.status === 'number') {
    const reqId = error.requestID ?? null;
    const retryAfterMs =
      error.headers instanceof Headers ? parseRetryAfterMs(error.headers.get('retry-after')) : null;
    return convertProviderError(error, { status: error.status, requestId: reqId, retryAfterMs });
  }
  // Base APIError with no status and no body => transport-layer failure.
  // When the error has a body (e.g. SSE error events from the server),
  // skip the heuristic to avoid misclassifying server-side errors.
  if (
    error instanceof OpenAIAPIError &&
    error.constructor === OpenAIAPIError &&
    error.error === undefined
  ) {
    return convertProviderError(error, { status: undefined });
  }
  if (error instanceof OpenAIError) {
    return new ChatProviderError(`Error: ${error.message}`);
  }
  return convertProviderError(error);
}
/** 函数型工具调用的形态(守卫使用的子集)。 */
export interface FunctionToolCallShape {
  type: 'function';
  id: string;
  function: { name: string; arguments: string | null };
}

/**
 * 类型守卫:把工具调用联合收窄为函数型变体。
 * 兼容 OpenAI SDK 的 `ChatCompletionMessageToolCall` 及任何携带
 * `{ type: string }` 的对象。
 */
export function isFunctionToolCall<T extends { type: string }>(
  tc: T,
): tc is T & FunctionToolCallShape {
  return tc.type === 'function';
}
/**
 * Model name prefixes / exact names known to support the `xhigh` reasoning
 * effort level.  All other OpenAI-compatible models clamp `xhigh` / `max`
 * down to `high`.
 */
const XHIGH_SUPPORT_PREFIXES = ['gpt-5.', 'gpt-5-', 'o3-pro', 'o4-mini'] as const;

function supportsXhighReasoningEffort(model: string): boolean {
  const normalized = model.toLowerCase();
  return XHIGH_SUPPORT_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * 把 kosong `ThinkingEffort` 映射为 OpenAI `reasoning_effort` 字符串。
 *
 * 提供 `model` 时,若模型未知支持 `xhigh` 努力级别,`xhigh` / `max`
 * 会被钳制为 `'high'` 并 `console.warn`。省略 `model` 时映射为透传
 * (向后兼容)。
 */
export function thinkingEffortToReasoningEffort(
  effort: ThinkingEffort,
  model?: string,
  warn?: (msg: string) => void,
): string | undefined {
  switch (effort) {
    case 'off':
      return undefined;
    case 'low':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'xhigh':
    case 'max': {
      const _warn = warn ?? console.warn;
      if (model !== undefined && !supportsXhighReasoningEffort(model)) {
        _warn(`effort '${effort}' clamped to 'high' for model ${model}`);
        return 'high';
      }
      return 'xhigh';
    }
    default:
      throw new Error(`Unknown thinking effort: ${String(effort)}`);
  }
}

/**
 * 把 OpenAI `reasoning_effort` 字符串映射回 kosong `ThinkingEffort`。
 */
export function reasoningEffortToThinkingEffort(
  reasoning: string | undefined,
): ThinkingEffort | null {
  if (reasoning === undefined || reasoning === null) {
    return null;
  }
  switch (reasoning) {
    case 'low':
    case 'minimal':
      return 'low';
    case 'medium':
      return 'medium';
    case 'high':
      return 'high';
    case 'xhigh':
    case 'max':
      return 'xhigh';
    case 'none':
      return 'off';
    default:
      return 'off';
  }
}
/**
 * 从 OpenAI 兼容的 usage 对象提取 `TokenUsage`。
 */
export function extractUsage(usage: unknown): TokenUsage | null {
  if (usage === null || usage === undefined || typeof usage !== 'object') {
    return null;
  }
  const u = usage as Record<string, unknown>;
  const promptTokens = typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : 0;
  const completionTokens = typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : 0;

  let cached = 0;
  // Field-presence based, capability-driven (no provider-name branching):
  // 1. DeepSeek (OpenAI-compatible): top-level prompt_cache_hit_tokens.
  //    DeepSeek caching is fully automatic (no prompt_cache_key) and reported
  //    via top-level hit/miss fields; miss ≈ hit × 50–120 in V4 pricing.
  // 2. Byf proprietary: top-level cached_tokens.
  // 3. OpenAI standard: nested prompt_tokens_details.cached_tokens.
  if (typeof u['prompt_cache_hit_tokens'] === 'number') {
    cached = u['prompt_cache_hit_tokens'];
  } else if (typeof u['cached_tokens'] === 'number') {
    // Byf proprietary: top-level cached_tokens
    cached = u['cached_tokens'];
  } else if (
    typeof u['prompt_tokens_details'] === 'object' &&
    u['prompt_tokens_details'] !== null
  ) {
    const details = u['prompt_tokens_details'] as Record<string, unknown>;
    if (typeof details['cached_tokens'] === 'number') {
      cached = details['cached_tokens'];
    }
  }

  return extractCacheUsage(promptTokens, cached, completionTokens);
}
const OPENAI_FINISH_REASON_MAP: Readonly<Record<string, FinishReason>> = {
  stop: 'completed',
  tool_calls: 'tool_calls',
  function_call: 'tool_calls',
  length: 'truncated',
  content_filter: 'filtered',
};

/**
 * 把 OpenAI Chat Completions 风格的 `finish_reason` 字符串归一化为统一
 * {@link FinishReason} 枚举。
 *
 * Byf 与 OpenAI Legacy 适配器都使用它,因为它们共享 Chat Completions
 * wire 格式。上游值缺失或为 `null` 时返回
 * `{ finishReason: null, rawFinishReason: null }`,使调用方可统一处理
 * 「无信号」。
 *
 * 映射:
 * - `'stop'` → `'completed'`
 * - `'tool_calls'` → `'tool_calls'`
 * - `'function_call'` → `'tool_calls'`(遗留别名)
 * - `'length'` → `'truncated'`
 * - `'content_filter'` → `'filtered'`
 * - 任何其他非 null 字符串 → `'other'`
 */
export const normalizeOpenAIFinishReason = makeFinishReasonNormalizer(OPENAI_FINISH_REASON_MAP);
/**
 * 转换工具角色消息内容的策略。
 *
 * - `'extract_text'`:把所有内容 part 展平为单个文本字符串
 *   (部分 provider 要求工具结果为纯文本)。
 * - `null`:把内容 part 转换为标准 OpenAI 内容 part 数组。
 */
export type ToolMessageConversion = 'extract_text' | null;

/**
 * 按所选策略转换工具角色消息内容。
 */
export function convertToolMessageContent(
  message: Message,
  conversion: ToolMessageConversion,
): string | OpenAIContentPart[] {
  if (conversion === 'extract_text') {
    return extractText(message);
  }
  return message.content
    .map((p) => convertContentPart(p))
    .filter((p): p is OpenAIContentPart => p !== null);
}
