/**
 * 使用 `prompt_cache_key` 策略(OpenAI Chat Completions 与 Responses API)
 * 的 OpenAI 家族 provider 的共享缓存键派生。
 *
 * 只有 `cacheScope === 'global'` 的块被纳入哈希,因为 OpenAI 只缓存稳定
 * 的全局前缀。无任何可缓存内容(无计划、无块、或无全局作用域块)时函数
 * 返回 `undefined`;调用点决定是否发送键或回退到占位值。
 */

import { createHash } from 'node:crypto';

import type { PromptPlan } from '#/prompt-plan';

/**
 * 从 {@link PromptPlan} 的全局作用域块派生稳定的 SHA256 十六进制。
 *
 * @param promptPlan - 提示计划;未提供时为 `undefined`。
 * @returns 存在至少一个此类块时,拼接的全局作用域块文本的小写 SHA256
 *   十六进制;否则为 `undefined`。
 */
export function deriveCacheKeyFromPromptPlan(
  promptPlan: PromptPlan | undefined,
): string | undefined {
  if (!promptPlan || promptPlan.blocks.length === 0) return undefined;

  const cacheableTexts: string[] = [];
  for (const block of promptPlan.blocks) {
    if (block.cacheScope === 'global') {
      cacheableTexts.push(block.text);
    }
  }

  if (cacheableTexts.length === 0) return undefined;

  return createHash('sha256').update(cacheableTexts.join('')).digest('hex');
}
