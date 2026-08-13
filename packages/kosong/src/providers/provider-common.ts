/**
 * 所有 ChatProvider 适配器共享的跨 provider 归一化辅助。
 *
 * 与持有 OpenAI 家族 wire 格式转换的 `openai-common.ts` 不同,本模块持有
 * 逻辑在 provider 间结构一致、仅由 per-provider 表或字段名参数化的辅助。
 *
 * 理由见 ADR 0015(BaseChatProvider)。
 */

import {
  APIConnectionError,
  APITimeoutError,
  ChatProviderError,
  normalizeAPIStatusError,
} from '#/errors';
import type { FinishReason } from '#/provider';
import type { TokenUsage } from '#/usage';

/**
 * 由 per-provider 原始字符串 → FinishReason 表构建 finish-reason 归一化器。
 *
 * 镜像各适配器 `normalizeXxxFinishReason` 函数的形态:
 * - `null` / `undefined` 原始值 → `{ finishReason: null, rawFinishReason: null }`
 * - 原始值存在且在表中 → 映射的 FinishReason,原始值回显
 * - 原始值存在但不在表中 → `'other'`,原始值回显
 *
 * 返回的函数无状态,可安全重复调用。
 */
export function makeFinishReasonNormalizer(mapping: Readonly<Record<string, FinishReason>>): (
  raw: string | null | undefined,
) => {
  finishReason: FinishReason | null;
  rawFinishReason: string | null;
} {
  return (raw) => {
    if (raw === null || raw === undefined) {
      return { finishReason: null, rawFinishReason: null };
    }
    const finishReason = mapping[raw] ?? 'other';
    return { finishReason, rawFinishReason: raw };
  };
}

/**
 * 由已解析的 per-provider 数字构建四字段 `TokenUsage`,应用 OpenAI 风格与
 * Google provider 共享的 `inputOther = total - cached` 公式(它们只暴露
 * 提示总数与缓存子集)。
 *
 * `cached` 超过 `total` 时 `inputOther` 被钳制为 ≥ 0(防御——provider
 * 绝不应报告缓存多于总数,但我们绝不发出负用量字段)。Anthropic 被排除:
 * 它报告真实的 `inputCacheCreation` 字段,不适合此公式。
 */
export function extractCacheUsage(total: number, cached: number, output: number): TokenUsage {
  return {
    inputOther: Math.max(0, total - cached),
    output,
    inputCacheRead: cached,
    inputCacheCreation: 0,
  };
}

const NETWORK_RE = /network|connection|connect|disconnect/i;
const TIMEOUT_RE = /timed?\s*out|timeout|deadline/i;

/** {@link convertProviderError} 的选项。 */
export interface ConvertProviderErrorOptions {
  /** 从 provider 特定错误提取的数字 HTTP 状态码(如有)。 */
  readonly status?: number;
  /** 附加到状态错误的请求 id(如有)。 */
  readonly requestId?: string | null;
  /**
   * 从 provider 限流响应提取的解析后 `Retry-After` 值(毫秒,如有)。
   * 穿入 `APIProviderRateLimitError`。
   */
  readonly retryAfterMs?: number | null;
  /**
   * 默认 `NETWORK_RE` 未覆盖的额外网络分类匹配器。Google 的 SDK 抛出
   * `fetch failed`,不在默认正则中;Google 在此提供。每个匹配器针对
   * 小写消息测试。
   */
  readonly extraNetworkMatchers?: readonly RegExp[];
  /**
   * 设置时,消息含此子串的 `TypeError` 也被归类为连接错误
   * (Google 的 fetch 层抛出 TypeError)。
   */
  readonly extraTypeErrorMatch?: string;
}

/**
 * 用共享的基于消息的分类阶梯把原始抛出值转换为 kosong
 * `ChatProviderError`:
 *
 * 1. 已是 `ChatProviderError` → 原样返回(同一性)
 * 2. 提供 `status` → `normalizeAPIStatusError`(status + message + requestId)
 * 3. 消息匹配 `TIMEOUT_RE` → `APITimeoutError`
 * 4. 消息匹配 `NETWORK_RE` 或任一 `extraNetworkMatchers`,或值是匹配
 *    `extraTypeErrorMatch` 的 `TypeError` → `APIConnectionError`
 * 5. 否则 → 包裹消息的 `ChatProviderError`
 *
 * 识别 SDK 特定错误类(如 OpenAI 的 `APIConnectionTimeoutError`、Google 的
 * `GoogleApiError`)的 provider 适配器,应在调用此函数前把它们解包为
 * `(message, status?, requestId?)`。SDK 类检测本身是 provider 特定的,
 * 留在适配器中。
 */
export function convertProviderError(
  error: unknown,
  opts: ConvertProviderErrorOptions = {},
): ChatProviderError {
  if (error instanceof ChatProviderError) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);

  if (typeof opts.status === 'number') {
    return normalizeAPIStatusError(opts.status, message, opts.requestId, opts.retryAfterMs);
  }

  // Timeout takes priority over network (a timeout is also a connection issue).
  if (TIMEOUT_RE.test(message)) {
    return new APITimeoutError(message);
  }

  if (NETWORK_RE.test(message)) {
    return new APIConnectionError(message);
  }
  if (opts.extraNetworkMatchers?.some((re) => re.test(message))) {
    return new APIConnectionError(message);
  }
  if (
    opts.extraTypeErrorMatch !== undefined &&
    error instanceof TypeError &&
    message.includes(opts.extraTypeErrorMatch)
  ) {
    return new APIConnectionError(message);
  }

  if (error instanceof Error) {
    return new ChatProviderError(`Error: ${message}`);
  }
  return new ChatProviderError(`Error: ${String(error)}`);
}
