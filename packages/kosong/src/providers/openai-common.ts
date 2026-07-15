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
 * Convert a kosong `ContentPart` to OpenAI-compatible content part.
 * Returns `null` for think parts (handled separately as reasoning_content).
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
 * Convert a kosong `Tool` to OpenAI tool format.
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
 * Convert an OpenAI SDK error (or raw Error) to a kosong `ChatProviderError`.
 *
 * Unwraps SDK-specific classes (`APIConnectionTimeoutError`,
 * `APIConnectionError`, `APIError`) into `(message, status?, requestId?)`
 * then delegates to the shared {@link convertProviderError} classification
 * ladder. The base-`APIError` heuristic (no status, no body) still falls back
 * to message-based classification.
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
/** Shape of a function-type tool call (subset used by the guard). */
export interface FunctionToolCallShape {
  type: 'function';
  id: string;
  function: { name: string; arguments: string | null };
}

/**
 * Type guard: narrow a tool call union to the function-type variant.
 * Works with OpenAI SDK's `ChatCompletionMessageToolCall` as well as
 * any object carrying `{ type: string }`.
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
 * Map kosong `ThinkingEffort` to OpenAI `reasoning_effort` string.
 *
 * When `model` is provided, `xhigh` / `max` are clamped to `'high'` with a
 * `console.warn` if the model is not known to support the `xhigh` effort
 * level.  When `model` is omitted the mapping is pass-through (backward
 * compatible).
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
 * Map OpenAI `reasoning_effort` string back to kosong `ThinkingEffort`.
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
 * Extract `TokenUsage` from an OpenAI-compatible usage object.
 */
export function extractUsage(usage: unknown): TokenUsage | null {
  if (usage === null || usage === undefined || typeof usage !== 'object') {
    return null;
  }
  const u = usage as Record<string, unknown>;
  const promptTokens = typeof u['prompt_tokens'] === 'number' ? u['prompt_tokens'] : 0;
  const completionTokens = typeof u['completion_tokens'] === 'number' ? u['completion_tokens'] : 0;

  let cached = 0;
  // Byf proprietary: top-level cached_tokens
  if (typeof u['cached_tokens'] === 'number') {
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
 * Normalize an OpenAI Chat Completions–style `finish_reason` string to the
 * unified {@link FinishReason} enum.
 *
 * Used by both the Byf and OpenAI Legacy adapters because they share the
 * Chat Completions wire format. Returns `{ finishReason: null,
 * rawFinishReason: null }` when the upstream value is missing or `null` so
 * callers can treat "no signal" uniformly.
 *
 * Mapping:
 * - `'stop'` → `'completed'`
 * - `'tool_calls'` → `'tool_calls'`
 * - `'function_call'` → `'tool_calls'` (legacy alias)
 * - `'length'` → `'truncated'`
 * - `'content_filter'` → `'filtered'`
 * - any other non-null string → `'other'`
 */
export const normalizeOpenAIFinishReason = makeFinishReasonNormalizer(OPENAI_FINISH_REASON_MAP);
/**
 * Strategy for converting tool-role message content.
 *
 * - `'extract_text'`: flatten all content parts into a single text string
 *   (some providers require tool results as plain text).
 * - `null`: convert content parts to the standard OpenAI content-part array.
 */
export type ToolMessageConversion = 'extract_text' | null;

/**
 * Convert tool-role message content according to the chosen strategy.
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
