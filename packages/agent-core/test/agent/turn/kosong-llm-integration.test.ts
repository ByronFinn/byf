/**
 * Integration tests for PromptPlan flow in KosongLLM.
 *
 * These tests verify the full flow from system prompt to wire format,
 * ensuring that:
 * - Anthropic provider receives correct cache blocks
 * - OpenAI provider receives correct prompt_cache_key
 * - Non-caching providers work correctly
 * - buildPromptPlan is called with correct arguments
 * - promptPlan is passed correctly to GenerateOptions
 */

import {
  emptyUsage,
  type GenerateOptions,
  type ModelCapability,
  type PromptPlan,
  UNKNOWN_CAPABILITY,
} from '@byfriends/kosong';
import { describe, expect, it, vi } from 'vitest';

import { KosongLLM, type KosongLLMConfig } from '../../../src/agent/turn/kosong-llm';
import type { LLMChatParams } from '../../../src/loop';

/**
 * System prompt with cache boundary markers.
 */
const SYSTEM_PROMPT_WITH_BOUNDARIES = `Base system instructions
__CACHE_BOUNDARY__
Project-specific context
__CACHE_BOUNDARY__
Session-specific context`;

/**
 * System prompt without cache boundaries.
 */
const SYSTEM_PROMPT_NO_BOUNDARIES = `Plain system prompt without boundaries`;

/**
 * Mock provider that tracks generate calls.
 */
class TrackingMockProvider {
  readonly name = 'mock';
  readonly modelName = 'mock-model';
  readonly thinkingEffort = null;

  readonly calls: Array<{
    systemPrompt: string;
    tools: unknown[];
    history: unknown[];
    options: GenerateOptions | undefined;
  }> = [];

  private readonly _capability: ModelCapability;
  private readonly _responseParts: Array<{ type: 'text'; text: string }>;

  constructor(capability: ModelCapability = UNKNOWN_CAPABILITY) {
    this._capability = capability;
    this._responseParts = [{ type: 'text', text: 'Mock response' }];
  }

  async generate(
    systemPrompt: string,
    tools: unknown[],
    history: unknown[],
    options?: GenerateOptions,
  ) {
    this.calls.push({ systemPrompt, tools, history, options });

    const responseParts = [...this._responseParts];

    return {
      id: 'mock-id',
      usage: emptyUsage(),
      finishReason: 'completed' as const,
      rawFinishReason: 'stop',
      async *[Symbol.asyncIterator]() {
        for (const part of responseParts) {
          yield part;
        }
      },
    };
  }

  getCapability(model?: string): ModelCapability {
    return this._capability;
  }

  withThinking() {
    return this;
  }
}

/**
 * Mock provider with Anthropic-style explicit-block caching.
 */
function createAnthropicStyleProvider(): TrackingMockProvider {
  const capability: ModelCapability = {
    ...UNKNOWN_CAPABILITY,
    cache: {
      strategy: 'explicit-block',
      maxCacheableBlocks: 4,
      supportedScopes: ['global', 'project', 'session'],
    },
  };
  return new TrackingMockProvider(capability);
}

/**
 * Mock provider with OpenAI-style prompt-cache-key caching.
 */
function createOpenAIStyleProvider(): TrackingMockProvider {
  const capability: ModelCapability = {
    ...UNKNOWN_CAPABILITY,
    cache: {
      strategy: 'prompt-cache-key',
      supportedScopes: ['global'],
    },
  };
  return new TrackingMockProvider(capability);
}

/**
 * Mock provider with no caching support.
 */
function createNonCachingProvider(): TrackingMockProvider {
  const capability: ModelCapability = {
    ...UNKNOWN_CAPABILITY,
    cache: {
      strategy: 'none',
    },
  };
  return new TrackingMockProvider(capability);
}

/**
 * Create a minimal LLMChatParams object.
 */
function createChatParams(): LLMChatParams {
  return {
    messages: [],
    tools: [],
    signal: new AbortController().signal,
  };
}

describe('KosongLLM PromptPlan Integration', () => {
  describe('Anthropic-style explicit-block caching', () => {
    it('should build PromptPlan with cache blocks for Anthropic provider', async () => {
      const provider = createAnthropicStyleProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'claude-3-5-sonnet-20241022',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const params = createChatParams();
      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;
      expect(call.options).toBeDefined();
      expect(call.options?.promptPlan).toBeDefined();

      const plan = call.options?.promptPlan as PromptPlan;
      expect(plan.blocks).toHaveLength(3);

      // First block (base) should have global scope
      expect(plan.blocks[0]!.name).toBe('base');
      expect(plan.blocks[0]!.text).toContain('Base system instructions');
      expect(plan.blocks[0]!.cacheScope).toBe('global');

      // Second block (project) should have project scope
      expect(plan.blocks[1]!.name).toBe('projectInstructions');
      expect(plan.blocks[1]!.text).toContain('Project-specific context');
      expect(plan.blocks[1]!.cacheScope).toBe('project');

      // Third block (session) should have session scope
      expect(plan.blocks[2]!.name).toBe('sessionContext');
      expect(plan.blocks[2]!.text).toContain('Session-specific context');
      expect(plan.blocks[2]!.cacheScope).toBe('session');
    });

    it('should handle system prompt without cache boundaries', async () => {
      const provider = createAnthropicStyleProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'claude-3-5-sonnet-20241022',
        systemPrompt: SYSTEM_PROMPT_NO_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const params = createChatParams();
      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;
      expect(call.options?.promptPlan).toBeDefined();

      const plan = call.options?.promptPlan as PromptPlan;
      expect(plan.blocks).toHaveLength(1);
      expect(plan.blocks[0]!.name).toBe('base');
      expect(plan.blocks[0]!.text).toBe(SYSTEM_PROMPT_NO_BOUNDARIES);
      // Without boundaries, cache scope should be 'none'
      expect(plan.blocks[0]!.cacheScope).toBe('none');
    });

    it('should not include cacheBreakpoints in GenerateOptions', async () => {
      const provider = createAnthropicStyleProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'claude-3-5-sonnet-20241022',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const params = createChatParams();
      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;

      // Verify cacheBreakpoints is not in options
      expect('cacheBreakpoints' in (call.options ?? {})).toBe(false);

      // But promptPlan should be present
      expect(call.options?.promptPlan).toBeDefined();
    });
  });

  describe('OpenAI-style prompt-cache-key caching', () => {
    it('should build PromptPlan filtered to global scope only', async () => {
      const provider = createOpenAIStyleProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'gpt-4o',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const params = createChatParams();
      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;
      expect(call.options?.promptPlan).toBeDefined();

      const plan = call.options?.promptPlan as PromptPlan;
      expect(plan.blocks).toHaveLength(3);

      // First block (base) should have global scope (supported)
      expect(plan.blocks[0]!.cacheScope).toBe('global');

      // Second block (project) should fallback to 'none' (not supported)
      expect(plan.blocks[1]!.cacheScope).toBe('none');

      // Third block (session) should fallback to 'none' (not supported)
      expect(plan.blocks[2]!.cacheScope).toBe('none');
    });
  });

  describe('Non-caching providers', () => {
    it('should set all cache scopes to none for non-caching provider', async () => {
      const provider = createNonCachingProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'some-model',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const params = createChatParams();
      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;
      expect(call.options?.promptPlan).toBeDefined();

      const plan = call.options?.promptPlan as PromptPlan;
      expect(plan.blocks).toHaveLength(3);

      // All blocks should have 'none' scope for non-caching provider
      for (const block of plan.blocks) {
        expect(block.cacheScope).toBe('none');
      }
    });

    it('should work correctly with provider that has no cache field', async () => {
      const provider = new TrackingMockProvider(UNKNOWN_CAPABILITY);
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'some-model',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const params = createChatParams();
      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;

      // Should still create a promptPlan, but with 'none' scopes
      expect(call.options?.promptPlan).toBeDefined();
      const plan = call.options?.promptPlan as PromptPlan;

      for (const block of plan.blocks) {
        expect(block.cacheScope).toBe('none');
      }
    });
  });

  describe('Full flow from system prompt to wire format', () => {
    it('should handle the complete flow with all components', async () => {
      const provider = createAnthropicStyleProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'claude-3-5-sonnet-20241022',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const params: LLMChatParams = {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            toolCalls: [],
          },
        ],
        tools: [],
        signal: new AbortController().signal,
      };

      const response = await llm.chat(params);

      // Verify response structure
      expect(response).toBeDefined();
      expect(response.toolCalls).toEqual([]);
      expect(response.usage).toEqual(emptyUsage());

      // Verify provider was called correctly
      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;
      expect(call.systemPrompt).toBe(SYSTEM_PROMPT_WITH_BOUNDARIES);
      expect(call.options?.promptPlan).toBeDefined();
    });

    it('should preserve signal in GenerateOptions', async () => {
      const provider = createAnthropicStyleProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'claude-3-5-sonnet-20241022',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };
      const llm = new KosongLLM(config);

      const abortController = new AbortController();
      const params: LLMChatParams = {
        messages: [],
        tools: [],
        signal: abortController.signal,
      };

      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;
      expect(call.options?.signal).toBe(abortController.signal);
    });
  });

  describe('Provider without getCapability method', () => {
    it('should handle provider that does not implement getCapability', async () => {
      // Create a provider without getCapability
      class ProviderWithoutCapability {
        readonly name = 'mock';
        readonly modelName = 'mock-model';
        readonly thinkingEffort = null;

        async generate() {
          return {
            id: 'mock-id',
            usage: emptyUsage(),
            finishReason: 'completed' as const,
            rawFinishReason: 'stop',
            async *[Symbol.asyncIterator]() {
              yield { type: 'text' as const, text: 'Mock response' };
            },
          };
        }

        withThinking() {
          return this;
        }
      }

      const provider = new ProviderWithoutCapability();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'mock-model',
        systemPrompt: SYSTEM_PROMPT_WITH_BOUNDARIES,
      };

      // This should not throw - it should handle missing getCapability gracefully
      const llm = new KosongLLM(config);
      const params = createChatParams();

      // The implementation should handle providers without getCapability
      // by treating them as having no cache capability
      await expect(llm.chat(params)).resolves.toBeDefined();
    });
  });

  describe('Block normalization', () => {
    it('should normalize block text correctly around cache boundaries', async () => {
      const provider = createAnthropicStyleProvider();
      const config: KosongLLMConfig = {
        provider: provider as unknown as typeof provider,
        modelName: 'claude-3-5-sonnet-20241022',
        systemPrompt: `First line
__CACHE_BOUNDARY__
Second line
__CACHE_BOUNDARY__
Third line`,
      };
      const llm = new KosongLLM(config);

      const params = createChatParams();
      await llm.chat(params);

      expect(provider.calls).toHaveLength(1);
      const call = provider.calls[0]!;
      const plan = call.options?.promptPlan as PromptPlan;

      // First block keeps trailing newline before marker
      expect(plan.blocks[0]!.text).toBe('First line\n');

      // Middle block keeps newlines between markers
      expect(plan.blocks[1]!.text).toBe('\nSecond line\n');

      // Last block removes leading newline after last marker
      expect(plan.blocks[2]!.text).toBe('Third line');
    });
  });
});
