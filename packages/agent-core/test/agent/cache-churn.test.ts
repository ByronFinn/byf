import type { PromptPlan, Tool } from '@byfriends/kosong';
import { describe, it, expect } from 'vitest';

import { computeToolsHash, extractCacheBlockHashes, diffStaticPrefix } from '#/agent/cache-churn';

import { testAgent } from './harness/agent';

const plan = (
  blocks: { name: string; text: string; cacheScope: PromptPlan['blocks'][number]['cacheScope'] }[],
): PromptPlan => ({
  blocks,
});

const tools = (...names: string[]): Tool[] =>
  names.map(
    (name) =>
      ({ name, description: `desc-${name}`, parameters: { type: 'object' } }) as unknown as Tool,
  );

describe('computeToolsHash', () => {
  it('is deterministic for the same tools', () => {
    const t = tools('a', 'b');
    expect(computeToolsHash(t)).toBe(computeToolsHash(t));
  });

  it('changes when a tool name differs', () => {
    expect(computeToolsHash(tools('a'))).not.toBe(computeToolsHash(tools('b')));
  });

  it('changes when tool description or parameters differ', () => {
    const base = tools('a');
    const modified = [
      { name: 'a', description: 'changed', parameters: { type: 'object' } },
    ] as unknown as Tool[];
    expect(computeToolsHash(base)).not.toBe(computeToolsHash(modified));
  });

  it('is order-sensitive (stable ordering is the caller contract)', () => {
    expect(computeToolsHash(tools('a', 'b'))).not.toBe(computeToolsHash(tools('b', 'a')));
  });
});

describe('extractCacheBlockHashes', () => {
  it('produces a per-block name → SHA256 map', () => {
    const hashes = extractCacheBlockHashes(
      plan([
        { name: 'base', text: 'hello', cacheScope: 'global' },
        { name: 'sessionContext', text: 'world', cacheScope: 'session' },
      ]),
    );
    expect(Object.keys(hashes).toSorted()).toEqual(['base', 'sessionContext']);
    expect(hashes['base']).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes['base']).not.toBe(hashes['sessionContext']);
  });

  it('hashes only text content (same text → same hash regardless of scope)', () => {
    const a = extractCacheBlockHashes(plan([{ name: 'base', text: 'x', cacheScope: 'global' }]));
    const b = extractCacheBlockHashes(plan([{ name: 'base', text: 'x', cacheScope: 'session' }]));
    expect(a['base']).toBe(b['base']);
  });
});

describe('diffStaticPrefix', () => {
  it('returns no changes when previous is undefined (baseline turn)', () => {
    const current = plan([{ name: 'base', text: 'hi', cacheScope: 'global' }]);
    expect(
      diffStaticPrefix(undefined, current, extractCacheBlockHashes(current), computeToolsHash([])),
    ).toEqual([]);
  });

  it('returns no changes when the static prefix is byte-identical', () => {
    const current = plan([
      { name: 'base', text: 'hi', cacheScope: 'global' },
      { name: 'sessionContext', text: 'turn', cacheScope: 'session' },
    ]);
    const snapshot = {
      blocks: extractCacheBlockHashes(current),
      toolsHash: computeToolsHash(tools('a')),
    };
    expect(
      diffStaticPrefix(
        snapshot,
        current,
        extractCacheBlockHashes(current),
        computeToolsHash(tools('a')),
      ),
    ).toEqual([]);
  });

  it('reports a block content change with before/after hash and current scope', () => {
    const before = plan([{ name: 'base', text: 'hi', cacheScope: 'global' }]);
    const after = plan([{ name: 'base', text: 'changed', cacheScope: 'global' }]);
    const snapshot = { blocks: extractCacheBlockHashes(before), toolsHash: computeToolsHash([]) };
    const changes = diffStaticPrefix(
      snapshot,
      after,
      extractCacheBlockHashes(after),
      computeToolsHash([]),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      blockName: 'base',
      cacheScope: 'global',
      beforeHash: extractCacheBlockHashes(before)['base'],
      afterHash: extractCacheBlockHashes(after)['base'],
    });
  });

  it('reports a newly added block with afterHash only (no beforeHash)', () => {
    const before = plan([{ name: 'base', text: 'hi', cacheScope: 'global' }]);
    const after = plan([
      { name: 'base', text: 'hi', cacheScope: 'global' },
      { name: 'projectInstructions', text: 'new injection', cacheScope: 'project' },
    ]);
    const snapshot = { blocks: extractCacheBlockHashes(before), toolsHash: computeToolsHash([]) };
    const changes = diffStaticPrefix(
      snapshot,
      after,
      extractCacheBlockHashes(after),
      computeToolsHash([]),
    );
    expect(changes).toHaveLength(1);
    expect(changes[0]?.blockName).toBe('projectInstructions');
    expect(changes[0]?.cacheScope).toBe('project');
    expect(changes[0]?.beforeHash).toBeUndefined();
    expect(changes[0]?.afterHash).toBeDefined();
  });

  it('reports a tools change as a single tools-block churn', () => {
    const before = plan([{ name: 'base', text: 'hi', cacheScope: 'global' }]);
    const after = plan([{ name: 'base', text: 'hi', cacheScope: 'global' }]);
    const prevTools = computeToolsHash(tools('a'));
    const nextTools = computeToolsHash(tools('a', 'b'));
    const snapshot = { blocks: extractCacheBlockHashes(before), toolsHash: prevTools };
    const changes = diffStaticPrefix(snapshot, after, extractCacheBlockHashes(after), nextTools);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      blockName: 'tools',
      cacheScope: 'global',
      beforeHash: prevTools,
      afterHash: nextTools,
    });
  });

  it('reports block and tools changes together when both changed', () => {
    const before = plan([{ name: 'base', text: 'hi', cacheScope: 'global' }]);
    const after = plan([{ name: 'base', text: 'CHANGED', cacheScope: 'session' }]);
    const snapshot = {
      blocks: extractCacheBlockHashes(before),
      toolsHash: computeToolsHash(tools('a')),
    };
    const changes = diffStaticPrefix(
      snapshot,
      after,
      extractCacheBlockHashes(after),
      computeToolsHash(tools('b')),
    );
    expect(changes).toHaveLength(2);
    // scope reflects the CURRENT block's scope
    const blockChange = changes.find((c) => c.blockName === 'base');
    expect(blockChange?.cacheScope).toBe('session');
    expect(changes.some((c) => c.blockName === 'tools')).toBe(true);
  });
});

describe('Agent churn dispatch (integration via harness)', () => {
  it('does not dispatch churn on the baseline turn', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'hi' }] });
    await ctx.untilTurnEnd();

    expect(ctx.getRecords().map((r) => r.type)).not.toContain('context.cache_churn');
  });

  it('dispatches context.cache_churn when the static prefix changes between turns', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'hi' }] });
    await ctx.untilTurnEnd();

    // Change the static prefix (system prompt) → next turn's PromptPlan differs.
    ctx.agent.config.update({ systemPrompt: 'A materially different system prompt.' });
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'again' }] });
    await ctx.untilTurnEnd();

    const churn = ctx.getRecords().filter((r) => r.type === 'context.cache_churn');
    expect(churn.length).toBe(1);
    const change = churn[0];
    // Short prompts without boundary headers fall back to a single 'base' block.
    expect(change.blockName).toBe('base');
    expect(change.beforeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(change.afterHash).toMatch(/^[0-9a-f]{64}$/);
    expect(change.beforeHash).not.toBe(change.afterHash);
  });

  it('does not dispatch churn across stable turns (same system prompt)', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'turn-1' }] });
    await ctx.untilTurnEnd();
    // Same system prompt → static prefix byte-identical → no churn.
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'turn-2' }] });
    await ctx.untilTurnEnd();

    expect(ctx.getRecords().filter((r) => r.type === 'context.cache_churn')).toHaveLength(0);
  });

  it('restore replays context.cache_churn records without error', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'hi' }] });
    await ctx.untilTurnEnd();
    ctx.agent.config.update({ systemPrompt: 'changed prompt to force churn' });
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'again' }] });
    await ctx.untilTurnEnd();

    expect(ctx.getRecords().some((r) => r.type === 'context.cache_churn')).toBe(true);
    // Fresh agent seeded with the journal must restore (replay cache_churn) cleanly
    // and reach an equivalent observable state.
    await ctx.expectResumeMatches();
  });

  it('exposes lastCacheChurn + cacheChurnCount via getUsage (PRD-0029 R3 attribution UI)', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'hi' }] });
    await ctx.untilTurnEnd();

    // Baseline turn: no churn → no attribution fields.
    const before = await ctx.rpc.getUsage({});
    expect(before.lastCacheChurn).toBeUndefined();
    expect(before.cacheChurnCount).toBeUndefined();

    // Change the static prefix → next turn churns.
    ctx.agent.config.update({ systemPrompt: 'A materially different system prompt.' });
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'again' }] });
    await ctx.untilTurnEnd();

    const after = await ctx.rpc.getUsage({});
    expect(after.cacheChurnCount).toBe(1);
    expect(after.lastCacheChurn).toMatchObject({ blockName: 'base', cacheScope: 'none' });
    expect(after.lastCacheChurn?.turnsAgo).toBe(0);
  });

  it('does not dispatch churn on the /btw side-query path (wire-silent, detached)', async () => {
    // Main turn with real tools → establishes a non-empty toolsHash baseline.
    const ctx = testAgent();
    ctx.configure({ tools: ['Bash'] });
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'hi' }] });
    await ctx.untilTurnEnd();
    const churnBefore = ctx.getRecords().filter((r) => r.type === 'context.cache_churn').length;

    // askSide runs detached with tools=[] + a throwaway promptPlan. Without the gate this
    // would fire a spurious `tools` churn (empty toolsHash ≠ main toolsHash) AND persist a
    // wire record, violating askSide's detachment invariant. Must stay wire-silent.
    ctx.mockNextResponse({ type: 'text', text: 'side answer' });
    await ctx.agent.askSide('quick question?');

    const churnAfter = ctx.getRecords().filter((r) => r.type === 'context.cache_churn').length;
    expect(churnAfter).toBe(churnBefore);
  });
});

/**
 * Prefix-stability regression guard (PRD-0029 R4).
 *
 * A CI canary: if a future change accidentally makes the static prefix (PromptPlan blocks +
 * tools) drift across turns during normal operation, churn fires and these tests go red.
 * The negative case proves the guard is not vacuous (it does fire when the prefix changes).
 */
describe('prefix stability regression guard (PRD-0029 R4)', () => {
  // Multi-block system prompt using the implicit boundary headers → global/project/session
  // scoped blocks, mirroring a realistic stable prefix.
  const STABLE_PROMPT = [
    'You are a concise test agent for the prefix-stability guard.',
    '# Project Information',
    'The project follows the byf cache-release contract.',
    '# Working Environment',
    'Bun 1.3.14 is the sole toolchain.',
    '# Skills',
    'No skills are active in this guard.',
  ].join('\n\n');

  it('global-scope block hashes stay byte-identical across 5 stable turns (no churn)', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.config.update({ systemPrompt: STABLE_PROMPT });

    for (let i = 0; i < 5; i++) {
      ctx.mockNextResponse({ type: 'text', text: 'ok' });
      await ctx.rpc.prompt({ input: [{ type: 'text', text: `turn ${String(i)}` }] });
      await ctx.untilTurnEnd();
    }

    // Guard A: no churn across all 5 turns (churn fires on ANY static-prefix diff).
    expect(ctx.getRecords().filter((r) => r.type === 'context.cache_churn')).toHaveLength(0);

    // Guard B: per-turn per-block hashes are identical (literal R4 assertion).
    const plans = ctx.llmCalls
      .map((c) => c.options?.promptPlan)
      .filter((p): p is PromptPlan => p !== undefined);
    expect(plans.length).toBe(5);
    const blockHashesPerTurn = plans.map((p) => JSON.stringify(extractCacheBlockHashes(p)));
    const firstTurnHashes = blockHashesPerTurn[0];
    expect(blockHashesPerTurn.every((h) => h === firstTurnHashes)).toBe(true);
  });

  it('guard is not vacuous: an injected dynamic prefix change dispatches churn (negative case)', async () => {
    const ctx = testAgent();
    ctx.configure();
    ctx.agent.config.update({ systemPrompt: STABLE_PROMPT });

    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'turn 0' }] });
    await ctx.untilTurnEnd();
    expect(ctx.getRecords().filter((r) => r.type === 'context.cache_churn')).toHaveLength(0);

    // Simulate a regression: a dynamic injector accidentally mutates the static prefix.
    ctx.agent.config.update({
      systemPrompt: `${STABLE_PROMPT}\n\n[dynamic: ${String(Date.now())}]`,
    });
    ctx.mockNextResponse({ type: 'text', text: 'ok' });
    await ctx.rpc.prompt({ input: [{ type: 'text', text: 'turn 1' }] });
    await ctx.untilTurnEnd();

    // The guard catches it — a churn is dispatched for the changed block.
    const churn = ctx.getRecords().filter((r) => r.type === 'context.cache_churn');
    expect(churn.length).toBeGreaterThanOrEqual(1);
  });
});
