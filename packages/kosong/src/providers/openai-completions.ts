import { createHash } from 'node:crypto';

import OpenAI from 'openai';

import type { ModelCapability } from '#/capability';
import type { ContentPart, Message, StreamedMessagePart, ToolCall } from '#/message';
import type { PromptPlan } from '#/prompt-plan';
import type {
  GenerateOptions,
  ProviderRequestAuth,
  StreamedMessage,
  ThinkingEffort,
  VideoUploadInput,
} from '#/provider';
import type { Tool } from '#/tool';

import { BaseChatProvider, type ResolvedAuth } from './base-chat-provider';
import { BaseStreamedMessage } from './base-streamed-message';
import { getOpenAILegacyModelCapability } from './capability-registry';
import {
  convertChatCompletionStreamToolCall,
  type BufferedChatCompletionToolCall,
} from './chat-completions-stream';
import {
  convertContentPart,
  convertOpenAIError,
  convertToolMessageContent,
  extractUsage,
  isFunctionToolCall,
  normalizeOpenAIFinishReason,
  type OpenAIContentPart,
  type OpenAIToolParam,
  reasoningEffortToThinkingEffort,
  toolToOpenAI,
  type ToolMessageConversion,
} from './openai-common';
import { OpenAICompatFiles } from './openai-compat-files';
import { normalizeOpenAICompatToolSchema } from './openai-compat-schema';

// Inbound: scan in priority order; first string value wins. Outbound: the first
// entry doubles as the default field we serialize ThinkPart back into. Both
// arms can be overridden by an explicit `reasoningKey` on the provider config.
const KNOWN_REASONING_KEYS = ['reasoning_content', 'reasoning_details', 'reasoning'] as const;
const DEFAULT_OUTBOUND_REASONING_KEY = KNOWN_REASONING_KEYS[0];

function extractReasoningContent(
  source: unknown,
  explicitKey: string | undefined,
): string | undefined {
  if (typeof source !== 'object' || source === null) return undefined;
  const record = source as Record<string, unknown>;
  const keys: readonly string[] = explicitKey !== undefined ? [explicitKey] : KNOWN_REASONING_KEYS;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

export interface OpenAICompletionsOptions {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  stream?: boolean;
  defaultHeaders?: Record<string, string>;
  thinkingEffortKey?: string;
  reasoningKey?: string;
  toolMessageConversion?: ToolMessageConversion;
  generationKwargs?: GenerationKwargs;
  clientFactory?: (auth: ProviderRequestAuth) => OpenAI;
}

export interface GenerationKwargs {
  max_tokens?: number | undefined;
  max_completion_tokens?: number | undefined;
  temperature?: number | undefined;
  top_p?: number | undefined;
  n?: number | undefined;
  presence_penalty?: number | undefined;
  frequency_penalty?: number | undefined;
  stop?: string | string[] | undefined;
  reasoning_effort?: string | undefined;
  prompt_cache_key?: string | undefined;
  extra_body?: ExtraBody;
  [key: string]: unknown;
}

export interface ThinkingConfig {
  type?: 'enabled' | 'disabled';
  keep?: unknown;
  [key: string]: unknown;
}

export interface ExtraBody {
  thinking?: ThinkingConfig;
  [key: string]: unknown;
}

interface OpenAIMessage {
  role: string;
  content?: string | OpenAIContentPart[] | undefined;
  tool_calls?: OpenAIToolCallOut[] | undefined;
  tool_call_id?: string | undefined;
  name?: string | undefined;
  [key: string]: unknown;
}

interface OpenAIToolCallOut {
  type: string;
  id: string;
  function: { name: string; arguments: string | null };
  extras?: Record<string, unknown> | undefined;
}

function isEffectivelyEmptyContent(parts: ContentPart[]): boolean {
  for (const part of parts) {
    if (part.type !== 'text') return false;
    if (part.text.trim() !== '') return false;
  }
  return true;
}

/**
 * Derive a stable SHA256 hash from cacheable blocks in a PromptPlan.
 *
 * Only blocks with cacheScope 'global' are included in the hash, as OpenAI
 * only supports caching the prefix (global scope).
 *
 * @param promptPlan - The prompt plan containing cacheable blocks.
 * @returns A hexadecimal SHA256 hash string.
 */
function deriveCacheKeyFromPromptPlan(promptPlan: PromptPlan | undefined): string {
  if (!promptPlan || promptPlan.blocks.length === 0) {
    // Hash of empty string
    return createHash('sha256').digest('hex');
  }

  // Concatenate only global-scope blocks in order
  const cacheableTexts: string[] = [];
  for (const block of promptPlan.blocks) {
    if (block.cacheScope === 'global') {
      cacheableTexts.push(block.text);
    }
  }

  const concatenated = cacheableTexts.join('');

  // Use Node.js crypto for SHA256
  return createHash('sha256').update(concatenated).digest('hex');
}

function convertMessage(
  message: Message,
  reasoningKey: string | undefined,
  toolMessageConversion: ToolMessageConversion,
): OpenAIMessage {
  let reasoningContent = '';
  const nonThinkParts: ContentPart[] = [];

  for (const part of message.content) {
    if (part.type === 'think') {
      reasoningContent += part.think;
    } else {
      nonThinkParts.push(part);
    }
  }

  const result: OpenAIMessage = { role: message.role };
  const hasToolCalls = message.toolCalls.length > 0;
  const shouldOmitContent =
    message.role === 'assistant' && hasToolCalls && isEffectivelyEmptyContent(nonThinkParts);

  if (message.role === 'tool') {
    // OpenAI Chat Completions `tool` messages only accept text content.
    // Any non-text content parts (image_url, audio_url, video_url) would be
    // rejected by the API with a 400. Detect multimodal tool output and
    // force the `extract_text` path in that case, regardless of the caller's
    // `toolMessageConversion` setting.
    const hasNonTextPart = message.content.some((p) => p.type !== 'text' && p.type !== 'think');
    const effectiveConversion: ToolMessageConversion = hasNonTextPart
      ? 'extract_text'
      : toolMessageConversion;

    if (effectiveConversion !== null) {
      result.content = convertToolMessageContent(message, effectiveConversion);
    } else if (!shouldOmitContent) {
      const firstPart = nonThinkParts[0];
      if (nonThinkParts.length === 1 && firstPart?.type === 'text') {
        result.content = firstPart.text;
      } else if (nonThinkParts.length > 0) {
        result.content = nonThinkParts
          .map((p) => convertContentPart(p))
          .filter((p): p is OpenAIContentPart => p !== null);
      }
    }
  } else if (!shouldOmitContent) {
    const firstPart = nonThinkParts[0];
    if (nonThinkParts.length === 1 && firstPart?.type === 'text') {
      result.content = firstPart.text;
    } else if (nonThinkParts.length > 0) {
      result.content = nonThinkParts
        .map((p) => convertContentPart(p))
        .filter((p): p is OpenAIContentPart => p !== null);
    }
  }

  if (message.name !== undefined) {
    result.name = message.name;
  }

  if (hasToolCalls) {
    result.tool_calls = message.toolCalls.map((tc) => {
      const mapped: OpenAIToolCallOut = {
        type: tc.type,
        id: tc.id,
        function: { name: tc.name, arguments: tc.arguments },
      };
      if (tc.extras !== undefined) {
        mapped.extras = tc.extras;
      }
      return mapped;
    });
  }

  if (message.toolCallId !== undefined) {
    result.tool_call_id = message.toolCallId;
  }

  if (reasoningContent) {
    result[reasoningKey ?? DEFAULT_OUTBOUND_REASONING_KEY] = reasoningContent;
  }

  return result;
}

function convertTool(tool: Tool): OpenAIToolParam {
  if (tool.name.startsWith('$')) {
    return {
      type: 'builtin_function',
      function: { name: tool.name },
    };
  }
  const converted = toolToOpenAI(tool);
  return {
    ...converted,
    function: {
      ...converted.function,
      parameters: normalizeOpenAICompatToolSchema(tool.parameters),
    },
  };
}

export function extractUsageFromChunk(
  chunk: Record<string, unknown>,
): Record<string, unknown> | null {
  if (
    chunk['usage'] !== null &&
    chunk['usage'] !== undefined &&
    typeof chunk['usage'] === 'object'
  ) {
    return chunk['usage'] as Record<string, unknown>;
  }
  const choices = chunk['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const firstChoice = choices[0] as Record<string, unknown> | undefined;
  if (firstChoice === undefined) {
    return null;
  }
  const choiceUsage = firstChoice['usage'];
  if (choiceUsage !== null && choiceUsage !== undefined && typeof choiceUsage === 'object') {
    return choiceUsage as Record<string, unknown>;
  }
  return null;
}

class OpenAICompletionsStreamedMessage extends BaseStreamedMessage {
  private readonly _response:
    | OpenAI.Chat.ChatCompletion
    | AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
  private readonly _isStream: boolean;
  private readonly _reasoningKey: string | undefined;

  constructor(
    response: OpenAI.Chat.ChatCompletion | AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    isStream: boolean,
    reasoningKey: string | undefined,
  ) {
    super();
    this._response = response;
    this._isStream = isStream;
    this._reasoningKey = reasoningKey;
  }

  protected _buildIter(): AsyncGenerator<StreamedMessagePart> {
    if (this._isStream) {
      return this._convertStreamResponse(
        this._response as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
        this._reasoningKey,
      );
    }
    return this._convertNonStreamResponse(
      this._response as OpenAI.Chat.ChatCompletion,
      this._reasoningKey,
    );
  }

  private _captureFinishReason(raw: string | null | undefined): void {
    const normalized = normalizeOpenAIFinishReason(raw);
    this._finishReason = normalized.finishReason;
    this._rawFinishReason = normalized.rawFinishReason;
  }

  private async *_convertNonStreamResponse(
    response: OpenAI.Chat.ChatCompletion,
    reasoningKey: string | undefined,
  ): AsyncGenerator<StreamedMessagePart> {
    this._id = response.id;
    if (response.usage) {
      this._usage = extractUsage(response.usage) ?? null;
    }
    this._captureFinishReason(response.choices[0]?.finish_reason ?? null);

    const message = response.choices[0]?.message;
    if (!message) return;

    const reasoning = extractReasoningContent(message, reasoningKey);
    if (reasoning) {
      yield { type: 'think', think: reasoning } satisfies StreamedMessagePart;
    }

    if (message.content) {
      yield { type: 'text', text: message.content } satisfies StreamedMessagePart;
    }

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        if (!isFunctionToolCall(toolCall)) continue;
        yield {
          type: 'function',
          id: toolCall.id || crypto.randomUUID(),
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        } satisfies ToolCall;
      }
    }
  }

  private async *_convertStreamResponse(
    response: AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    reasoningKey: string | undefined,
  ): AsyncGenerator<StreamedMessagePart> {
    const bufferedToolCalls = new Map<number | string, BufferedChatCompletionToolCall>();

    try {
      for await (const chunk of response) {
        if (chunk.id) {
          this._id = chunk.id;
        }

        const rawChunk = chunk as unknown as Record<string, unknown>;
        const rawUsage = extractUsageFromChunk(rawChunk);
        if (rawUsage) {
          this._usage = extractUsage(rawUsage) ?? null;
        }

        if (!chunk.choices || chunk.choices.length === 0) {
          continue;
        }

        const choice = chunk.choices[0];
        if (!choice) continue;

        if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
          this._captureFinishReason(choice.finish_reason);
        }

        const delta = choice.delta;

        const reasoning = extractReasoningContent(delta, reasoningKey);
        if (reasoning) {
          yield { type: 'think', think: reasoning } satisfies StreamedMessagePart;
        }

        if (delta.content) {
          yield { type: 'text', text: delta.content } satisfies StreamedMessagePart;
        }

        for (const toolCall of delta.tool_calls ?? []) {
          for (const part of convertChatCompletionStreamToolCall(toolCall, bufferedToolCalls)) {
            yield part;
          }
        }
      }
    } catch (error: unknown) {
      throw convertOpenAIError(error);
    }
  }
}

export class OpenAICompletionsChatProvider extends BaseChatProvider<GenerationKwargs> {
  readonly name: string = 'openai-completions';

  private _stream: boolean;
  private _thinkingEffortKey: string;
  private _reasoningKey: string | undefined;
  private _toolMessageConversion: ToolMessageConversion;
  private _files: OpenAICompatFiles | undefined;

  constructor(options: OpenAICompletionsOptions) {
    const apiKey =
      options.apiKey === undefined || options.apiKey.length === 0 ? undefined : options.apiKey;
    const baseUrl = options.baseUrl ?? '';
    const generationKwargs = { ...options.generationKwargs };
    const client =
      apiKey === undefined
        ? undefined
        : new OpenAI({ apiKey, baseURL: baseUrl, defaultHeaders: options.defaultHeaders });
    // Shared fields (_model, _generationKwargs, _apiKey, _baseUrl,
    // _defaultHeaders, _client, _clientFactory) live on BaseChatProvider.
    super(
      options.model,
      generationKwargs,
      apiKey,
      baseUrl,
      options.defaultHeaders,
      client,
      options.clientFactory,
    );
    // OpenAI-specific fields stay here.
    this._stream = options.stream ?? true;
    const normalizedThinkingEffortKey = options.thinkingEffortKey?.trim();
    this._thinkingEffortKey =
      normalizedThinkingEffortKey !== undefined && normalizedThinkingEffortKey.length > 0
        ? normalizedThinkingEffortKey
        : 'reasoning_effort';
    const normalizedReasoningKey = options.reasoningKey?.trim();
    this._reasoningKey =
      normalizedReasoningKey !== undefined && normalizedReasoningKey.length > 0
        ? normalizedReasoningKey
        : undefined;
    this._toolMessageConversion = options.toolMessageConversion ?? null;
  }

  override get thinkingEffort(): ThinkingEffort | null {
    const customValue = this._generationKwargs[this._thinkingEffortKey];
    if (typeof customValue === 'string') {
      return reasoningEffortToThinkingEffort(customValue);
    }
    const defaultValue = this._generationKwargs.reasoning_effort;
    return reasoningEffortToThinkingEffort(defaultValue);
  }

  get files(): OpenAICompatFiles {
    this._files ??= new OpenAICompatFiles({
      apiKey: this._apiKey,
      baseUrl: this._baseUrl,
      defaultHeaders: this._defaultHeaders,
      clientFactory: this._clientFactory as ((auth: ProviderRequestAuth) => OpenAI) | undefined,
    });
    return this._files;
  }

  uploadVideo(input: string | VideoUploadInput, options?: GenerateOptions) {
    return this.files.uploadVideo(input, options);
  }

  override get modelParameters(): Record<string, unknown> {
    return {
      model: this._model,
      baseUrl: this._baseUrl,
      ...this._generationKwargs,
    };
  }

  override getCapability(model?: string): ModelCapability {
    return getOpenAILegacyModelCapability(model ?? this._model);
  }

  override async generate(
    systemPrompt: string,
    tools: Tool[],
    history: Message[],
    options?: GenerateOptions,
  ): Promise<StreamedMessage> {
    const messages: OpenAIMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    for (const msg of history) {
      messages.push(convertMessage(msg, this._reasoningKey, this._toolMessageConversion));
    }

    const kwargs: Record<string, unknown> = {
      ...this._generationKwargs,
    };

    // Auto-enable reasoning_effort when the history contains ThinkPart but
    // reasoning was not explicitly configured. Skip when the caller already
    // pinned reasoning_effort via withGenerationKwargs.
    if (kwargs[this._thinkingEffortKey] === undefined && kwargs['reasoning_effort'] === undefined) {
      const hasThinkPart = history.some((message) =>
        message.content.some((part) => part.type === 'think'),
      );
      if (hasThinkPart) {
        kwargs[this._thinkingEffortKey] = 'high';
      }
    }

    // Remove undefined values from kwargs
    for (const key of Object.keys(kwargs)) {
      if (kwargs[key] === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete kwargs[key];
      }
    }

    // Normalize legacy max_tokens → max_completion_tokens
    if (kwargs['max_completion_tokens'] === undefined && kwargs['max_tokens'] !== undefined) {
      kwargs['max_completion_tokens'] = kwargs['max_tokens'];
    }
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete kwargs['max_tokens'];

    const { extra_body: extraBody, ...requestKwargs } = kwargs;

    const createParams: Record<string, unknown> = {
      model: this._model,
      messages,
      stream: this._stream,
      ...requestKwargs,
      ...(extraBody as Record<string, unknown> | undefined),
    };

    if (tools.length > 0) {
      createParams['tools'] = tools.map((t) => convertTool(t));
    }

    if (this._stream) {
      createParams['stream_options'] = { include_usage: true };
    }

    // Inject prompt_cache_key from PromptPlan if provided
    if (options?.promptPlan) {
      const cacheKey = deriveCacheKeyFromPromptPlan(options.promptPlan);
      if (cacheKey) {
        createParams['prompt_cache_key'] = cacheKey;
      }
    }

    try {
      const client = this._createClient(options?.auth) as OpenAI;
      const response = (await client.chat.completions.create(
        createParams as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        options?.signal ? { signal: options.signal } : undefined,
      )) as unknown as OpenAI.Chat.ChatCompletion | AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
      return new OpenAICompletionsStreamedMessage(response, this._stream, this._reasoningKey);
    } catch (error: unknown) {
      throw convertOpenAIError(error);
    }
  }

  override withThinking(effort: ThinkingEffort): OpenAICompletionsChatProvider {
    const thinking: ThinkingConfig = {
      type: effort === 'off' ? 'disabled' : 'enabled',
    };
    let reasoningEffort: string | undefined;
    switch (effort) {
      case 'off':
        reasoningEffort = undefined;
        break;
      case 'low':
        reasoningEffort = 'low';
        break;
      case 'medium':
        reasoningEffort = 'medium';
        break;
      case 'high':
      case 'xhigh':
      case 'max':
        reasoningEffort = 'high';
        break;
    }
    const nextEffort: GenerationKwargs = {
      [this._thinkingEffortKey]: reasoningEffort,
    };
    return this._withGenerationKwargs(nextEffort).withExtraBody({
      thinking,
    });
  }

  withMaxCompletionTokens(maxCompletionTokens: number): OpenAICompletionsChatProvider {
    return this._withGenerationKwargs({ max_completion_tokens: maxCompletionTokens });
  }

  withExtraBody(extraBody: ExtraBody): OpenAICompletionsChatProvider {
    const oldExtra = this._generationKwargs.extra_body ?? {};
    const merged: ExtraBody = { ...oldExtra, ...extraBody };
    const oldThinking = oldExtra.thinking;
    const newThinking = extraBody.thinking;
    if (oldThinking !== undefined && newThinking !== undefined) {
      merged.thinking = { ...oldThinking, ...newThinking };
    }
    return this._withGenerationKwargs({ extra_body: merged });
  }

  private _withGenerationKwargs(kwargs: GenerationKwargs): OpenAICompletionsChatProvider {
    // Inherited withGenerationKwargs does the clone+merge; the _files reset
    // is handled by our _clone override below.
    return this.withGenerationKwargs(kwargs);
  }

  protected override _clone(): this {
    const clone = super._clone();
    // Reset the lazy OpenAICompatFiles cache on every clone so the clone
    // does not share file-upload state with the original.
    (clone as OpenAICompletionsChatProvider)._files = undefined;
    return clone;
  }

  protected createRawClient(
    auth: ResolvedAuth,
    defaultHeaders: Record<string, string> | undefined,
  ): OpenAI {
    return new OpenAI({
      apiKey: auth.apiKey,
      baseURL: this._baseUrl,
      defaultHeaders,
    });
  }
}
