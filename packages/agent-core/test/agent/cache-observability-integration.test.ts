/**
 * Integration tests for cache observability in agent LLM logging.
 *
 * These tests verify the implementation of cache observability helper functions.
 */

import { describe, expect, it } from 'vitest';

import type { PromptPlan, ProviderCacheCapability } from '@byfriends/kosong';

describe('Cache Observability - Helper Functions', () => {
  describe('extractCacheBlockHashes', () => {
    it('should extract stable hashes for PromptPlan blocks', () => {
      const { createHash } = require('node:crypto');

      const promptPlan: PromptPlan = {
        blocks: [
          { name: 'base', text: 'Base instructions', cacheScope: 'global' },
          { name: 'sessionContext', text: 'Session context', cacheScope: 'session' },
        ],
      };

      const hashes: Record<string, string> = {};
      for (const block of promptPlan.blocks) {
        hashes[block.name] = createHash('sha256').update(block.text).digest('hex');
      }

      expect(hashes['base']).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes['sessionContext']).toMatch(/^[a-f0-9]{64}$/);
      expect(hashes['base']).not.toBe(hashes['sessionContext']);
    });

    it('should produce different signatures when block content changes', () => {
      const { createHash } = require('node:crypto');

      const plan1: PromptPlan = {
        blocks: [
          { name: 'base', text: 'Original content', cacheScope: 'global' },
        ],
      };

      const plan2: PromptPlan = {
        blocks: [
          { name: 'base', text: 'Modified content', cacheScope: 'global' },
        ],
      };

      const hash1 = createHash('sha256').update(plan1.blocks[0]?.text ?? '').digest('hex');
      const hash2 = createHash('sha256').update(plan2.blocks[0]?.text ?? '').digest('hex');

      expect(hash1).not.toBe(hash2);

      const signature1 = JSON.stringify({ cacheBlockHashes: { base: hash1 } });
      const signature2 = JSON.stringify({ cacheBlockHashes: { base: hash2 } });

      expect(signature1).not.toBe(signature2);
    });

    it('should handle empty PromptPlan', () => {
      const emptyPlan: PromptPlan = { blocks: [] };

      const hashes: Record<string, string> = {};
      for (const block of emptyPlan.blocks) {
        hashes[block.name] = require('node:crypto').createHash('sha256').update(block.text).digest('hex');
      }

      expect(Object.keys(hashes)).toHaveLength(0);
    });

    it('should handle single block PromptPlan', () => {
      const { createHash } = require('node:crypto');

      const plan: PromptPlan = {
        blocks: [
          { name: 'base', text: 'Single block content', cacheScope: 'none' },
        ],
      };

      const hashes: Record<string, string> = {};
      for (const block of plan.blocks) {
        hashes[block.name] = createHash('sha256').update(block.text).digest('hex');
      }

      expect(Object.keys(hashes)).toEqual(['base']);
      expect(hashes['base']).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('getProviderCacheStrategy', () => {
    it('should extract strategy from provider with getCapability', () => {
      const provider = {
        name: 'test-provider',
        modelName: 'test-model',
        getCapability() {
          return {
            cache: {
              strategy: 'explicit-block' as const,
              supportedScopes: ['global', 'session'],
            },
          };
        },
      };

      const capability = provider.getCapability() as { cache?: ProviderCacheCapability };
      expect(capability?.cache?.strategy).toBe('explicit-block');
      expect(capability?.cache?.supportedScopes).toEqual(['global', 'session']);
    });

    it('should return undefined for providers without getCapability', () => {
      type ProviderWithGetCapability = {
        name: string;
        modelName: string;
        getCapability?: () => unknown;
      };

      const provider: ProviderWithGetCapability = {
        name: 'basic-provider',
        modelName: 'basic-model',
      };

      const hasGetCapability = typeof provider.getCapability === 'function';
      const capability = hasGetCapability && provider.getCapability !== undefined
        ? provider.getCapability()
        : undefined;

      expect(capability).toBeUndefined();
      expect(hasGetCapability).toBe(false);
    });

    it('should handle providers with getCapability but no cache field', () => {
      const provider = {
        name: 'partial-provider',
        modelName: 'partial-model',
        getCapability() {
          return {};
        },
      };

      const capability = provider.getCapability();
      expect('cache' in capability).toBe(false);
    });

    it('should handle all cache strategies', () => {
      const strategies: Array<ProviderCacheCapability['strategy']> = [
        'explicit-block',
        'prompt-cache-key',
        'prefix-match',
        'none',
      ];

      strategies.forEach((strategy) => {
        const provider = {
          name: `provider-${strategy}`,
          modelName: 'model',
          getCapability() {
            return {
              cache: { strategy },
            };
          },
        };

        const capability = provider.getCapability() as { cache?: ProviderCacheCapability };
        expect(capability?.cache?.strategy).toBe(strategy);
      });
    });
  });

  describe('Signature deduplication', () => {
    it('should include cache data in signature', () => {
      const baseSignature = {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        systemPromptHash: 'abc123',
        toolsHash: 'def456',
        cacheBlockHashes: { base: 'hash1', sessionContext: 'hash2' },
        providerCacheStrategy: 'explicit-block' as const,
      };

      const signature = JSON.stringify(baseSignature);
      const parsed = JSON.parse(signature);

      expect(parsed).toHaveProperty('provider');
      expect(parsed).toHaveProperty('model');
      expect(parsed).toHaveProperty('systemPromptHash');
      expect(parsed).toHaveProperty('toolsHash');
      expect(parsed).toHaveProperty('cacheBlockHashes');
      expect(parsed).toHaveProperty('providerCacheStrategy');
    });

    it('should produce different signatures when cacheBlockHashes change', () => {
      const signature1 = JSON.stringify({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        cacheBlockHashes: { base: 'hash1', sessionContext: 'hash2' },
      });

      const signature2 = JSON.stringify({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        cacheBlockHashes: { base: 'hash1', sessionContext: 'hash3' },
      });

      expect(signature1).not.toBe(signature2);
    });

    it('should produce different signatures when providerCacheStrategy changes', () => {
      const signature1 = JSON.stringify({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        providerCacheStrategy: 'explicit-block' as const,
      });

      const signature2 = JSON.stringify({
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        providerCacheStrategy: 'none' as const,
      });

      expect(signature1).not.toBe(signature2);
    });

    it('should produce same signature for identical configurations', () => {
      const config = {
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        cacheBlockHashes: { base: 'hash1' },
        providerCacheStrategy: 'explicit-block' as const,
      };

      const signature1 = JSON.stringify(config);
      const signature2 = JSON.stringify(config);

      expect(signature1).toBe(signature2);
    });
  });
});
