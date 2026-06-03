import type { ModelCapability } from '#/capability';
import { normalizeOpenAICompatToolSchema } from './openai-compat-schema';
import type { ContentPart, Message, StreamedMessagePart, ToolCall } from '#/message';
import type {
  ChatProvider,
  FinishReason,
  GenerateOptions,
  ProviderRequestAuth,
  StreamedMessage,
  ThinkingEffort,
  VideoUploadInput,
} from '#/provider';
import type { Tool } from '#/tool';
import type { TokenUsage } from '#/usage';
import OpenAI from 'openai';

import { OpenAICompatFiles } from './openai-compat-files';
import {
  convertChatCompletionStreamToolCall,
  type BufferedChatCompletionToolCall,
} from './chat-completions-stream';
import { getOpenAILegacyModelCapability } from './capability-registry';
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
import {
  mergeRequestHeaders,
  requireProviderApiKey,
  resolveAuthBackedClient,
} from './request-auth';

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

class OpenAICompletionsStreamedMessage implements StreamedMessage {
  private _id: string | null = null;
  private _usage: TokenUsage | null = null;
  private _finishReason: FinishReason | null = null;
  private _rawFinishReason: string | null = null;
  private readonly _iter: AsyncGenerator<StreamedMessagePart>;

  constructor(
    response: OpenAI.Chat.ChatCompletion | AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
    isStream: boolean,
    reasoningKey: string | undefined,
  ) {
    if (isStream) {
      this._iter = this._convertStreamResponse(
        response as AsyncIterable<OpenAI.Chat.ChatCompletionChunk>,
        reasoningKey,
      );
    } else {
      this._iter = this._convertNonStreamResponse(
        response as OpenAI.Chat.ChatCompletion,
        reasoningKey,
      );
    }
  }

  get id(): string | null {
    return this._id;
  }

  get usage(): TokenUsage | null {
    return this._usage;
  }

  get finishReason(): FinishReason | null {
    return this._finishReason;
  }

  get rawFinishReason(): string | null {
    return this._rawFinishReason;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<StreamedMessagePart> {
    yield* this._iter;
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

export class OpenAICompletionsChatProvider implements ChatProvider {
  readonly name: string = 'openai-completions';

  private _model: string;
  private _stream: boolean;
  private _apiKey: string | undefined;
  private _baseUrl: string;
  private _defaultHeaders: Record<string, string> | undefined;
  private _generationKwargs: GenerationKwargs;
  private _thinkingEffortKey: string;
  private _reasoningKey: string | undefined;
  private _toolMessageConversion: ToolMessageConversion;
  private _client: OpenAI | undefined;
  private _clientFactory: ((auth: ProviderRequestAuth) => OpenAI) | undefined;
  private _files: OpenAICompatFiles | undefined;

  constructor(options: OpenAICompletionsOptions) {
    const apiKey = options.apiKey;
    this._apiKey = apiKey === undefined || apiKey.length === 0 ? undefined : apiKey;
    this._baseUrl = options.baseUrl ?? '';
    this._defaultHeaders = options.defaultHeaders;
    this._clientFactory = options.clientFactory;
    this._model = options.model;
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
    this._generationKwargs = { ...options.generationKwargs };
    this._toolMessageConversion = options.toolMessageConversion ?? null;
    this._client =
      this._apiKey === undefined
        ? undefined
        : new OpenAI({
            apiKey: this._apiKey,
            baseURL: this._baseUrl,
            defaultHeaders: this._defaultHeaders,
          });
  }

  get modelName(): string {
    return this._model;
  }

  get thinkingEffort(): ThinkingEffort | null {
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
      clientFactory: this._clientFactory,
    });
    return this._files;
  }

  uploadVideo(input: string | VideoUploadInput, options?: GenerateOptions) {
    return this.files.uploadVideo(input, options);
  }

  get modelParameters(): Record<string, unknown> {
    return {
      model: this._model,
      baseUrl: this._baseUrl,
      ...this._generationKwargs,
    };
  }

  getCapability(model?: string): ModelCapability {
    return getOpenAILegacyModelCapability(model ?? this._model);
  }

  async generate(
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
    if (
      kwargs['max_completion_tokens'] === undefined &&
      kwargs['max_tokens'] !== undefined
    ) {
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

    try {
      const client = this._createClient(options?.auth);
      const response = (await client.chat.completions.create(
        createParams as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
        options?.signal ? { signal: options.signal } : undefined,
      )) as unknown as OpenAI.Chat.ChatCompletion | AsyncIterable<OpenAI.Chat.ChatCompletionChunk>;
      return new OpenAICompletionsStreamedMessage(response, this._stream, this._reasoningKey);
    } catch (error: unknown) {
      throw convertOpenAIError(error);
    }
  }

  withThinking(effort: ThinkingEffort): OpenAICompletionsChatProvider {
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

  withGenerationKwargs(kwargs: GenerationKwargs): OpenAICompletionsChatProvider {
    return this._withGenerationKwargs(kwargs);
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

  private _createClient(auth: ProviderRequestAuth | undefined): OpenAI {
    return resolveAuthBackedClient(
      { cachedClient: this._client, clientFactory: this._clientFactory },
      auth,
      (a) => {
        const defaultHeaders = mergeRequestHeaders(this._defaultHeaders, a?.headers);
        return new OpenAI({
          apiKey: requireProviderApiKey('OpenAICompletionsChatProvider', a, this._apiKey),
          baseURL: this._baseUrl,
          defaultHeaders,
        });
      },
    );
  }

  private _withGenerationKwargs(kwargs: GenerationKwargs): OpenAICompletionsChatProvider {
    const clone = this._clone();
    clone._generationKwargs = { ...clone._generationKwargs, ...kwargs };
    return clone;
  }

  private _clone(): OpenAICompletionsChatProvider {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(this) as object) as OpenAICompletionsChatProvider,
      this,
    );
    clone._generationKwargs = { ...this._generationKwargs };
    clone._files = undefined;
    return clone;
  }
}
