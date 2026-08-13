import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  ChatProviderError,
} from '@byfriends/kosong';

import { ByfError } from './classes';
import { ErrorCodes, BYF_ERROR_INFO, type ByfErrorCode } from './codes';

/**
 * Byf 错误的 wire 安全负载。
 *
 * 这是跨进程 / 跨语言边界(RPC、事件、遥测、SDK 包装)传递的结构。类身份
 * 无法跨过边界;下游代码必须按 `code` 分支而非 `instanceof`。
 *
 * `details` 被 JSON 序列化。`cause` 刻意缺席——它是仅本地的诊断状态,
 * 不得跨边界。
 */
export interface ByfErrorPayload {
  readonly code: ByfErrorCode;
  readonly message: string;
  readonly name?: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
}

/** ByfError 的类型守卫。 */
export function isByfError(error: unknown): error is ByfError {
  return error instanceof ByfError;
}

/**
 * 直接由 code + message 构建 ByfErrorPayload(无需 Error 实例)。用于以信号
 * 而非抛出的方式表达的错误事件——例如「turn 忙碌」或「压缩失败」。
 * `retryable` 从 BYF_ERROR_INFO 填充,使调用方不会与注册表脱节。
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
 * 把任意值归一化为 ByfErrorPayload。
 *
 * 可识别的错误:
 * - `ByfError`:直接透传。
 * - `APIStatusError`:429 → rate_limit,401 → auth_error,其余 → api_error。
 * - `APIConnectionError` / `APITimeoutError`:connection_error。
 * - `ChatProviderError`:api_error。
 * - 启发式匹配「Model not set」/「Provider not set」消息:model.not_configured。
 *
 * 其余一切归并为 `internal`。我们绝不在 wire 上回显 `cause` 或堆栈。
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
 * 把 ByfErrorPayload 重新水合为 ByfError。SDK 边界代码经 RPC 收到错误后用它
 * 以真实类重新呈现,使进程内消费者仍可使用 `instanceof`。
 */
export function fromByfErrorPayload(payload: ByfErrorPayload): ByfError {
  return new ByfError(payload.code, payload.message, {
    details: payload.details,
  });
}
