import { describe, it, expect } from 'vitest';
import type { FinishReason } from '#/provider';
import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  ChatProviderError,
} from '#/errors';
import {
  convertProviderError,
  extractCacheUsage,
  makeFinishReasonNormalizer,
} from '#/providers/provider-common';

describe('makeFinishReasonNormalizer', () => {
  it('returns the mapped FinishReason and echoes the raw string when the raw is in the table', () => {
    const normalize = makeFinishReasonNormalizer({
      stop: 'completed',
      tool_calls: 'tool_calls',
    });
    expect(normalize('stop')).toEqual({ finishReason: 'completed', rawFinishReason: 'stop' });
  });

  it('maps several raw strings to the same FinishReason (e.g. OpenAI tool_calls + function_call)', () => {
    const normalize = makeFinishReasonNormalizer({
      tool_calls: 'tool_calls',
      function_call: 'tool_calls',
    });
    expect(normalize('function_call')).toEqual({
      finishReason: 'tool_calls',
      rawFinishReason: 'function_call',
    });
  });

  it('falls back to "other" and echoes the raw string when the raw is not in the table', () => {
    const normalize = makeFinishReasonNormalizer({ stop: 'completed' });
    expect(normalize('some_unknown_reason')).toEqual({
      finishReason: 'other',
      rawFinishReason: 'some_unknown_reason',
    });
  });

  it('returns null FinishReason and null raw when input is null', () => {
    const normalize = makeFinishReasonNormalizer({ stop: 'completed' });
    expect(normalize(null)).toEqual({ finishReason: null, rawFinishReason: null });
  });

  it('returns null FinishReason and null raw when input is undefined', () => {
    const normalize = makeFinishReasonNormalizer({ stop: 'completed' });
    expect(normalize(undefined)).toEqual({ finishReason: null, rawFinishReason: null });
  });

  it('maps every raw to "other" when the mapping table is empty', () => {
    const normalize = makeFinishReasonNormalizer({});
    expect(normalize('stop')).toEqual({ finishReason: 'other', rawFinishReason: 'stop' });
  });

  it('falls back to "other" for an empty-string raw (empty is not null)', () => {
    const normalize = makeFinishReasonNormalizer({ stop: 'completed' });
    expect(normalize('')).toEqual({ finishReason: 'other', rawFinishReason: '' });
  });

  it('produces a stateless normalizer that gives identical results across repeated calls', () => {
    const normalize = makeFinishReasonNormalizer({ stop: 'completed' });
    const expected = { finishReason: 'completed' as FinishReason, rawFinishReason: 'stop' };
    expect(normalize('stop')).toEqual(expected);
    expect(normalize('stop')).toEqual(expected);
  });
});

describe('extractCacheUsage', () => {
  it('splits total input into cache-read and other when some tokens were cached', () => {
    // total 1000, 700 cached → 300 other
    expect(extractCacheUsage(1000, 700, 50)).toEqual({
      inputOther: 300, output: 50, inputCacheRead: 700, inputCacheCreation: 0,
    });
  });

  it('puts all input into inputOther when nothing was cached', () => {
    expect(extractCacheUsage(1000, 0, 50)).toEqual({
      inputOther: 1000, output: 50, inputCacheRead: 0, inputCacheCreation: 0,
    });
  });

  it('reports zero inputOther when everything was cached', () => {
    expect(extractCacheUsage(800, 800, 20)).toEqual({
      inputOther: 0, output: 20, inputCacheRead: 800, inputCacheCreation: 0,
    });
  });

  it('clamps inputOther to 0 when cached exceeds total (defensive)', () => {
    // raw subtraction would be negative; ADR 0015 mandates clamp
    expect(extractCacheUsage(500, 700, 10)).toEqual({
      inputOther: 0, output: 10, inputCacheRead: 700, inputCacheCreation: 0,
    });
  });

  it('handles a zero-token response', () => {
    expect(extractCacheUsage(0, 0, 0)).toEqual({
      inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0,
    });
  });
});

describe('convertProviderError', () => {
  it('classifies a timeout-keyword message as APITimeoutError', () => {
    const out = convertProviderError(new Error('Request timed out after 30s'));
    expect(out).toBeInstanceOf(APITimeoutError);
    expect(out.message).toContain('timed out');
  });

  it('classifies a network-keyword message as APIConnectionError', () => {
    const out = convertProviderError(new Error('connection reset by peer'));
    expect(out).toBeInstanceOf(APIConnectionError);
  });

  it('timeout takes priority over network when a message matches both', () => {
    // "connect timeout" matches both regexes; timeout must win
    const out = convertProviderError(new Error('connect timeout'));
    expect(out).toBeInstanceOf(APITimeoutError);
  });

  it('classifies via an extraNetworkMatcher the default regex misses (e.g. Google fetch failed)', () => {
    // "fetch failed" is NOT in the default NETWORK_RE; google supplies it via the hook
    const out = convertProviderError(
      new TypeError('fetch failed'),
      { extraNetworkMatchers: [/^fetch failed$/] },
    );
    expect(out).toBeInstanceOf(APIConnectionError);
  });

  it('classifies a TypeError matching the extra matcher as a connection error (Google case)', () => {
    // Google: TypeError + msg includes 'fetch' → connection error
    const out = convertProviderError(
      new TypeError('TypeError: fetch failed'),
      { extraNetworkMatchers: [/^fetch failed$/], extraTypeErrorMatch: 'fetch' },
    );
    expect(out).toBeInstanceOf(APIConnectionError);
  });

  it('normalizes a numeric status code into an APIStatusError', () => {
    const out = convertProviderError(new Error('rate limited'), { status: 429 });
    expect(out).toBeInstanceOf(APIStatusError);
  });

  it('passes requestId through to the status error when supplied', () => {
    const out = convertProviderError(new Error('boom'), { status: 500, requestId: 'req-42' });
    expect(out).toBeInstanceOf(APIStatusError);
    expect((out as APIStatusError).requestId).toBe('req-42');
  });

  it('falls back to ChatProviderError for a plain message that matches no pattern', () => {
    const out = convertProviderError(new Error('something weird happened'));
    expect(out).toBeInstanceOf(ChatProviderError);
    expect(out).not.toBeInstanceOf(APITimeoutError);
    expect(out).not.toBeInstanceOf(APIConnectionError);
  });

  it('returns the same instance when given an already-ChatProviderError', () => {
    const existing = new APITimeoutError('already');
    expect(convertProviderError(existing)).toBe(existing);
  });

  it('wraps a non-Error thrown value into a ChatProviderError', () => {
    const out = convertProviderError('a bare string');
    expect(out).toBeInstanceOf(ChatProviderError);
  });
});


