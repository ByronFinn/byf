/**
 * Cache scope for a {@link PromptBlock} in a {@link PromptPlan}.
 *
 * Scopes determine the lifetime and sharing boundaries of cached prompt
 * content, allowing providers to apply cache-breaking policies appropriately.
 *
 * - `'global'`: Content is cacheable across all projects/sessions. Useful for
 *   stable system prompts that rarely change.
 * - `'project'`: Content is cacheable within a single project. Typical for
 *   project-specific instructions, domain knowledge, or coding standards.
 * - `'session'`: Content is cacheable only within the current session.
 *   Appropriate for conversation context that persists across turns but not
 *   across sessions.
 * - `'none'`: Content is not cacheable. Use for ephemeral or highly dynamic
 *   content (user input, temporary context, rapidly changing data).
 */
export type CacheScope = 'global' | 'project' | 'session' | 'none';

/**
 * Cache strategy supported by a provider.
 *
 * Each provider advertises which caching mechanism it implements via
 * {@link ProviderCacheCapability.strategy}. Consumers must respect this
 * when constructing {@link PromptPlan}s to avoid sending unsupported
 * cache directives.
 *
 * - `'explicit-block'`: Provider supports explicit cache control at the
 *   block level (e.g., Anthropic's `cache_control` headers). Each
 *   {@link PromptBlock} can be independently marked as cacheable.
 * - `'prompt-cache-key'`: Provider supports a cache key that spans the
 *   entire prompt (OpenAI's `prompt_cache_key` approach).
 * - `'prefix-match'`: Provider caches by matching prompt prefixes
 *   (OpenAI's automatic prefix caching for repeated prefixes).
 *   Reserved for future use — no provider currently declares this strategy.
 * - `'none'`: Provider does not support prompt caching.
 */
export type CacheStrategy = 'explicit-block' | 'prompt-cache-key' | 'prefix-match' | 'none';

/**
 * A single named block of text with an associated cache scope.
 *
 * {@link PromptPlan}s are composed of multiple blocks, each with its own
 * caching semantics. This structure allows providers to apply different
 * cache policies to different parts of the system prompt (e.g., global
 * instructions vs. session-specific context).
 *
 * @readonly
 */
export interface PromptBlock {
  /**
   * Identifier for this block.
   *
   * Used for debugging, logging, and potentially for cache key generation.
   * Should be stable and descriptive (e.g., `'system-instructions'`,
   * `'project-context'`).
   */
  readonly name: string;

  /**
   * Text content of this block.
   *
   * The actual prompt text that will be sent to the LLM. Blocks are
   * typically concatenated in order when constructing the full system
   * prompt.
   */
  readonly text: string;

  /**
   * Cache scope for this block.
   *
   * Determines how providers may cache this content. See {@link CacheScope}
   * for details on each scope's semantics.
   */
  readonly cacheScope: CacheScope;
}

/**
 * A structured prompt plan that defines cacheable blocks.
 *
 * PromptPlans allow consumers to provide explicit caching hints alongside
 * their prompt content. When passed via {@link GenerateOptions.promptPlan},
 * providers that support caching can translate the plan into their native
 * cache control format.
 *
 * Example usage:
 * ```ts
 * const plan: PromptPlan = {
 *   blocks: [
 *     { name: 'system', text: 'You are a helpful assistant.', cacheScope: 'global' },
 *     { name: 'project', text: 'Project-specific rules...', cacheScope: 'project' },
 *     { name: 'context', text: 'Current session context...', cacheScope: 'session' },
 *     { name: 'user-query', text: 'Answer this question...', cacheScope: 'none' },
 *   ],
 * };
 * ```
 *
 * @readonly
 */
export interface PromptPlan {
  /**
   * Ordered list of blocks that compose this prompt plan.
   *
   * Blocks are typically concatenated in order when constructing the full
   * system prompt. Each block's `cacheScope` determines its caching
   * semantics.
   */
  readonly blocks: readonly PromptBlock[];
}
