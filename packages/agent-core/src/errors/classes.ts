import type { ByfErrorCode } from './codes';

export interface ByfErrorOptions {
  /** JSON-serializable structured details. */
  readonly details?: Record<string, unknown>;
  /** Original error or value. Local-only; never serialized to the wire. */
  readonly cause?: unknown;
}

/**
 * The single Byf error class.
 *
 * Discrimination is always by `code`. Cross-process consumers receive
 * `ByfErrorPayload` and must branch on `code` rather than class identity.
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
