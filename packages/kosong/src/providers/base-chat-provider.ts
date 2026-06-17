/**
 * Shared abstract base for the four ChatProvider adapters.
 *
 * Holds the SDK-agnostic boilerplate (`_clone`, `withGenerationKwargs`, the
 * accessor trio, the `_createClient` shell) that was previously copy-pasted
 * across `anthropic.ts`, `openai-responses.ts`, `google-genai.ts`, and
 * `openai-completions.ts`. Protocol-specific logic (`generate`, message
 * mapping, streaming parsing, cache-control injection) stays in subclasses.
 *
 * See ADR 0015 for the rationale.
 */

import type { ChatProvider, GenerateOptions, ThinkingEffort } from '#/provider';
import type { Message } from '#/message';
import type { ModelCapability } from '#/capability';
import type { Tool } from '#/tool';
import type { StreamedMessage } from '#/provider';
import type { ProviderRequestAuth } from '#/provider';
import {
  mergeRequestHeaders,
  requireProviderApiKey,
  resolveAuthBackedClient,
} from '#/providers/request-auth';

/**
 * Per-provider generation-keyword bag. Each subclass constrains this to its
 * own interface (e.g. `GenerationKwargs`, `AnthropicGenerationKwargs`).
 * The index signature is the common supertype all four share.
 */
export type BaseGenerationKwargs = Record<string, unknown>;

/**
 * Resolved auth handed to {@link BaseChatProvider.createRawClient}.
 */
export interface ResolvedAuth {
  readonly apiKey: string;
  readonly headers: Record<string, string> | undefined;
}

/**
 * Abstract base implementing the SDK-agnostic ChatProvider boilerplate.
 *
 * Subclasses must implement:
 * - `generate(...)` — the streaming/dispatch loop (protocol-specific)
 * - `createRawClient(auth, defaultHeaders)` — `new OpenAI(...)` / `new Anthropic(...)` / etc.
 * - `thinkingEffort` getter — per-provider effort mapping
 * - `getCapability(model?)` — per-provider capability registry lookup
 * - `withThinking(effort)` — per-provider thinking configuration
 *
 * Subclasses inherit: `_clone`, `withGenerationKwargs`, `modelName`,
 * `modelParameters`, and the `_createClient` shell.
 */
export abstract class BaseChatProvider<TKwargs extends BaseGenerationKwargs>
  implements ChatProvider
{
  /** Provider name; subclasses set via constructor. */
  abstract readonly name: string;

  protected constructor(
    protected readonly _model: string,
    protected _generationKwargs: TKwargs,
    protected readonly _apiKey: string | undefined = undefined,
    protected readonly _baseUrl: string = '',
    protected readonly _defaultHeaders: Record<string, string> | undefined = undefined,
    protected _client: unknown = undefined,
    protected readonly _clientFactory:
      | ((auth: ProviderRequestAuth) => unknown)
      | undefined = undefined,
  ) {}

  get modelName(): string {
    return this._model;
  }

  get modelParameters(): Record<string, unknown> {
    return { model: this._model, ...this._generationKwargs };
  }

  abstract get thinkingEffort(): ThinkingEffort | null;

  abstract getCapability(model?: string): ModelCapability;

  abstract generate(
    systemPrompt: string,
    tools: Tool[],
    history: Message[],
    options?: GenerateOptions,
  ): Promise<StreamedMessage>;

  abstract withThinking(effort: ThinkingEffort): ChatProvider;

  /**
   * Return a shallow copy of this provider with `kwargs` merged into the
   * generation-keyword bag. The clone shares transport state (client) with
   * the original; only `_generationKwargs` is deep-copied.
   */
  withGenerationKwargs(kwargs: TKwargs): this {
    const clone = this._clone();
    clone._generationKwargs = { ...clone._generationKwargs, ...kwargs };
    return clone;
  }

  /**
   * Shallow clone preserving prototype and instance state, with a fresh
   * `_generationKwargs` copy. Subclasses with extra clone-time cleanup
   * (e.g. resetting a lazy `_files` cache) override and call `super._clone()`
   * then apply their cleanup.
   */
  protected _clone(): this {
    const clone = Object.assign(
      Object.create(Object.getPrototypeOf(this) as object) as this,
      this,
    );
    clone._generationKwargs = { ...this._generationKwargs };
    return clone;
  }

  /**
   * Resolve the SDK client for the current request, using cached/client-factory
   * auth resolution. Delegates the actual SDK construction to
   * {@link createRawClient}. The provider name passed to `requireProviderApiKey`
   * is the subclass's `name`.
   */
  protected _createClient(auth: ProviderRequestAuth | undefined): unknown {
    return resolveAuthBackedClient(
      {
        cachedClient: this._client,
        clientFactory: this._clientFactory,
      },
      auth,
      (a) => {
        const defaultHeaders = mergeRequestHeaders(this._defaultHeaders, a?.headers);
        return this.createRawClient(
          {
            apiKey: requireProviderApiKey(this.name, a, this._apiKey),
            headers: defaultHeaders,
          },
          defaultHeaders,
        );
      },
    );
  }

  /**
   * Construct the provider-specific SDK client. Implemented by each subclass
   * (e.g. `new OpenAI({...})`, `new Anthropic({...})`, `new GoogleGenAI({...})`).
   */
  protected abstract createRawClient(
    auth: ResolvedAuth,
    defaultHeaders: Record<string, string> | undefined,
  ): unknown;
}
