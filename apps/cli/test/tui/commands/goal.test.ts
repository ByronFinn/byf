import type { GoalSnapshot } from '@byfriends/sdk';
import { describe, expect, it, vi } from 'vitest';

import { handleGoalCommand, type GoalSession } from '#/tui/actions/goal';
import { parseGoalCommand } from '#/tui/commands/goal';

describe('parseGoalCommand (PRD-0019 #204 AC-5)', () => {
  describe('subcommands', () => {
    it('empty input → status', () => {
      expect(parseGoalCommand('')).toEqual({ kind: 'status' });
      expect(parseGoalCommand('   ')).toEqual({ kind: 'status' });
    });

    it('status → status', () => {
      expect(parseGoalCommand('status')).toEqual({ kind: 'status' });
      expect(parseGoalCommand('status extra')).toEqual({ kind: 'status' });
    });

    it('pause → pause', () => {
      expect(parseGoalCommand('pause')).toEqual({ kind: 'pause' });
    });

    it('resume → resume', () => {
      expect(parseGoalCommand('resume')).toEqual({ kind: 'resume' });
    });

    it('cancel → cancel', () => {
      expect(parseGoalCommand('cancel')).toEqual({ kind: 'cancel' });
    });
  });

  describe('create', () => {
    it('plain objective → create', () => {
      const result = parseGoalCommand('ship the feature');
      expect(result).toEqual({
        kind: 'create',
        objective: 'ship the feature',
        replace: false,
      });
    });

    it('objective with budget flags', () => {
      const result = parseGoalCommand('ship it --max-turns 3 --max-tokens 1000');
      expect(result).toMatchObject({
        kind: 'create',
        objective: 'ship it',
        replace: false,
        budget: { turnBudget: 3, tokenBudget: 1000 },
      });
    });

    it('--max-seconds converts to wallClockBudgetMs', () => {
      const result = parseGoalCommand('obj --max-seconds 60');
      expect(result).toMatchObject({
        budget: { wallClockBudgetMs: 60_000 },
      });
    });

    it('budget flags in any order, objective preserved', () => {
      const result = parseGoalCommand('the objective here --max-tokens 5 --max-turns 2');
      expect(result).toMatchObject({
        objective: 'the objective here',
        budget: { turnBudget: 2, tokenBudget: 5 },
      });
    });

    it('only budget flags, no objective → error', () => {
      const result = parseGoalCommand('--max-turns 3');
      expect(result.kind).toBe('error');
    });

    it('empty objective → error', () => {
      const result = parseGoalCommand('   ');
      // whitespace-only collapses to empty after status check
      expect(result).toEqual({ kind: 'status' });
    });

    it('over-long objective → error', () => {
      const result = parseGoalCommand('x'.repeat(4001));
      expect(result).toMatchObject({ kind: 'error' });
    });

    it('budget flag missing value → error', () => {
      const result = parseGoalCommand('obj --max-turns');
      expect(result).toMatchObject({ kind: 'error' });
      expect((result as { message: string }).message).toContain('--max-turns');
    });

    it('budget flag non-integer value → error', () => {
      const result = parseGoalCommand('obj --max-turns abc');
      expect(result).toMatchObject({ kind: 'error' });
    });

    it('budget flag negative value → error', () => {
      const result = parseGoalCommand('obj --max-turns -3');
      expect(result).toMatchObject({ kind: 'error' });
    });

    it('budget flag with no objective → error', () => {
      const result = parseGoalCommand('--max-turns 3 --max-tokens 5');
      expect(result).toMatchObject({ kind: 'error' });
    });
  });

  describe('replace', () => {
    it('replace with objective → create with replace:true', () => {
      const result = parseGoalCommand('replace new objective');
      expect(result).toEqual({
        kind: 'create',
        objective: 'new objective',
        replace: true,
      });
    });

    it('replace with budget flags applies to new goal', () => {
      const result = parseGoalCommand('replace obj --max-turns 5');
      expect(result).toMatchObject({
        kind: 'create',
        objective: 'obj',
        replace: true,
        budget: { turnBudget: 5 },
      });
    });

    it('replace with no objective → error', () => {
      const result = parseGoalCommand('replace');
      expect(result).toMatchObject({ kind: 'error' });
    });
  });

  describe('-- escape', () => {
    it('-- <objective> treats reserved words as objective text', () => {
      // Without -- this would be the status subcommand.
      const result = parseGoalCommand('-- status the deploy step');
      expect(result).toEqual({
        kind: 'create',
        objective: 'status the deploy step',
        replace: false,
      });
    });

    it('bare -- with nothing → error', () => {
      const result = parseGoalCommand('--');
      expect(result).toMatchObject({ kind: 'error' });
    });

    it('-- with empty objective after → error', () => {
      const result = parseGoalCommand('--   ');
      expect(result).toMatchObject({ kind: 'error' });
    });
  });
});

// Regression: PRD-0019 data flow requires the slash entry to (1) call createGoal
// and (2) launch the first user turn so the goal driver can take over at the end
// of that turn. The action layer (handleGoalCommand) owns step (1); the TUI
// dispatcher in byf-tui.ts owns step (2). These tests pin the action's half of
// the contract — the create case must invoke createGoal; the other cases must
// not. The dispatcher half is covered by byf-tui-message-flow integration.
describe('handleGoalCommand action (PRD-0019 #204, regression)', () => {
  function makeSession(): GoalSession & { prompt: ReturnType<typeof vi.fn> } {
    const noGoal = vi.fn(async (): Promise<GoalSnapshot | null> => null);
    return {
      createGoal: noGoal,
      getGoal: noGoal,
      pauseGoal: noGoal,
      resumeGoal: noGoal,
      cancelGoal: noGoal,
      // The action must NOT depend on prompt — launching the first turn is the
      // TUI dispatcher's job. Including it here only to assert it stays unused.
      prompt: vi.fn(async () => {}),
    };
  }

  function callbacks() {
    return {
      showStatus: vi.fn(),
      showError: vi.fn(),
      appendTranscriptLine: vi.fn(),
    };
  }

  it('create calls createGoal with objective, replace, budget', async () => {
    const session = makeSession();
    const cb = callbacks();
    await handleGoalCommand(
      session,
      { kind: 'create', objective: 'ship it', replace: false, budget: { turnBudget: 3 } },
      cb,
    );
    expect(session.createGoal).toHaveBeenCalledWith('ship it', {
      replace: false,
      budget: { turnBudget: 3 },
    });
    expect(cb.showStatus).toHaveBeenCalled();
    // Action must not launch a turn itself — that is the dispatcher's job.
    expect(session.prompt).not.toHaveBeenCalled();
  });

  it('status calls getGoal and writes a transcript line', async () => {
    const session = makeSession();
    vi.mocked(session.getGoal).mockResolvedValue({
      objective: 'o',
      status: 'active',
      budget: {},
      usage: { turns: 0, tokens: 0, wallClockMs: 0 },
      createdAt: 0,
    });
    const cb = callbacks();
    await handleGoalCommand(session, { kind: 'status' }, cb);
    expect(session.getGoal).toHaveBeenCalled();
    expect(cb.appendTranscriptLine).toHaveBeenCalled();
  });

  it('pause/resume/cancel call the matching session method', async () => {
    const session = makeSession();
    const cb = callbacks();
    await handleGoalCommand(session, { kind: 'pause' }, cb);
    expect(session.pauseGoal).toHaveBeenCalled();
    await handleGoalCommand(session, { kind: 'resume' }, cb);
    expect(session.resumeGoal).toHaveBeenCalled();
    await handleGoalCommand(session, { kind: 'cancel' }, cb);
    expect(session.cancelGoal).toHaveBeenCalled();
    expect(session.prompt).not.toHaveBeenCalled();
  });
});
