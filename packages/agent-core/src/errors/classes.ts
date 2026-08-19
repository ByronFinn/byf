import type { ByfErrorCode } from './codes';

export interface ByfErrorOptions {
  /** 可 JSON 序列化的结构化细节。 */
  readonly details?: Record<string, unknown>;
  /** 原始错误或值。仅本地;绝不序列化到 wire 上。 */
  readonly cause?: unknown;
}

/**
 * 唯一的 Byf 错误类。
 *
 * 判别始终依据 `code`。跨进程消费者收到 `ByfErrorPayload`,
 * 必须按 `code` 分支而非类身份。
 */
export class ByfError extends Error {
  readonly code: ByfErrorCode;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(code: ByfErrorCode, message: string, options: ByfErrorOptions = {}) {
    super(message);
    this.name = 'ByfError';
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;
  }
}
