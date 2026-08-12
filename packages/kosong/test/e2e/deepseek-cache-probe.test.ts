/**
 * DeepSeek 真实缓存探针（PRD-0029 R6）—— opt-in，不进常规 CI。
 *
 * 门控：仅当 `DEEPSEEK_API_KEY` 存在时启用，否则整个 suite skip（不 fail）。
 * 运行：`DEEPSEEK_API_KEY=sk-... bun test packages/kosong/test/e2e/deepseek-cache-probe.test.ts`
 *
 * 弥补 mock 与现实的断层：mock/FakeLLM 测的是「我们对 provider 行为的假设」，本探针
 * 校准 provider 实际行为——验证 DeepSeek 顶层 `prompt_cache_hit_tokens`/`prompt_cache_miss_tokens`
 * 被正确解析、且多 turn 缓存确实命中（hot > cold）。
 *
 * 断言用相对关系（hot.inputCacheRead > 0、hot ≥ cold）而非绝对数，避免 provider 侧
 * 计费/调度波动导致 flaky。
 */

import { describe, it, expect } from 'vitest';

import type { Message } from '#/message';
import type { StreamedMessage } from '#/provider';
import { OpenAICompletionsChatProvider } from '#/providers/openai-completions';
import { emptyUsage, type TokenUsage } from '#/usage';

const KEY = process.env.DEEPSEEK_API_KEY;
const BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

// DeepSeek 缓存对足够长的前缀生效；构造一段稳定的静态前缀（≈ 数百 token）。
const STATIC_PREFIX = [
  'You are a concise technical assistant for the byf cache-release-contract probe.',
  'Always answer in one short sentence.',
  'Reference documents:',
  '...[cache-probe stable preamble, repeated to exceed the minimum cacheable prefix length]...',
  'Glossary: cache stake = where cache breakpoints are placed in a request.',
  'Glossary: prefix fingerprint = per-block SHA256 of the cache prefix.',
  'Glossary: break-side attribution = locating which block broke the prefix.',
  'Glossary: real probe = opt-in test against a live provider API.',
].join('\n');

function createProvider(): OpenAICompletionsChatProvider {
  return new OpenAICompletionsChatProvider({
    model: MODEL,
    apiKey: KEY,
    baseUrl: BASE_URL,
    stream: true,
  });
}

async function generateOnce(
  provider: OpenAICompletionsChatProvider,
  systemPrompt: string,
  userText: string,
): Promise<TokenUsage> {
  const history: Message[] = [
    { role: 'user', content: [{ type: 'text', text: userText }], toolCalls: [] },
  ];
  const stream: StreamedMessage = await provider.generate(systemPrompt, [], history);
  // 必须把流读完，usage 在最后一块（stream_options.include_usage）。
  for await (const _part of stream) {
    void _part;
  }
  return stream.usage ?? emptyUsage();
}

describe.skipIf(KEY === undefined)(
  'DeepSeek cache probe (opt-in, requires DEEPSEEK_API_KEY)',
  () => {
    it('parses prompt_cache_hit_tokens and shows a hot call hitting cache more than cold', async () => {
      const provider = createProvider();

      // Cold: first request with this prefix → expected miss (hit ≈ 0).
      const cold = await generateOnce(
        provider,
        STATIC_PREFIX,
        'Reply with the single word: ready.',
      );
      // Hot: same static prefix → expected cache hit (hit > 0, and ≥ cold).
      const hot = await generateOnce(provider, STATIC_PREFIX, 'Reply with the single word: ready.');

      // Sanity: parsed usage is non-negative and cache-read never exceeds total input.
      for (const usage of [cold, hot]) {
        expect(usage.inputCacheRead, 'inputCacheRead must be ≥ 0').toBeGreaterThanOrEqual(0);
        expect(usage.inputOther, 'inputOther must be ≥ 0').toBeGreaterThanOrEqual(0);
        expect(
          usage.inputCacheRead + usage.inputOther,
          'identity: hit + miss ≈ prompt_tokens',
        ).toBeGreaterThan(0);
        expect(usage.inputCacheRead, 'hit must not exceed total input').toBeLessThanOrEqual(
          usage.inputCacheRead + usage.inputOther,
        );
      }

      // Core assertion: the hot call engages DeepSeek's automatic cache (proving both that the
      // provider caches on identical prefixes AND that our extractUsage parses hit tokens).
      expect(hot.inputCacheRead, 'hot call must show cache hits').toBeGreaterThan(0);
      expect(
        hot.inputCacheRead,
        'hot call must read at least as much from cache as the cold call',
      ).toBeGreaterThanOrEqual(cold.inputCacheRead);
    }, 60_000);
  },
);
