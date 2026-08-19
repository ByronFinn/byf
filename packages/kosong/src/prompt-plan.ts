/**
 * {@link PromptPlan} 中 {@link PromptBlock} 的缓存作用域。
 *
 * 作用域决定缓存提示内容的生命周期与共享边界,使 provider 能恰当地应用
 * 缓存破坏策略。
 *
 * - `'global'`:内容可跨所有项目 / 会话缓存。适用于很少变化的稳定系统提示。
 * - `'project'`:内容可在单个项目内缓存。典型用于项目特定指令、领域知识
 *   或编码规范。
 * - `'session'`:内容仅在当前会话内可缓存。适用于跨 turn 持续但不跨会话
 *   的对话上下文。
 * - `'none'`:内容不可缓存。用于瞬时或高度动态的内容(用户输入、临时
 *   上下文、快速变化的数据)。
 */
export type CacheScope = 'global' | 'project' | 'session' | 'none';

/**
 * provider 支持的缓存策略。
 *
 * 每个 provider 经 {@link ProviderCacheCapability.strategy} 声明其实现的
 * 缓存机制。消费者构造 {@link PromptPlan} 时必须尊重它,避免发送不支持的
 * 缓存指令。
 *
 * - `'explicit-block'`:provider 支持块级显式缓存控制(如 Anthropic 的
 *   `cache_control` 头)。每个 {@link PromptBlock} 可独立标记为可缓存。
 * - `'prompt-cache-key'`:provider 支持横跨整个提示词的缓存键
 *   (OpenAI 的 `prompt_cache_key` 方式)。
 * - `'prefix-match'`:provider 通过匹配提示前缀缓存(OpenAI 对重复前缀的
 *   自动前缀缓存)。保留供未来使用——目前没有 provider 声明此策略。
 * - `'none'`:provider 不支持提示缓存。
 */
export type CacheStrategy = 'explicit-block' | 'prompt-cache-key' | 'prefix-match' | 'none';

/**
 * 单个带名称的文本块及关联缓存作用域。
 *
 * {@link PromptPlan} 由多个块组成,每块有自己的缓存语义。该结构使
 * provider 能对系统提示词的不同部分应用不同缓存策略(如全局指令 vs
 * 会话特定上下文)。
 *
 * @readonly
 */
export interface PromptBlock {
  /**
   * 此块的标识符。
   *
   * 用于调试、日志,并可能用于缓存键生成。应稳定且具描述性
   * (如 `'system-instructions'`、`'project-context'`)。
   */
  readonly name: string;

  /**
   * 此块的文本内容。
   *
   * 将发送给 LLM 的实际提示文本。构造完整系统提示词时,块通常按顺序
   * 拼接。
   */
  readonly text: string;

  /**
   * 此块的缓存作用域。
   *
   * 决定 provider 可如何缓存此内容。各作用域语义见 {@link CacheScope}。
   */
  readonly cacheScope: CacheScope;
}

/**
 * 定义可缓存块的结构化提示计划。
 *
 * PromptPlan 使消费者能在提示内容旁提供显式缓存提示。经
 * {@link GenerateOptions.promptPlan} 传入时,支持缓存的 provider 可把
 * 计划转换为原生缓存控制格式。
 *
 * 用法示例:
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
   * 组成此提示计划的有序块列表。
   *
   * 构造完整系统提示词时,块通常按顺序拼接。每块的 `cacheScope` 决定
   * 其缓存语义。
   */
  readonly blocks: readonly PromptBlock[];
}
