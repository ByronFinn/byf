import type { GoalSnapshot, GoalUpdatedEvent } from '@byfriends/sdk';
import { describe, expect, it, vi } from 'vitest';

import { GoalEventHandler, type GoalEventCallbacks } from '#/tui/events/goal-event-handler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshot(overrides: Partial<GoalSnapshot> = {}): GoalSnapshot {
  return {
    objective: 'Ship feature X',
    status: 'active',
    budget: {},
    usage: { turns: 3, tokens: 2000, wallClockMs: 30_000 },
    createdAt: 0,
    ...overrides,
  } as GoalSnapshot;
}

function event(
  partial: Pick<GoalUpdatedEvent, 'snapshot'> & Pick<GoalUpdatedEvent, 'change'>,
): GoalUpdatedEvent {
  return { type: 'goal.updated', ...partial };
}

function makeHandler(): { handler: GoalEventHandler; calls: GoalEventCallbacks } {
  const calls: GoalEventCallbacks = {
    onGoalSnapshotChange: vi.fn(),
    appendLifecycleMarker: vi.fn(),
    appendCompletionCard: vi.fn(),
  };
  return { handler: new GoalEventHandler(calls), calls };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoalEventHandler — completion card (PRD-0019 R14)', () => {
  it('renders completion card on change.kind=completion', () => {
    const { handler, calls } = makeHandler();
    const snap = snapshot({ status: 'complete' });
    handler.handleEvent(event({ snapshot: snap, change: { kind: 'completion' } }));

    expect(calls.appendCompletionCard).toHaveBeenCalledWith(snap, undefined);
    expect(calls.appendLifecycleMarker).not.toHaveBeenCalled();
  });

  it('passes the model reason to the completion card', () => {
    const { handler, calls } = makeHandler();
    const snap = snapshot({ status: 'complete' });
    handler.handleEvent(
      event({ snapshot: snap, change: { kind: 'completion', reason: 'All tests pass' } }),
    );

    expect(calls.appendCompletionCard).toHaveBeenCalledWith(snap, 'All tests pass');
  });

  it('does not render a card when completion has a null snapshot', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: null, change: { kind: 'completion' } }));
    expect(calls.appendCompletionCard).not.toHaveBeenCalled();
  });

  it('does not emit a cancel marker on the driver clear after completion (ADR-0024)', () => {
    // Sequence: completion event (renders card) → driver emits null snapshot
    // at the turn boundary (delayed clear). The null must NOT produce a
    // "Goal cancelled." marker — the completion card already rendered.
    const { handler, calls } = makeHandler();
    handler.handleEvent(
      event({ snapshot: snapshot({ status: 'complete' }), change: { kind: 'completion' } }),
    );
    handler.handleEvent(event({ snapshot: null, change: undefined }));

    expect(calls.appendCompletionCard).toHaveBeenCalledTimes(1);
    expect(calls.appendLifecycleMarker).not.toHaveBeenCalledWith('Goal cancelled.');
    expect(calls.onGoalSnapshotChange).toHaveBeenLastCalledWith(null);
  });
});

describe('GoalEventHandler — blocked marker (PRD-0019 R14)', () => {
  it('renders a blocked lifecycle marker with the snapshot reason', () => {
    const { handler, calls } = makeHandler();
    const snap = snapshot({ status: 'blocked', blockedReason: 'Budget reached' });
    handler.handleEvent(
      event({ snapshot: snap, change: { kind: 'blocked', reason: 'Budget reached' } }),
    );

    expect(calls.appendLifecycleMarker).toHaveBeenCalledWith('Goal blocked: Budget reached');
    expect(calls.appendCompletionCard).not.toHaveBeenCalled();
  });

  it('falls back to the change reason when snapshot has none', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(
      event({
        snapshot: snapshot({ status: 'blocked' }),
        change: { kind: 'blocked', reason: 'hook' },
      }),
    );
    expect(calls.appendLifecycleMarker).toHaveBeenCalledWith('Goal blocked: hook');
  });
});

describe('GoalEventHandler — pause/resume transitions', () => {
  it('renders a paused marker on active→paused (no change tag)', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: snapshot({ status: 'active' }), change: undefined }));
    handler.handleEvent(event({ snapshot: snapshot({ status: 'paused' }), change: undefined }));

    expect(calls.appendLifecycleMarker).toHaveBeenCalledWith('Goal paused.');
  });

  it('includes the pausedReason when present', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: snapshot({ status: 'active' }), change: undefined }));
    handler.handleEvent(
      event({
        snapshot: snapshot({ status: 'paused', pausedReason: 'user request' }),
        change: undefined,
      }),
    );

    expect(calls.appendLifecycleMarker).toHaveBeenCalledWith('Goal paused: user request');
  });

  it('renders a resumed marker on paused→active', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: snapshot({ status: 'paused' }), change: undefined }));
    handler.handleEvent(event({ snapshot: snapshot({ status: 'active' }), change: undefined }));

    expect(calls.appendLifecycleMarker).toHaveBeenCalledWith('Goal resumed.');
  });

  it('does not render markers for steady active→active transitions', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: snapshot({ status: 'active' }), change: undefined }));
    handler.handleEvent(event({ snapshot: snapshot({ status: 'active' }), change: undefined }));

    expect(calls.appendLifecycleMarker).not.toHaveBeenCalled();
  });
});

describe('GoalEventHandler — cancel (no completion card)', () => {
  it('renders a cancel marker, not a completion card, on null snapshot', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: snapshot({ status: 'active' }), change: undefined }));
    handler.handleEvent(event({ snapshot: null, change: undefined }));

    expect(calls.appendLifecycleMarker).toHaveBeenCalledWith('Goal cancelled.');
    expect(calls.appendCompletionCard).not.toHaveBeenCalled();
  });

  it('does not render cancel marker when there was no prior goal', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: null, change: undefined }));
    expect(calls.appendLifecycleMarker).not.toHaveBeenCalled();
  });
});

describe('GoalEventHandler — snapshot forwarding', () => {
  it('always forwards the snapshot to the badge callback', () => {
    const { handler, calls } = makeHandler();
    const snap = snapshot();
    handler.handleEvent(event({ snapshot: snap, change: undefined }));
    expect(calls.onGoalSnapshotChange).toHaveBeenCalledWith(snap);
  });

  it('forwards null snapshot so the badge hides', () => {
    const { handler, calls } = makeHandler();
    handler.handleEvent(event({ snapshot: null, change: undefined }));
    expect(calls.onGoalSnapshotChange).toHaveBeenCalledWith(null);
  });
});
