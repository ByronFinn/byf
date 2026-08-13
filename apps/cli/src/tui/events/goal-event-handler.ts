/**
 * goal.updated 事件处理器(PRD-0019 #204 / #205)。
 *
 * 从 SDK 事件流接收 `goal.updated` 事件,投影到两个 UI 表面:
 *   1. 实时页脚徽章——由最新快照驱动。
 *   2. transcript——生命周期标记(pause/resume/blocked/cancel)与完成卡片,
 *      由事件 `change` 标签加状态转换检测派生。
 *
 * 纯投影——不修改会话状态。live/replay 一致性有保证,因为两条路径消费
 * 同一个 `goal.updated` 事件。本处理器在本地跟踪上一状态,使不带
 * `change` 标签的 pause/resume 转换也能作为生命周期标记呈现。
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
