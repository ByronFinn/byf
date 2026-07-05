/**
 * goal.updated event handler (PRD-0019 #204).
 *
 * Receives `goal.updated` events from the SDK event stream and forwards the
 * snapshot to the UI layer. Pure projection — does not mutate session state.
 * The actual rendering (footer badge, completion card, transcript marker)
 * lives in #205; this module is the seam between the SDK event stream and
 * the UI state.
 */

import type { GoalUpdatedEvent } from '@byfriends/sdk';

export interface GoalEventCallbacks {
  /** Called whenever the live goal snapshot changes (including null). */
  onGoalSnapshotChange(snapshot: GoalUpdatedEvent['snapshot']): void;
}

export class GoalEventHandler {
  constructor(private readonly callbacks: GoalEventCallbacks) {}

  handleEvent(event: GoalUpdatedEvent): void {
    this.callbacks.onGoalSnapshotChange(event.snapshot);
  }
}
