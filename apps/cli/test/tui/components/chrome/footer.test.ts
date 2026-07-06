import type { GoalSnapshot } from '@byfriends/sdk';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// ── Live wall-clock timer (ADR-0027 / #206) ──────────────────────────
//
// footer extrapolates elapsed mid-turn: a 1s setInterval ticks while a goal
// is `active`, advancing the displayed wall-clock locally between
// `goal.updated` events (counts/tokens are turn-level by N3). These tests
// lock: timer start/stop, extrapolation correctness, anchor-not-reset on
// unrelated setState, and dispose cleanup.

describe('Footer — goal live wall-clock timer (ADR-0027)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks onRefresh every second while a goal is active', () => {
    const onRefresh = vi.fn();
    const fc = new FooterComponent(
      baseState({ goalSnapshot: goalSnapshot({ status: 'active' }) }),
      darkColors,
      () => {},
      onRefresh,
    );
    expect(onRefresh).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(onRefresh).toHaveBeenCalledTimes(2);
    fc.dispose();
  });

  it('does NOT tick when goal is paused/blocked/null', () => {
    const onRefresh = vi.fn();
    const fc = new FooterComponent(
      baseState({ goalSnapshot: goalSnapshot({ status: 'paused' }) }),
      darkColors,
      () => {},
      onRefresh,
    );
    vi.advanceTimersByTime(5000);
    expect(onRefresh).toHaveBeenCalledTimes(0);
    fc.dispose();
  });

  it('stops the ticker when an active goal becomes paused', () => {
    const onRefresh = vi.fn();
    const fc = new FooterComponent(
      baseState({ goalSnapshot: goalSnapshot({ status: 'active' }) }),
      darkColors,
      () => {},
      onRefresh,
    );
    vi.advanceTimersByTime(1000);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // Transition to paused — timer must be cleared.
    fc.setState(baseState({ goalSnapshot: goalSnapshot({ status: 'paused' }) }));
    vi.advanceTimersByTime(5000);
    expect(onRefresh).toHaveBeenCalledTimes(1); // no further ticks
    fc.dispose();
  });

  it('extrapolates elapsed forward while active', () => {
    // Snapshot carries wallClockMs=18s. Observed at t=0; at t=2.5s the footer
    // should display 18s + 2.5s ≈ 20s (Math.round(20.5) = 21 with .5s rounding).
    const fc = new FooterComponent(
      baseState({
        goalSnapshot: goalSnapshot({
          status: 'active',
          usage: { turns: 2, tokens: 1500, wallClockMs: 18_000 },
        }),
      }),
      darkColors,
    );
    vi.advanceTimersByTime(2500);
    const [line1] = fc.render(120);
    const stripped = strip(line1!);
    // 18000 + 2500 = 20500ms → round(20.5) = 21s (banker's rounding → 20)
    // Use a range assertion to avoid coupling to rounding direction at .5.
    expect(stripped).toMatch(/2 turns · 1\.5k tokens · (20|21)s/);
    fc.dispose();
  });

  it('does NOT extrapolate while paused (shows frozen value)', () => {
    const fc = new FooterComponent(
      baseState({
        goalSnapshot: goalSnapshot({
          status: 'paused',
          usage: { turns: 2, tokens: 1500, wallClockMs: 18_000 },
        }),
      }),
      darkColors,
    );
    vi.advanceTimersByTime(10_000);
    const [line1] = fc.render(120);
    // Still 18s — paused wall-clock is frozen, not extrapolated.
    expect(strip(line1!)).toMatch(/2 turns · 1\.5k tokens · 18s/);
    fc.dispose();
  });

  it('does NOT reset the extrapolation anchor on unrelated setState', () => {
    // Two setState calls with the SAME goal snapshot (only permissionMode
    // differs) must NOT reset goalObservedAtMs — otherwise the extrapolated
    // elapsed would never advance.
    const snapshot = goalSnapshot({
      status: 'active',
      usage: { turns: 2, tokens: 1500, wallClockMs: 10_000 },
    });
    const fc = new FooterComponent(baseState({ goalSnapshot: snapshot }), darkColors);
    // Unrelated setState 1s later (e.g. permissionMode toggle) with the same snapshot.
    vi.advanceTimersByTime(1000);
    fc.setState(baseState({ goalSnapshot: snapshot, permissionMode: 'yolo' }));
    vi.advanceTimersByTime(2000);
    const [line1] = fc.render(120);
    // Anchor not reset → total elapsed = 3s of extrapolation + 10s base = 13s.
    expect(strip(line1!)).toMatch(/2 turns · 1\.5k tokens · 13s/);
    fc.dispose();
  });

  it('resets the anchor when the snapshot truly changes', () => {
    // A new goal.updated event arrives (wallClockMs updated) — anchor resets,
    // extrapolation restarts from the new snapshot value.
    const fc = new FooterComponent(
      baseState({
        goalSnapshot: goalSnapshot({
          status: 'active',
          usage: { turns: 2, tokens: 1500, wallClockMs: 10_000 },
        }),
      }),
      darkColors,
    );
    vi.advanceTimersByTime(2000);
    // New event: turns bumped to 3, wallClockMs folded to 15s at event time.
    fc.setState(
      baseState({
        goalSnapshot: goalSnapshot({
          status: 'active',
          usage: { turns: 3, tokens: 2000, wallClockMs: 15_000 },
        }),
      }),
    );
    vi.advanceTimersByTime(1000);
    const [line1] = fc.render(120);
    // Anchor reset at the new event: 15s base + 1s extrapolation = 16s.
    expect(strip(line1!)).toMatch(/3 turns · 2\.0k tokens · 16s/);
    fc.dispose();
  });

  it('dispose clears the timer (no further ticks)', () => {
    const onRefresh = vi.fn();
    const fc = new FooterComponent(
      baseState({ goalSnapshot: goalSnapshot({ status: 'active' }) }),
      darkColors,
      () => {},
      onRefresh,
    );
    fc.dispose();
    vi.advanceTimersByTime(10_000);
    expect(onRefresh).toHaveBeenCalledTimes(0);
  });

  it('dispose is idempotent', () => {
    const fc = new FooterComponent(
      baseState({ goalSnapshot: goalSnapshot({ status: 'active' }) }),
      darkColors,
    );
    expect(() => {
      fc.dispose();
      fc.dispose();
    }).not.toThrow();
  });

  it('complete transient status does NOT tick (timer stopped, frozen value shown)', () => {
    // complete is transient; its wall-clock is already folded to the final
    // value. The footer must not extrapolate (would over-count past the fold).
    const onRefresh = vi.fn();
    const fc = new FooterComponent(
      baseState({
        goalSnapshot: goalSnapshot({
          status: 'complete',
          usage: { turns: 3, tokens: 2000, wallClockMs: 30_000 },
        }),
      }),
      darkColors,
      () => {},
      onRefresh,
    );
    vi.advanceTimersByTime(10_000);
    expect(onRefresh).toHaveBeenCalledTimes(0);
    const [line1] = fc.render(120);
    // Frozen at 30s — complete never extrapolates.
    expect(strip(line1!)).toMatch(/3 turns · 2\.0k tokens · 30s/);
    fc.dispose();
  });
});
