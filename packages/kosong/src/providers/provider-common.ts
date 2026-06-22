/**
 * Cross-provider normalization helpers shared by all ChatProvider adapters.
 *
 * Distinct from `openai-common.ts`, which holds OpenAI-family wire-format
 * conversion. This module holds helpers whose logic is structurally identical
 * across providers, parameterized only by per-provider tables or field names.
 *
 * See ADR 0015 (BaseChatProvider) for the rationale.
 */

import {
  APIConnectionError,
  APITimeoutError,
  ChatProviderError,
  normalizeAPIStatusError,
} from '#/errors';
import type { FinishReason } from '#/provider';
import type { TokenUsage } from '#/usage';

/**
 * Build a finish-reason normalizer from a per-provider raw-string → FinishReason table.
 *
 * Mirrors the shape of the per-adapter `normalizeXxxFinishReason` functions:
 * - `null` / `undefined` raw → `{ finishReason: null, rawFinishReason: null }`
 * - raw present and in the table → mapped FinishReason, raw echoed back
 * - raw present but not in the table → `'other'`, raw echoed back
 *
 * The returned function is stateless and safe to call repeatedly.
 */
export function makeFinishReasonNormalizer(mapping: Readonly<Record<string, FinishReason>>): (
  raw: string | null | undefined,
) => {
  finishReason: FinishReason | null;
  rawFinishReason: string | null;
} {
  return (raw) => {
    if (raw === null || raw === undefined) {
      return { finishReason: null, rawFinishReason: null };
    }
    const finishReason = mapping[raw] ?? 'other';
    return { finishReason, rawFinishReason: raw };
  };
}

/**
 * Build the four-field `TokenUsage` from already-parsed per-provider numbers,
 * applying the `inputOther = total - cached` formula shared by OpenAI-style and
 * Google providers (which expose only a total prompt count and a cached subset).
 *
 * `inputOther` is clamped to ≥ 0 when `cached` exceeds `total` (defensive — a
 * provider should never report more cached than total, but we never emit a
 * negative usage field). Anthropic is excluded: it reports a real
 * `inputCacheCreation` field that does not fit this formula.
 */
export function extractCacheUsage(total: number, cached: number, output: number): TokenUsage {
  return {
    inputOther: Math.max(0, total - cached),
    output,
    inputCacheRead: cached,
    inputCacheCreation: 0,
  };
}

const NETWORK_RE = /network|connection|connect|disconnect/i;
const TIMEOUT_RE = /timed?\s*out|timeout|deadline/i;

/** Options for {@link convertProviderError}. */
export interface ConvertProviderErrorOptions {
  /** Numeric HTTP status code extracted from a provider-specific error, if any. */
  readonly status?: number;
  /** Request id to attach to a status error, if any. */
  readonly requestId?: string | null;
  /**
   * Extra network-classification matchers the default `NETWORK_RE` does not
   * cover. Google's SDK throws `fetch failed`, which is not in the default
   * regex; Google supplies it here. Each matcher is tested against the
   * lowercased message.
   */
  readonly extraNetworkMatchers?: readonly RegExp[];
  /**
   * When set, a `TypeError` whose message includes this substring is also
   * classified as a connection error (Google's fetch layer throws TypeError).
   */
  readonly extraTypeErrorMatch?: string;
}

/**
 * Convert a raw thrown value into a kosong `ChatProviderError` using the
 * shared message-based classification ladder:
 *
 * 1. already a `ChatProviderError` → returned as-is (identity)
 * 2. `status` provided → `normalizeAPIStatusError` (status + message + requestId)
 * 3. message matches `TIMEOUT_RE` → `APITimeoutError`
 * 4. message matches `NETWORK_RE` or any `extraNetworkMatchers`, or the value
 *    is a `TypeError` matching `extraTypeErrorMatch` → `APIConnectionError`
 * 5. otherwise → `ChatProviderError` wrapping the message
 *
 * Provider adapters that recognize SDK-specific error classes (e.g. OpenAI's
 * `APIConnectionTimeoutError`, Google's `GoogleApiError`) should unwrap them
 * into `(message, status?, requestId?)` before calling this function. The
 * SDK-class detection itself is provider-specific and stays in the adapter.
 */
export function convertProviderError(
  error: unknown,
  opts: ConvertProviderErrorOptions = {},
): ChatProviderError {
  if (error instanceof ChatProviderError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);

  if (typeof opts.status === 'number') {
    return normalizeAPIStatusError(opts.status, message, opts.requestId);
  }

  // Timeout takes priority over network (a timeout is also a connection issue).
  if (TIMEOUT_RE.test(message)) {
    return new APITimeoutError(message);
  }

  if (NETWORK_RE.test(message)) {
    return new APIConnectionError(message);
  }
  if (opts.extraNetworkMatchers?.some((re) => re.test(message))) {
    return new APIConnectionError(message);
  }
  if (
    opts.extraTypeErrorMatch !== undefined &&
    error instanceof TypeError &&
    message.includes(opts.extraTypeErrorMatch)
  ) {
    return new APIConnectionError(message);
  }

  if (error instanceof Error) {
    return new ChatProviderError(`Error: ${message}`);
  }
  return new ChatProviderError(`Error: ${String(error)}`);
}
