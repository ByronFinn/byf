import type { Session } from '@byfriends/sdk';
import type { OverlayHandle, Terminal } from '@earendil-works/pi-tui';
import { describe, expect, it, vi } from 'vitest';

import { BtwController, type BtwHost } from '#/tui/components/dialogs/btw-controller';
import { darkColors } from '#/tui/theme/colors';
import type { TUIState } from '#/tui/types';

/** Minimal fake OverlayHandle recording hide/hidden/focus transitions. */
function fakeHandle(): OverlayHandle & { hidden: boolean } {
  let hidden = false;
  return {
    hide() {
      hidden = true;
    },
    setHidden(value: boolean) {
      hidden = value;
    },
    isHidden() {
      return hidden;
    },
    focus() {},
    get hidden() {
      return hidden;
    },
  } as unknown as OverlayHandle & { hidden: boolean };
}

function fakeTerminal(): Terminal {
  return {
    start: () => {},
    stop: () => {},
    drainInput: () => Promise.resolve(),
    write: () => {},
    get columns() {
      return 120;
    },
    get rows() {
      return 30;
    },
    get kittyProtocolActive() {
      return false;
    },
    moveBy: () => {},
    hideCursor: () => {},
    showCursor: () => {},
    clearLine: () => {},
    clearFromCursor: () => {},
    clearScreen: () => {},
    setTitle: () => {},
    setProgress: () => {},
  };
}

interface FakeStateOverrides {
  model?: string;
  isStreaming?: boolean;
}

/**
 * Builds the narrow TUIState slice BtwController actually reads. The full
 * TUIState is large; only appState.model / appState.isStreaming / terminal /
 * theme.colors / ui.showOverlay / ui.requestRender are touched.
 */
function makeState(overrides: FakeStateOverrides = {}): TUIState {
  const handles: Array<OverlayHandle & { hidden: boolean }> = [];
  const renderCalls: number[] = [];
  const state = {
    ui: {
      showOverlay(): OverlayHandle & { hidden: boolean } {
        const h = fakeHandle();
        handles.push(h);
        return h;
      },
      requestRender(): void {
        renderCalls.push(1);
      },
    },
    terminal: fakeTerminal(),
    theme: { colors: darkColors },
    appState: {
      model: overrides.model ?? 'test-model',
      isStreaming: overrides.isStreaming ?? false,
    },
  } as unknown as TUIState & {
    ui: { __handles: typeof handles; __renderCalls: typeof renderCalls };
  };
  (state.ui as unknown as { __handles: typeof handles }).__handles = handles;
  (state.ui as unknown as { __renderCalls: typeof renderCalls }).__renderCalls = renderCalls;
  return state;
}

interface FakeHostOverrides {
  session?: Session;
}

function makeHost(overrides: FakeHostOverrides = {}): {
  host: BtwHost;
  errors: string[];
  tracks: Array<{ event: string; properties?: Record<string, boolean | number> }>;
} {
  const errors: string[] = [];
  const tracks: Array<{ event: string; properties?: Record<string, boolean | number> }> = [];
  const session = overrides.session;
  const host: BtwHost = {
    getSession: () => session,
    showError: (message: string) => {
      errors.push(message);
    },
    track: (event, properties) => {
      tracks.push({ event, properties });
    },
  };
  return { host, errors, tracks };
}

function makeSession(askSide = vi.fn().mockResolvedValue(undefined)): Session {
  return {
    askSide,
    cancelSideQuery: vi.fn().mockResolvedValue(undefined),
  } as unknown as Session;
}

function handlesOf(state: TUIState): Array<OverlayHandle & { hidden: boolean }> {
  return (state.ui as unknown as { __handles: Array<OverlayHandle & { hidden: boolean }> })
    .__handles;
}

describe('BtwController', () => {
  it('shows a usage error and never asks when the query is empty', async () => {
    const askSide = vi.fn();
    const state = makeState();
    const { host, errors } = makeHost({ session: makeSession(askSide) });
    const controller = new BtwController(state, host);

    await controller.show('   ');

    expect(askSide).not.toHaveBeenCalled();
    expect(errors).toEqual(['Usage: /btw <question>']);
  });

  it('shows a no-session error when no session is active', async () => {
    const askSide = vi.fn();
    const state = makeState();
    const { host, errors } = makeHost(); // no session
    const controller = new BtwController(state, host);

    await controller.show('where is the config?');

    expect(askSide).not.toHaveBeenCalled();
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/session/i);
  });

  it('shows a no-model error when the model is unset', async () => {
    const askSide = vi.fn();
    const state = makeState({ model: '   ' });
    const session = makeSession(askSide);
    const { host, errors } = makeHost({ session });
    const controller = new BtwController(state, host);

    await controller.show('where is the config?');

    expect(askSide).not.toHaveBeenCalled();
    expect(errors.length).toBe(1);
    expect(errors[0]).toMatch(/LLM not set/i);
  });

  it('opens an overlay and asks the side query with a queryId', async () => {
    const askSide = vi.fn().mockResolvedValue(undefined);
    const state = makeState();
    const session = makeSession(askSide);
    const { host } = makeHost({ session });
    const controller = new BtwController(state, host);

    await controller.show('where is the config?');

    expect(askSide).toHaveBeenCalledTimes(1);
    const [query, options] = askSide.mock.calls[0]!;
    expect(query).toBe('where is the config?');
    expect((options as { queryId: string }).queryId).toMatch(/^cli-btw-/);
    expect(handlesOf(state)).toHaveLength(1);
  });

  it('closes the previous overlay (and cancels its query) when reopened', async () => {
    const askSide = vi.fn().mockResolvedValue(undefined);
    const cancelSideQuery = vi.fn().mockResolvedValue(undefined);
    const state = makeState();
    const session = { askSide, cancelSideQuery } as unknown as Session;
    const { host } = makeHost({ session });
    const controller = new BtwController(state, host);

    await controller.show('first question');
    const firstQueryId = (askSide.mock.calls[0]![1] as { queryId: string }).queryId;
    const firstHandle = handlesOf(state)[0];

    await controller.show('second question');

    expect(cancelSideQuery).toHaveBeenCalledWith(firstQueryId);
    expect(firstHandle.hidden).toBe(true);
    expect(handlesOf(state)).toHaveLength(2);
  });

  it('closes the active overlay, aborting and cancelling the side query', async () => {
    const askSide = vi.fn().mockResolvedValue(undefined);
    const cancelSideQuery = vi.fn().mockResolvedValue(undefined);
    const state = makeState();
    const session = { askSide, cancelSideQuery } as unknown as Session;
    const { host } = makeHost({ session });
    const controller = new BtwController(state, host);

    await controller.show('quick one');
    const queryId = (askSide.mock.calls[0]![1] as { queryId: string }).queryId;
    const handle = handlesOf(state)[0];

    controller.close();

    expect(cancelSideQuery).toHaveBeenCalledWith(queryId);
    expect(handle.hidden).toBe(true);
  });

  it('hideForModal hides the overlay and restore brings it back', async () => {
    const state = makeState();
    const { host } = makeHost({ session: makeSession() });
    const controller = new BtwController(state, host);

    await controller.show('hi');
    const handle = handlesOf(state)[0];

    controller.hideForModal();
    expect(handle.isHidden()).toBe(true);

    controller.restore();
    expect(handle.isHidden()).toBe(false);
  });

  it('hideForModal and restore are no-ops when no overlay is open', () => {
    const state = makeState();
    const { host } = makeHost({ session: makeSession() });
    const controller = new BtwController(state, host);

    expect(() => {
      controller.hideForModal();
      controller.restore();
      controller.close();
    }).not.toThrow();
  });

  it('handleEvent returns false for non-btw events', async () => {
    const state = makeState();
    const { host } = makeHost({ session: makeSession() });
    const controller = new BtwController(state, host);

    await controller.show('q');

    expect(controller.handleEvent({ type: 'turn.started' } as never)).toBe(false);
  });

  it('handleEvent ignores btw events for a different queryId', async () => {
    const askSide = vi.fn().mockResolvedValue(undefined);
    const state = makeState();
    const { host } = makeHost({ session: makeSession(askSide) });
    const controller = new BtwController(state, host);

    await controller.show('q');
    const renderCallsBefore = (state.ui as unknown as { __renderCalls: number[] }).__renderCalls
      .length;

    const consumed = controller.handleEvent({
      type: 'btw.delta',
      queryId: 'someone-elses-qid',
      delta: 'ignored',
    } as never);

    expect(consumed).toBe(false);
    expect((state.ui as unknown as { __renderCalls: number[] }).__renderCalls.length).toBe(
      renderCallsBefore,
    );
  });

  it('handleEvent streams deltas and reports telemetry on completion', async () => {
    const askSide = vi.fn().mockResolvedValue(undefined);
    const state = makeState({ isStreaming: true });
    const { host, tracks } = makeHost({ session: makeSession(askSide) });
    const controller = new BtwController(state, host);

    await controller.show('q');
    const queryId = (askSide.mock.calls[0]![1] as { queryId: string }).queryId;

    expect(controller.handleEvent({ type: 'btw.started', queryId } as never)).toBe(true);
    expect(controller.handleEvent({ type: 'btw.delta', queryId, delta: 'hel' } as never)).toBe(
      true,
    );
    expect(controller.handleEvent({ type: 'btw.delta', queryId, delta: 'lo' } as never)).toBe(true);
    expect(
      controller.handleEvent({
        type: 'btw.completed',
        queryId,
        text: 'hello',
        usage: {
          inputCacheRead: 1,
          inputCacheCreation: 2,
          inputOther: 3,
          output: 4,
        },
      } as never),
    ).toBe(true);

    expect(tracks).toEqual([
      {
        event: 'btw_query',
        properties: expect.objectContaining({
          during_streaming: true,
          input_cache_read: 1,
          input_cache_creation: 2,
          input_other: 3,
          output: 4,
        }),
      },
    ]);
  });

  it('handleEvent surfaces a failure status', async () => {
    const askSide = vi.fn().mockResolvedValue(undefined);
    const state = makeState();
    const { host } = makeHost({ session: makeSession(askSide) });
    const controller = new BtwController(state, host);

    await controller.show('q');
    const queryId = (askSide.mock.calls[0]![1] as { queryId: string }).queryId;

    expect(controller.handleEvent({ type: 'btw.failed', queryId, message: 'boom' } as never)).toBe(
      true,
    );
  });
});
