/**
 * Shared cache-key derivation for OpenAI-family providers that use the
 * `prompt_cache_key` strategy (OpenAI Chat Completions and Responses APIs).
 *
 * Only blocks with `cacheScope === 'global'` are included in the hash, since
 * OpenAI only caches a stable global prefix. The function returns `undefined`
 * when there is nothing cacheable (no plan, no blocks, or no global-scope
 * blocks); call sites decide whether to send a key at all or fall back to a
 * dummy value.
 */

import { createHash } from 'node:crypto';

import type { PromptPlan } from '#/prompt-plan';

/**
 * Derive a stable SHA256 hex from the global-scope blocks of a
 * {@link PromptPlan}.
 *
 * @param promptPlan - The prompt plan, or `undefined` when none was supplied.
 * @returns The lowercase SHA256 hex of the concatenated global-scope block
 *   texts when at least one such block exists, otherwise `undefined`.
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
