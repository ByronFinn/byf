import { describe, expect, it } from 'vitest';

import {
  GoalCompletionComponent,
  formatGoalUsageLine,
} from '#/tui/components/messages/goal-completion';
import { darkColors } from '#/tui/theme/colors';
import type { GoalCompletionData } from '#/tui/types';

function strip(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

function data(overrides: Partial<GoalCompletionData> = {}): GoalCompletionData {
  return {
    objective: 'Ship feature X',
    turns: 4,
    tokens: 3200,
    wallClockMs: 45_000,
    ...overrides,
  };
}

describe('GoalCompletionComponent (PRD-0019 R14)', () => {
  it('renders title, objective, and usage line', () => {
    const lines = new GoalCompletionComponent(data(), darkColors)
      .render(120)
      .map((l) => strip(l).trimEnd());

    // top spacer
    expect(lines[0]).toBe('');
    // title line
    expect(lines[1]).toMatch(/Goal complete/);
    // objective
    expect(lines.some((l) => l.includes('Ship feature X'))).toBe(true);
    // usage
    expect(lines.some((l) => l.includes('turns=4 tokens=3200 elapsed=45s'))).toBe(true);
  });

  it('renders the reason line when a reason is provided', () => {
    const lines = new GoalCompletionComponent(data({ reason: 'All tests green' }), darkColors)
      .render(120)
      .map((l) => strip(l));

    expect(lines.some((l) => l.includes('All tests green'))).toBe(true);
  });

  it('omits the reason line when reason is empty/whitespace', () => {
    const lines = new GoalCompletionComponent(data({ reason: '   ' }), darkColors)
      .render(120)
      .map((l) => strip(l).trimEnd());

    expect(lines.every((l) => !l.includes('   '))).toBe(true);
  });
});

describe('formatGoalUsageLine', () => {
  it('formats turns/tokens/elapsed-seconds', () => {
    expect(formatGoalUsageLine({ turns: 2, tokens: 1500, wallClockMs: 18_400 })).toBe(
      'turns=2 tokens=1500 elapsed=18s',
    );
  });

  it('clamps negative wall-clock to 0', () => {
    expect(formatGoalUsageLine({ turns: 0, tokens: 0, wallClockMs: -500 })).toBe(
      'turns=0 tokens=0 elapsed=0s',
    );
  });
});
