import type { CacheScope, CacheStrategy } from './prompt-plan';

/**
 * provider 声明的缓存能力。
 *
 * 支持提示缓存的 provider 经 {@link ModelCapability.cache} 暴露它,描述
 * 其实现的缓存机制与消费者必须尊重的约束。
 *
 * @readonly
 */
export interface ProviderCacheCapability {
  /**
   * 此 provider 支持的缓存策略。
   *
   * 策略描述与语义见 {@link CacheStrategy}。
   */
  readonly strategy: CacheStrategy;

  /**
   * 支持的最大可缓存块数。
   *
   * 仅对 `'explicit-block'` 策略适用。provider 可能限制其支持的缓存点
   * 数量(如 Anthropic 最多支持 4 个缓存断点)。省略表示「未知」或
   * 「无实际限制」。
   */
  readonly maxCacheableBlocks?: number;

  /**
   * 此 provider 支持的缓存作用域。
   *
   * provider 可能不支持全部作用域(如某些不支持 `'global'` 作用域)。
   * 省略时,消费者应假定所有作用域都受支持。
   */
  readonly supportedScopes?: readonly CacheScope[];
}

/**
 * {@link ChatProvider} 暴露的特定模型声明能力。
 *
 * provider 从 {@link ChatProvider.getCapability} 返回其中之一,使调用方可
 * 针对模型不接受的模态门控请求,而无需分发请求并眼看它在上游失败。
 *
 * `max_context_tokens: 0` 表示「未知」;不按上下文长度门控的调用方可
 * 忽略该字段。
 */
export interface ModelCapability {
  readonly image_in: boolean;
  readonly video_in: boolean;
  readonly audio_in: boolean;
  readonly thinking: boolean;
  readonly tool_use: boolean;
  readonly thinking_effort: boolean;
  readonly thinking_xhigh: boolean;
  readonly thinking_max: boolean;
  readonly max_context_tokens: number;
  /**
   * 此模型的缓存能力。
   *
   * provider 支持提示缓存时存在。消费者可检查此字段确定哪些缓存策略
   * 与作用域可用,然后构造合适的 {@link PromptPlan}。
   */
  readonly cache?: ProviderCacheCapability;
}

const UNKNOWN_CAPABILITY_MARKER = Symbol.for('byf.kosong.UNKNOWN_CAPABILITY');

/**
 * provider 未编目给定模型时返回的共享只读默认值。已冻结,使一个调用点
 * 的意外变更不会泄漏到另一调用点。
 */
export const UNKNOWN_CAPABILITY: ModelCapability = Object.freeze(
  Object.defineProperty(
    {
      image_in: false,
      video_in: false,
      audio_in: false,
      thinking: false,
      tool_use: false,
      thinking_effort: false,
      thinking_xhigh: false,
      thinking_max: false,
      max_context_tokens: 0,
    },
    UNKNOWN_CAPABILITY_MARKER,
    { value: true },
  ),
);

export function isUnknownCapability(capability: ModelCapability): boolean {
  if (capability === UNKNOWN_CAPABILITY) return true;
  const marked =
    (capability as unknown as Record<PropertyKey, unknown>)[UNKNOWN_CAPABILITY_MARKER] === true;
  if (marked) return true;
  return (
    !capability.image_in &&
    !capability.video_in &&
    !capability.audio_in &&
    !capability.thinking &&
    !capability.tool_use &&
    !capability.thinking_effort &&
    !capability.thinking_xhigh &&
    !capability.thinking_max &&
    capability.max_context_tokens === 0
  );
}
