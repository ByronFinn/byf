export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface TextPart {
  type: 'text';
  text: string;
}

export interface ThinkPart {
  type: 'think';
  think: string;
  encrypted?: string; // Provider-specific reasoning signature
}

export interface ImageURLPart {
  type: 'image_url';
  imageUrl: { url: string; id?: string };
}

export interface AudioURLPart {
  type: 'audio_url';
  audioUrl: { url: string; id?: string };
}

export interface VideoURLPart {
  type: 'video_url';
  videoUrl: { url: string; id?: string };
}

/**
 * {@link Message} 中的单块内容。
 *
 * 该联合覆盖文本、模型推理("think")、图片、音频与视频。
 * provider 在 {@link ChatProvider.generate} 期间把它们转换为原生
 * 内容块格式。
 */
export type ContentPart = TextPart | ThinkPart | ImageURLPart | AudioURLPart | VideoURLPart;

/**
 * 附加到 {@link Message} 的缓存提示元数据。
 *
 * 缓存桩层用它标记哪些消息是良好的缓存断点候选(例如上一 turn 的最后
 * 一条消息)。Anthropic 适配器读取这些提示,在合适的内容块上注入
 * `cache_control`。
 */
export interface CacheHint {
  readonly isLastTurnEnd?: boolean;
  readonly isSuddenLargeContext?: boolean;
}

export interface ToolCall {
  type: 'function';
  id: string;
  name: string;
  arguments: string | null;
  extras?: Record<string, unknown>;
  /**
   * Provider-specific streaming index used to route argument deltas to the
   * correct parallel tool call. Set by streaming providers (OpenAI Chat
   * Completions `index`, Responses API `item_id`). Consumed internally by
   * {@link generate} and stripped before the ToolCall is stored on a Message.
   *
   * @internal
   */
  _streamIndex?: number | string;
}

/** 工具调用参数的流式 delta。 */
export interface ToolCallPart {
  type: 'tool_call_part';
  argumentsPart: string | null;
  /**
   * 用于把此流式 delta 路由到正确并行工具调用的 provider 特定索引。
   * OpenAI Chat Completions 用(`index`),Responses API 用
   * (`item_id`/`output_index`)。缺席时,delta 追加到最近看到的 ToolCall
   * (单工具调用回退)。
   */
  index?: number | string;
}

/**
 * {@link StreamedMessage} 异步迭代器产出的一块。
 *
 * 流式期间,generate 循环收到一串这样的 part,并原地合并兼容的连续 part
 * (如 TextPart + TextPart),使最终 {@link Message} 含完整组装的内容。
 *
 * 工具调用完成从合并边界(下一个不可合并的 part 会刷出待决工具调用)
 * 与流结束推断。provider 适配器负责把其原生「完成」信号翻译为此形态;
 * 它们不发出独立完成事件。
 */
export type StreamedMessagePart = ContentPart | ToolCall | ToolCallPart;

/**
 * 会话中的单条消息。
 *
 * 消息携带 {@link role}(system、user、assistant 或 tool)、一组
 * {@link ContentPart} 内容块与可选 {@link ToolCall} 条目。工具结果消息
 * 设置 {@link toolCallId} 以关联发起调用的来源。
 */
export interface Message {
  /** 消息发送者的角色。 */
  role: Role;
  /** 发送者的可选显示名(部分 provider 使用)。 */
  name?: string;
  /** 有序内容 part(文本、图片、思考等)。 */
  content: ContentPart[];
  /** 本消息中 assistant 请求的工具调用。 */
  toolCalls: ToolCall[];
  /** 对 `tool` 角色消息,此结果所应答的工具调用 ID。 */
  toolCallId?: string;
  /** 为 `true` 时,表示消息未完整接收(如流被中断)。 */
  partial?: boolean;
  /** 供提示缓存策略使用的缓存提示元数据。 */
  cacheHint?: CacheHint;
}

/** 检查流式 part 是否为 ContentPart(text、think、image_url、audio_url、video_url)。 */
export function isContentPart(part: StreamedMessagePart): part is ContentPart {
  const t = part.type;
  return (
    t === 'text' || t === 'think' || t === 'image_url' || t === 'audio_url' || t === 'video_url'
  );
}

/** 检查流式 part 是否为 ToolCall。 */
export function isToolCall(part: StreamedMessagePart): part is ToolCall {
  return part.type === 'function';
}

/** 检查流式 part 是否为 ToolCallPart(流式参数 delta)。 */
export function isToolCallPart(part: StreamedMessagePart): part is ToolCallPart {
  return part.type === 'tool_call_part';
}

/**
 * 为流式累积原地把 `source` 合并进 `target`。
 *
 * 支持的组合:
 * - TextPart + TextPart → 拼接文本
 * - ThinkPart + ThinkPart → 拼接思考(target.encrypted 已设置时拒绝)
 * - ToolCall + ToolCallPart → 追加参数
 *
 * **并行工具调用路由**:OpenAI(或兼容)API 并行流式多个工具调用时,
 * 参数 delta 可能跨调用交错。为处理此情况,{@link generate} 按其可选
 * {@link ToolCallPart.index} 字段(镜像 provider 的流式索引)把
 * ToolCallPart 路由到正确的待决 ToolCall,而非依赖顺序。待决 part 与
 * 传入 part 匹配时,本函数仍执行顺序合并作为回退。
 *
 * 执行了合并返回 `true`,否则返回 `false`。
 */
export function mergeInPlace(target: StreamedMessagePart, source: StreamedMessagePart): boolean {
  // TextPart + TextPart
  if (target.type === 'text' && source.type === 'text') {
    target.text += source.text;
    return true;
  }

  // ThinkPart + ThinkPart
  if (target.type === 'think' && source.type === 'think') {
    if (target.encrypted !== undefined) {
      return false;
    }
    target.think += source.think;
    if (source.encrypted !== undefined) {
      target.encrypted = source.encrypted;
    }
    return true;
  }

  // ToolCall + ToolCallPart
  if (target.type === 'function' && source.type === 'tool_call_part') {
    if (source.argumentsPart !== null) {
      target.arguments =
        target.arguments === null ? source.argumentsPart : target.arguments + source.argumentsPart;
    }
    return true;
  }

  return false;
}

/**
 * 提取消息内容 part 中拼接后的文本。
 *
 * @param message 要提取文本的消息。
 * @param sep 文本 part 之间的分隔符。默认为空字符串。
 */
export function extractText(message: Message, sep: string = ''): string {
  return message.content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.text)
    .join(sep);
}

/**
 * @deprecated Use `extractText` instead.
 */
export function getTextContent(message: Message): string {
  return extractText(message);
}

/** 创建带单个文本 part 的简单用户消息。 */
export function createUserMessage(content: string): Message {
  return {
    role: 'user',
    content: [{ type: 'text', text: content }],
    toolCalls: [],
  };
}

/** 由内容 part 与可选工具调用创建 assistant 消息。 */
export function createAssistantMessage(content: ContentPart[], toolCalls?: ToolCall[]): Message {
  return {
    role: 'assistant',
    content,
    toolCalls: toolCalls ?? [],
  };
}

/** 创建工具结果消息。 */
export function createToolMessage(toolCallId: string, output: string | ContentPart[]): Message {
  const content: ContentPart[] =
    typeof output === 'string' ? [{ type: 'text', text: output }] : output;
  return {
    role: 'tool',
    content,
    toolCalls: [],
    toolCallId,
  };
}
