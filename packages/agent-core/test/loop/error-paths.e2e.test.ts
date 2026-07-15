/**
 * Error propagation contract.
 *
 * The loop never returns `'error'` or `'max_steps'` as a stopReason — those
 * states surface only by throwing. AbortError-shaped exceptions converge
 * to `stopReason='aborted'` and never throw to the caller. Every throw
 * is preceded by exactly one `turn.interrupted` event whose `reason`
 * names the cause.
 */

import { APIRequestTooLargeError, APIStatusError, type Message } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { ErrorCodes, ByfError } from '../../src/errors';
import type { Logger, LogPayload } from '../../src/logging';
import type { LoopHooks } from '../../src/loop/index';
import { makeEndTurnResponse, makeToolCall, makeToolUseResponse } from './fixtures/fake-llm';
import { runTurn, runTurnExpectingThrow } from './fixtures/helpers';
import { EchoTool } from './fixtures/tools';

interface CapturedLogEntry {
  readonly level: 'error' | 'warn' | 'info' | 'debug';
  readonly message: string;
  readonly payload?: LogPayload;
}

describe('runTurn — error paths', () => {
  it('rethrows non-abort LLM errors with turn.interrupted{reason:"error"}', async () => {
    const llmError = new Error('upstream blew up');
    const { error, sink, context } = await runTurnExpectingThrow({
      responses: [makeEndTurnResponse('never')], // ignored: throw fires first
      llmThrowOnIndex: { index: 0, error: llmError },
    });

    expect(error).toBe(llmError);
    const interrupted = sink.byType('turn.interrupted');
    expect(interrupted.length).toBe(1);
    expect(interrupted[0]?.reason).toBe('error');
    expect(interrupted[0]?.attemptedSteps).toBe(1);
    expect(interrupted[0]?.activeStep).toBe(1);
    // step.begin was opened but step.end was NOT
    expect(context.stepBegins().length).toBe(1);
    expect(context.stepEnds().length).toBe(0);
  });

  it('logs non-abort LLM request failures without request payloads or stacks', async () => {
    const llmError = new Error('upstream blew up');
    const { logger, entries } = captureLogs();
    const { error } = await runTurnExpectingThrow({
      responses: [makeEndTurnResponse('never')],
      llmThrowOnIndex: { index: 0, error: llmError },
      log: logger,
    });

    expect(error).toBe(llmError);
    expect(entries).toEqual([
      {
        level: 'warn',
        message: 'llm request failed',
        payload: {
          turnId: 'turn-1',
          step: 1,
          attempt: 1,
          maxAttempts: 3,
          model: 'fake-model',
          errorName: 'Error',
          errorMessage: 'upstream blew up',
        },
      },
    ]);
  });

  it('does not log aborted LLM requests as failures', async () => {
    const controller = new AbortController();
    const { logger, entries } = captureLogs();
    const { result } = await runTurn({
      responses: [makeEndTurnResponse('never')],
      llmAbortOnIndex: { index: 0, controller },
      signal: controller.signal,
      log: logger,
    });

    expect(result.stopReason).toBe('aborted');
    expect(entries).toEqual([]);
  });

  it('throws ByfError(loop.max_steps_exceeded) with turn.interrupted{reason:"max_steps"} before the throw', async () => {
    const echo = new EchoTool();
    const { error, sink } = await runTurnExpectingThrow({
      maxSteps: 2,
      tools: [echo],
      responses: [
        makeToolUseResponse([makeToolCall('echo', { text: '1' }, 'a')]),
        makeToolUseResponse([makeToolCall('echo', { text: '2' }, 'b')]),
        // never reached
      ],
    });

    expect(error).toBeInstanceOf(ByfError);
    expect((error as ByfError).code).toBe(ErrorCodes.LOOP_MAX_STEPS_EXCEEDED);
    const interrupted = sink.byType('turn.interrupted');
    expect(interrupted.map((e) => e.reason)).toEqual(['max_steps']);
    expect(interrupted[0]?.attemptedSteps).toBe(2);
    expect(interrupted[0]?.activeStep).toBeUndefined();
  });

  it('rethrows non-abort hook errors via the same path', async () => {
    const hookError = new Error('hook crashed');
    const hooks: LoopHooks = {
      beforeStep: async () => {
        throw hookError;
      },
    };
    const { error, sink } = await runTurnExpectingThrow({
      hooks,
      responses: [makeEndTurnResponse('never')],
    });

    expect(error).toBe(hookError);
    const interrupted = sink.byType('turn.interrupted');
    expect(interrupted.length).toBe(1);
    expect(interrupted[0]?.reason).toBe('error');
  });

  it('AbortError thrown by a hook converges to stopReason="aborted" (no throw)', async () => {
    const controller = new AbortController();
    const hooks: LoopHooks = {
      beforeStep: async () => {
        controller.abort();
        const err = new Error('aborted');
        err.name = 'AbortError';
        throw err;
      },
    };
    const { result, sink } = await runTurn({
      hooks,
      responses: [makeEndTurnResponse('never')],
      signal: controller.signal,
    });
    expect(result.stopReason).toBe('aborted');
    const interrupted = sink.byType('turn.interrupted');
    expect(interrupted.length).toBe(1);
    expect(interrupted[0]?.reason).toBe('aborted');
  });

  it('emits turn.interrupted exactly once per failure (no duplicate emits)', async () => {
    const { sink } = await runTurnExpectingThrow({
      responses: [makeEndTurnResponse('never')],
      llmThrowOnIndex: { index: 0, error: new Error('once') },
    });
    expect(sink.byType('turn.interrupted').length).toBe(1);
  });

  it('does NOT emit step.end when a step throws before sealing', async () => {
    const { sink } = await runTurnExpectingThrow({
      responses: [makeEndTurnResponse('never')],
      llmThrowOnIndex: { index: 0, error: new Error('boom') },
    });
    // step.begin fires, step.end does not, turn.interrupted takes its place
    expect(sink.count('step.begin')).toBe(1);
    expect(sink.count('step.end')).toBe(0);
    expect(sink.count('turn.interrupted')).toBe(1);
  });
});

/**
 * PRD-0023 #240 — turn-step media-degraded / media-stripped one-shot resend.
 * Drives the real `runTurn` → `executeLoopStep` path with FakeLLM rejections.
 */
describe('runTurn — media-degraded / media-stripped recovery (PRD-0023 #240)', () => {
  const fullMessages: Message[] = [
    {
      role: 'user',
      content: [{ type: 'image_url', imageUrl: { url: 'data:image/png;base64,FULL' } }],
      toolCalls: [],
    },
  ];
  const degradedMessages: Message[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: '[older media omitted — re-read the file if needed]' }],
      toolCalls: [],
    },
  ];
  const strippedMessages: Message[] = [
    {
      role: 'user',
      content: [{ type: 'text', text: '[image omitted — provider rejected this image]' }],
      toolCalls: [],
    },
  ];

  it('APIRequestTooLargeError triggers one media-degraded resend then succeeds', async () => {
    const tooLarge = new APIRequestTooLargeError(413, 'request entity too large');
    const { result, llm } = await runTurn({
      responses: [makeEndTurnResponse('unused'), makeEndTurnResponse('recovered')],
      llmThrowOnIndex: { index: 0, error: tooLarge },
      buildMessages: async () => fullMessages,
      buildMessagesMediaDegraded: async () => degradedMessages,
    });

    expect(result.stopReason).toBe('end_turn');
    // First call full body (rejected), second call degraded projection
    expect(llm.callCount).toBe(2);
    expect(llm.calls[0]?.messages).toBe(fullMessages);
    expect(llm.calls[1]?.messages).toBe(degradedMessages);
  });

  it('second media-degraded rejection propagates (no infinite degrade loop)', async () => {
    const first = new APIRequestTooLargeError(413, 'request entity too large');
    const second = new APIRequestTooLargeError(413, 'payload too large');
    const { error, llm } = await runTurnExpectingThrow({
      responses: [makeEndTurnResponse('never')],
      llmThrowOnIndex: [
        { index: 0, error: first },
        { index: 1, error: second },
      ],
      buildMessages: async () => fullMessages,
      buildMessagesMediaDegraded: async () => degradedMessages,
    });

    expect(error).toBe(second);
    expect(llm.callCount).toBe(2);
  });

  it('image format error triggers one media-stripped resend then succeeds', async () => {
    // isImageFormatError: status 400 + image format/data wording
    const formatError = new APIStatusError(400, 'Unsupported image format');
    const { result, llm } = await runTurn({
      responses: [makeEndTurnResponse('unused'), makeEndTurnResponse('stripped-ok')],
      llmThrowOnIndex: { index: 0, error: formatError },
      buildMessages: async () => fullMessages,
      buildMessagesMediaStripped: async () => strippedMessages,
    });

    expect(result.stopReason).toBe('end_turn');
    expect(llm.callCount).toBe(2);
    expect(llm.calls[1]?.messages).toBe(strippedMessages);
  });

  it('second media-stripped rejection propagates (no infinite strip loop)', async () => {
    const first = new APIStatusError(400, 'Unsupported image format');
    const second = new APIStatusError(400, 'Invalid image data');
    const { error, llm } = await runTurnExpectingThrow({
      responses: [makeEndTurnResponse('never')],
      llmThrowOnIndex: [
        { index: 0, error: first },
        { index: 1, error: second },
      ],
      buildMessages: async () => fullMessages,
      buildMessagesMediaStripped: async () => strippedMessages,
    });

    expect(error).toBe(second);
    expect(llm.callCount).toBe(2);
  });

  it('sticky media-degraded projection is reused on later steps without re-paying 413', async () => {
    const echo = new EchoTool();
    const tooLarge = new APIRequestTooLargeError(413, 'request entity too large');
    // Step 1: call0 throw 413 → call1 tool_use with degraded (sticky latches)
    // Step 2: call2 end_turn with degraded as primary buildMessages (no resend needed)
    const { result, llm } = await runTurn({
      tools: [echo],
      responses: [
        makeEndTurnResponse('unused-slot-0'),
        makeToolUseResponse([makeToolCall('echo', { text: 'step1' }, 'c1')]),
        makeEndTurnResponse('step2-done'),
      ],
      llmThrowOnIndex: { index: 0, error: tooLarge },
      buildMessages: async () => fullMessages,
      buildMessagesMediaDegraded: async () => degradedMessages,
    });

    expect(result.stopReason).toBe('end_turn');
    expect(result.steps).toBe(2);
    expect(llm.callCount).toBe(3);
    // After sticky latch, step 2 uses degraded messages as the primary builder
    expect(llm.calls[2]?.messages).toBe(degradedMessages);
  });

  it('does not treat context-overflow-shaped 413 as body-size (no media-degraded path)', async () => {
    // Vertex-style: 413 + prompt-too-long is APIContextOverflowError after
    // kosong normalize; here we inject a plain Error that is NOT
    // APIRequestTooLargeError so media recovery must not fire.
    const overflow = new Error('context_length_exceeded');
    const degradedCalls: number[] = [];
    const { error, llm } = await runTurnExpectingThrow({
      responses: [makeEndTurnResponse('never')],
      llmThrowOnIndex: { index: 0, error: overflow },
      buildMessages: async () => fullMessages,
      buildMessagesMediaDegraded: async () => {
        degradedCalls.push(1);
        return degradedMessages;
      },
    });

    expect(error).toBe(overflow);
    expect(llm.callCount).toBe(1);
    expect(degradedCalls).toEqual([]);
  });
});

function captureLogs(): { readonly logger: Logger; readonly entries: CapturedLogEntry[] } {
  const entries: CapturedLogEntry[] = [];
  const logger: Logger = {
    error: (message, payload) => {
      entries.push({ level: 'error', message, payload });
    },
    warn: (message, payload) => {
      entries.push({ level: 'warn', message, payload });
    },
    info: (message, payload) => {
      entries.push({ level: 'info', message, payload });
    },
    debug: (message, payload) => {
      entries.push({ level: 'debug', message, payload });
    },
    createChild: () => logger,
  };
  return { logger, entries };
}
