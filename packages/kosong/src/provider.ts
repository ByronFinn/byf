import type { ModelCapability } from './capability';
import type { Message, StreamedMessagePart, VideoURLPart } from './message';
import type { PromptPlan } from './prompt-plan';
import type { Tool } from './tool';
import type { TokenUsage } from './usage';

/**
 * 跨 provider 使用的归一化思考努力级别。
 *
 * 高于 `high` 的值是 provider / 模型特定的,原生 API 无匹配级别时适配器
 * 可能钳制。OpenAI 把 `max` 映射到其 `xhigh` 上限;Byf 与 Gemini 把
 * `xhigh`/`max` 封顶为 `high`;Anthropic 仅对选定模型支持
 * `xhigh`/`max`,否则钳制为 `high`。
 */
export type ThinkingEffort = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/**
 * 指示生成为何停止的归一化 finish-reason 信号。
 *
 * 每个 provider 的原生停止值被映射为其中之一,未映射的原始字符串保留在
 * `rawFinishReason` 中作为逃生舱。`null` 表示 provider 未发出 finish_reason
 * (如流在最终事件前被切断)。
 *
 * - `'completed'`:正常完成(OpenAI `'stop'`、Anthropic `'end_turn'` /
 *   `'stop_sequence'`、Gemini `'STOP'`)。
 * - `'tool_calls'`:生成暂停,使调用方可分发工具调用并反馈其结果。
 *   注意 OpenAI Responses API 与 Google GenAI 在此报告 `'completed'`;
 *   只有 Chat Completions 风格 provider 与 Anthropic 呈现专用值。
 * - `'truncated'`:token 预算耗尽(OpenAI `'length'`、Anthropic
 *   `'max_tokens'`、Gemini `'MAX_TOKENS'`、Responses `'max_output_tokens'`)。
 * - `'filtered'`:内容过滤器或安全策略阻止了响应。
 * - `'paused'`:Anthropic 特有的 `'pause_turn'`。
 * - `'other'`:可识别的非 null 原因,但不属于上述类别。
 */
export type FinishReason =
  | 'completed'
  | 'tool_calls'
  | 'truncated'
  | 'filtered'
  | 'paused'
  | 'other';

/**
 * 单个 LLM 响应产生的消息 part 的异步可迭代流。
 *
 * 消费者用 `for await..of` 迭代流,接收 {@link StreamedMessagePart} 块。
 * 迭代完成后,{@link id}、{@link usage}、{@link finishReason} 与
 * {@link rawFinishReason} 属性反映 provider 报告的最终值。
 */
export interface StreamedMessage {
  [Symbol.asyncIterator](): AsyncIterator<StreamedMessagePart>;
  /** provider 分配的响应标识符;不可用时为 `null`。 */
  readonly id: string | null;
  /** token 用量统计,流完成后填充。 */
  readonly usage: TokenUsage | null;
  /**
   * 归一化 finish reason,流完成后填充。
   *
   * provider 未发出 finish_reason 时为 `null`(例如流在最终事件到达前
   * 被中断)。
   */
  readonly finishReason: FinishReason | null;
  /**
   * 原始 provider 特定 finish_reason 字符串,逐字保留,作为需要原始
   * wire 值的调用方的逃生舱。
   *
   * provider 未发出 finish_reason 时为 `null`。
   */
  readonly rawFinishReason: string | null;
}

/**
 * 可转发给单个 {@link ChatProvider.generate} 调用的选项。
 */
export interface ProviderRequestAuth {
  /** 为此次特定 provider 请求解析的 Bearer / API token。 */
  apiKey?: string;
  /** 请求作用域的头。覆盖构造函数级默认头。 */
  headers?: Record<string, string>;
}

export interface GenerateOptions {
  /**
   * 一个 {@link AbortSignal},中止时请求取消进行中的 generate 调用。
   * 接受 signal 的 provider 会把它转发给底层 HTTP 客户端;
   * {@link generate | generate()} 中的 generate 循环也会在流式 part
   * 之间检查 signal。
   */
  signal?: AbortSignal;
  /**
   * 请求作用域的 provider 认证。宿主应在每次请求 / 重试前立即解析它,
   * 使 provider 永不保留可变的凭据状态。
   */
  auth?: ProviderRequestAuth;
  /**
   * 带显式缓存作用域的结构化提示计划。
   *
   * 提供时,支持缓存的 provider 可将其转换为原生缓存控制格式。
   */
  promptPlan?: PromptPlan;
}

/**
 * 供要求上传文件引用(而非内联 data URL)的 provider 使用的内存视频字节。
 */
export interface VideoUploadInput {
  readonly data: Uint8Array;
  readonly mimeType: string;
  readonly filename?: string;
}

/**
 * LLM chat provider 的统一接口。
 *
 * 每个 provider 实现(Byf、OpenAI、Anthropic、Google GenAI 等)把通用
 * {@link Message} / {@link Tool} 类型转换为 provider 特定 wire 格式,
 * 流式返回 {@link StreamedMessage},并暴露诸如 {@link withThinking}
 * 的配置辅助。
 */
export interface ChatProvider {
  /** provider 后端的短标识符(如 `"byf"`、`"anthropic"`)。 */
  readonly name: string;
  /** 传给上游 API 的模型名(如 `"byf-v1-auto"`)。 */
  readonly modelName: string;
  /** 当前思考努力级别;未配置思考时为 `null`。 */
  readonly thinkingEffort: ThinkingEffort | null;
  /**
   * 把会话发送给 LLM,返回流式响应。
   *
   * @param systemPrompt - 前置到请求的系统级指令。
   * @param tools - 模型可调用的工具定义。
   * @param history - 会话历史(user、assistant、tool 消息)。
   * @param options - 可选每次调用设置,如 {@link AbortSignal}。
   */
  generate(
    systemPrompt: string,
    tools: Tool[],
    history: Message[],
    options?: GenerateOptions,
  ): Promise<StreamedMessage>;
  /** 返回带给定思考努力的此 provider 的浅拷贝。 */
  withThinking(effort: ThinkingEffort): ChatProvider;
  /**
   * 返回每次请求完成预算被钳制到 `maxCompletionTokens` 的此 provider
   * 浅拷贝。可选,因为并非每个后端都受益于客户端计算的上限。
   *
   * 实现**不得**变更或替换返回克隆上的内部 HTTP 客户端——克隆预期与
   * 原对象共享传输状态。理由见 `OpenAICompletionsChatProvider._clone()`。
   */
  withMaxCompletionTokens?(maxCompletionTokens: number): ChatProvider;
  /** 上传视频,返回可发送给此 provider 的内容 part。 */
  uploadVideo?(input: string | VideoUploadInput, options?: GenerateOptions): Promise<VideoURLPart>;
  /**
   * 返回 `model` 的声明能力(默认 `modelName`)。
   *
   * 未知 / 未编目的模型返回 {@link UNKNOWN_CAPABILITY} 而非抛出,使能力
   * 检查保持非致命,操作员可指向私有 / 自定义部署而不崩溃。
   *
   * 在接口上可选,使先于能力矩阵存在的测试 mock 仍可在不更动的情况下
   * 结构上满足 `ChatProvider`。按模态门控的调用方在 provider 未暴露它时
   * 应回退到 {@link UNKNOWN_CAPABILITY}。
   */
  getCapability?(model?: string): ModelCapability;
  getContextSizeLimit?(): number | undefined;
}
