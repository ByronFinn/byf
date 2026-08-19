import { APIEmptyResponseError } from './errors';
import {
  isContentPart,
  isToolCall,
  isToolCallPart,
  mergeInPlace,
  type Message,
  type StreamedMessagePart,
  type ToolCall,
} from './message';
import type { ChatProvider, FinishReason, GenerateOptions, StreamedMessage } from './provider';
import type { Tool } from './tool';
import type { TokenUsage } from './usage';

/** Snapshot of a ToolCall excluding the internal `_streamIndex` routing field. */
type StoredToolCall = Omit<ToolCall, '_streamIndex'>;

/**
 * 单次 {@link generate} 调用的结果。
 *
 * 包含完整组装的 assistant {@link message}、可选 provider 分配的
 * {@link id} 与 token {@link usage} 统计。
 */
export interface GenerateResult {
  /** provider 分配的响应标识符;不可用时为 `null`。 */
  readonly id: string | null;
  /** 含合并内容 part 与工具调用的完整组装 assistant 消息。 */
  readonly message: Message;
  /** 本次生成的 token 用量;未报告时为 `null`。 */
  readonly usage: TokenUsage | null;
  /**
   * provider 报告的归一化 finish reason;未发出 finish_reason 时为 `null`
   * (例如流在最终事件前被中断)。
   */
  readonly finishReason: FinishReason | null;
  /**
   * 逐字保留的原始 provider 特定 finish_reason 字符串。
   * provider 未发出时为 `null`。
   */
  readonly rawFinishReason: string | null;
  /**
   * Milliseconds between the `provider.generate()` call and the first
   * streamed chunk. `undefined` when the stream produced no chunks
   * (empty response, early abort, or error).
   */
  readonly llmFirstTokenLatencyMs?: number;
  /**
   * Milliseconds between the `provider.generate()` call and stream
   * exhaustion (last chunk consumed). `undefined` when the stream
   * produced no chunks (empty response, early abort, or error).
   */
  readonly llmStreamDurationMs?: number;
}

export interface GenerateCallbacks {
  onMessagePart?: (part: StreamedMessagePart) => void | Promise<void>;
  /**
   * Fires once per fully-assembled tool call after the stream drains, in the
   * order tool calls appear in the final assistant message.
   *
   * Tool calls are deliberately deferred until after the stream completes:
   * parallel-tool-call streams may interleave argument deltas across calls
   * (e.g. tc0-header → tc1-header → tc0-args → tc1-args), so firing mid-stream
   * would dispatch a tool with half-parsed arguments and trigger toolParseError.
   */
  onToolCall?: (toolCall: ToolCall) => void | Promise<void>;
}

/**
 * 从给定 provider 流式生成一条 assistant 消息。
 *
 * 消息的 part 被流式接收并合并:连续兼容的 part(如 TextPart + TextPart、
 * ToolCall + ToolCallPart)原地合并,使返回的消息总是含完整组装的 part。
 *
 * **工具调用完成**从合并边界(下一个不可合并的 part 把待决工具调用刷进
 * `message.toolCalls`)与流结束推断。provider 适配器把原生「完成」信号
 * 翻译为这一统一形态;generate 循环永不见独立完成事件。
 *
 * @param provider - 要从中生成的 chat provider。
 * @param systemPrompt - 前置到请求的系统级指令。
 * @param tools - 模型可调用的工具定义。
 * @param history - 作为上下文发送的会话历史。
 * @param callbacks - 可选的流式回调。
 * @param options - 可选每次调用设置(如 {@link AbortSignal})。
 *
 * @throws {DOMException} 名 `"AbortError"`——`options.signal` 在流式前或
 *   流式期间被中止时。
 * @throws {APIEmptyResponseError}——响应无内容且无工具调用,或只有思考
 *   内容而无任何文本或工具调用时。
 */
export async function generate(
  provider: ChatProvider,
  systemPrompt: string,
  tools: Tool[],
  history: Message[],
  callbacks?: GenerateCallbacks,
  options?: GenerateOptions,
): Promise<GenerateResult> {
  const message: Message = { role: 'assistant', content: [], toolCalls: [] };
  let pendingPart: StreamedMessagePart | null = null;

  // Map from provider streaming index (e.g. OpenAI Chat `index`, Responses
  // `item_id`) to the position inside `message.toolCalls`. Used to route
  // interleaved argument deltas from parallel tool calls to the correct call.
  const toolCallIndexMap = new Map<number | string, number>();

  // Pre-flight abort check: if the caller's signal is already aborted, we
  // must not issue the provider request at all. Providers that do not
  // themselves honor `signal` would otherwise emit a network call that the
  // caller has explicitly cancelled.
  if (options?.signal?.aborted) {
    throwAbortError();
  }

  const generateStart = performance.now();
  const stream = await provider.generate(systemPrompt, tools, history, options);

  // Post-await abort check: `provider.generate()` may have resolved before
  // noticing a mid-flight abort. Reject immediately rather than draining
  // the stream.
  await throwIfAborted(options?.signal, stream);

  let firstChunkTime: number | undefined;
  for await (const part of stream) {
    firstChunkTime ??= performance.now();
    await throwIfAborted(options?.signal, stream);

    // Notify raw part callback (deep copy to avoid aliasing mutations).
    if (callbacks?.onMessagePart !== undefined) {
      await callbacks.onMessagePart(deepCopyPart(part));
      await throwIfAborted(options?.signal, stream);
    }

    // Index-based routing for parallel tool call argument deltas.
    // When a ToolCallPart arrives with an index referring to a tool call
    // that is NOT the currently-pending one, append it directly to the
    // correct ToolCall in message.toolCalls instead of relying on sequential
    // merging. This prevents argument cross-contamination across parallel calls.
    if (
      isToolCallPart(part) &&
      part.index !== undefined &&
      !isPendingToolCallAtIndex(pendingPart, part.index)
    ) {
      const arrayIdx = toolCallIndexMap.get(part.index);
      if (arrayIdx !== undefined) {
        const target = message.toolCalls[arrayIdx];
        if (target !== undefined && part.argumentsPart !== null) {
          target.arguments =
            target.arguments === null ? part.argumentsPart : target.arguments + part.argumentsPart;
        }
        continue;
      }
      // Unknown index — fall through to the sequential logic as a safety net.
    }

    if (pendingPart === null) {
      pendingPart = part;
    } else if (!mergeInPlace(pendingPart, part)) {
      // Could not merge — flush the pending part and start a new one.
      // For parallel tool calls this happens when a new ToolCall header arrives
      // while a previous ToolCall is still pending; the flush finalizes the
      // previous tool call into `message.toolCalls`.
      flushPart(message, pendingPart, toolCallIndexMap);
      pendingPart = part;
    }
  }

  await throwIfAborted(options?.signal, stream);

  // Flush the last pending part.
  if (pendingPart !== null) {
    flushPart(message, pendingPart, toolCallIndexMap);
  }
  if (message.content.length === 0 && message.toolCalls.length === 0) {
    throw new APIEmptyResponseError(
      `The API returned an empty response (no content, no tool calls). Provider: ${provider.name}, model: ${provider.modelName}`,
    );
  }

  // Think-only response (no real text, no tool calls) is treated as incomplete.
  const hasThink = message.content.some((p) => p.type === 'think');
  const hasText = message.content.some((p) => p.type === 'text' && p.text.trim().length > 0);
  const hasToolCalls = message.toolCalls.length > 0;

  if (hasThink && !hasText && !hasToolCalls) {
    throw new APIEmptyResponseError(
      'The API returned a response containing only thinking content ' +
        'without any text or tool calls. This usually indicates the ' +
        'stream was interrupted or the output token budget was exhausted ' +
        `during reasoning. Provider: ${provider.name}, model: ${provider.modelName}`,
    );
  }

  // Fire onToolCall for every fully-assembled tool call, in final order.
  if (callbacks?.onToolCall !== undefined) {
    for (const toolCall of message.toolCalls) {
      await throwIfAborted(options?.signal, stream);
      await callbacks.onToolCall(toolCall);
    }
  }

  const streamEnd = performance.now();
  const llmFirstTokenLatencyMs =
    firstChunkTime !== undefined ? Math.round(firstChunkTime - generateStart) : undefined;
  const llmStreamDurationMs =
    firstChunkTime !== undefined ? Math.round(streamEnd - generateStart) : undefined;

  return {
    id: stream.id,
    message,
    usage: stream.usage,
    finishReason: stream.finishReason,
    rawFinishReason: stream.rawFinishReason,
    llmFirstTokenLatencyMs,
    llmStreamDurationMs,
  };
}

type CancelableStream = StreamedMessage & {
  cancel?: () => unknown;
  return?: () => unknown;
};

function throwAbortError(): never {
  throw new DOMException('The operation was aborted.', 'AbortError');
}

async function cancelStream(stream: StreamedMessage): Promise<void> {
  const cancelable = stream as CancelableStream;

  try {
    await cancelable.cancel?.();
  } catch {}

  try {
    await cancelable.return?.();
  } catch {}
}

async function throwIfAborted(signal?: AbortSignal, stream?: StreamedMessage): Promise<void> {
  if (!signal?.aborted) {
    return;
  }

  if (stream !== undefined) {
    await cancelStream(stream);
  }

  throwAbortError();
}

/** True when `pending` is a ToolCall whose _streamIndex equals `index`. */
function isPendingToolCallAtIndex(
  pending: StreamedMessagePart | null,
  index: number | string,
): pending is ToolCall {
  return pending !== null && isToolCall(pending) && pending._streamIndex === index;
}

/**
 * Append a fully-merged part to the message.
 *
 * - ContentPart -> message.content
 * - ToolCall    -> message.toolCalls (the `_streamIndex` routing key is
 *                  registered in the map and stripped before storage).
 * - ToolCallPart -> ignored (orphaned delta without a matching pending call)
 */
function flushPart(
  message: Message,
  part: StreamedMessagePart,
  toolCallIndexMap: Map<number | string, number>,
): void {
  if (isContentPart(part)) {
    message.content.push(part);
    return;
  }
  if (isToolCall(part)) {
    const streamIndex = part._streamIndex;
    const stored: StoredToolCall = {
      type: 'function',
      id: part.id,
      name: part.name,
      arguments: part.arguments,
      extras: part.extras,
    };
    const ordinal = message.toolCalls.length;
    message.toolCalls.push(stored as ToolCall);
    if (streamIndex !== undefined) {
      toolCallIndexMap.set(streamIndex, ordinal);
    }
  }
  // ToolCallPart: orphaned delta — silently ignore.
}

/**
 * Produce a shallow-ish copy of a StreamedMessagePart.
 *
 * This is intentionally minimal: we only need isolation for the mutable
 * string fields that `mergeInPlace` mutates (text, think, arguments).
 */
function deepCopyPart(part: StreamedMessagePart): StreamedMessagePart {
  return structuredClone(part);
}
