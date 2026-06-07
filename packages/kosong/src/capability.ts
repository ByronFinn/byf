import type { CacheScope, CacheStrategy } from './prompt-plan';

/**
 * Cache capability advertised by a provider.
 *
 * Providers that support prompt caching expose this via
 * {@link ModelCapability.cache} to describe which caching mechanisms they
 * implement and any constraints consumers must respect.
 *
 * @readonly
 */
export interface ProviderCacheCapability {
  /**
   * The caching strategy supported by this provider.
   *
   * See {@link CacheStrategy} for strategy descriptions and semantics.
   */
  readonly strategy: CacheStrategy;

  /**
   * Maximum number of cacheable blocks supported.
   *
   * Only applicable for `'explicit-block'` strategy. Providers may limit
   * the number of distinct cache points they support (e.g., Anthropic
   * supports up to 4 cache breakpoints). Omitted means "unknown" or "no
   * practical limit."
   */
  readonly maxCacheableBlocks?: number;

  /**
   * Cache scopes supported by this provider.
   *
   * Providers may not support all scopes (e.g., some may not support
   * `'global'` scoping). When omitted, consumers should assume all scopes
   * are supported.
   */
  readonly supportedScopes?: readonly CacheScope[];
}

/**
 * Declared capabilities for a specific model exposed by a {@link ChatProvider}.
 *
 * Providers return one of these from {@link ChatProvider.getCapability} so
 * callers can gate requests against modalities the model does not accept
 * without dispatching the request and watching it fail upstream.
 *
 * `max_context_tokens: 0` means "unknown"; callers that do not gate on
 * context length can ignore the field.
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
   * Cache capability for this model.
   *
   * Present when the provider supports prompt caching. Consumers can inspect
   * this field to determine which caching strategies and scopes are
   * available, then construct appropriate {@link PromptPlan}s.
   */
  readonly cache?: ProviderCacheCapability;
}

const UNKNOWN_CAPABILITY_MARKER = Symbol.for('byf.kosong.UNKNOWN_CAPABILITY');

/**
 * Shared read-only default returned when a provider has not catalogued a
 * given model. Frozen so accidental mutation at one call site cannot leak
 * into another.
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
