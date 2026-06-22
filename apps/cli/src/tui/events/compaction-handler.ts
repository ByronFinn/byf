import type {
  CompactionCancelledEvent,
  CompactionCompletedEvent,
  CompactionStartedEvent,
} from '@byfriends/sdk';

import type { AppState, QueuedMessage } from '#/tui/types';

export interface CompactionState {
  readonly appState: AppState;
  queuedMessages: QueuedMessage[];
}

export interface CompactionCallbacks {
  finalizeLiveTextBuffers(mode: 'idle' | 'waiting' | 'thinking' | 'tool' | 'session'): void;
  setAppState(patch: Partial<AppState>): void;
  resetLivePane(): void;
  beginCompactionBlock(instruction?: string): void;
  endCompactionBlock(tokensBefore?: number, tokensAfter?: number): void;
  cancelCompactionBlock(): void;
}

export class CompactionHandler {
  constructor(
    private readonly state: CompactionState,
    private readonly callbacks: CompactionCallbacks,
  ) {}

  handleBegin(event: CompactionStartedEvent): void {
    this.callbacks.finalizeLiveTextBuffers('waiting');
    this.callbacks.setAppState({
      isCompacting: true,
      streamingPhase: 'waiting',
      streamingStartTime: Date.now(),
    });
    this.callbacks.beginCompactionBlock(event.instruction);
  }

  handleEnd(event: CompactionCompletedEvent, sendQueued: (item: QueuedMessage) => void): void {
    this.callbacks.endCompactionBlock(event.result.tokensBefore, event.result.tokensAfter);
    this.finishCompaction(sendQueued);
  }

  handleCancel(_event: CompactionCancelledEvent, sendQueued: (item: QueuedMessage) => void): void {
    this.callbacks.cancelCompactionBlock();
    this.finishCompaction(sendQueued);
  }

  private finishCompaction(sendQueued: (item: QueuedMessage) => void): void {
    if (!this.state.appState.isStreaming) {
      this.callbacks.setAppState({
        isCompacting: false,
        streamingPhase: 'idle',
      });
      this.callbacks.resetLivePane();
      if (this.state.queuedMessages.length > 0) {
        const [next, ...rest] = this.state.queuedMessages;
        this.state.queuedMessages = rest;
        if (next !== undefined) {
          setTimeout(() => {
            sendQueued(next);
          }, 0);
        }
      }
    } else {
      this.callbacks.setAppState({ isCompacting: false });
    }
  }
}
