import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { PromptBlock, PromptPlan } from '#/prompt-plan';
import { deriveCacheKeyFromPromptPlan } from '#/providers/prompt-cache-key';

function block(name: string, text: string, cacheScope: PromptBlock['cacheScope']): PromptBlock {
  return { name, text, cacheScope };
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

describe('deriveCacheKeyFromPromptPlan', () => {
  describe('returns undefined when nothing is cacheable', () => {
    it('returns undefined for an undefined plan', () => {
      expect(deriveCacheKeyFromPromptPlan(undefined)).toBeUndefined();
    });

    it('returns undefined for a plan with an empty blocks array', () => {
      const plan: PromptPlan = { blocks: [] };
      expect(deriveCacheKeyFromPromptPlan(plan)).toBeUndefined();
    });

    it('returns undefined when blocks exist but none are global-scope', () => {
      const plan: PromptPlan = {
        blocks: [
          block('project', 'project context', 'project'),
          block('session', 'session context', 'session'),
          block('ephemeral', 'temp data', 'none'),
        ],
      };
      expect(deriveCacheKeyFromPromptPlan(plan)).toBeUndefined();
    });
  });

  describe('returns the SHA256 hex when >=1 global-scope block exists', () => {
    it('hashes a single global-scope block', () => {
      const plan: PromptPlan = {
        blocks: [block('system', 'You are helpful', 'global')],
      };
      expect(deriveCacheKeyFromPromptPlan(plan)).toBe(sha256('You are helpful'));
    });

    it('concatenates only global-scope blocks, in order, ignoring other scopes', () => {
      const plan: PromptPlan = {
        blocks: [
          block('global-a', 'AAA', 'global'),
          block('project', 'ignored', 'project'),
          block('global-b', 'BBB', 'global'),
          block('session', 'ignored', 'session'),
          block('global-c', 'CCC', 'global'),
        ],
      };
      expect(deriveCacheKeyFromPromptPlan(plan)).toBe(sha256('AAABBBCCC'));
    });

    it('uses only the global-scope block when other-scoped blocks surround it', () => {
      const plan: PromptPlan = {
        blocks: [
          block('system', 'You are helpful', 'global'),
          block('context', 'Context here', 'session'),
        ],
      };
      expect(deriveCacheKeyFromPromptPlan(plan)).toBe(sha256('You are helpful'));
    });
  });

  describe('determinism and ordering', () => {
    it('is deterministic: the same blocks produce the same key', () => {
      const planA: PromptPlan = {
        blocks: [block('a', 'AAA', 'global'), block('b', 'BBB', 'global')],
      };
      const planB: PromptPlan = {
        blocks: [block('a', 'AAA', 'global'), block('b', 'BBB', 'global')],
      };
      expect(deriveCacheKeyFromPromptPlan(planA)).toBe(deriveCacheKeyFromPromptPlan(planB));
    });

    it('order matters: blocks in a different order produce a different key', () => {
      const planAB: PromptPlan = {
        blocks: [block('a', 'AAA', 'global'), block('b', 'BBB', 'global')],
      };
      const planBA: PromptPlan = {
        blocks: [block('b', 'BBB', 'global'), block('a', 'AAA', 'global')],
      };
      const keyAB = deriveCacheKeyFromPromptPlan(planAB);
      const keyBA = deriveCacheKeyFromPromptPlan(planBA);
      expect(keyAB).toBeDefined();
      expect(keyBA).toBeDefined();
      expect(keyAB).not.toBe(keyBA);
    });
  });
});
