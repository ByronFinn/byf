import { afterEach, describe, expect, it } from 'bun:test';

import { APIProviderRateLimitError, APIStatusError, emptyUsage } from '@byfriends/kosong';

import type {
  LLM,
  LLMChatParams,
  LLMChatResponse,
  LoopEventDispatcher,
  LoopStepRetryingEvent,
} from '../../src/loop/index';
import { chatWithRetry } from '../../src/loop/retry';
import { vi } from '../_vitest-vi';

interface ScriptedLLMOptions {
  readonly responses: readonly LLMChatResponse[];
  readonly throwOnIndex?: { readonly index: number; readonly error: unknown };
}

class ScriptedLLM implements LLM {
  readonly modelName = 'scripted';
  readonly systemPrompt = 'scripted system prompt';
  readonly calls: LLMChatParams[] = [];

  private responseIndex = 0;
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
    const callIndex = this.calls.length - 1;
    if (this.throwOnIndex !== undefined && this.throwOnIndex.index === callIndex) {
      throw this.throwOnIndex.error;
    }
    // `responses` scripts the successful replies only, so a call that throws
    // does not consume a slot. Running out of the script is a test bug and
    // must fail loudly instead of resolving with `undefined`.
    const response = this.responses[this.responseIndex];
    this.responseIndex += 1;
    if (response === undefined) {
      throw new Error(`ScriptedLLM ran out of responses at call #${String(callIndex + 1)}`);
    }
    return response;
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

/** The single captured `step.retrying` event, or a loud failure. */
function soleRetryingEvent(events: readonly LoopStepRetryingEvent[]): LoopStepRetryingEvent {
  const [event] = events;
  if (event === undefined) throw new Error('expected one step.retrying event');
  return event;
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
    expect(soleRetryingEvent(events).delayMs).toBe(1);
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
    expect(soleRetryingEvent(events).delayMs).toBeGreaterThanOrEqual(300);
  });

  it('clamps an absurd server Retry-After so the turn is not hung', async () => {
    // 24 hours in ms — a buggy/malicious server could return this. The clamp
    // must bring it down so the turn doesn't block for a day. Use fake timers
    // so the clamped sleep (up to 60s) doesn't wall-clock the test.
    vi.useFakeTimers();
    try {
      const events: LoopStepRetryingEvent[] = [];
      const dayMs = 24 * 60 * 60 * 1000;
      const llm = new ScriptedLLM({
        responses: [okResponse()],
        throwOnIndex: {
          index: 0,
          error: new APIProviderRateLimitError(429, 'rate limited', null, dayMs),
        },
      });

      const promise = chatWithRetry({
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
      // Advance past the clamped retry delay so the retry can complete.
      await vi.advanceTimersByTimeAsync(120_000);
      await promise;

      expect(events).toHaveLength(1);
      const event = soleRetryingEvent(events);
      // The delay must be clamped well below the 24h the server asked for.
      expect(event.delayMs).toBeLessThan(dayMs);
      expect(event.delayMs).toBeLessThanOrEqual(60_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
