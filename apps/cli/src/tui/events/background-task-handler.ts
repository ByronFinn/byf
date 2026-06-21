import type {
  BackgroundTaskInfo,
  BackgroundTaskStartedEvent,
  BackgroundTaskTerminatedEvent,
  BackgroundTaskUpdatedEvent,
} from '@byfriends/sdk';

import type { BackgroundAgentMetadata, TranscriptEntry } from '#/tui/types';
import { formatBackgroundAgentTranscript } from '#/tui/utils/background-agent-status';
import { formatBackgroundTaskTranscript } from '#/tui/utils/background-task-status';
import { nextTranscriptId } from '#/tui/utils/transcript-id';

// ---------------------------------------------------------------------------
// State and callbacks for background tasks and background agents
// ---------------------------------------------------------------------------

export interface BackgroundTaskState {
  backgroundTasks: Map<string, BackgroundTaskInfo>;
  backgroundTaskTranscriptedTerminal: Set<string>;
  currentTurnId: string | undefined;
}

export interface BackgroundTaskCallbacks {
  appendTranscriptEntry(entry: TranscriptEntry): void;
  requestRender(): void;
  setBackgroundCounts(counts: { bashTasks: number; agentTasks: number }): void;
  repaintTasksBrowser(): void;
}

// ---------------------------------------------------------------------------
// BackgroundTaskHandler
// ---------------------------------------------------------------------------

export class BackgroundTaskHandler {
  constructor(
    private readonly state: BackgroundTaskState,
    private readonly callbacks: BackgroundTaskCallbacks,
  ) {}

  // -----------------------------------------------------------------------
  // Background lifecycle events (BPM-derived, covers both bash + agent tasks)
  // -----------------------------------------------------------------------

  handleEvent(
    event: BackgroundTaskStartedEvent | BackgroundTaskUpdatedEvent | BackgroundTaskTerminatedEvent,
  ): void {
    const { info } = event;
    const previous = this.state.backgroundTasks.get(info.taskId);
    this.state.backgroundTasks.set(info.taskId, info);

    const isTerminal =
      info.status === 'completed' ||
      info.status === 'failed' ||
      info.status === 'killed' ||
      info.status === 'lost';

    if (event.type === 'background.task.started') {
      // For agent-* tasks, the legacy subagent.spawned flow already
      // pushed a 'started' transcript card; skip to avoid duplicates.
      if (info.taskId.startsWith('agent-')) {
        this.syncBadge();
        this.callbacks.repaintTasksBrowser();
        return;
      }
      this.appendBackgroundTaskEntry(info);
      this.syncBadge();
      this.callbacks.repaintTasksBrowser();
      return;
    }

    if (event.type === 'background.task.terminated' && isTerminal) {
      if (!this.state.backgroundTaskTranscriptedTerminal.has(info.taskId)) {
        // For agent-* tasks, the older subagent.completed/failed flow
        // may also produce a terminal card; whoever wins records the
        // dedupe marker first. See handleSubagentCompleted/Failed.
        if (info.taskId.startsWith('bash-')) {
          this.appendBackgroundTaskEntry(info);
        }
        this.state.backgroundTaskTranscriptedTerminal.add(info.taskId);
      }
      this.syncBadge();
      this.callbacks.repaintTasksBrowser();
      return;
    }

    // updated: status flipped between running and awaiting_approval.
    // No transcript card — just sync the badge if the active count
    // changed (awaiting_approval still counts as active).
    if (previous?.status !== info.status) {
      this.syncBadge();
    }
    this.callbacks.repaintTasksBrowser();
  }

  // -----------------------------------------------------------------------
  // Background agent transcript entries (called from subagent flow)
  // -----------------------------------------------------------------------

  appendBackgroundAgentEntry(
    phase: 'started' | 'completed' | 'failed',
    meta: BackgroundAgentMetadata,
    extras: { resultSummary?: string; error?: string } | undefined = undefined,
  ): void {
    const status = formatBackgroundAgentTranscript(phase, meta, extras);
    const entry: TranscriptEntry = {
      id: nextTranscriptId(),
      kind: 'status',
      turnId: this.state.currentTurnId,
      renderMode: 'plain',
      content: status.headline,
      detail: status.detail,
      backgroundAgentStatus: status,
    };
    this.callbacks.appendTranscriptEntry(entry);
  }

  syncBackgroundAgentBadge(): void {
    this.syncBadge();
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private appendBackgroundTaskEntry(info: BackgroundTaskInfo): void {
    const status = formatBackgroundTaskTranscript(info);
    const entry: TranscriptEntry = {
      id: nextTranscriptId(),
      kind: 'status',
      turnId: this.state.currentTurnId,
      renderMode: 'plain',
      content: status.headline,
      detail: status.detail,
      backgroundAgentStatus: status,
    };
    this.callbacks.appendTranscriptEntry(entry);
  }

  private syncBadge(): void {
    let bashTasks = 0;
    let agentTasks = 0;
    for (const info of this.state.backgroundTasks.values()) {
      if (
        info.status === 'completed' ||
        info.status === 'failed' ||
        info.status === 'killed' ||
        info.status === 'lost'
      ) {
        continue;
      }
      if (info.taskId.startsWith('agent-')) {
        agentTasks += 1;
      } else {
        bashTasks += 1;
      }
    }
    this.callbacks.setBackgroundCounts({ bashTasks, agentTasks });
    this.callbacks.requestRender();
  }
}