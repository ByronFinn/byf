import type { Component, Focusable, Terminal } from '@earendil-works/pi-tui';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SubagentsController,
  type SubagentsEnv,
} from '#/tui/components/dialogs/subagents/controller';
import { darkColors } from '#/tui/theme/colors';
import type { FullscreenHost } from '#/tui/types';

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

function makeEnv(overrides: Partial<SubagentsEnv> = {}) {
  const errors: string[] = [];
  const fullscreenPanels: Array<Component & Focusable> = [];
  const restoredChildren: Component[][] = [];
  const focusedComponents: Array<Component & Focusable> = [];
  let renders = 0;

  const host: FullscreenHost = {
    showFullscreen(component: Component & Focusable): readonly Component[] {
      fullscreenPanels.push(component);
      focusedComponents.push(component);
      return [];
    },
    closeFullscreen(savedChildren: readonly Component[]): void {
      restoredChildren.push([...savedChildren]);
    },
    focus(component: Component & Focusable): void {
      focusedComponents.push(component);
    },
    requestRender(_full?: boolean): void {
      renders++;
    },
  };

  const env: SubagentsEnv = {
    host,
    getTerminal: fakeTerminal,
    getColors: () => darkColors,
    showError(msg: string) {
      errors.push(msg);
    },
    collectItems: () => [],
    getComponentById: () => undefined,
    ...overrides,
  };

  return {
    errors,
    host,
    env,
    get fullscreenPanels() {
      return fullscreenPanels;
    },
    get restoredChildren() {
      return restoredChildren;
    },
    get focusedComponents() {
      return focusedComponents;
    },
    get renders() {
      return renders;
    },
  };
}

describe('SubagentsController', () => {
  let helper: ReturnType<typeof makeEnv>;
  let controller: SubagentsController;

  beforeEach(() => {
    helper = makeEnv();
    controller = new SubagentsController(helper.env);
  });

  it('starts closed', () => {
    expect(controller.isOpen).toBe(false);
  });

  it('show() mounts a component via FullscreenHost.showFullscreen and marks isOpen', () => {
    controller.show();

    expect(controller.isOpen).toBe(true);
    expect(helper.fullscreenPanels.length).toBe(1);
  });

  it('show() is idempotent when already open', () => {
    controller.show();
    expect(helper.fullscreenPanels.length).toBe(1);

    controller.show();
    expect(helper.fullscreenPanels.length).toBe(1); // no second mount
  });

  it('close() calls closeFullscreen and clears isOpen', () => {
    controller.show();
    expect(controller.isOpen).toBe(true);

    controller.close();
    expect(controller.isOpen).toBe(false);
    expect(helper.restoredChildren.length).toBe(1);
  });

  it('close() is idempotent when already closed', () => {
    controller.close(); // no crash
    expect(controller.isOpen).toBe(false);
  });

  it('show() passes collectItems() output to the list component', () => {
    const collectItems = vi.fn(() => []);
    const ctrl = new SubagentsController(makeEnv({ collectItems }).env);
    ctrl.show();
    // collectItems is called once for initial items + once from pushListProps
    expect(collectItems).toHaveBeenCalledTimes(2);
  });

  it('starts a polling timer on show() and clears on close()', async () => {
    vi.useFakeTimers();
    const collectItems = vi.fn(() => []);
    const ctrl = new SubagentsController(makeEnv({ collectItems }).env);

    ctrl.show();
    expect(collectItems).toHaveBeenCalledTimes(2); // initial + pushListProps

    vi.advanceTimersByTime(1000);
    expect(collectItems).toHaveBeenCalledTimes(3); // poll tick

    vi.advanceTimersByTime(1000);
    expect(collectItems).toHaveBeenCalledTimes(4); // second tick

    ctrl.close();
    vi.advanceTimersByTime(1000);
    expect(collectItems).toHaveBeenCalledTimes(4); // stopped

    vi.useRealTimers();
  });

  it('requests a render on each poll tick so updates are visible', () => {
    vi.useFakeTimers();
    controller.show();
    const initialRenders = helper.renders;

    vi.advanceTimersByTime(1000);
    expect(helper.renders).toBeGreaterThan(initialRenders);

    vi.useRealTimers();
  });

  it('does not mount a second fullscreen panel if show() is called while already open', () => {
    controller.show();
    expect(helper.fullscreenPanels.length).toBe(1);

    // Simulate a second /agent invocation before state is fully set
    controller.show();
    expect(helper.fullscreenPanels.length).toBe(1);
  });

  it('requests a render when live viewer receives a subagent snapshot update', () => {
    const tc = makeMockToolCallComponent();

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-1',
          agentName: 'Explore',
          description: 'Search',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: () => tc,
    });
    const ctrl = new SubagentsController(envHelper.env);

    ctrl.show();
    const rendersAfterShow = envHelper.renders;

    // Simulate selecting the entry to open the live viewer
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;
    listApp.handleInput('\n');

    // Snapshot listener should have fired and requested a render
    expect(envHelper.renders).toBeGreaterThan(rendersAfterShow);
  });

  it('focuses the live viewer and can close it with Q', () => {
    const tc = makeMockToolCallComponent();

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-1',
          agentName: 'Explore',
          description: 'Search',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: () => tc,
    });
    const ctrl = new SubagentsController(envHelper.env);

    ctrl.show();
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;
    listApp.handleInput('\n');

    // The viewer should be the current fullscreen panel and focused
    expect(envHelper.fullscreenPanels.length).toBe(2);
    const viewer = envHelper
      .fullscreenPanels[1] as import('#/tui/components/dialogs/subagents/live-viewer').SubagentLiveViewer;
    expect(envHelper.focusedComponents.at(-1)).toBe(viewer);

    // Pressing q closes the viewer and returns focus to the list
    viewer.handleInput('q');
    expect(ctrl.isOpen).toBe(true);
    expect(envHelper.focusedComponents.at(-1)).toBe(listApp);
  });

  it('is idempotent when Enter is pressed multiple times on the same agent', () => {
    const tc = makeMockToolCallComponent();

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-1',
          agentName: 'Explore',
          description: 'Search',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: () => tc,
    });
    const ctrl = new SubagentsController(envHelper.env);

    ctrl.show();
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;

    listApp.handleInput('\n');
    listApp.handleInput('\n'); // second Enter should be ignored

    expect(envHelper.fullscreenPanels.length).toBe(2);
  });

  it('updates detail and preview immediately when selection changes', () => {
    const tcA = makeMockToolCallComponent({ latestActivity: 'Using Grep', text: 'A output' });
    const tcB = makeMockToolCallComponent({ latestActivity: 'Using Read', text: 'B output' });

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-a',
          agentName: 'Alpha',
          description: 'Alpha agent',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
        {
          toolCallId: 'tc-b',
          agentName: 'Beta',
          description: 'Beta agent',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: (id) => (id === 'tc-a' ? tcA : tcB),
    });
    const ctrl = new SubagentsController(envHelper.env);

    ctrl.show();
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;

    const initialDetail = listApp['props'].selectedDetail;
    const initialPreview = listApp['props'].selectedPreview;

    listApp.handleInput('j'); // select Beta

    expect(listApp['props'].selectedDetail).not.toEqual(initialDetail);
    expect(listApp['props'].selectedPreview).not.toEqual(initialPreview);
    expect(listApp['props'].selectedDetail?.latestActivity).toBe('Using Read');
    expect(listApp['props'].selectedPreview?.lines).toContain('B output');
  });

  it('distinguishes ongoing and done tools in selectedDetail toolList', () => {
    const tc = makeMockToolCallComponent({
      activities: [
        {
          orderSeq: 1,
          name: 'Grep',
          args: { pattern: 'foo' },
          phase: 'done',
          output: 'src/foo.ts',
          isError: false,
        },
        { orderSeq: 2, name: 'Read', args: { path: 'src/foo.ts' }, phase: 'ongoing' },
      ],
    });

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-1',
          agentName: 'Explore',
          description: 'Search',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: () => tc,
    });
    const ctrl = new SubagentsController(envHelper.env);

    ctrl.show();
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;

    expect(listApp['props'].selectedDetail?.toolList).toContain('• Grep');
    expect(listApp['props'].selectedDetail?.toolList).toContain('… Read');
  });

  it('includes ongoing tool activities in selectedPreview', () => {
    const tc = makeMockToolCallComponent({
      activities: [
        {
          orderSeq: 1,
          name: 'Grep',
          args: { pattern: 'foo' },
          phase: 'done',
          output: 'src/foo.ts',
          isError: false,
        },
        { orderSeq: 2, name: 'Read', args: { path: 'src/foo.ts' }, phase: 'ongoing' },
      ],
    });

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-1',
          agentName: 'Explore',
          description: 'Search',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: () => tc,
    });
    const ctrl = new SubagentsController(envHelper.env);

    ctrl.show();
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;

    expect(listApp['props'].selectedPreview?.activityLines).toContain('Using Read (src/foo.ts)');
  });

  it('coalesces high-frequency snapshot callbacks into a single render (freeze guard)', () => {
    vi.useFakeTimers();

    // A mock that captures the registered snapshot callback so we can drive it,
    // simulating a burst of `assistant.delta` events streaming from the child
    // agent.
    let registeredCb: (() => void) | undefined;
    const tc = {
      getSubagentSnapshot: vi.fn(() => ({
        agentName: 'Explore',
        toolCallDescription: 'Search',
        phase: 'running',
        toolCount: 1,
        tokens: 100,
        elapsedSeconds: 5,
        latestActivity: 'Using Read',
        errorText: undefined,
      })),
      getSubagentActivityDetail: vi.fn(() => ({
        toolCallId: 'tc-1',
        agentName: 'Explore',
        phase: 'running',
        toolCount: 1,
        tokens: 100,
        elapsedSeconds: 5,
        activities: [],
        text: '',
        thinkingText: '',
        resultSummary: undefined,
        errorText: undefined,
      })),
      addSnapshotListener: vi.fn((cb: () => void) => {
        registeredCb = cb;
        cb(); // firstCallback fires immediately on registration
        return () => {
          registeredCb = undefined;
        };
      }),
    } as unknown as import('#/tui/components/messages/tool-call').ToolCallComponent;

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-1',
          agentName: 'Explore',
          description: 'Search',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: () => tc,
    });
    const ctrl = new SubagentsController(envHelper.env);
    ctrl.show();
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;
    listApp.handleInput('\n'); // open viewer

    expect(registeredCb).toBeDefined();
    const rendersAfterOpen = envHelper.renders;

    // Burst of 100 streaming deltas within the coalesce window.
    for (let i = 0; i < 100; i++) {
      registeredCb!();
    }

    // No render should have fired yet — the coalesce timer hasn't elapsed.
    expect(envHelper.renders).toBe(rendersAfterOpen);

    // Advance past the coalesce window: exactly one render for the whole burst.
    vi.advanceTimersByTime(80);
    expect(envHelper.renders).toBe(rendersAfterOpen + 1);

    // A second burst after the window produces one more render, not 100.
    const rendersAfterFirstFlush = envHelper.renders;
    for (let i = 0; i < 100; i++) {
      registeredCb!();
    }
    vi.advanceTimersByTime(80);
    expect(envHelper.renders).toBe(rendersAfterFirstFlush + 1);

    vi.useRealTimers();
  });

  it('cancels the pending render timer when the viewer closes (no stale callbacks)', () => {
    vi.useFakeTimers();

    let registeredCb: (() => void) | undefined;
    const tc = {
      getSubagentSnapshot: vi.fn(() => ({
        agentName: 'Explore',
        toolCallDescription: 'Search',
        phase: 'running',
        toolCount: 1,
        tokens: 100,
        elapsedSeconds: 5,
        latestActivity: 'Using Read',
        errorText: undefined,
      })),
      getSubagentActivityDetail: vi.fn(() => ({
        toolCallId: 'tc-1',
        agentName: 'Explore',
        phase: 'running',
        toolCount: 1,
        tokens: 100,
        elapsedSeconds: 5,
        activities: [],
        text: '',
        thinkingText: '',
        resultSummary: undefined,
        errorText: undefined,
      })),
      addSnapshotListener: vi.fn((cb: () => void) => {
        registeredCb = cb;
        cb();
        return () => {};
      }),
    } as unknown as import('#/tui/components/messages/tool-call').ToolCallComponent;

    const envHelper = makeEnv({
      collectItems: () => [
        {
          toolCallId: 'tc-1',
          agentName: 'Explore',
          description: 'Search',
          phase: 'running',
          toolCount: 1,
          tokens: 100,
          elapsedSeconds: 5,
        },
      ],
      getComponentById: () => tc,
    });
    const ctrl = new SubagentsController(envHelper.env);
    ctrl.show();
    const listApp = envHelper
      .fullscreenPanels[0] as import('#/tui/components/dialogs/subagents/list-app').SubagentsListApp;
    listApp.handleInput('\n'); // open viewer

    // Schedule a coalesced render, then close before the timer fires.
    registeredCb!();
    const viewer = envHelper
      .fullscreenPanels[1] as import('#/tui/components/dialogs/subagents/live-viewer').SubagentLiveViewer;
    viewer.handleInput('q'); // close viewer; restores list layer (+1 render)

    // After close, advancing the pending timer must NOT produce another render.
    const rendersAfterClose = envHelper.renders;
    vi.advanceTimersByTime(200);
    expect(envHelper.renders).toBe(rendersAfterClose);

    vi.useRealTimers();
  });
});

interface MockToolCallOptions {
  latestActivity?: string;
  text?: string;
  thinkingText?: string;
  activities?: import('#/tui/components/messages/tool-call').SubagentActivityLine[];
}

function makeMockToolCallComponent(
  options: MockToolCallOptions = {},
): import('#/tui/components/messages/tool-call').ToolCallComponent {
  const { latestActivity = 'Using Read', text = '', thinkingText = '', activities = [] } = options;
  return {
    getSubagentSnapshot: vi.fn(() => ({
      agentName: 'Explore',
      toolCallDescription: 'Search',
      phase: 'running',
      toolCount: activities.filter((a) => a.phase === 'done').length || 1,
      tokens: 100,
      elapsedSeconds: 5,
      latestActivity,
      errorText: undefined,
    })),
    getSubagentActivityDetail: vi.fn(() => ({
      toolCallId: 'tc-1',
      agentName: 'Explore',
      phase: 'running',
      toolCount: activities.length || 1,
      tokens: 100,
      elapsedSeconds: 5,
      activities,
      text,
      thinkingText,
      resultSummary: undefined,
      errorText: undefined,
    })),
    addSnapshotListener: vi.fn((cb: (() => void) | undefined) => {
      cb?.();
      return () => {};
    }),
  } as unknown as import('#/tui/components/messages/tool-call').ToolCallComponent;
}
