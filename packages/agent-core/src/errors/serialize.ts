import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  ChatProviderError,
} from '@byfriends/kosong';

import { ByfError } from './classes';
import { ErrorCodes, BYF_ERROR_INFO, type ByfErrorCode } from './codes';

/**
 * Wire-safe payload of a Byf error.
 *
 * The structure passed across process / language boundaries (RPC, events,
 * telemetry, SDK wrappers). Class identity does not survive the boundary;
 * downstream code must branch on `code` rather than `instanceof`.
 *
 * `details` is JSON-serialized. `cause` is intentionally absent -- it is
 * local-only diagnostic state and must not cross the boundary.
 */
export interface ByfErrorPayload {
  readonly code: ByfErrorCode;
  readonly message: string;
  readonly name?: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
}

/** Type guard for ByfError. */
export function isByfError(error: unknown): error is ByfError {
  return error instanceof ByfError;
}

/**
 * Build a ByfErrorPayload directly from a code + message (no Error instance
 * needed). Use this for synthetic error events that are signaled, not thrown
 * -- e.g. "turn busy" or "compaction failed". `retryable` is filled from
 * BYF_ERROR_INFO so callers cannot drift out of sync with the registry.
 */
export function makeErrorPayload(
  code: ByfErrorCode,
  message: string,
  options?: { readonly details?: Record<string, unknown>; readonly name?: string },
): ByfErrorPayload {
  return {
    code,
    message,
    name: options?.name,
    details: options?.details,
    retryable: BYF_ERROR_INFO[code].retryable,
  };
}

/**
 * Normalize any value into a ByfErrorPayload.
 *
 * Recognized errors:
 * - `ByfError`: passthrough.
 * - `APIStatusError`: 429 -> rate_limit, 401 -> auth_error, otherwise -> api_error.
 * - `APIConnectionError` / `APITimeoutError`: connection_error.
 * - `ChatProviderError`: api_error.
 * - Heuristic "Model not set" / "Provider not set" messages: model.not_configured.
 *
 * Anything else collapses to `internal`. We never echo `cause` or stack on
 * the wire.
 */
export function toByfErrorPayload(error: unknown): ByfErrorPayload {
  if (isByfError(error)) {
    return {
      code: error.code,
      message: error.message,
      name: error.name,
      details: error.details,
      retryable: BYF_ERROR_INFO[error.code].retryable,
    };
  }

  if (error instanceof APIStatusError) {
    const code: ByfErrorCode =
      error.statusCode === 429
        ? ErrorCodes.PROVIDER_RATE_LIMIT
        : error.statusCode === 401
          ? ErrorCodes.PROVIDER_AUTH_ERROR
          : ErrorCodes.PROVIDER_API_ERROR;
    return {
      code,
      message: error.message,
      name: error.name,
      details: {
        statusCode: error.statusCode,
        requestId: error.requestId,
      },
      retryable: BYF_ERROR_INFO[code].retryable,
    };
  }

  if (error instanceof APIConnectionError || error instanceof APITimeoutError) {
    return {
      code: ErrorCodes.PROVIDER_CONNECTION_ERROR,
      message: error.message,
      name: error.name,
      retryable: BYF_ERROR_INFO[ErrorCodes.PROVIDER_CONNECTION_ERROR].retryable,
    };
  }

  if (error instanceof ChatProviderError) {
    return {
      code: ErrorCodes.PROVIDER_API_ERROR,
      message: error.message,
      name: error.name,
      retryable: BYF_ERROR_INFO[ErrorCodes.PROVIDER_API_ERROR].retryable,
    };
  }

  if (error instanceof Error) {
    if (error.message === 'Model not set' || error.message === 'Provider not set') {
      return {
        code: ErrorCodes.MODEL_NOT_CONFIGURED,
        message: error.message,
        name: error.name,
        retryable: BYF_ERROR_INFO[ErrorCodes.MODEL_NOT_CONFIGURED].retryable,
      };
    }

    return {
      code: ErrorCodes.INTERNAL,
      message: error.message,
      name: error.name,
      retryable: BYF_ERROR_INFO[ErrorCodes.INTERNAL].retryable,
    };
  }

  return {
    code: ErrorCodes.INTERNAL,
    message: String(error),
    retryable: BYF_ERROR_INFO[ErrorCodes.INTERNAL].retryable,
  };
}

/**
 * Rehydrate a ByfErrorPayload into a ByfError. Used by SDK boundary code
 * receiving errors over RPC to re-surface them with a real class so
 * in-process consumers can still use `instanceof`.
 */
export function fromByfErrorPayload(payload: ByfErrorPayload): ByfError {
  return new ByfError(payload.code, payload.message, {
    details: payload.details,
  });
}
