/**
 * Base error for all chat provider errors.
 */
export class ChatProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatProviderError';
  }
}

/**
 * Network-level connection failure.
 */
export class APIConnectionError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APIConnectionError';
  }
}

/**
 * Request timed out.
 */
export class APITimeoutError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APITimeoutError';
  }
}

/**
 * HTTP status error from the API.
 */
export class APIStatusError extends ChatProviderError {
  readonly statusCode: number;
  readonly requestId: string | null;

  constructor(statusCode: number, message: string, requestId?: string | null) {
    super(message);
    this.name = 'APIStatusError';
    this.statusCode = statusCode;
    this.requestId = requestId ?? null;
  }
}

/**
 * HTTP status error that specifically means the request exceeded the model
 * context window.
 */
export class APIContextOverflowError extends APIStatusError {
  constructor(statusCode: number, message: string, requestId?: string | null) {
    super(statusCode, message, requestId);
    this.name = 'APIContextOverflowError';
  }
}

/**
 * HTTP 413 that specifically means the serialized request body exceeded the
 * provider's byte ceiling (e.g. accumulated base64 images), as opposed to a
 * token-count overflow. Token overflow is recoverable by compaction; a body
 * size rejection is not — it needs media to be dropped or shrunk.
 */
export class APIRequestTooLargeError extends APIStatusError {
  constructor(statusCode: number, message: string, requestId?: string | null) {
    super(statusCode, message, requestId);
    this.name = 'APIRequestTooLargeError';
  }
}

/**
 * HTTP 429 rate-limit error from the API. Carries a parsed `retryAfterMs`
 * (from the `Retry-After` response header) when available.
 */
export class APIProviderRateLimitError extends APIStatusError {
  readonly retryAfterMs: number | null;

  constructor(
    statusCode: number,
    message: string,
    requestId?: string | null,
    retryAfterMs?: number | null,
  ) {
    super(statusCode, message, requestId);
    this.name = 'APIProviderRateLimitError';
    this.retryAfterMs = retryAfterMs ?? null;
  }
}

/**
 * The API returned an empty response (no content, no tool calls).
 */
export class APIEmptyResponseError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APIEmptyResponseError';
  }
}

/**
 * Check whether an unknown value is a standard `AbortError`.
 *
 * Returns `true` when `err` is an `Error` instance whose `.name` property is
 * exactly `'AbortError'`. This is the canonical check used by kosong, agent-core,
 * and the CLI — all layers converge on this single function.
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === 'AbortError';
  }
  return false;
}

const CONTEXT_OVERFLOW_MESSAGE_PATTERNS = [
  /context[ _-]?length/,
  /(?:context[ _-]?window.*exceed|exceed.*context[ _-]?window)/,
  /maximum context/,
  /exceed(?:ed|s|ing)?\s+(?:the\s+)?max(?:imum)?\s+tokens?/,
  /(?:too many tokens.*(?:prompt|input|context)|(?:prompt|input|context).*too many tokens)/,
  /prompt is too long.*maximum/,
  /input token count.*exceeds?.*maximum number of tokens/,
] as const;

export function normalizeAPIStatusError(
  statusCode: number,
  message: string,
  requestId?: string | null,
  retryAfterMs?: number | null,
): APIStatusError {
  if (statusCode === 429) {
    return new APIProviderRateLimitError(statusCode, message, requestId, retryAfterMs);
  }
  // Context overflow first: Vertex returns prompt-too-long as a 413, and a
  // token overflow must keep routing to compaction even on that status.
  if (isContextOverflowStatusError(statusCode, message)) {
    return new APIContextOverflowError(statusCode, message, requestId);
  }
  if (isRequestTooLargeStatusError(statusCode, message)) {
    return new APIRequestTooLargeError(statusCode, message, requestId);
  }
  return new APIStatusError(statusCode, message, requestId);
}

/**
 * Parse an HTTP `Retry-After` header value into milliseconds.
 *
 * Accepts only integer seconds (the common form, e.g. "30"). HTTP-date form
 * and any non-parseable value return `null`. Negative/zero is allowed and
 * returned as-is (caller decides whether to clamp).
 */
export function parseRetryAfterMs(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  // Integer seconds only.
  if (!/^\d+$/.test(trimmed)) return null;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds)) return null;
  return seconds * 1000;
}

function isContextOverflowStatusError(statusCode: number, message: string): boolean {
  if (statusCode !== 400 && statusCode !== 413 && statusCode !== 422) return false;
  const lowerMessage = message.toLowerCase();
  return CONTEXT_OVERFLOW_MESSAGE_PATTERNS.some((pattern) => pattern.test(lowerMessage));
}

// Wordings that mean the serialized request BODY was too big, matched against
// the lowercased message of a 413. Kept separate from the context-overflow
// patterns above: those describe token counts, these describe bytes. A 413
// whose message matches neither family stays a plain `APIStatusError` —
// Vertex phrases prompt-too-long as a 413, so the status alone is not proof
// of a body-size rejection.
const REQUEST_TOO_LARGE_MESSAGE_PATTERNS = [
  // Reverse proxies (nginx-style HTML body): "413 Request Entity Too Large".
  /request entity too large/,
  // Anthropic: error type `request_too_large`, message "Request exceeds the
  // maximum allowed number of bytes".
  /request_too_large/,
  /exceeds? the maximum allowed number of bytes/,
  // RFC 9110 reason phrase (both the pre-2022 and current names).
  /payload too large/,
  /content too large/,
  // Plain wordings: generic gateways say "request too large"; Go's
  // http.MaxBytesReader (common in Go proxies) says "request body too large".
  /request (?:body )?too large/,
] as const;

export function isRequestTooLargeStatusError(statusCode: number, message: string): boolean {
  if (statusCode !== 413) return false;
  const lowerMessage = message.toLowerCase();
  return REQUEST_TOO_LARGE_MESSAGE_PATTERNS.some((pattern) => pattern.test(lowerMessage));
}

// Client-side image rejections thrown before the request is sent (kosong's
// own media whitelist in the Anthropic adapter).
const IMAGE_FORMAT_PROVIDER_MESSAGE_PATTERNS = [
  /unsupported media type for base64 image/,
  /invalid data url for image/,
] as const;

// Server-side image rejections that are safe to recover by stripping media:
// an unsupported/invalid media type or undecodable image data. These are
// deliberately narrow and grounded in the documented messages of the major
// providers (Anthropic, OpenAI, Gemini) — image COUNT/SIZE limits or
// image-input-disabled errors also mention "image", but stripping media
// either over-recovers or hides a real configuration problem the user should
// see; only format/data rejections are guaranteed to be fixed by removing the
// offending image.
const IMAGE_FORMAT_STATUS_MESSAGE_PATTERNS = [
  // Unsupported format — OpenAI "unsupported image …".
  /unsupported image (?:url|format|type)/,
  // Undecodable / corrupt image data.
  /does not represent a valid image/,
  /could not (?:process|decode) (?:the |input )?image/,
  /unable to process (?:the |input )?image/,
  /failed to decode (?:the )?image/,
  /invalid image(?: data| type| format)?/,
] as const;

// Anthropic `media_type` & Gemini `mime_type` enum violations name the field
// — recoverable only when the message is about an IMAGE.
const MEDIA_TYPE_FIELD_PATTERN = /(?:media|mime)_?type/;

/**
 * Whether the provider rejected an IMAGE in the request because of its
 * FORMAT or DATA — an unsupported media type or undecodable image bytes.
 * The rejection is deterministic for a given history (the same image is
 * re-sent on every request), and the only recovery is to resend once with
 * all media stripped. Body-size (413), context overflow, image count/size
 * limits, image-input-disabled rejections, and non-image (audio/video) media
 * rejections are excluded — the first two have their own recoveries, and the
 * rest are not fixed by stripping media.
 */
export function isImageFormatError(error: unknown): boolean {
  if (error instanceof APIStatusError) {
    if (error instanceof APIContextOverflowError) return false;
    if (error instanceof APIRequestTooLargeError) return false;
    if (error.statusCode !== 400) return false;
    const lowerMessage = error.message.toLowerCase();
    return (
      IMAGE_FORMAT_STATUS_MESSAGE_PATTERNS.some((pattern) => pattern.test(lowerMessage)) ||
      (MEDIA_TYPE_FIELD_PATTERN.test(lowerMessage) && lowerMessage.includes('image'))
    );
  }
  if (error instanceof ChatProviderError) {
    const lowerMessage = error.message.toLowerCase();
    return IMAGE_FORMAT_PROVIDER_MESSAGE_PATTERNS.some((pattern) => pattern.test(lowerMessage));
  }
  return false;
}

/**
 * Whether an error is retryable by resending the identical request.
 * Context-overflow, request-too-large, and image-format errors are
 * deliberately excluded: they are deterministic for a given history and have
 * their own recovery paths (compaction / media-degraded / media-stripped),
 * so retrying the identical request first would only burn the retry budget.
 */
export function isRetryableGenerateError(error: unknown): boolean {
  if (error instanceof APIConnectionError || error instanceof APITimeoutError) {
    return true;
  }
  if (error instanceof APIEmptyResponseError) {
    return true;
  }
  if (error instanceof APIStatusError) {
    // Transient statuses worth retrying: 429 (rate limit), 5xx (server
    // errors) and 529 (provider overloaded).
    return [429, 500, 502, 503, 504, 529].includes(error.statusCode);
  }
  // Fallback safety net: an unclassified provider failure — typically an
  // upstream gateway that forwards the original error only as text. Retrying
  // beats failing the run on the first transient blip. Typed subclasses that
  // have their own recovery are excluded above before reaching here.
  return error instanceof ChatProviderError && !isImageFormatError(error);
}
