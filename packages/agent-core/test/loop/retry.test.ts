import { APIProviderRateLimitError, APIStatusError, emptyUsage } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import type { LoopEventDispatcher, LoopStepRetryingEvent } from '../../src/loop/index';
import type { LLM, LLMChatParams, LLMChatResponse } from '../../src/loop/index';
import { chatWithRetry } from '../../src/loop/retry';

interface ScriptedLLMOptions {
  readonly responses: readonly LLMChatResponse[];
  readonly throwOnIndex?: { readonly index: number; readonly error: unknown };
}

class ScriptedLLM implements LLM {
  readonly modelName = 'scripted';
  readonly calls: LLMChatParams[] = [];

  private index = 0;
  private readonly responses: readonly LLMChatResponse[];
  private readonly throwOnIndex: ScriptedLLMOptions['throwOnIndex'];

  constructor(opts: ScriptedLLMOptions) {
    this.responses = opts.responses;
    this.throwOnIndex = opts.throwOnIndex;
  }

  isRetryableError(error: unknown): boolean {
    // Mirror the production rule for the cases under test: status errors
    // with retryable codes are retried.
    return (
      error instanceof APIStatusError && [429, 500, 502, 503, 504, 529].includes(error.statusCode)
    );
  }

  async chat(params: LLMChatParams): Promise<LLMChatResponse> {
    this.calls.push(params);
    const current = this.index;
    this.index += 1;
    if (this.throwOnIndex !== undefined && this.throwOnIndex.index === current) {
      throw this.throwOnIndex.error;
    }
    return this.responses[current]!;
  }
}

function okResponse(): LLMChatResponse {
  return { toolCalls: [], providerFinishReason: 'completed', usage: emptyUsage() };
}

function capturingDispatcher(events: LoopStepRetryingEvent[]): LoopEventDispatcher {
  // The `step.retrying` event is live-only, so dispatch returns void and the
  // events are captured synchronously.
  return ((event: LoopStepRetryingEvent) => {
    events.push(event);
  }) as LoopEventDispatcher;
}

describe('chatWithRetry', () => {
  it('uses server Retry-After over local backoff when present', async () => {
    const events: LoopStepRetryingEvent[] = [];
    const llm = new ScriptedLLM({
      responses: [okResponse()],
      throwOnIndex: {
        index: 0,
        error: new APIProviderRateLimitError(429, 'rate limited', null, 1),
      },
    });

    await chatWithRetry({
      llm,
      params: {
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      },
      dispatchEvent: capturingDispatcher(events),
      turnId: 't1',
      currentStep: 1,
      stepUuid: 's1',
      maxAttempts: 3,
    });

    expect(events).toHaveLength(1);
    // retryAfterMs of 1 must override the local backoff (which starts at 300ms).
    expect(events[0]!.delayMs).toBe(1);
    expect(llm.calls).toHaveLength(2);
  });

  it('falls back to local backoff when Retry-After is null', async () => {
    const events: LoopStepRetryingEvent[] = [];
    const llm = new ScriptedLLM({
      responses: [okResponse()],
      throwOnIndex: {
        index: 0,
        error: new APIProviderRateLimitError(429, 'rate limited', null, null),
      },
    });

    await chatWithRetry({
      llm,
      params: {
        messages: [],
        tools: [],
        signal: new AbortController().signal,
      },
      dispatchEvent: capturingDispatcher(events),
      turnId: 't1',
      currentStep: 1,
      stepUuid: 's1',
      maxAttempts: 3,
    });

    expect(events).toHaveLength(1);
    // With no server delay, fall back to the first backoff slot (>= 300ms).
    expect(events[0]!.delayMs).toBeGreaterThanOrEqual(300);
  });
});
