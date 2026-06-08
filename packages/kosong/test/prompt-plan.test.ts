import { describe, expectTypeOf, it } from 'vitest';

import type { CacheScope, CacheStrategy, PromptBlock, PromptPlan } from '#/prompt-plan';
import type { GenerateOptions } from '#/provider';
import type { ModelCapability, ProviderCacheCapability } from '#/capability';

describe('PromptPlan types', () => {
  describe('CacheScope', () => {
    it('accepts "global" scope', () => {
      const scope: CacheScope = 'global';
      expectTypeOf(scope).toEqualTypeOf<'global'>();
    });

    it('accepts "project" scope', () => {
      const scope: CacheScope = 'project';
      expectTypeOf(scope).toEqualTypeOf<'project'>();
    });

    it('accepts "session" scope', () => {
      const scope: CacheScope = 'session';
      expectTypeOf(scope).toEqualTypeOf<'session'>();
    });

    it('accepts "none" scope', () => {
      const scope: CacheScope = 'none';
      expectTypeOf(scope).toEqualTypeOf<'none'>();
    });

    it('is a union of four literal types', () => {
      expectTypeOf<CacheScope>().toEqualTypeOf<'global' | 'project' | 'session' | 'none'>();
    });
  });

  describe('CacheStrategy', () => {
    it('accepts "explicit-block" strategy', () => {
      const strategy: CacheStrategy = 'explicit-block';
      expectTypeOf(strategy).toEqualTypeOf<'explicit-block'>();
    });

    it('accepts "prompt-cache-key" strategy', () => {
      const strategy: CacheStrategy = 'prompt-cache-key';
      expectTypeOf(strategy).toEqualTypeOf<'prompt-cache-key'>();
    });

    it('accepts "prefix-match" strategy', () => {
      const strategy: CacheStrategy = 'prefix-match';
      expectTypeOf(strategy).toEqualTypeOf<'prefix-match'>();
    });

    it('accepts "none" strategy', () => {
      const strategy: CacheStrategy = 'none';
      expectTypeOf(strategy).toEqualTypeOf<'none'>();
    });

    it('is a union of four literal types', () => {
      expectTypeOf<CacheStrategy>().toEqualTypeOf<'explicit-block' | 'prompt-cache-key' | 'prefix-match' | 'none'>();
    });
  });

  describe('PromptBlock', () => {
    it('has required name field of type string', () => {
      const block: PromptBlock = { name: 'instructions', text: 'You are helpful', cacheScope: 'global' };
      expectTypeOf(block.name).toEqualTypeOf<string>();
    });

    it('has required text field of type string', () => {
      const block: PromptBlock = { name: 'instructions', text: 'You are helpful', cacheScope: 'global' };
      expectTypeOf(block.text).toEqualTypeOf<string>();
    });

    it('has required cacheScope field of type CacheScope', () => {
      const block: PromptBlock = { name: 'instructions', text: 'You are helpful', cacheScope: 'global' };
      expectTypeOf(block.cacheScope).toEqualTypeOf<CacheScope>();
    });

    it('is readonly', () => {
      const block: PromptBlock = { name: 'instructions', text: 'You are helpful', cacheScope: 'global' };
      expectTypeOf(block).toMatchTypeOf<{ readonly name: string; readonly text: string; readonly cacheScope: CacheScope }>();
    });

    it('accepts all CacheScope values', () => {
      const globalBlock: PromptBlock = { name: 'a', text: 't', cacheScope: 'global' };
      const projectBlock: PromptBlock = { name: 'b', text: 't', cacheScope: 'project' };
      const sessionBlock: PromptBlock = { name: 'c', text: 't', cacheScope: 'session' };
      const noneBlock: PromptBlock = { name: 'd', text: 't', cacheScope: 'none' };

      // If these compile, the types are assignable correctly
      const globalScope: CacheScope = globalBlock.cacheScope;
      const projectScope: CacheScope = projectBlock.cacheScope;
      const sessionScope: CacheScope = sessionBlock.cacheScope;
      const noneScope: CacheScope = noneBlock.cacheScope;

      expectTypeOf(globalScope).toBeString();
      expectTypeOf(projectScope).toBeString();
      expectTypeOf(sessionScope).toBeString();
      expectTypeOf(noneScope).toBeString();
    });
  });

  describe('PromptPlan', () => {
    it('has required blocks field of type PromptBlock[]', () => {
      const plan: PromptPlan = {
        blocks: [
          { name: 'system', text: 'You are helpful', cacheScope: 'global' },
          { name: 'context', text: 'Context here', cacheScope: 'session' },
        ],
      };
      expectTypeOf(plan.blocks).toEqualTypeOf<readonly PromptBlock[]>();
    });

    it('blocks array is readonly', () => {
      const plan: PromptPlan = {
        blocks: [{ name: 'system', text: 'You are helpful', cacheScope: 'global' }],
      };
      expectTypeOf(plan.blocks).toMatchTypeOf<readonly PromptBlock[]>();
    });

    it('can contain multiple blocks with different scopes', () => {
      const plan: PromptPlan = {
        blocks: [
          { name: 'global', text: 'Global instructions', cacheScope: 'global' },
          { name: 'project', text: 'Project context', cacheScope: 'project' },
          { name: 'session', text: 'Session data', cacheScope: 'session' },
          { name: 'ephemeral', text: 'Temporary data', cacheScope: 'none' },
        ],
      };
      // Verify we can access blocks - the fact this compiles proves the structure is correct
      expectTypeOf(plan.blocks).toEqualTypeOf<readonly PromptBlock[]>();
    });
  });
});

describe('ProviderCacheCapability', () => {
  it('has required strategy field of type CacheStrategy', () => {
    const capability: ProviderCacheCapability = { strategy: 'explicit-block' };
    expectTypeOf(capability.strategy).toEqualTypeOf<CacheStrategy>();
  });

  it('has optional maxCacheableBlocks field of type number', () => {
    const capability: ProviderCacheCapability = { strategy: 'explicit-block', maxCacheableBlocks: 4 };
    expectTypeOf(capability.maxCacheableBlocks).toEqualTypeOf<number | undefined>();
  });

  it('has optional supportedScopes field of type CacheScope array', () => {
    const capability: ProviderCacheCapability = {
      strategy: 'explicit-block',
      supportedScopes: ['global', 'project', 'session'],
    };
    expectTypeOf(capability.supportedScopes).toEqualTypeOf<readonly CacheScope[] | undefined>();
  });

  it('all fields are readonly', () => {
    const capability: ProviderCacheCapability = {
      strategy: 'explicit-block',
      maxCacheableBlocks: 4,
      supportedScopes: ['global', 'project'],
    };
    expectTypeOf(capability).toMatchTypeOf<{
      readonly strategy: CacheStrategy;
      readonly maxCacheableBlocks?: number;
      readonly supportedScopes?: readonly CacheScope[];
    }>();
  });

  it('can be constructed with only required fields', () => {
    const capability: ProviderCacheCapability = { strategy: 'none' };
    const strategy: CacheStrategy = capability.strategy;
    expectTypeOf(strategy).toBeString();
  });

  it('accepts all cache strategies', () => {
    const explicitBlock: ProviderCacheCapability = { strategy: 'explicit-block' };
    const promptCacheKey: ProviderCacheCapability = { strategy: 'prompt-cache-key' };
    const prefixMatch: ProviderCacheCapability = { strategy: 'prefix-match' };
    const none: ProviderCacheCapability = { strategy: 'none' };

    const s1: CacheStrategy = explicitBlock.strategy;
    const s2: CacheStrategy = promptCacheKey.strategy;
    const s3: CacheStrategy = prefixMatch.strategy;
    const s4: CacheStrategy = none.strategy;

    expectTypeOf(s1).toBeString();
    expectTypeOf(s2).toBeString();
    expectTypeOf(s3).toBeString();
    expectTypeOf(s4).toBeString();
  });
});

describe('ModelCapability cache extension', () => {
  it('has optional cache field of type ProviderCacheCapability', () => {
    const capability: ModelCapability = {
      image_in: false,
      video_in: false,
      audio_in: false,
      thinking: false,
      tool_use: false,
      thinking_effort: false,
      thinking_xhigh: false,
      thinking_max: false,
      max_context_tokens: 200000,
      cache: { strategy: 'explicit-block', maxCacheableBlocks: 4 },
    };
    expectTypeOf(capability.cache).toEqualTypeOf<ProviderCacheCapability | undefined>();
  });

  it('can be constructed without cache field', () => {
    const capability: ModelCapability = {
      image_in: false,
      video_in: false,
      audio_in: false,
      thinking: false,
      tool_use: false,
      thinking_effort: false,
      thinking_xhigh: false,
      thinking_max: false,
      max_context_tokens: 200000,
    };
    // cache field is optional and undefined when not provided
    const cacheValue: ProviderCacheCapability | undefined = capability.cache;
    expectTypeOf(cacheValue).toEqualTypeOf<ProviderCacheCapability | undefined>();
  });

  it('cache field is readonly when present', () => {
    const capability: ModelCapability = {
      image_in: false,
      video_in: false,
      audio_in: false,
      thinking: false,
      tool_use: false,
      thinking_effort: false,
      thinking_xhigh: false,
      thinking_max: false,
      max_context_tokens: 200000,
      cache: { strategy: 'explicit-block' },
    };
    expectTypeOf(capability).toMatchTypeOf<{ readonly cache?: ProviderCacheCapability }>();
  });
});

describe('GenerateOptions promptPlan extension', () => {
  it('has optional promptPlan field of type PromptPlan', () => {
    const options: GenerateOptions = {
      promptPlan: {
        blocks: [
          { name: 'system', text: 'You are helpful', cacheScope: 'global' },
          { name: 'context', text: 'Context', cacheScope: 'session' },
        ],
      },
    };
    expectTypeOf(options.promptPlan).toEqualTypeOf<PromptPlan | undefined>();
  });

  it('can be constructed without promptPlan field', () => {
    const options: GenerateOptions = {};
    const promptPlan: PromptPlan | undefined = options.promptPlan;
    expectTypeOf(promptPlan).toEqualTypeOf<PromptPlan | undefined>();
  });

  it('can coexist with other GenerateOptions fields', () => {
    const controller = new AbortController();
    const options: GenerateOptions = {
      signal: controller.signal,
      auth: { apiKey: 'test-key' },
      promptPlan: {
        blocks: [{ name: 'sys', text: 'text', cacheScope: 'global' }],
      },
    };
    expectTypeOf(options.signal).toEqualTypeOf<AbortSignal | undefined>();
    expectTypeOf(options.auth).toEqualTypeOf<{ apiKey?: string; headers?: Record<string, string> } | undefined>();
    expectTypeOf(options.promptPlan).toEqualTypeOf<PromptPlan | undefined>();
  });
});
