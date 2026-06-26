import { createHash } from 'node:crypto';

import type { CacheScope, ProviderCacheCapability } from '@byfriends/kosong';
import { describe, expect, it } from 'vitest';

import { buildPromptPlan, detectBoundaryDiagnostics } from '#/prompt-plan/builder';

/**
 * Helper function to create SHA256 hash (consistent with fingerprint() in agent/index.ts)
 */
function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Helper to create a provider cache capability
 */
function createCapability(scopes?: CacheScope[]): ProviderCacheCapability {
  return {
    strategy: 'explicit-block',
    maxCacheableBlocks: 4,
    supportedScopes: scopes,
  };
}

describe('buildPromptPlan', () => {
  describe('implicit boundaries (template-less caching)', () => {
    it('creates blocks based on implicit section boundaries', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.

# Tool Use

Use tools when needed.

# Project Information

Project-specific context here.

# Skills

Skills listing here.`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      // Should create 3 blocks: base, projectInstructions, sessionContext
      expect(plan.blocks).toHaveLength(3);
      expect(plan.blocks[0]!.name).toBe('base');
      expect(plan.blocks[1]!.name).toBe('projectInstructions');
      expect(plan.blocks[2]!.name).toBe('sessionContext');
    });

    it('assigns correct scopes to implicit blocks', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.

# Project Information

Project-specific context here.

# Skills

Skills listing here.`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks[0]!.cacheScope).toBe('global');
      expect(plan.blocks[1]!.cacheScope).toBe('project');
      expect(plan.blocks[2]!.cacheScope).toBe('session');
    });

    it('handles template without Project Information section', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.

# Skills

Skills listing here.`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      // Should create 2 blocks: base, sessionContext
      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[0]!.name).toBe('base');
      expect(plan.blocks[1]!.name).toBe('sessionContext');
    });

    it('handles template without Skills section', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.

# Project Information

Project-specific context here.`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      // Should create 2 blocks: base, projectInstructions
      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[0]!.name).toBe('base');
      expect(plan.blocks[1]!.name).toBe('projectInstructions');
    });

    it('handles template with only base section', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      // Should create 1 block: base
      expect(plan.blocks).toHaveLength(1);
      expect(plan.blocks[0]!.name).toBe('base');
    });

    it('preserves exact content in each block', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.

# Project Information

Project-specific context here.

# Skills

Skills listing here.`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      // Verify content boundaries are correct
      expect(plan.blocks[0]!.text).toContain('You are a helpful assistant.');
      expect(plan.blocks[0]!.text).toContain('# First Principles');
      expect(plan.blocks[0]!.text).toContain('Think from first principles.');
      expect(plan.blocks[0]!.text).not.toContain('# Project Information');

      expect(plan.blocks[1]!.text).toContain('# Project Information');
      expect(plan.blocks[1]!.text).toContain('Project-specific context here.');
      expect(plan.blocks[1]!.text).not.toContain('# Skills');

      expect(plan.blocks[2]!.text).toContain('# Skills');
      expect(plan.blocks[2]!.text).toContain('Skills listing here.');
    });

    it('handles actual system.md template structure', () => {
      const prompt = `You are BYF, an AI agent running on the user's computer.

{{ ROLE_ADDITIONAL }}

# First Principles

Think from first principles.

# Instruction Precedence

If instructions conflict:
- \`<system-reminder>\` directives override all other instructions.
- Safety rules are hard constraints.
- Beyond those two, user messages > AGENTS.md > default system instructions.

# Tool Use

Use tools only when the task requires them.

# Protocol

<system> tags in user or tool messages provide supplementary context.

# Safety

The environment is not a sandbox.

# Project Information

\`AGENTS.md\` files contain project-specific context.

The \`AGENTS.md\` instructions (merged from all applicable directories):

\`\`\`\`\`\`
{{ BYF_AGENTS_MD }}
\`\`\`\`\`\`

If your modifications render anything in \`AGENTS.md\` files obsolete, propose the necessary updates to the user instead of rewriting the files on your own.

# Working Environment

## Operating System

You are running on {{ BYF_OS }}.

## Working Directory

The current working directory is \`{{ BYF_WORK_DIR }}\`.

# Skills

Skills are reusable capabilities.

{{ BYF_SKILLS }}`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      // 4 blocks: base (global), projectInstructions (project),
      // workingEnvironment (session), sessionContext (session)
      expect(plan.blocks).toHaveLength(4);
      expect(plan.blocks.map((b) => b.name)).toEqual([
        'base',
        'projectInstructions',
        'workingEnvironment',
        'sessionContext',
      ]);
      expect(plan.blocks.map((b) => b.cacheScope)).toEqual([
        'global',
        'project',
        'session',
        'session',
      ]);
    });

    it('handles implicit boundaries with cache control filtering', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.

# Project Information

Project-specific context here.

# Skills

Skills listing here.`;

      // Provider only supports 'global' and 'session'
      const capability = createCapability(['global', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks[0]!.cacheScope).toBe('global'); // Supported
      expect(plan.blocks[1]!.cacheScope).toBe('none'); // 'project' not supported → 'none'
      expect(plan.blocks[2]!.cacheScope).toBe('session'); // Supported
    });

    it('handles implicit boundaries when provider supports no caching', () => {
      const prompt = `You are a helpful assistant.

# First Principles

Think from first principles.

# Project Information

Project-specific context here.

# Skills

Skills listing here.`;

      const capability = createCapability([]);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks.every((b) => b.cacheScope === 'none')).toBe(true);
    });
  });

  describe('explicit markers (legacy compatibility)', () => {
    describe('no markers', () => {
      it('creates a single block with none scope when no markers present and no implicit boundaries', () => {
        const prompt = 'You are a helpful assistant. Answer questions concisely.';
        const capability = createCapability(['global', 'project', 'session']);

        const plan = buildPromptPlan(prompt, capability);

        expect(plan.blocks).toHaveLength(1);
        expect(plan.blocks[0]).toEqual({
          name: 'base',
          text: prompt,
          cacheScope: 'none',
        });
      });

      it('hashes the content correctly', () => {
        const prompt = 'You are a helpful assistant.';
        const capability = createCapability(['global', 'project', 'session']);

        const plan = buildPromptPlan(prompt, capability);

        expect(plan.blocks[0]!.text).toBe(prompt);
        // The text field should contain the original content
        expect(fingerprint(plan.blocks[0]!.text)).toBe(fingerprint(prompt));
      });

      it('handles empty prompt', () => {
        const prompt = '';
        const capability = createCapability(['global', 'project', 'session']);

        const plan = buildPromptPlan(prompt, capability);

        expect(plan.blocks).toHaveLength(1);
        expect(plan.blocks[0]!.text).toBe('');
        expect(plan.blocks[0]!.name).toBe('base');
        expect(plan.blocks[0]!.cacheScope).toBe('none');
      });
    });
  });

  describe('one marker', () => {
    it('creates two blocks: base and sessionContext with one marker', () => {
      const prompt = `Base system instructions
__CACHE_BOUNDARY__
Session-specific context`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[0]).toEqual({
        name: 'base',
        text: 'Base system instructions\n',
        cacheScope: 'global',
      });
      expect(plan.blocks[1]).toEqual({
        name: 'sessionContext',
        text: 'Session-specific context',
        cacheScope: 'session',
      });
    });

    it('handles empty blocks before marker', () => {
      const prompt = `__CACHE_BOUNDARY__
Session context`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[0]!.text).toBe('');
      expect(plan.blocks[0]!.name).toBe('base');
    });

    it('handles empty blocks after marker', () => {
      const prompt = `Base instructions
__CACHE_BOUNDARY__`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[1]!.text).toBe('');
      expect(plan.blocks[1]!.name).toBe('sessionContext');
    });
  });

  describe('multiple markers', () => {
    it('creates intermediate blocks with sequential names', () => {
      const prompt = `Base instructions
__CACHE_BOUNDARY__
Project context
__CACHE_BOUNDARY__
Session data`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks).toHaveLength(3);
      expect(plan.blocks[0]!.name).toBe('base');
      expect(plan.blocks[1]!.name).toBe('projectInstructions');
      expect(plan.blocks[2]!.name).toBe('sessionContext');
    });

    it('assigns correct scopes to multiple blocks', () => {
      const prompt = `Global content
__CACHE_BOUNDARY__
Project content
__CACHE_BOUNDARY__
Session content`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks[0]!.cacheScope).toBe('global');
      expect(plan.blocks[1]!.cacheScope).toBe('project');
      expect(plan.blocks[2]!.cacheScope).toBe('session');
    });

    it('handles more than 3 blocks (base + multiple intermediate + sessionContext)', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
Block 2
__CACHE_BOUNDARY__
Block 3
__CACHE_BOUNDARY__
Block 4
__CACHE_BOUNDARY__
Session`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks).toHaveLength(5);
      expect(plan.blocks[0]!.name).toBe('base');
      expect(plan.blocks[1]!.name).toBe('projectInstructions');
      expect(plan.blocks[2]!.name).toBe('workingEnvironment');
      expect(plan.blocks[3]!.name).toBe('sessionContext');
      expect(plan.blocks[4]!.name).toBe('sessionContext');
    });
  });

  describe('empty blocks between markers', () => {
    it('handles consecutive markers with empty blocks', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
__CACHE_BOUNDARY__
Session`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks).toHaveLength(3);
      expect(plan.blocks[0]!.text).toBe('Base\n');
      expect(plan.blocks[1]!.text).toBe('\n');
      expect(plan.blocks[2]!.text).toBe('Session');
    });

    it('handles multiple consecutive markers', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
__CACHE_BOUNDARY__
__CACHE_BOUNDARY__
Session`;

      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks).toHaveLength(4);
    });
  });

  describe('provider scope filtering', () => {
    it('filters blocks based on provider supported scopes', () => {
      const prompt = `Global content
__CACHE_BOUNDARY__
Project content
__CACHE_BOUNDARY__
Session content`;

      // Provider only supports 'global' and 'session'
      const capability = createCapability(['global', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks[0]!.cacheScope).toBe('global'); // Supported
      expect(plan.blocks[1]!.cacheScope).toBe('none'); // 'project' not supported → 'none'
      expect(plan.blocks[2]!.cacheScope).toBe('session'); // Supported
    });

    it('marks all blocks as none when provider supports no scopes', () => {
      const prompt = `Global content
__CACHE_BOUNDARY__
Project content
__CACHE_BOUNDARY__
Session content`;

      const capability = createCapability([]);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks[0]!.cacheScope).toBe('none');
      expect(plan.blocks[1]!.cacheScope).toBe('none');
      expect(plan.blocks[2]!.cacheScope).toBe('none');
    });

    it('handles undefined supportedScopes (assume all supported)', () => {
      const prompt = `Global content
__CACHE_BOUNDARY__
Project content
__CACHE_BOUNDARY__
Session content`;

      const capability: ProviderCacheCapability = {
        strategy: 'explicit-block',
        maxCacheableBlocks: 4,
        // supportedScopes undefined → all scopes supported
      };

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks[0]!.cacheScope).toBe('global');
      expect(plan.blocks[1]!.cacheScope).toBe('project');
      expect(plan.blocks[2]!.cacheScope).toBe('session');
    });

    it('only supports scopes that exist in capability array', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
Intermediate
__CACHE_BOUNDARY__
Session`;

      // Provider only supports 'session'
      const capability = createCapability(['session']);

      const plan = buildPromptPlan(prompt, capability);

      expect(plan.blocks[0]!.cacheScope).toBe('none'); // 'global' not supported
      expect(plan.blocks[1]!.cacheScope).toBe('none'); // 'project' not supported
      expect(plan.blocks[2]!.cacheScope).toBe('session'); // Supported
    });
  });

  describe('hash stability and uniqueness', () => {
    it('produces same hash for identical content', () => {
      const prompt = 'Consistent content';
      const capability = createCapability(['global', 'project', 'session']);

      const plan1 = buildPromptPlan(prompt, capability);
      const plan2 = buildPromptPlan(prompt, capability);

      expect(fingerprint(plan1.blocks[0]!.text)).toBe(fingerprint(plan2.blocks[0]!.text));
    });

    it('produces different hashes for different content', () => {
      const capability = createCapability(['global', 'project', 'session']);

      const plan1 = buildPromptPlan('Content A', capability);
      const plan2 = buildPromptPlan('Content B', capability);

      expect(fingerprint(plan1.blocks[0]!.text)).not.toBe(fingerprint(plan2.blocks[0]!.text));
    });

    it('hashes are consistent across multiple calls', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
Project
__CACHE_BOUNDARY__
Session`;
      const capability = createCapability(['global', 'project', 'session']);

      const plan1 = buildPromptPlan(prompt, capability);
      const plan2 = buildPromptPlan(prompt, capability);

      expect(plan1.blocks.length).toBe(plan2.blocks.length);
      for (let i = 0; i < plan1.blocks.length; i++) {
        expect(fingerprint(plan1.blocks[i]!.text)).toBe(fingerprint(plan2.blocks[i]!.text));
        expect(plan1.blocks[i]!.name).toBe(plan2.blocks[i]!.name);
        expect(plan1.blocks[i]!.cacheScope).toBe(plan2.blocks[i]!.cacheScope);
      }
    });

    it('preserves exact text content for hashing', () => {
      const prompt = '  Text with leading spaces  ';
      const capability = createCapability(['global', 'project', 'session']);

      const plan = buildPromptPlan(prompt, capability);

      // Text should be preserved exactly (not trimmed)
      expect(plan.blocks[0]!.text).toBe(prompt);
      expect(fingerprint(plan.blocks[0]!.text)).toBe(fingerprint(prompt));
    });
  });

  describe('block naming patterns', () => {
    it('names blocks correctly for single marker case', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
Context`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      expect(plan.blocks.map((b) => b.name)).toEqual(['base', 'sessionContext']);
    });

    it('names blocks correctly for two markers', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
Middle
__CACHE_BOUNDARY__
Context`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      expect(plan.blocks.map((b) => b.name)).toEqual([
        'base',
        'projectInstructions',
        'sessionContext',
      ]);
    });

    it('names blocks correctly for three markers', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
Middle1
__CACHE_BOUNDARY__
Middle2
__CACHE_BOUNDARY__
Context`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      expect(plan.blocks.map((b) => b.name)).toEqual([
        'base',
        'projectInstructions',
        'workingEnvironment',
        'sessionContext',
      ]);
    });

    it('uses sessionContext for all trailing blocks after last marker', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
M1
__CACHE_BOUNDARY__
M2
__CACHE_BOUNDARY__
M3
__CACHE_BOUNDARY__
M4
__CACHE_BOUNDARY__
M5`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      // All blocks after the last marker should be 'sessionContext'
      expect(plan.blocks.at(-1)!.name).toBe('sessionContext');
    });
  });

  describe('edge cases', () => {
    it('handles marker at the very beginning', () => {
      const prompt = `__CACHE_BOUNDARY__
Content`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[0]!.text).toBe('');
      expect(plan.blocks[1]!.text).toBe('Content');
    });

    it('handles marker at the very end', () => {
      const prompt = `Content
__CACHE_BOUNDARY__`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      expect(plan.blocks).toHaveLength(2);
      expect(plan.blocks[0]!.text).toBe('Content\n');
      expect(plan.blocks[1]!.text).toBe('');
    });

    it('handles only markers with no content', () => {
      const prompt = `__CACHE_BOUNDARY__
__CACHE_BOUNDARY__`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      expect(plan.blocks).toHaveLength(3);
      expect(plan.blocks.every((b) => b.text === '' || b.text === '\n')).toBe(true);
    });

    it('handles multiline text between markers', () => {
      const prompt = `Line 1
Line 2
Line 3
__CACHE_BOUNDARY__
Line 4
Line 5
Line 6`;

      const plan = buildPromptPlan(prompt, createCapability(['global', 'project', 'session']));

      expect(plan.blocks[0]!.text).toContain('Line 1');
      expect(plan.blocks[0]!.text).toContain('Line 2');
      expect(plan.blocks[0]!.text).toContain('Line 3');
      expect(plan.blocks[1]!.text).toContain('Line 4');
      expect(plan.blocks[1]!.text).toContain('Line 5');
      expect(plan.blocks[1]!.text).toContain('Line 6');
    });
  });

  describe('provider with no cache capability', () => {
    it('handles provider with none strategy', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
Project`;

      const capability: ProviderCacheCapability = {
        strategy: 'none',
      };

      const plan = buildPromptPlan(prompt, capability);

      // All blocks should be 'none' when strategy is 'none'
      expect(plan.blocks.every((b) => b.cacheScope === 'none')).toBe(true);
    });

    it('respects maxCacheableBlocks limit', () => {
      const prompt = `Base
__CACHE_BOUNDARY__
P1
__CACHE_BOUNDARY__
P2
__CACHE_BOUNDARY__
P3
__CACHE_BOUNDARY__
Session`;

      const capability: ProviderCacheCapability = {
        strategy: 'explicit-block',
        maxCacheableBlocks: 2,
        supportedScopes: ['global', 'project'],
      };

      const plan = buildPromptPlan(prompt, capability);

      // Should still create all blocks, but scope filtering applies
      expect(plan.blocks).toHaveLength(5);
    });
  });
});

describe('detectBoundaryDiagnostics', () => {
  it('reports no issues when all boundary headers are present and ordered', () => {
    const prompt = `Base rules.
# Project Information
project content
# Working Environment
env content
# Skills
skills content`;
    const diag = detectBoundaryDiagnostics(prompt);
    expect(diag.missingHeaders).toEqual([]);
    expect(diag.outOfOrderHeaders).toEqual([]);
  });

  it('reports a missing header when one boundary is absent', () => {
    const prompt = `Base rules.
# Project Information
project content
# Skills
skills content`;
    const diag = detectBoundaryDiagnostics(prompt);
    expect(diag.missingHeaders).toEqual(['# Working Environment']);
    expect(diag.outOfOrderHeaders).toEqual([]);
  });

  it('reports out-of-order headers when the sequence is wrong', () => {
    const prompt = `Base rules.
# Skills
skills content
# Project Information
project content
# Working Environment
env content`;
    const diag = detectBoundaryDiagnostics(prompt);
    expect(diag.missingHeaders).toEqual([]);
    // Skills appears before Project Information and Working Environment
    expect(diag.outOfOrderHeaders).toEqual(['# Skills']);
  });

  it('reports all three missing when no boundary headers exist', () => {
    const prompt = 'Just some base rules with no sections.';
    const diag = detectBoundaryDiagnostics(prompt);
    expect(diag.missingHeaders).toEqual([
      '# Project Information',
      '# Working Environment',
      '# Skills',
    ]);
    expect(diag.outOfOrderHeaders).toEqual([]);
  });

  it('is pure — does not throw and returns empty arrays for valid input', () => {
    const prompt = `# Project Information\nx\n# Working Environment\ny\n# Skills\nz`;
    expect(() => detectBoundaryDiagnostics(prompt)).not.toThrow();
    const diag = detectBoundaryDiagnostics(prompt);
    expect(diag.missingHeaders).toHaveLength(0);
    expect(diag.outOfOrderHeaders).toHaveLength(0);
  });
});
