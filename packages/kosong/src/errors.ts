/**
 * 所有 chat provider 错误的基类。
 */
export class ChatProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatProviderError';
  }
}

/**
 * 网络层连接失败。
 */
export class APIConnectionError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APIConnectionError';
  }
}

/**
 * 请求超时。
 */
export class APITimeoutError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APITimeoutError';
  }
}

/**
 * API 的 HTTP 状态错误。
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
 * 特指请求超出模型上下文窗口的 HTTP 状态错误。
 */
export class APIContextOverflowError extends APIStatusError {
  constructor(statusCode: number, message: string, requestId?: string | null) {
    super(statusCode, message, requestId);
    this.name = 'APIContextOverflowError';
  }
}

/**
 * 特指序列化请求体超出 provider 字节上限的 HTTP 413(如累积的 base64
 * 图片),而非 token 数溢出。token 溢出可通过压缩恢复;请求体大小被拒
 * 则不能——它需要丢弃或缩小媒体。
 */
export class APIRequestTooLargeError extends APIStatusError {
  constructor(statusCode: number, message: string, requestId?: string | null) {
    super(statusCode, message, requestId);
    this.name = 'APIRequestTooLargeError';
  }
}

/**
 * API 的 HTTP 429 限流错误。可用时携带解析后的 `retryAfterMs`
 * (来自 `Retry-After` 响应头)。
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
 * API 返回空响应(无内容、无工具调用)。
 */
export class APIEmptyResponseError extends ChatProviderError {
  constructor(message: string) {
    super(message);
    this.name = 'APIEmptyResponseError';
  }
}

/**
 * 检查未知值是否为标准 `AbortError`。
 *
 * `err` 是 `.name` 属性恰为 `'AbortError'` 的 `Error` 实例时返回 `true`。
 * 这是 kosong、agent-core 与 CLI 使用的规范检查——所有层都汇聚于
 * 这一单一函数。
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
 * 把 HTTP `Retry-After` 头值解析为毫秒。
 *
 * 只接受整数秒(常见形式,如 "30")。HTTP-date 形式与任何不可解析的值
 * 返回 `null`。负数 / 零被允许并原样返回(调用方决定是否钳制)。
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
 * provider 是否因图片的**格式**或**数据**拒绝了请求中的 IMAGE——
 * 不支持的媒体类型或无法解码的图片字节。对给定历史,该拒绝是确定性的
 * (同一图片每次请求都会重发),唯一恢复方式是剥离全部媒体后重发一次。
 * 请求体大小(413)、上下文溢出、图片数量 / 大小限制、禁用图片输入的
 * 拒绝,以及非图片(audio/video)媒体拒绝被排除——前两者有自己的恢复
 * 路径,其余不会因剥离媒体而解决。
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
 * 错误是否可通过重发相同请求重试。上下文溢出、请求过大与图片格式错误
 * 被刻意排除:它们对给定历史是确定性的,且有各自恢复路径
 * (压缩 / media-degraded / media-stripped),先重试相同请求只会烧掉
 * 重试预算。
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
