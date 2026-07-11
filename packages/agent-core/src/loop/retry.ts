import { sleep } from '@antfu/utils';
import { APIProviderRateLimitError } from '@byfriends/kosong';
import * as retry from 'retry';

import type { Logger } from '#/logging/types';

import { abortable } from '../utils/abort';
import { isAbortError } from './errors';
import type { LoopEventDispatcher } from './events';
import type { LLM, LLMChatParams, LLMChatResponse } from './llm';

export const DEFAULT_MAX_RETRY_ATTEMPTS = 3;

const RETRY_MIN_TIMEOUT_MS = 300;
const RETRY_MAX_TIMEOUT_MS = 5000;
const RETRY_FACTOR = 2;
/**
 * Upper bound on a single retry sleep — applied to both the local backoff
 * and any server-provided `Retry-After`. Without this a malicious or buggy
 * server returning `Retry-After: 86400` (a day) would hang the turn until the
 * process is killed. Capped at a generous multiple of the local backoff max
 * so a legitimate "wait a minute" from the server is still honored.
 */
const RETRY_AFTER_CLAMP_MS = 60_000;

export interface ChatWithRetryInput {
  readonly llm: LLM;
  readonly params: LLMChatParams;
  readonly dispatchEvent: LoopEventDispatcher;
  readonly turnId: string;
  readonly currentStep: number;
  readonly stepUuid: string;
  readonly maxAttempts?: number;
  readonly log?: Logger;
}

export async function chatWithRetry(input: ChatWithRetryInput): Promise<LLMChatResponse> {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS;

  if (input.llm.isRetryableError === undefined || maxAttempts <= 1) {
    const effectiveMaxAttempts = Math.max(maxAttempts, 1);
    try {
      return await input.llm.chat(paramsForAttempt(input, 1, effectiveMaxAttempts));
    } catch (error) {
      logRequestFailure(input, error, 1, effectiveMaxAttempts);
      throw error;
    }
  }

  const delays = retryBackoffDelays(maxAttempts);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await input.llm.chat(paramsForAttempt(input, attempt, maxAttempts));
    } catch (error) {
      if (attempt >= maxAttempts || !input.llm.isRetryableError(error)) {
        logRequestFailure(input, error, attempt, maxAttempts);
        throw error;
      }

      const serverDelayMs = readRetryAfterMs(error);
      const rawDelay = serverDelayMs ?? delays[attempt - 1] ?? 0;
      // Clamp the server delay so a runaway `Retry-After` can't hang the turn.
      const delayMs = serverDelayMs !== null ? Math.min(rawDelay, RETRY_AFTER_CLAMP_MS) : rawDelay;
      input.params.signal.throwIfAborted();
      input.dispatchEvent({
        type: 'step.retrying',
        turnId: input.turnId,
        step: input.currentStep,
        stepUuid: input.stepUuid,
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        maxAttempts,
        delayMs,
        ...retryErrorFields(error),
      });
      await sleepForRetry(delayMs, input.params.signal);
    }
  }
}

function logRequestFailure(
  input: ChatWithRetryInput,
  error: unknown,
  attempt: number,
  maxAttempts: number,
): void {
  if (isAbortError(error) || input.params.signal.aborted) return;
  input.log?.warn('llm request failed', {
    turnId: input.turnId,
    step: input.currentStep,
    attempt,
    maxAttempts,
    model: input.llm.modelName,
    ...retryErrorFields(error),
  });
}

function paramsForAttempt(
  input: ChatWithRetryInput,
  attempt: number,
  maxAttempts: number,
): LLMChatParams {
  return {
    ...input.params,
    requestLogContext: {
      turnId: input.turnId,
      step: input.currentStep,
      stepUuid: input.stepUuid,
      attempt,
      maxAttempts,
    },
  };
}

export function retryBackoffDelays(maxAttempts: number): number[] {
  return retry.timeouts({
    retries: Math.max(maxAttempts - 1, 0),
    minTimeout: RETRY_MIN_TIMEOUT_MS,
    maxTimeout: RETRY_MAX_TIMEOUT_MS,
    factor: RETRY_FACTOR,
    randomize: true,
  });
}

export async function sleepForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await abortable(sleep(delayMs), signal);
}

interface RetryErrorFields {
  readonly errorName: string;
  readonly errorMessage: string;
  readonly statusCode?: number;
}

function retryErrorFields(error: unknown): RetryErrorFields {
  return {
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    statusCode: maybeStatusCode(error),
  };
}

/**
 * Read a server-provided `Retry-After` delay (already parsed into ms at the
 * adapter boundary) from a rate-limit error. Only `APIProviderRateLimitError`
 * currently carries the header, keeping the scope tight. Returns `null` when
 * the error is not a rate-limit error or no Retry-After was provided.
 */
function readRetryAfterMs(error: unknown): number | null {
  if (error instanceof APIProviderRateLimitError) {
    return error.retryAfterMs;
  }
  return null;
}

function maybeStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}
