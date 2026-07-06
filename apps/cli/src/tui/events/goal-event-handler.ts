/**
 * goal.updated event handler (PRD-0019 #204 / #205).
 *
 * Receives `goal.updated` events from the SDK event stream and projects them
 * onto two UI surfaces:
 *   1. The live footer badge — driven by the latest snapshot.
 *   2. The transcript — lifecycle markers (pause/resume/blocked/cancel) and
 *      the completion card, derived from the event `change` tag plus
 *      status-transition detection.
 *
 * Pure projection — does not mutate session state. Live/replay consistency is
 * guaranteed because both paths consume the same `goal.updated` event. The
 * handler tracks the previous status locally so pause/resume transitions
 * (which carry no `change` tag) can be surfaced as lifecycle markers.
 */

import type { GoalChange, GoalSnapshot, GoalStatus, GoalUpdatedEvent } from '@byfriends/sdk';

export interface GoalEventCallbacks {
  /** Called whenever the live goal snapshot changes (including null). */
  onGoalSnapshotChange(snapshot: GoalUpdatedEvent['snapshot']): void;
  /** Append a low-presence lifecycle marker (pause/resume/blocked/cancel). */
  appendLifecycleMarker(message: string): void;
  /** Append a completion card (only for model `UpdateGoal('complete')`). */
  appendCompletionCard(snapshot: GoalSnapshot, reason?: string): void;
}

export class GoalEventHandler {
  private previousStatus: GoalStatus | null = null;

  constructor(private readonly callbacks: GoalEventCallbacks) {}

  handleEvent(event: GoalUpdatedEvent): void {
    const { snapshot, change } = event;

    if (change !== undefined) {
      this.handleChange(change, snapshot);
    } else if (snapshot !== null) {
      this.handleStatusTransition(snapshot);
    } else if (this.previousStatus !== null && this.previousStatus !== 'complete') {
      // A null snapshot with no change tag is a cancel (user hard-stop) —
      // render a plain lifecycle marker, NOT a completion card (PRD R14).
      // When the prior status was `complete`, the null snapshot is the
      // driver's delayed clear (ADR-0024): the completion card already
      // rendered via the change tag, so this clear must stay silent.
      this.callbacks.appendLifecycleMarker('Goal cancelled.');
    }

    this.previousStatus = snapshot?.status ?? null;
    this.callbacks.onGoalSnapshotChange(snapshot);
  }

  private handleChange(change: GoalChange, snapshot: GoalSnapshot | null): void {
    if (change.kind === 'completion') {
      // Completion always carries a snapshot (cleared only at the next driver
      // boundary, so the card can still read objective + final usage).
      if (snapshot !== null) {
        this.callbacks.appendCompletionCard(snapshot, change.reason);
      }
      return;
    }
    // change.kind === 'blocked' — the ⚠ badge is the primary signal (PRD R13);
    // also drop a low-presence marker carrying the reason.
    if (snapshot !== null) {
      const reason = snapshot.blockedReason ?? change.reason;
      this.callbacks.appendLifecycleMarker(`Goal blocked${reason ? `: ${reason}` : '.'}`);
    }
  }

  private handleStatusTransition(snapshot: GoalSnapshot): void {
    const prev = this.previousStatus;
    const next = snapshot.status;
    if (prev === next) return;
    // Only pause/resume reach here without a change tag; active is the
    // driver's steady state (no marker), complete carries a change tag.
    if (next === 'paused') {
      const reason = snapshot.pausedReason;
      this.callbacks.appendLifecycleMarker(`Goal paused${reason ? `: ${reason}` : '.'}`);
    } else if (prev === 'paused' && next === 'active') {
      this.callbacks.appendLifecycleMarker('Goal resumed.');
    }
  }
}
