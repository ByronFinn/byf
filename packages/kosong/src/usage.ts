/**
 * 单次 LLM 生成的 token 用量细分。
 *
 * provider 把其原生用量计数器映射进这一通用形态,使调用方无需关心后端
 * 即可汇总成本。
 */
export interface TokenUsage {
  /** 既非缓存读也非缓存创建的输入 token。 */
  inputOther: number;
  /** 模型生成的输出(补全)token。 */
  output: number;
  /** 由 provider 提示缓存服务的输入 token。 */
  inputCacheRead: number;
  /** 写入 provider 提示缓存的输入 token。 */
  inputCacheCreation: number;
}

/**
 * 计算输入 token 总数(other + 缓存读 + 缓存创建)。
 */
export function inputTotal(usage: TokenUsage): number {
  return usage.inputOther + usage.inputCacheRead + usage.inputCacheCreation;
}

/**
 * 计算 token 总数(输入总数 + 输出)。
 */
export function grandTotal(usage: TokenUsage): number {
  return inputTotal(usage) + usage.output;
}

/**
 * 创建零值 TokenUsage。
 */
export function emptyUsage(): TokenUsage {
  return {
    inputOther: 0,
    output: 0,
    inputCacheRead: 0,
    inputCacheCreation: 0,
  };
}

/**
 * 求和两个 TokenUsage 值。
 */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputOther: a.inputOther + b.inputOther,
    output: a.output + b.output,
    inputCacheRead: a.inputCacheRead + b.inputCacheRead,
    inputCacheCreation: a.inputCacheCreation + b.inputCacheCreation,
  };
}

/**
 * 缓存命中率的带品牌类型,避免被误用为原始数字。
 */
export type CacheHitRate = number & { readonly __brand: unique symbol };

/**
 * 把缓存命中率计算为 0 到 1 之间的带品牌数字。
 *
 * 未处理任何输入 token(inputTotal === 0)时返回 `undefined`,
 * 使调用方能区分「无数据」与「零命中」。
 */
export function cacheHitRate(usage: TokenUsage): CacheHitRate | undefined {
  const total = inputTotal(usage);
  if (total === 0) return undefined;
  return (usage.inputCacheRead / total) as CacheHitRate;
}
