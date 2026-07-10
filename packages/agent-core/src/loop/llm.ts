/**
 * LLM contract for the model capability used by the stateless loop.
 *
 * The immutable `LLM` object owns provider/model metadata, capability metadata,
 * and the system prompt. Other host concerns are injected through separate
 * surfaces.
 */

import type {
  FinishReason,
  Message,
  ModelCapability,
  TextPart,
  ThinkPart,
  TokenUsage,
  Tool,
  ToolCall,
} from '@byfriends/kosong';

export interface ToolCallDelta {
  readonly toolCallId: string;
  readonly name?: string;
  readonly argumentsPart?: string;
}

export interface LLMRequestLogContext {
  readonly turnId?: string;
  readonly step?: number;
  readonly stepUuid?: string;
  readonly attempt?: number;
  readonly maxAttempts?: number;
}

export interface LLMChatParams {
  messages: Message[];
  tools: readonly Tool[];
  signal: AbortSignal;
  requestLogContext?: LLMRequestLogContext;
  onTextDelta?: (delta: string) => void;
  onThinkDelta?: (delta: string) => void;
  onToolCallDelta?: (delta: ToolCallDelta) => void;
  /**
   * Fires once per completed text block. Additive relative to
   * `onTextDelta` — deltas still fire chunk-by-chunk for UI streaming.
   * Returned promises are awaited by the adapter to preserve transcript append
   * order. Durable transcript writes receive completed blocks only.
   */
  onTextPart?: (part: TextPart) => Promise<void> | void;
  /**
   * Fires once per completed thinking block. Additive relative to
   * `onThinkDelta` — deltas still fire chunk-by-chunk for UI streaming.
   * Returned promises are awaited by the adapter to preserve transcript append
   * order. Durable transcript writes receive completed blocks only.
   */
  onThinkPart?: (part: ThinkPart) => Promise<void> | void;
}

export interface LLMChatResponse {
  toolCalls: ToolCall[];
  providerFinishReason?: FinishReason;
  rawFinishReason?: string;
  usage: TokenUsage;
  llmFirstTokenLatencyMs?: number;
  llmStreamDurationMs?: number;
}

export interface LLM {
  readonly systemPrompt: string;
  readonly modelName: string;
  readonly capability?: ModelCapability;
  isRetryableError?(error: unknown): boolean;
  chat(params: LLMChatParams): Promise<LLMChatResponse>;
}
