import { describe, expect, it } from 'vitest';

import {
  APIConnectionError,
  APIContextOverflowError,
  APIEmptyResponseError,
  APIProviderRateLimitError,
  APIRequestTooLargeError,
  APIStatusError,
  APITimeoutError,
  ChatProviderError,
  isAbortError,
  isImageFormatError,
  isRequestTooLargeStatusError,
  isRetryableGenerateError,
  normalizeAPIStatusError,
  parseRetryAfterMs,
} from '#/errors';

describe('ChatProviderError', () => {
  it('is an instance of Error', () => {
    const err = new ChatProviderError('base error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err.message).toBe('base error');
    expect(err.name).toBe('ChatProviderError');
  });
});

describe('APIConnectionError', () => {
  it('extends ChatProviderError', () => {
    const err = new APIConnectionError('connection refused');
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('APIConnectionError');
    expect(err.message).toBe('connection refused');
  });
});

describe('APITimeoutError', () => {
  it('extends ChatProviderError', () => {
    const err = new APITimeoutError('request timed out after 30s');
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('APITimeoutError');
    expect(err.message).toBe('request timed out after 30s');
  });
});

describe('APIStatusError', () => {
  it('extends ChatProviderError and stores status code', () => {
    const err = new APIStatusError(429, 'rate limited', 'req-abc');
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('APIStatusError');
    expect(err.message).toBe('rate limited');
    expect(err.statusCode).toBe(429);
    expect(err.requestId).toBe('req-abc');
  });

  it('accepts null requestId', () => {
    const err = new APIStatusError(500, 'server error', null);
    expect(err.statusCode).toBe(500);
    expect(err.requestId).toBeNull();
  });

  it('defaults requestId to null when omitted', () => {
    const err = new APIStatusError(502, 'bad gateway');
    expect(err.statusCode).toBe(502);
    expect(err.requestId).toBeNull();
  });
});

describe('APIEmptyResponseError', () => {
  it('extends ChatProviderError', () => {
    const err = new APIEmptyResponseError('empty response');
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('APIEmptyResponseError');
    expect(err.message).toBe('empty response');
  });
});

describe('APIContextOverflowError', () => {
  it('extends APIStatusError and preserves HTTP details', () => {
    const err = new APIContextOverflowError(400, 'Context length exceeded', 'req-context');
    expect(err).toBeInstanceOf(APIStatusError);
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err.name).toBe('APIContextOverflowError');
    expect(err.statusCode).toBe(400);
    expect(err.requestId).toBe('req-context');
  });
});

describe('APIRequestTooLargeError', () => {
  it('extends APIStatusError and preserves HTTP details', () => {
    const err = new APIRequestTooLargeError(413, 'Request Entity Too Large', 'req-413');
    expect(err).toBeInstanceOf(APIStatusError);
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err.name).toBe('APIRequestTooLargeError');
    expect(err.statusCode).toBe(413);
    expect(err.requestId).toBe('req-413');
  });

  it('is not an APIContextOverflowError', () => {
    const err = new APIRequestTooLargeError(413, 'payload too large');
    expect(err).not.toBeInstanceOf(APIContextOverflowError);
  });
});

describe('APIProviderRateLimitError', () => {
  it('extends APIStatusError', () => {
    const err = new APIProviderRateLimitError(429, 'rate limited', 'req-rl');
    expect(err).toBeInstanceOf(APIStatusError);
    expect(err).toBeInstanceOf(ChatProviderError);
    expect(err.name).toBe('APIProviderRateLimitError');
    expect(err.statusCode).toBe(429);
    expect(err.requestId).toBe('req-rl');
  });

  it('defaults retryAfterMs to null when omitted', () => {
    const err = new APIProviderRateLimitError(429, 'rate limited');
    expect(err.retryAfterMs).toBeNull();
  });

  it('holds the passed retryAfterMs value', () => {
    const err = new APIProviderRateLimitError(429, 'rate limited', null, 5000);
    expect(err.retryAfterMs).toBe(5000);
  });

  it('treats explicitly-null retryAfterMs as null', () => {
    const err = new APIProviderRateLimitError(429, 'rate limited', null, null);
    expect(err.retryAfterMs).toBeNull();
  });
});

describe('error hierarchy instanceof checks', () => {
  it('all error types are instanceof ChatProviderError', () => {
    const errors = [
      new APIConnectionError('conn'),
      new APITimeoutError('timeout'),
      new APIStatusError(400, 'status', null),
      new APIContextOverflowError(400, 'context length exceeded'),
      new APIEmptyResponseError('empty'),
    ];

    for (const err of errors) {
      expect(err).toBeInstanceOf(ChatProviderError);
    }
  });

  it('specific types are distinguishable', () => {
    const connErr = new APIConnectionError('conn');
    const statusErr = new APIStatusError(400, 'status', null);

    expect(connErr).not.toBeInstanceOf(APIStatusError);
    expect(statusErr).not.toBeInstanceOf(APIConnectionError);
  });

  it('can catch with ChatProviderError and inspect subtype', () => {
    const err: ChatProviderError = new APIStatusError(404, 'not found', 'req-123');

    if (err instanceof APIStatusError) {
      expect(err.statusCode).toBe(404);
      expect(err.requestId).toBe('req-123');
    } else {
      expect.unreachable('Expected APIStatusError');
    }
  });
});

describe('normalizeAPIStatusError', () => {
  it.each([
    [400, 'Context length exceeded'],
    [400, 'Exceeded max tokens'],
    [413, 'Context length exceeded'],
    [422, 'Maximum context window exceeded'],
    [400, 'context_length_exceeded'],
    [422, 'Too many tokens in prompt'],
    [400, 'prompt is too long: 210000 tokens exceeds the maximum'],
    [400, 'input token count 131072 exceeds the maximum number of tokens allowed'],
  ])('normalizes %i "%s" to APIContextOverflowError', (statusCode, message) => {
    const error = normalizeAPIStatusError(statusCode, message, 'req-context');
    expect(error).toBeInstanceOf(APIContextOverflowError);
    expect(error.statusCode).toBe(statusCode);
    expect(error.requestId).toBe('req-context');
  });

  it.each([
    [401, 'Context length exceeded'],
    [500, 'Context length exceeded'],
    [400, 'Bad request'],
    [422, 'Invalid tool schema'],
    [400, 'max_tokens must be less than or equal to 4096'],
    [422, 'max_output_tokens must not exceed 8192'],
    [400, 'max tokens must not exceed the configured output limit'],
  ])('keeps %i "%s" as APIStatusError', (statusCode, message) => {
    const error = normalizeAPIStatusError(statusCode, message);
    expect(error).toBeInstanceOf(APIStatusError);
    expect(error).not.toBeInstanceOf(APIContextOverflowError);
  });

  it('normalizes 429 to APIProviderRateLimitError', () => {
    const error = normalizeAPIStatusError(429, 'rate limited', 'req-rl');
    expect(error).toBeInstanceOf(APIProviderRateLimitError);
    expect(error.statusCode).toBe(429);
    expect(error.requestId).toBe('req-rl');
    expect((error as APIProviderRateLimitError).retryAfterMs).toBeNull();
  });

  it('threads retryAfterMs through 429 normalization', () => {
    const error = normalizeAPIStatusError(429, 'rate limited', 'req-rl', 5000);
    expect(error).toBeInstanceOf(APIProviderRateLimitError);
    expect((error as APIProviderRateLimitError).retryAfterMs).toBe(5000);
  });

  it.each([
    ['413 Request Entity Too Large', 413, '413 Request Entity Too Large'],
    ['request_too_large', 413, 'request_too_large'],
    [
      'exceeds the maximum allowed number of bytes',
      413,
      'Request exceeds the maximum allowed number of bytes',
    ],
    ['payload too large', 413, 'Payload Too Large'],
    ['content too large', 413, 'Content Too Large'],
    ['request too large', 413, 'request too large'],
    ['request body too large', 413, 'http: request body too large'],
  ])('normalizes body-size 413 "%s" to APIRequestTooLargeError', (_label, statusCode, message) => {
    const error = normalizeAPIStatusError(statusCode, message, 'req-body');
    expect(error).toBeInstanceOf(APIRequestTooLargeError);
    expect(error).not.toBeInstanceOf(APIContextOverflowError);
    expect(error.statusCode).toBe(413);
    expect(error.requestId).toBe('req-body');
  });

  it.each([
    // Vertex phrases prompt-too-long as a 413 — overflow must win.
    [
      'Vertex 413 prompt-too-long',
      413,
      'Request too large: input length exceeds maximum context length',
    ],
    ['413 context length', 413, 'context_length_exceeded'],
    ['413 max tokens', 413, 'exceeds the maximum tokens allowed'],
  ])(
    'normalizes token-overflow 413 "%s" to APIContextOverflowError (overflow checked before too-large)',
    (_label, statusCode, message) => {
      const error = normalizeAPIStatusError(statusCode, message);
      expect(error).toBeInstanceOf(APIContextOverflowError);
      expect(error).not.toBeInstanceOf(APIRequestTooLargeError);
    },
  );

  it('keeps a bare 413 with no matching message as APIStatusError', () => {
    const error = normalizeAPIStatusError(413, 'Unknown error');
    expect(error).toBeInstanceOf(APIStatusError);
    expect(error).not.toBeInstanceOf(APIContextOverflowError);
    expect(error).not.toBeInstanceOf(APIRequestTooLargeError);
  });
});

describe('isRequestTooLargeStatusError', () => {
  it.each([
    [413, '413 Request Entity Too Large'],
    [413, 'request_too_large'],
    [413, 'Payload Too Large'],
    [413, 'request body too large'],
  ])('returns true for body-size 413 (%i "%s")', (statusCode, message) => {
    expect(isRequestTooLargeStatusError(statusCode, message)).toBe(true);
  });

  it.each([
    [413, 'context_length_exceeded'],
    [413, 'Unknown error'],
    [400, 'request too large'],
    [422, 'payload too large'],
  ])('returns false for non-body-size (%i "%s")', (statusCode, message) => {
    expect(isRequestTooLargeStatusError(statusCode, message)).toBe(false);
  });
});

describe('isImageFormatError', () => {
  it.each([
    [400, 'Unsupported image format'],
    [400, 'does not represent a valid image'],
    [400, 'could not decode the image'],
    [400, 'failed to decode image'],
    [400, 'invalid image data'],
    [400, 'media_type image is not supported'],
  ])('returns true for image format/data rejection (%i "%s")', (statusCode, message) => {
    const err = new APIStatusError(statusCode, message);
    expect(isImageFormatError(err)).toBe(true);
  });

  it.each([
    [413, 'request entity too large'],
    [400, 'context_length_exceeded'],
    [400, 'unsupported media type for audio'],
    [400, 'media_type video is not supported'],
    [500, 'unsupported image format'],
    [400, 'image count exceeds limit'],
  ])('returns false for non-format rejection (%i "%s")', (statusCode, message) => {
    const err = new APIStatusError(statusCode, message);
    expect(isImageFormatError(err)).toBe(false);
  });

  it('returns false for APIRequestTooLargeError even with image text', () => {
    const err = new APIRequestTooLargeError(413, 'request too large for image');
    expect(isImageFormatError(err)).toBe(false);
  });

  it('returns false for APIContextOverflowError even with image text', () => {
    const err = new APIContextOverflowError(400, 'context length exceeded with image');
    expect(isImageFormatError(err)).toBe(false);
  });

  it('matches client-side image format errors on base ChatProviderError', () => {
    const err = new ChatProviderError('unsupported media type for base64 image');
    expect(isImageFormatError(err)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isImageFormatError(null)).toBe(false);
  });
});

describe('isRetryableGenerateError', () => {
  it.each([
    [new APIConnectionError('conn'), 'connection error'],
    [new APITimeoutError('timeout'), 'timeout'],
    [new APIEmptyResponseError('empty'), 'empty response'],
    [new APIStatusError(429, 'rate'), '429'],
    [new APIStatusError(500, 'server'), '500'],
    [new APIStatusError(502, 'bad gateway'), '502'],
    [new APIStatusError(503, 'unavailable'), '503'],
    [new APIStatusError(529, 'overloaded'), '529'],
  ])('returns true for retryable: %s', (err) => {
    expect(isRetryableGenerateError(err)).toBe(true);
  });

  it.each([
    [new APIRequestTooLargeError(413, 'request entity too large'), 'request-too-large'],
    [new APIContextOverflowError(400, 'context_length_exceeded'), 'context-overflow'],
    [new APIStatusError(400, 'unsupported image format'), 'image-format (400)'],
    [new APIStatusError(400, 'bad request'), 'generic 400'],
    [new APIStatusError(401, 'unauthorized'), '401'],
    [new APIStatusError(422, 'invalid schema'), '422'],
  ])('returns false for non-retryable: %s', (err) => {
    expect(isRetryableGenerateError(err)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRetryableGenerateError(null)).toBe(false);
  });
});

describe('parseRetryAfterMs', () => {
  it('parses integer seconds into milliseconds', () => {
    expect(parseRetryAfterMs('30')).toBe(30000);
  });

  it('parses zero as 0', () => {
    expect(parseRetryAfterMs('0')).toBe(0);
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(parseRetryAfterMs('  5  ')).toBe(5000);
  });

  it('returns null for null', () => {
    expect(parseRetryAfterMs(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(parseRetryAfterMs(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRetryAfterMs('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(parseRetryAfterMs('   ')).toBeNull();
  });

  it('returns null for HTTP-date form', () => {
    expect(parseRetryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseRetryAfterMs('abc')).toBeNull();
  });

  it('returns null for fractional seconds', () => {
    expect(parseRetryAfterMs('1.5')).toBeNull();
  });
});

describe('isAbortError', () => {
  it('returns true for a standard Error with name AbortError', () => {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('returns true for a DOMException with name AbortError', () => {
    const err = new DOMException('The operation was aborted', 'AbortError');
    expect(isAbortError(err)).toBe(true);
  });

  it('returns false for a regular Error', () => {
    const err = new Error('Something went wrong');
    expect(isAbortError(err)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAbortError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isAbortError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isAbortError('AbortError')).toBe(false);
  });

  it('returns false for a plain object', () => {
    expect(isAbortError({ name: 'AbortError' })).toBe(false);
  });

  it('returns false for a plain object with Aborted message (regression: old CLI impl matched this)', () => {
    expect(isAbortError({ message: 'Aborted' })).toBe(false);
  });

  it('returns true for a custom Error subclass with name AbortError', () => {
    class CustomAbort extends Error {
      override name = 'AbortError' as const;
    }
    expect(isAbortError(new CustomAbort())).toBe(true);
  });

  it('returns false for an Error with empty string name', () => {
    const err = new Error('dummy');
    err.name = '';
    expect(isAbortError(err)).toBe(false);
  });

  it('returns false when message contains Aborted but name is not AbortError (old CLI matched this)', () => {
    // The legacy CLI implementation matched message substring 'Aborted' /
    // endsWith ': Aborted'.  This test pins the new contract: only
    // name === 'AbortError' is checked.
    const err = new Error('Request was Aborted');
    err.name = 'TimeoutError';
    expect(isAbortError(err)).toBe(false);
  });

  it('returns false when message ends with ": Aborted" but name is not AbortError', () => {
    // Another pattern the old CLI matched (e.g. 'The operation was aborted: Aborted')
    const err = new Error('The operation was aborted: Aborted');
    err.name = 'DOMException';
    expect(isAbortError(err)).toBe(false);
  });
});
