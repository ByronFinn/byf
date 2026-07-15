import { describe, expect, it } from 'vitest';

import {
  GOAL_EXIT_CODES,
  formatGoalSummaryText,
  goalExitCode,
  goalSummaryJson,
  parseHeadlessGoalCreate,
} from '#/cli/goal-prompt';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    goalId: 'g1',
    objective: 'work',
    status: 'complete',
    turnsUsed: 2,
    tokensUsed: 120,
    wallClockMs: 0,
    budget: {} as never,
    ...overrides,
  };
}

describe('goalExitCode', () => {
  it('maps final statuses to distinct codes', () => {
    expect(goalExitCode('complete')).toBe(GOAL_EXIT_CODES.complete);
    expect(goalExitCode('blocked')).toBe(GOAL_EXIT_CODES.blocked);
    expect(goalExitCode('paused')).toBe(GOAL_EXIT_CODES.paused);
    expect(goalExitCode(undefined)).toBe(0);
  });
});

describe('parseHeadlessGoalCreate', () => {
  it('returns create payload for /goal <objective>', () => {
    expect(parseHeadlessGoalCreate('/goal Ship feature X')).toEqual({
      objective: 'Ship feature X',
      replace: false,
    });
  });

  it('supports replace subcommand', () => {
    expect(parseHeadlessGoalCreate('/goal replace Do it')).toEqual({
      objective: 'Do it',
      replace: true,
    });
  });

  it('returns undefined for non-create goal subcommands', () => {
    expect(parseHeadlessGoalCreate('/goal status')).toBeUndefined();
    expect(parseHeadlessGoalCreate('/goal pause')).toBeUndefined();
    expect(parseHeadlessGoalCreate('normal prompt')).toBeUndefined();
  });

  it('throws on malformed create (empty replace objective)', () => {
    expect(() => parseHeadlessGoalCreate('/goal replace')).toThrow(/Usage|empty/i);
  });

  it('treats bare /goal as non-create (status path)', () => {
    expect(parseHeadlessGoalCreate('/goal')).toBeUndefined();
  });
});

describe('goalSummaryJson / formatGoalSummaryText', () => {
  it('renders a complete goal', () => {
    const g = {
      objective: 'work',
      status: 'complete',
      budget: {},
      usage: { turns: 2, tokens: 120, wallClockMs: 0 },
      createdAt: 0,
    } as never;
    expect(goalSummaryJson(g)).toMatchObject({
      type: 'goal.summary',
      status: 'complete',
      turnsUsed: 2,
      tokensUsed: 120,
    });
    expect(formatGoalSummaryText(g)).toContain('complete');
    expect(formatGoalSummaryText(g)).toContain('turns: 2');
  });

  it('renders a null goal', () => {
    expect(goalSummaryJson(null).status).toBeNull();
    expect(formatGoalSummaryText(null)).toContain('no goal');
  });
});
