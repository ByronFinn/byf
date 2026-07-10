/**
 * BtwController owns the `/btw` side-query overlay lifecycle.
 *
 * It mounts a {@link BtwViewer} as a center-anchored overlay, drives a read-only
 * side query through `Session.askSide`, routes the streaming `btw.*` events back
 * into the viewer, and manages hide/restore when an approval or question modal
 * needs the foreground. Extracted from `byf-tui.ts` per ADR-0017; follows the
 * same DI shape as `DialogManager` — it takes `TUIState` plus a narrow host
 * interface and never holds a reference to the full `ByfTui` instance.
 */

import { randomUUID } from 'node:crypto';

import type {
  BtwCompletedEvent,
  BtwDeltaEvent,
  BtwFailedEvent,
  Event,
  Session,
} from '@byfriends/sdk';
import type { Component, Focusable, OverlayHandle } from '@earendil-works/pi-tui';

import { LLM_NOT_SET_MESSAGE, NO_ACTIVE_SESSION_MESSAGE } from '#/tui/constant/byf-tui';
import type { TUIState } from '#/tui/types';

import { BtwViewer } from './btw-viewer';

/**
 * Narrow host capabilities the controller needs from its owner.
 * Kept explicit to avoid a reference back to the full ByfTui instance.
 */
export interface BtwHost {
  /** The active session. Dynamic (changes on create/switch), so a getter. */
  getSession(): Session | undefined;
  /** Surface a transient error message outside the overlay. */
  showError(message: string): void;
  /** Telemetry hook. */
  track(event: string, properties?: Record<string, boolean | number>): void;
}

/** Active `/btw` side-query overlay, or undefined when none is open. */
interface BtwOverlay {
  readonly queryId: string;
  readonly component: BtwViewer;
  readonly handle: OverlayHandle;
  readonly abort: AbortController;
  answer: string;
  status: 'streaming' | 'completed' | 'failed';
  readonly startedAt: number;
  readonly duringStreaming: boolean;
  readonly maxHeight: number;
}

export class BtwController {
  private overlay: BtwOverlay | undefined;

  constructor(
    private readonly state: TUIState,
    private readonly host: BtwHost,
  ) {}

  /**
   * Opens the side-query overlay for `query` and streams the answer.
   * The exchange never enters the main transcript (see {@link handleEvent}).
   */
  async show(query: string): Promise<void> {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      this.host.showError('Usage: /btw <question>');
      return;
    }
    const session = this.host.getSession();
    if (session === undefined) {
      this.host.showError(NO_ACTIVE_SESSION_MESSAGE);
      return;
    }
    if (this.state.appState.model.trim().length === 0) {
      this.host.showError(LLM_NOT_SET_MESSAGE);
      return;
    }
    if (this.overlay !== undefined) {
      this.close();
    }

    const startedAt = Date.now();
    const duringStreaming = this.state.appState.isStreaming;
    const queryId = `cli-btw-${randomUUID()}`;
    const overlayWidth = Math.min(80, Math.floor(this.state.terminal.columns * 0.85));
    const overlayMaxHeight = Math.floor(this.state.terminal.rows * 0.82);
    const component = new BtwViewer(
      {
        query: trimmed,
        answer: '',
        status: 'streaming',
        maxHeight: overlayMaxHeight,
        colors: this.state.theme.colors,
        onClose: () => {
          this.close();
        },
      },
      this.state.terminal,
    );
    const handle = this.mountOverlay(component, overlayWidth, overlayMaxHeight);
    const abort = new AbortController();
    this.overlay = {
      queryId,
      component,
      handle,
      abort,
      answer: '',
      status: 'streaming',
      startedAt,
      duringStreaming,
      maxHeight: overlayMaxHeight,
    };

    try {
      await session.askSide(trimmed, { signal: abort.signal, queryId });
    } catch {
      // Errors surface as a btw.failed event; ignore the rejected promise.
    }
  }

  /** Closes an active overlay, aborting any in-flight side query. */
  close(): void {
    const overlay = this.overlay;
    if (overlay === undefined) return;
    const session = this.host.getSession();
    if (session !== undefined) {
      void session.cancelSideQuery(overlay.queryId);
    }
    overlay.abort.abort();
    overlay.handle.hide();
    this.overlay = undefined;
  }

  /**
   * Temporarily hides the overlay so an approval/question modal can take the
   * foreground. The side query keeps streaming in the background; the overlay
   * is restored once the modal resolves (see {@link restore}).
   */
  hideForModal(): void {
    const overlay = this.overlay;
    if (overlay === undefined || overlay.handle.isHidden()) return;
    overlay.handle.setHidden(true);
  }

  /**
   * Restores an overlay that was hidden for a modal, bringing it back to the
   * foreground. Safe to call when no overlay is open or it was never hidden.
   */
  restore(): void {
    const overlay = this.overlay;
    if (overlay === undefined || !overlay.handle.isHidden()) return;
    overlay.handle.setHidden(false);
    overlay.handle.focus();
  }

  /**
   * Routes a `btw.*` event to the active overlay (filtered by queryId).
   * Returns true when the event was handled.
   */
  handleEvent(event: Event): boolean {
    if (!('type' in event) || typeof event.type !== 'string' || !event.type.startsWith('btw.')) {
      return false;
    }
    const overlay = this.overlay;
    if (overlay === undefined) return false;
    const queryId = (event as { queryId?: string }).queryId;
    if (queryId === undefined || queryId !== overlay.queryId) {
      return false;
    }

    const refresh = (
      answer: string,
      status: 'streaming' | 'completed' | 'failed',
      usage?: {
        inputCacheRead: number;
        inputCacheCreation: number;
        inputOther: number;
        output: number;
      },
      error?: string,
    ): void => {
      overlay.answer = answer;
      overlay.status = status;
      overlay.component.setProps({
        query: overlay.component.query,
        answer,
        status,
        usage,
        error,
        maxHeight: overlay.maxHeight,
        colors: this.state.theme.colors,
        onClose: () => {
          this.close();
        },
      });
      this.state.ui.requestRender();
    };

    // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- guard above narrows to btw.* events; default handles the rest.
    switch (event.type) {
      case 'btw.started':
        return true;
      case 'btw.delta':
        refresh(overlay.answer + (event as BtwDeltaEvent).delta, 'streaming');
        return true;
      case 'btw.completed': {
        const completed = event as BtwCompletedEvent;
        const durationMs = Date.now() - overlay.startedAt;
        const telemetryPayload: Record<string, boolean | number> = {
          duration_ms: durationMs,
          during_streaming: overlay.duringStreaming,
        };
        if (completed.usage !== undefined) {
          telemetryPayload['input_cache_read'] = completed.usage.inputCacheRead;
          telemetryPayload['input_cache_creation'] = completed.usage.inputCacheCreation;
          telemetryPayload['input_other'] = completed.usage.inputOther;
          telemetryPayload['output'] = completed.usage.output;
        }
        this.host.track('btw_query', telemetryPayload);
        refresh(
          completed.text,
          'completed',
          completed.usage !== undefined
            ? {
                inputCacheRead: completed.usage.inputCacheRead,
                inputCacheCreation: completed.usage.inputCacheCreation,
                inputOther: completed.usage.inputOther,
                output: completed.usage.output,
              }
            : undefined,
        );
        return true;
      }
      case 'btw.failed':
        refresh(overlay.answer, 'failed', undefined, (event as BtwFailedEvent).message);
        return true;
      default:
        return false;
    }
  }

  // Mounts the overlay via the center anchor. Unlike editor-replacement
  // dialogs, an overlay never disturbs the editor container, so closing it
  // needs no restoreEditor — hide() is enough.
  private mountOverlay(
    panel: Component & Focusable,
    width: number,
    maxHeight: number,
  ): OverlayHandle {
    return this.state.ui.showOverlay(panel, {
      anchor: 'center',
      width,
      maxHeight,
    });
  }
}
