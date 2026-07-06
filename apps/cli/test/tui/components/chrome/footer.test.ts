import type { GoalSnapshot } from '@byfriends/sdk';
import { describe, it, expect } from 'vitest';

import {
  FooterComponent,
  formatContextStatus,
  formatGoalBadge,
} from '#/tui/components/chrome/footer';
import { darkColors } from '#/tui/theme/colors';
import type { AppState } from '#/tui/types';

const ANSI_SGR = /\u001B\[[0-9;]*m/g;
function strip(text: string): string {
  return text.replaceAll(ANSI_SGR, '');
}

function baseState(overrides: Record<string, unknown> = {}): AppState {
  const state = {
    model: 'k2',
    workDir: '/tmp',
    sessionId: 'sess_1',
    yolo: false,
    permissionMode: 'manual',
    thinkingEffort: 'off',
    contextUsage: 0.45,
    contextTokens: 22000,
    maxContextTokens: 48000,
    isStreaming: false,
    isCompacting: false,
    isReplaying: false,
    streamingPhase: 'idle',
    streamingStartTime: 0,
    theme: 'dark',
    version: 'test',
    editorCommand: null,
    notifications: { enabled: true, condition: 'unfocused' },
    availableModels: {},
    availableProviders: {},
    sessionTitle: null,
    ...overrides,
  };
  return state as never as AppState;
}

describe('Footer — cache badge (Group B)', () => {
  // ── B1: shows badge ────────────────────────────────────────────
  it('B1: shows cache badge on line 2 when cacheHitRate > 0', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0.87 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    expect(strip(line2!)).toMatch(/cache:\s*87%/);
  });

  // ── B2: hides badge at 0 ───────────────────────────────────────
  it('B2: hides cache badge when cacheHitRate is 0', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    const stripped = strip(line2!);
    expect(stripped).not.toMatch(/cache:/);
    // context line still renders
    expect(stripped).toMatch(/context:/);
  });

  // ── B3: hides badge at undefined ───────────────────────────────
  it('B3: hides cache badge when cacheHitRate is undefined', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: undefined }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    const stripped = strip(line2!);
    expect(stripped).not.toMatch(/cache:/);
    expect(stripped).toMatch(/context:/);
  });

  // ── B4: 99.9% → 100% ──────────────────────────────────────────
  it('B4: rounds 0.999 → "100%" with banker\'s rounding', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0.999 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    expect(strip(line2!)).toMatch(/cache:\s*100%/);
  });

  // ── B5: 49.5% → 50% ───────────────────────────────────────────
  it('B5: rounds 0.495 → "50%" with banker\'s rounding', () => {
    const fc = new FooterComponent(baseState({ cacheHitRate: 0.495 }), darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    expect(strip(line2!)).toMatch(/cache:\s*50%/);
  });

  // ── B10: formatContextStatus unchanged ────────────────────────
  it('B10: formatContextStatus returns context-only string, no cache:', () => {
    const result = formatContextStatus(0.45, 22000, 48000);
    expect(result).toContain('context:');
    expect(result).not.toContain('cache:');
  });

  // ── #135: footer must use the canonical formatTokenCount (finite/negative guard) ──
  it('#135: renders NaN tokens as 0 (not "NaN") via canonical formatTokenCount guard', () => {
    const result = formatContextStatus(0.45, Number.NaN, 48000);
    expect(result).not.toContain('NaN');
    expect(result).toContain('0/48.0k');
  });

  it('#135: renders negative tokens as 0 via canonical formatTokenCount guard', () => {
    const result = formatContextStatus(0.45, -5, 48000);
    expect(result).not.toContain('-5');
    expect(result).toContain('0/48.0k');
  });

  // ── B12: key absent ────────────────────────────────────────────
  it('B12: no cache badge when cacheHitRate key is absent from state', () => {
    // Construct state without cacheHitRate — key literally absent.
    const stateWithout = {
      model: 'k2',
      workDir: '/tmp',
      sessionId: 'sess_1',
      yolo: false,
      permissionMode: 'manual',
      thinkingEffort: 'off',
      contextUsage: 0.3,
      contextTokens: 10000,
      maxContextTokens: 48000,
      isStreaming: false,
      isCompacting: false,
      isReplaying: false,
      streamingPhase: 'idle',
      streamingStartTime: 0,
      theme: 'dark',
      version: 'test',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
      availableModels: {},
      availableProviders: {},
      sessionTitle: null,
    } as never as AppState;

    const fc = new FooterComponent(stateWithout, darkColors);
    const [, line2] = fc.render(120);
    expect(line2).toBeDefined();
    const stripped = strip(line2!);
    expect(stripped).not.toMatch(/cache:/);
    expect(stripped).toMatch(/context:/);
  });
});

// ── Goal badge (PRD-0019 R13) ─────────────────────────────────────────
function goalSnapshot(overrides: Partial<GoalSnapshot> = {}): GoalSnapshot {
  return {
    objective: 'Ship feature X',
    status: 'active',
    budget: {},
    usage: { turns: 2, tokens: 1500, wallClockMs: 18_000 },
    createdAt: 0,
    ...overrides,
  } as GoalSnapshot;
}

describe('Footer — goal badge (PRD-0019 R13)', () => {
  it('shows ▶ badge with usage when an active goal is set', () => {
    const fc = new FooterComponent(
      baseState({ goalSnapshot: goalSnapshot({ status: 'active' }) }),
      darkColors,
    );
    const [line1] = fc.render(120);
    expect(strip(line1!)).toMatch(/▶ goal · 2 turns · 1\.5k tokens · 18s/);
  });

  it('shows ⏸ glyph for a paused goal', () => {
    const fc = new FooterComponent(
      baseState({ goalSnapshot: goalSnapshot({ status: 'paused' }) }),
      darkColors,
    );
    const [line1] = fc.render(120);
    expect(strip(line1!)).toMatch(/⏸ goal/);
  });

  it('shows ⚠ glyph for a blocked goal', () => {
    const fc = new FooterComponent(
      baseState({
        goalSnapshot: goalSnapshot({ status: 'blocked', blockedReason: 'budget' }),
      }),
      darkColors,
    );
    const [line1] = fc.render(120);
    expect(strip(line1!)).toMatch(/⚠ goal/);
  });

  it('hides the goal badge when goalSnapshot is null', () => {
    const fc = new FooterComponent(baseState({ goalSnapshot: null }), darkColors);
    const [line1] = fc.render(120);
    expect(strip(line1!)).not.toMatch(/goal/);
  });

  it('formatGoalBadge returns null for null snapshot', () => {
    expect(formatGoalBadge(null, darkColors)).toBeNull();
  });

  it('renders the ▶ glyph for the transient complete status (fallback to active)', () => {
    // `complete` is transient — the driver clears it at the turn boundary.
    // If it ever reaches the footer it falls back to the active glyph.
    const badge = formatGoalBadge(goalSnapshot({ status: 'complete' }), darkColors);
    expect(badge).toBeDefined();
    expect(strip(badge!)).toMatch(/▶ goal/);
  });

  it('badge reflects turns/tokens/elapsed from usage', () => {
    const badge = formatGoalBadge(
      goalSnapshot({ usage: { turns: 5, tokens: 25000, wallClockMs: 95_000 } }),
      darkColors,
    );
    expect(badge).toBeDefined();
    expect(strip(badge!)).toMatch(/5 turns · 25\.0k tokens · 95s/);
  });
});
