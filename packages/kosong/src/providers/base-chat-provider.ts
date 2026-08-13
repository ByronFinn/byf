/**
 * 四个 ChatProvider 适配器共享的抽象基类。
 *
 * 持有此前在 `anthropic.ts`、`openai-responses.ts`、`google-genai.ts` 与
 * `openai-completions.ts` 间复制粘贴的 SDK 无关样板(`_clone`、
 * `withGenerationKwargs`、访问器三件套、`_createClient` 外壳)。协议特定
 * 逻辑(`generate`、消息映射、流式解析、缓存控制注入)留在子类。
 *
 * 理由见 ADR 0015。
 */

import type { ModelCapability } from '#/capability';
import type { Message } from '#/message';
import type {
  ChatProvider,
  GenerateOptions,
  ProviderRequestAuth,
  StreamedMessage,
  ThinkingEffort,
} from '#/provider';
import {
  mergeRequestHeaders,
  requireProviderApiKey,
  resolveAuthBackedClient,
} from '#/providers/request-auth';
import type { Tool } from '#/tool';

/**
 * 每 provider 的生成关键字袋。每个子类把它约束到自己的接口
 * (如 `GenerationKwargs`、`AnthropicGenerationKwargs`)。
 * 索引签名是四个适配器共享的公共超类型。
 */
export type BaseGenerationKwargs = Record<string, unknown>;

/**
 * 交给 {@link BaseChatProvider.createRawClient} 的已解析认证。
 */
export interface ResolvedAuth {
  readonly apiKey: string;
  readonly headers: Record<string, string> | undefined;
}

/**
 * 实现 SDK 无关 ChatProvider 样板的抽象基类。
 *
 * 子类必须实现:
 * - `generate(...)` — 流式 / 分发循环(协议特定)
 * - `createRawClient(auth, defaultHeaders)` — `new OpenAI(...)` /
 *   `new Anthropic(...)` 等
 * - `thinkingEffort` getter — 每 provider 的努力映射
 * - `getCapability(model?)` — 每 provider 的能力注册表查找
 * - `withThinking(effort)` — 每 provider 的思考配置
 *
 * 子类继承:`_clone`、`withGenerationKwargs`、`modelName`、
 * `modelParameters` 与 `_createClient` 外壳。
 */
export abstract class BaseChatProvider<
  TKwargs extends BaseGenerationKwargs,
> implements ChatProvider {
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
    const clone = Object.assign(Object.create(Object.getPrototypeOf(this) as object) as this, this);
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
