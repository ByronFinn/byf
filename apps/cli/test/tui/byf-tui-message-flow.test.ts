import { mock as bunMock } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ApprovalRequest, ApprovalResponse, Event } from '@byfriends/sdk';
import {
  deleteAllKittyImages,
  resetCapabilitiesCache,
  setCapabilities,
} from '@earendil-works/pi-tui';
import { afterEach, describe, expect, it, vi, afterAll } from 'vitest';

import { ByfTui, type ByfTuiStartupInput, type TUIState } from '#/tui/byf-tui';
import { BtwViewer } from '#/tui/components/dialogs/btw-viewer';
import { ChoicePickerComponent } from '#/tui/components/dialogs/choice-picker';
import { ModelSelectorComponent } from '#/tui/components/dialogs/model-selector';
import type { QueuedMessage } from '#/tui/types';
import type { ImageAttachmentStore } from '#/tui/utils/image-attachment-store';

vi.mock('#/tui/utils/open-url', () => ({ openUrl: vi.fn() }));

function stripSgr(text: string): string {
  return text.replaceAll(/\u001B\[[0-9;]*m/g, '');
}

interface MessageDriver {
  state: TUIState;
  init(): Promise<boolean>;
  handleUserInput(text: string): void;
  handleEvent(event: Event, sendQueued: (item: QueuedMessage) => void): void;
  persistInputHistory(text: string): Promise<void>;
  startSessionEventSubscription(): void;
  getCurrentSessionId(): string;
}

interface FeedbackDriver extends MessageDriver {
  handleFeedbackCommand(): Promise<void>;
  promptFeedbackInput(): Promise<string | undefined>;
}

function makeStartupInput(): ByfTuiStartupInput {
  return {
    cliOptions: {
      session: undefined,
      continue: false,
      yolo: false,

      model: undefined,
      outputFormat: undefined,
      prompt: undefined,
      skillsDirs: [],
    },
    tuiConfig: {
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    },
    version: '0.0.0-test',
    workDir: '/tmp/proj-a',
    resolvedTheme: 'dark',
  };
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ses-1',
    workDir: '/tmp/proj-a',
    model: 'k2',
    summary: { title: null },
    prompt: vi.fn(async () => {}),
    shellExec: vi.fn(async () => ({
      stdout: '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    })),
    steer: vi.fn(async () => {}),
    init: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    cancelCompaction: vi.fn(async () => {}),
    askSide: vi.fn(
      async (_query: string, _options?: { signal?: AbortSignal; queryId?: string }) => ({
        queryId: 'cli-btw-test-qid',
      }),
    ),
    cancelSideQuery: vi.fn(async (_queryId: string) => {}),
    getStatus: vi.fn(async () => ({
      model: 'k2',
      thinkingLevel: 'off',
      permission: 'manual',
      contextTokens: 0,
      maxContextTokens: 100,
      contextUsage: 0,
    })),
    setApprovalHandler: vi.fn(),
    setQuestionHandler: vi.fn(),
    setModel: vi.fn(async () => {}),
    setThinking: vi.fn(async () => {}),
    setPermission: vi.fn(async () => {}),
    onEvent: vi.fn(() => vi.fn()),
    listMcpServers: vi.fn(async () => []),
    listSkills: vi.fn(async () => []),
    getResumeState: vi.fn(() => ({
      sessionMetadata: {},
      agents: {
        main: {
          status: {
            model: 'k2',
            thinkingLevel: 'off',
            permission: 'manual',
            contextTokens: 0,
            maxContextTokens: 100,
            contextUsage: 0,
          },
          context: { history: [] },
          replay: [],
        },
      },
    })),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeHarness(session = makeSession(), overrides: Record<string, unknown> = {}) {
  return {
    getConfig: vi.fn(async () => ({
      models: {
        k2: { model: 'byf-v1', maxContextSize: 100 },
      },
    })),
    setConfig: vi.fn(async () => ({ providers: {} })),
    removeProvider: vi.fn(async () => ({})),
    createSession: vi.fn(async () => session),
    resumeSession: vi.fn(async () => session),
    forkSession: vi.fn(async () => session),
    listSessions: vi.fn(async () => []),
    close: vi.fn(async () => {}),
    track: vi.fn(),
    setTelemetryContext: vi.fn(),
    interactiveAgentId: 'main',
    auth: {
      status: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      getManagedUsage: vi.fn(),
      submitFeedback: vi.fn(
        async (): Promise<
          { kind: 'ok' } | { kind: 'error'; status?: number; message: string }
        > => ({
          kind: 'ok',
        }),
      ),
    },
    ...overrides,
  };
}

async function makeDriver(
  session = makeSession(),
  harnessOverrides: Record<string, unknown> = {},
): Promise<{
  driver: MessageDriver;
  session: ReturnType<typeof makeSession>;
  harness: ReturnType<typeof makeHarness>;
}> {
  const harness = makeHarness(session, harnessOverrides);
  const driver = new ByfTui(harness as never, makeStartupInput()) as unknown as MessageDriver;
  vi.spyOn(driver.state.ui, 'requestRender').mockImplementation(() => {});
  vi.spyOn(driver.state.terminal, 'setProgress').mockImplementation(() => {});
  driver.persistInputHistory = vi.fn(async () => {});
  await driver.init();
  return { driver, session, harness };
}

function renderTranscript(driver: MessageDriver): string {
  return driver.state.transcriptContainer.render(120).join('\n');
}

/**
 * Returns the active BtwViewer mounted as a /btw overlay, or undefined.
 * The overlay lives in the pi-tui overlay stack (not the editor container),
 * so we read it back through the BtwController's internal overlay state.
 */
function getBtwViewer(driver: MessageDriver): BtwViewer | undefined {
  const controller = (
    driver as unknown as { btwController?: { overlay?: { component: BtwViewer } | undefined } }
  ).btwController;
  return controller?.overlay?.component;
}

function expectBtwViewer(driver: MessageDriver): BtwViewer {
  const viewer = getBtwViewer(driver);
  expect(viewer).toBeInstanceOf(BtwViewer);
  return viewer as BtwViewer;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const tempDirs: string[] = [];
const originalByfHome = process.env['BYF_HOME'];
const originalVisual = process.env['VISUAL'];
const originalEditor = process.env['EDITOR'];

async function makeTempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-tui-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  resetCapabilitiesCache();
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
  if (originalByfHome === undefined) {
    delete process.env['BYF_HOME'];
  } else {
    process.env['BYF_HOME'] = originalByfHome;
  }
  if (originalVisual === undefined) {
    delete process.env['VISUAL'];
  } else {
    process.env['VISUAL'] = originalVisual;
  }
  if (originalEditor === undefined) {
    delete process.env['EDITOR'];
  } else {
    process.env['EDITOR'] = originalEditor;
  }
});

describe('ByfTui message flow', () => {
  it('tracks editor shortcut and paste hooks', async () => {
    const { driver, harness } = await makeDriver();
    harness.track.mockClear();

    driver.state.editor.handleInput('\u001B[106;5u');
    driver.state.editor.handleInput('\u001F');
    delete process.env['VISUAL'];
    delete process.env['EDITOR'];
    driver.state.editor.onOpenExternalEditor?.();
    driver.state.editor.onToggleToolExpand?.();
    driver.state.editor.onTextPaste?.();

    expect(harness.track).toHaveBeenCalledWith('shortcut_newline', undefined);
    expect(harness.track).toHaveBeenCalledWith('undo', undefined);
    expect(harness.track).toHaveBeenCalledWith('shortcut_editor', undefined);
    expect(harness.track).toHaveBeenCalledWith('shortcut_expand', undefined);
    expect(harness.track).toHaveBeenCalledWith('shortcut_paste', { kind: 'text' });
  });

  it('tracks /clear as the clear alias for /new', async () => {
    const { driver, harness } = await makeDriver(makeSession({ id: 'ses-1' }));
    const nextSession = makeSession({ id: 'ses-2' });
    harness.createSession.mockResolvedValueOnce(nextSession);
    harness.track.mockClear();

    driver.handleUserInput('/clear');

    await vi.waitFor(() => {
      expect(driver.getCurrentSessionId()).toBe('ses-2');
    });
    expect(harness.track).toHaveBeenCalledWith('input_command', { command: 'new' });
    expect(harness.track).toHaveBeenCalledWith('clear', undefined);
  });

  it('tracks theme changes from slash commands', async () => {
    process.env['BYF_HOME'] = await makeTempHome();
    const { driver, harness } = await makeDriver();
    harness.track.mockClear();

    driver.handleUserInput('/theme light');

    await vi.waitFor(() => {
      expect(driver.state.appState.theme).toBe('light');
    });
    expect(harness.track).toHaveBeenCalledWith('input_command', { command: 'theme' });
    expect(harness.track).toHaveBeenCalledWith('theme_switch', { theme: 'light' });
  });

  it('opens GitHub issues for /feedback', async () => {
    const { driver, harness } = await makeDriver(makeSession(), {
      getConfig: vi.fn(async () => ({
        models: {
          k2: {
            model: 'byf-v1',
            maxContextSize: 100,
            provider: 'test-provider',
          },
        },
      })),
    });
    const feedbackDriver = driver as unknown as FeedbackDriver;
    harness.track.mockClear();

    await feedbackDriver.handleFeedbackCommand();

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('https://github.com/ByronFinn/byf/issues');
    expect(harness.auth.submitFeedback).not.toHaveBeenCalled();
    expect(harness.track).not.toHaveBeenCalledWith('feedback_submitted', undefined);
  });

  it('does not track feedback when the dialog is cancelled', async () => {
    const { driver, harness } = await makeDriver(makeSession(), {
      getConfig: vi.fn(async () => ({
        models: {
          k2: {
            model: 'byf-v1',
            maxContextSize: 100,
            provider: 'test-provider',
          },
        },
      })),
    });
    const feedbackDriver = driver as unknown as FeedbackDriver;
    feedbackDriver.promptFeedbackInput = vi.fn(async () => undefined);
    harness.track.mockClear();

    await feedbackDriver.handleFeedbackCommand();

    expect(harness.auth.submitFeedback).not.toHaveBeenCalled();
    expect(harness.track).not.toHaveBeenCalledWith('feedback_submitted', undefined);
  });

  it('/tasks without an active session shows an error and keeps the main layout', async () => {
    const oauthLoginRequired = Object.assign(new Error('login required'), {
      code: 'auth.login_required',
    });
    const { driver } = await makeDriver(makeSession(), {
      createSession: vi.fn(async () => {
        throw oauthLoginRequired;
      }),
    });
    const rootChildren = [...driver.state.ui.children];

    driver.handleUserInput('/tasks');

    await vi.waitFor(() => {
      expect(stripSgr(renderTranscript(driver))).toContain('No active session.');
      expect(driver.state.ui.children).toEqual(rootChildren);
    });
  });

  it('tracks blocked slash commands as invalid without counting them as executed commands', async () => {
    const { driver, harness } = await makeDriver();
    driver.state.appState.isStreaming = true;

    for (const command of ['/new', '/model', '/sessions']) {
      harness.track.mockClear();

      driver.handleUserInput(command);
      await Promise.resolve();

      expect(harness.track).toHaveBeenCalledWith('input_command_invalid', {
        reason: 'blocked',
        command: command.slice(1),
      });
      expect(harness.track).not.toHaveBeenCalledWith('input_command', {
        command: command.slice(1),
      });
    }
  });

  it('routes /yolo through session permission state without app-layer telemetry duplication', async () => {
    const { driver, session, harness } = await makeDriver();
    harness.track.mockClear();

    driver.handleUserInput('/yolo on');

    await vi.waitFor(() => {
      expect(session.setPermission).toHaveBeenCalledWith('yolo');
    });
    expect(driver.state.appState).toMatchObject({
      yolo: true,
      permissionMode: 'yolo',
    });
    expect(harness.track).toHaveBeenCalledWith('input_command', { command: 'yolo' });
    expect(harness.track).not.toHaveBeenCalledWith('yolo_toggle', expect.anything());
  });

  describe('/btw side query', () => {
    it('opens a BtwViewer overlay and asks the side query', async () => {
      const { driver, session, harness } = await makeDriver();
      harness.track.mockClear();

      driver.handleUserInput('/btw where is the config?');

      await vi.waitFor(() => {
        expect(session.askSide).toHaveBeenCalledWith(
          'where is the config?',
          expect.objectContaining({ queryId: expect.stringMatching(/^cli-btw-/) }),
        );
      });
      expect(getBtwViewer(driver)).toBeInstanceOf(BtwViewer);
      expect(driver.state.ui.hasOverlay()).toBe(true);
      expect(harness.track).toHaveBeenCalledWith('input_command', { command: 'btw' });
    });

    it('shows a usage error when /btw has no args', async () => {
      const { driver, session, harness } = await makeDriver();
      harness.track.mockClear();

      driver.handleUserInput('/btw');

      await vi.waitFor(() => {
        expect(session.askSide).not.toHaveBeenCalled();
      });
      const transcript = renderTranscript(driver);
      expect(stripSgr(transcript)).toContain('Usage: /btw <question>');
      // The command is still recorded as dispatched; only the network request is skipped.
      expect(harness.track).toHaveBeenCalledWith('input_command', { command: 'btw' });
    });

    it('streams side-query deltas into the overlay', async () => {
      const { driver, session, harness } = await makeDriver();
      harness.track.mockClear();

      driver.handleUserInput('/btw where is the config?');

      await vi.waitFor(() => {
        expect(getBtwViewer(driver)).toBeInstanceOf(BtwViewer);
      });

      const queryId = (session.askSide.mock.calls[0]![1] as unknown as { queryId: string }).queryId;
      driver.handleEvent(
        {
          type: 'btw.started',
          sessionId: 'ses-1',
          agentId: 'main',
          queryId,
        },
        vi.fn(),
      );
      driver.handleEvent(
        {
          type: 'btw.delta',
          sessionId: 'ses-1',
          agentId: 'main',
          queryId,
          delta: 'config/',
        },
        vi.fn(),
      );
      driver.handleEvent(
        {
          type: 'btw.delta',
          sessionId: 'ses-1',
          agentId: 'main',
          queryId,
          delta: 'runtime.toml',
        },
        vi.fn(),
      );
      driver.handleEvent(
        {
          type: 'btw.completed',
          sessionId: 'ses-1',
          agentId: 'main',
          queryId,
          text: 'config/runtime.toml',
          usage: {
            inputCacheRead: 0,
            inputCacheCreation: 0,
            inputOther: 5,
            output: 6,
          },
        },
        vi.fn(),
      );

      const viewer = expectBtwViewer(driver);
      const out = stripSgr(viewer.render(80).join('\n'));
      expect(out).toContain('A: config/runtime.toml');
      expect(out).toContain('done');
    });

    it('ignores btw events for a different queryId', async () => {
      const { driver, session } = await makeDriver();

      driver.handleUserInput('/btw where is the config?');

      await vi.waitFor(() => {
        expect(getBtwViewer(driver)).toBeInstanceOf(BtwViewer);
      });

      const queryId = (session.askSide.mock.calls[0]![1] as unknown as { queryId: string }).queryId;
      driver.handleEvent(
        {
          type: 'btw.delta',
          sessionId: 'ses-1',
          agentId: 'main',
          queryId: 'other-qid',
          delta: 'wrong',
        },
        vi.fn(),
      );
      driver.handleEvent(
        {
          type: 'btw.delta',
          sessionId: 'ses-1',
          agentId: 'main',
          queryId,
          delta: 'right',
        },
        vi.fn(),
      );

      const viewer = expectBtwViewer(driver);
      const out = stripSgr(viewer.render(80).join('\n'));
      expect(out).toContain('A: right');
      expect(out).not.toContain('wrong');
    });

    it('closes the overlay and cancels the side query', async () => {
      const { driver, session, harness } = await makeDriver();
      harness.track.mockClear();

      driver.handleUserInput('/btw where is the config?');

      await vi.waitFor(() => {
        expect(getBtwViewer(driver)).toBeInstanceOf(BtwViewer);
      });

      const queryId = (session.askSide.mock.calls[0]![1] as unknown as { queryId: string }).queryId;
      const viewer = expectBtwViewer(driver);
      viewer.handleInput('\u001B');

      expect(session.cancelSideQuery).toHaveBeenCalledWith(queryId);
      expect(getBtwViewer(driver)).toBeUndefined();
      expect(driver.state.ui.hasOverlay()).toBe(false);
    });

    it('hides the btw overlay while an approval panel is shown, then restores it', async () => {
      const { driver } = await makeDriver();

      driver.handleUserInput('/btw where is the config?');
      await vi.waitFor(() => {
        expect(getBtwViewer(driver)).toBeInstanceOf(BtwViewer);
      });

      const overlay = (
        driver as unknown as { btwController: { overlay: { handle: { isHidden: () => boolean } } } }
      ).btwController.overlay;

      // An approval arrives while the btw overlay is open → it must hide.
      // showApprovalPanel is driven directly (the session mock bypasses the
      // approval handler wiring) to assert the hide/restore wiring around btw.
      const approvalData = {
        id: 'ap-1',
        tool_call_id: 'tc-1',
        tool_name: 'Bash',
        action: 'run command',
        description: '',
        display: [],
        choices: [],
      };
      const internal = driver as unknown as {
        showApprovalPanel(data: typeof approvalData): void;
        hideApprovalPanel(): void;
      };
      internal.showApprovalPanel(approvalData);
      expect(overlay.handle.isHidden()).toBe(true);

      // Resolving the approval must bring the btw overlay back.
      internal.hideApprovalPanel();
      expect(overlay.handle.isHidden()).toBe(false);
    });

    it('hides the btw overlay while a question dialog is shown, then restores it', async () => {
      const { driver } = await makeDriver();

      driver.handleUserInput('/btw where is the config?');
      await vi.waitFor(() => {
        expect(getBtwViewer(driver)).toBeInstanceOf(BtwViewer);
      });

      const overlay = (
        driver as unknown as { btwController: { overlay: { handle: { isHidden: () => boolean } } } }
      ).btwController.overlay;
      const internal = driver as unknown as {
        showQuestionDialog(data: unknown): void;
        hideQuestionDialog(): void;
      };

      const questionData = {
        id: 'q-1',
        tool_call_id: 'tc-q',
        questions: [
          {
            question: 'continue?',
            multi_select: false,
            options: [{ label: 'yes' }],
          },
        ],
      };
      internal.showQuestionDialog(questionData);
      expect(overlay.handle.isHidden()).toBe(true);

      internal.hideQuestionDialog();
      expect(overlay.handle.isHidden()).toBe(false);
    });

    it('reports during_streaming and token usage in telemetry when completed', async () => {
      const { driver, session, harness } = await makeDriver();
      harness.track.mockClear();

      driver.state.appState.isStreaming = true;
      driver.handleUserInput('/btw quick one');

      await vi.waitFor(() => {
        expect(session.askSide).toHaveBeenCalled();
      });

      const queryId = (session.askSide.mock.calls[0]![1] as unknown as { queryId: string }).queryId;
      driver.handleEvent(
        {
          type: 'btw.completed',
          sessionId: 'ses-1',
          agentId: 'main',
          queryId,
          text: 'answer',
          usage: {
            inputCacheRead: 1,
            inputCacheCreation: 2,
            inputOther: 3,
            output: 4,
          },
        },
        vi.fn(),
      );

      await vi.waitFor(() => {
        expect(harness.track).toHaveBeenCalledWith(
          'btw_query',
          expect.objectContaining({
            during_streaming: true,
            input_cache_read: 1,
            input_cache_creation: 2,
            input_other: 3,
            output: 4,
          }),
        );
      });
    });
  });

  it('hydrates MCP server status after subscribing to session events', async () => {
    const session = makeSession({
      listMcpServers: vi.fn(async () => [
        {
          name: 'local-tools',
          transport: 'stdio',
          status: 'connected',
          toolCount: 2,
        },
        {
          name: 'remote-tools',
          transport: 'http',
          status: 'failed',
          toolCount: 0,
          error: 'connection refused',
        },
      ]),
    });
    const { driver } = await makeDriver(session);

    driver.startSessionEventSubscription();
    await Promise.resolve();

    expect(session.onEvent).toHaveBeenCalledOnce();
    expect(session.listMcpServers).toHaveBeenCalledOnce();
    const subscribeOrder = session.onEvent.mock.invocationCallOrder[0];
    const snapshotOrder = session.listMcpServers.mock.invocationCallOrder[0];
    if (subscribeOrder === undefined || snapshotOrder === undefined) {
      throw new Error('Expected MCP status sync to subscribe and fetch a snapshot.');
    }
    expect(subscribeOrder).toBeLessThan(snapshotOrder);
    const transcript = renderTranscript(driver);
    expect(transcript).toContain('MCP server "local-tools" connected');
    expect(transcript).toContain('2 tools (stdio)');
    expect(transcript).toContain('MCP server "remote-tools" failed: connection refused');
  });

  it('deduplicates identical MCP status updates while allowing reconnect transitions', async () => {
    const eventListeners: Array<(event: Event) => void> = [];
    const connectedServer = {
      name: 'local-tools',
      transport: 'stdio',
      status: 'connected',
      toolCount: 2,
    };
    const session = makeSession({
      onEvent: vi.fn((listener: (event: Event) => void) => {
        eventListeners.push(listener);
        return vi.fn();
      }),
      listMcpServers: vi.fn(async () => [connectedServer]),
    });
    const { driver } = await makeDriver(session);

    driver.startSessionEventSubscription();
    await Promise.resolve();
    eventListeners[0]?.({
      type: 'mcp.server.status',
      agentId: 'main',
      sessionId: 'ses-1',
      server: connectedServer,
    } as Event);

    expect(countOccurrences(renderTranscript(driver), 'MCP server "local-tools" connected')).toBe(
      1,
    );

    eventListeners[0]?.({
      type: 'mcp.server.status',
      agentId: 'main',
      sessionId: 'ses-1',
      server: {
        ...connectedServer,
        status: 'pending',
        toolCount: 0,
      },
    } as Event);
    eventListeners[0]?.({
      type: 'mcp.server.status',
      agentId: 'main',
      sessionId: 'ses-1',
      server: connectedServer,
    } as Event);

    expect(countOccurrences(renderTranscript(driver), 'MCP server "local-tools" connected')).toBe(
      2,
    );
  });

  it('does not let a late MCP snapshot overwrite a live status event', async () => {
    const eventListeners: Array<(event: Event) => void> = [];
    let resolveSnapshot: (
      servers: Array<{
        name: string;
        transport: 'stdio' | 'http';
        status: 'pending' | 'connected' | 'failed' | 'disabled';
        toolCount: number;
        error?: string;
      }>,
    ) => void = () => {};
    const snapshot = new Promise((resolve) => {
      resolveSnapshot = resolve;
    });
    const session = makeSession({
      onEvent: vi.fn((listener: (event: Event) => void) => {
        eventListeners.push(listener);
        return vi.fn();
      }),
      listMcpServers: vi.fn(() => snapshot),
    });
    const { driver } = await makeDriver(session);

    driver.startSessionEventSubscription();
    eventListeners[0]?.({
      type: 'mcp.server.status',
      agentId: 'main',
      sessionId: 'ses-1',
      server: {
        name: 'local-tools',
        transport: 'stdio',
        status: 'connected',
        toolCount: 2,
      },
    } as Event);
    resolveSnapshot([
      {
        name: 'local-tools',
        transport: 'stdio',
        status: 'failed',
        toolCount: 0,
        error: 'stale failure',
      },
    ]);
    await Promise.resolve();

    const transcript = renderTranscript(driver);
    expect(transcript).toContain('MCP server "local-tools" connected');
    expect(transcript).not.toContain('stale failure');
  });

  it('sends normal editor input to the active session and marks the turn as waiting', async () => {
    const { driver, session } = await makeDriver();

    driver.handleUserInput('hello');

    expect(session.prompt).toHaveBeenCalledWith('hello');
    expect(driver.state.appState.isStreaming).toBe(true);
    expect(driver.state.appState.streamingPhase).toBe('waiting');
    expect(driver.state.livePane.mode).toBe('waiting');
    expect(driver.state.transcriptEntries).toEqual([
      expect.objectContaining({
        kind: 'user',
        content: 'hello',
      }),
    ]);
  });

  it('sends pasted image placeholders as image content parts', async () => {
    const { driver, session } = await makeDriver();
    const imageStore = (driver as unknown as { imageStore: ImageAttachmentStore }).imageStore;
    const attachment = imageStore.addImage(new Uint8Array([0xaa, 0xbb]), 'image/png', 1, 1);

    driver.handleUserInput(`describe ${attachment.placeholder}`);

    expect(session.prompt).toHaveBeenCalledWith([
      { type: 'text', text: 'describe ' },
      { type: 'image_url', imageUrl: { url: 'data:image/png;base64,qrs=' } },
    ]);
    expect(driver.state.transcriptEntries).toEqual([
      expect.objectContaining({
        kind: 'user',
        content: `describe ${attachment.placeholder}`,
        imageAttachmentIds: [attachment.id],
      }),
    ]);
  });

  it('queues editor input instead of prompting while a turn is already streaming', async () => {
    const { driver, session, harness } = await makeDriver();
    driver.state.appState.isStreaming = true;
    harness.track.mockClear();

    driver.handleUserInput('queued message');

    expect(session.prompt).not.toHaveBeenCalled();
    expect(driver.state.queuedMessages).toEqual([{ text: 'queued message', agentId: 'main' }]);
    expect(driver.state.queueContainer.children.length).toBeGreaterThan(0);
    expect(harness.track).toHaveBeenCalledWith('input_queue', undefined);
  });

  it('routes ! commands to shell execution before slash-command dispatch and renders output', async () => {
    const shellExec = vi.fn(async () => ({
      stdout: 'hi\n',
      stderr: '',
      exitCode: 0,
      timedOut: false,
    }));
    const session = makeSession({ shellExec, workDir: '/tmp/shell-session' });
    const { driver } = await makeDriver(session);

    driver.handleUserInput('! echo hi');

    await vi.waitFor(() => {
      expect(shellExec).toHaveBeenCalledWith('echo hi', { cwd: '/tmp/shell-session' });
    });
    expect(session.prompt).not.toHaveBeenCalled();
    expect(driver.persistInputHistory).toHaveBeenCalledWith('! echo hi');
    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('$ echo hi');
    expect(transcript).toContain('hi');
  });

  it('updates shell cwd after successful `! cd` and uses it for subsequent shell commands', async () => {
    const shellExec = vi.fn(async (command: string, options?: { cwd?: string }) => {
      if (command === 'pwd' && options?.cwd === '/tmp') {
        return {
          stdout: '/tmp\n',
          stderr: '',
          exitCode: 0,
          timedOut: false,
        };
      }
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      };
    });
    const session = makeSession({ shellExec, workDir: '/tmp/proj-a' });
    const { driver } = await makeDriver(session);

    driver.handleUserInput('! cd ..');
    await vi.waitFor(() => {
      expect(shellExec).toHaveBeenCalledWith('cd ..', { cwd: '/tmp/proj-a' });
    });
    await vi.waitFor(() => {
      expect(shellExec).toHaveBeenCalledWith('pwd', { cwd: '/tmp' });
    });
    expect(driver.state.appState.shellWorkDir).toBe('/tmp');

    driver.handleUserInput('! pwd');
    await vi.waitFor(() => {
      expect(shellExec).toHaveBeenCalledWith('pwd', { cwd: '/tmp' });
    });
  });

  it('updates shell cwd after successful `! cd "a b"` and uses it for subsequent shell commands', async () => {
    const shellExec = vi.fn(async (command: string, options?: { cwd?: string }) => {
      if (command === 'pwd' && options?.cwd === '/tmp/proj-a/a b') {
        return {
          stdout: '/tmp/proj-a/a b\n',
          stderr: '',
          exitCode: 0,
          timedOut: false,
        };
      }
      if (command === 'pwd') {
        return {
          stdout: '',
          stderr: 'missing',
          exitCode: 1,
          timedOut: false,
        };
      }
      return {
        stdout: '',
        stderr: '',
        exitCode: 0,
        timedOut: false,
      };
    });
    const session = makeSession({ shellExec, workDir: '/tmp/proj-a' });
    const { driver } = await makeDriver(session);

    driver.handleUserInput('! cd "a b"');
    await vi.waitFor(() => {
      expect(shellExec).toHaveBeenCalledWith('cd "a b"', { cwd: '/tmp/proj-a' });
    });
    await vi.waitFor(() => {
      expect(shellExec).toHaveBeenCalledWith('pwd', { cwd: '/tmp/proj-a/a b' });
    });
    expect(driver.state.appState.shellWorkDir).toBe('/tmp/proj-a/a b');

    driver.handleUserInput('! pwd');
    await vi.waitFor(() => {
      expect(shellExec).toHaveBeenCalledWith('pwd', { cwd: '/tmp/proj-a/a b' });
    });
  });

  it('rejects ! commands while replaying session history', async () => {
    const session = makeSession();
    const { driver } = await makeDriver(session);
    driver.state.appState.isReplaying = true;

    driver.handleUserInput('! ls -la');

    expect(session.shellExec).not.toHaveBeenCalled();
    expect(driver.state.transcriptContainer.render(120).join('\n')).toContain(
      'Cannot execute shell commands while session history is replaying.',
    );
  });

  it('cancels active streaming from Escape and Ctrl-C editor shortcuts', async () => {
    const { driver, session } = await makeDriver();

    driver.state.appState.isStreaming = true;
    driver.state.editor.onEscape?.();

    expect(session.cancel).toHaveBeenCalledTimes(1);

    session.cancel.mockClear();
    driver.state.appState.isStreaming = true;
    driver.state.editor.onCtrlC?.();

    expect(session.cancel).toHaveBeenCalledTimes(1);
  });

  it('dispatches the next queued message after the active turn ends', async () => {
    vi.useFakeTimers();
    try {
      const { driver } = await makeDriver();
      const sendQueued = vi.fn();
      driver.state.appState.isStreaming = true;
      driver.state.appState.streamingStartTime = 1;
      driver.state.currentTurnId = '1';
      driver.state.queuedMessages = [{ text: 'next' }];

      driver.handleEvent(
        {
          type: 'turn.ended',
          agentId: 'main',
          sessionId: 'ses-1',
          turnId: 1,
          reason: 'completed',
        } as Event,
        sendQueued,
      );
      await vi.runAllTimersAsync();

      expect(sendQueued).toHaveBeenCalledWith({ text: 'next' });
      expect(driver.state.queuedMessages).toEqual([]);
      expect(driver.state.appState.isStreaming).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces assistant delta component updates', async () => {
    vi.useFakeTimers();
    try {
      const { driver } = await makeDriver();
      vi.mocked(driver.state.ui.requestRender).mockClear();

      driver.handleEvent(
        {
          type: 'assistant.delta',
          agentId: 'main',
          sessionId: 'ses-1',
          turnId: 1,
          delta: 'a',
        } as Event,
        vi.fn(),
      );
      const component = driver.state.streamingComponent;
      if (component === undefined) throw new Error('expected streaming component');
      const updateSpy = vi.spyOn(component, 'updateContent');

      driver.handleEvent(
        {
          type: 'assistant.delta',
          agentId: 'main',
          sessionId: 'ses-1',
          turnId: 1,
          delta: 'b',
        } as Event,
        vi.fn(),
      );
      driver.handleEvent(
        {
          type: 'assistant.delta',
          agentId: 'main',
          sessionId: 'ses-1',
          turnId: 1,
          delta: 'c',
        } as Event,
        vi.fn(),
      );

      expect(updateSpy).not.toHaveBeenCalled();
      await vi.runOnlyPendingTimersAsync();

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy).toHaveBeenLastCalledWith('abc');
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes pending assistant deltas before turn completion', async () => {
    vi.useFakeTimers();
    try {
      const { driver } = await makeDriver();
      const sendQueued = vi.fn();
      driver.state.appState.isStreaming = true;

      driver.handleEvent(
        {
          type: 'assistant.delta',
          agentId: 'main',
          sessionId: 'ses-1',
          turnId: 1,
          delta: 'done',
        } as Event,
        sendQueued,
      );
      driver.handleEvent(
        {
          type: 'turn.ended',
          agentId: 'main',
          sessionId: 'ses-1',
          turnId: 1,
          reason: 'completed',
        } as Event,
        sendQueued,
      );

      expect(stripSgr(renderTranscript(driver))).toContain('done');
    } finally {
      vi.useRealTimers();
    }
  });

  it('coalesces streaming tool-call argument preview updates', async () => {
    vi.useFakeTimers();
    try {
      const { driver } = await makeDriver();
      driver.state.currentTurnId = '1';
      driver.state.currentStep = 1;

      driver.handleEvent(
        {
          type: 'tool.call.delta',
          agentId: 'main',
          sessionId: 'ses-1',
          turnId: 1,
          toolCallId: 'call_bash',
          name: 'Bash',
          argumentsPart: '{"command":"echo hi"}',
        } as Event,
        vi.fn(),
      );

      expect(driver.state.pendingToolComponents.has('call_bash')).toBe(false);
      expect(driver.state.activeToolCalls.has('call_bash')).toBe(false);

      await vi.runOnlyPendingTimersAsync();

      expect(driver.state.pendingToolComponents.has('call_bash')).toBe(true);
      expect(driver.state.activeToolCalls.get('call_bash')?.args).toMatchObject({
        command: 'echo hi',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels manual compaction from the editor', async () => {
    const { driver, session } = await makeDriver();
    driver.handleEvent(
      {
        type: 'compaction.started',
        agentId: 'main',
        sessionId: 'ses-1',
        trigger: 'manual',
      } as Event,
      vi.fn(),
    );

    driver.state.editor.onEscape?.();

    expect(session.cancelCompaction).toHaveBeenCalledTimes(1);

    session.cancelCompaction.mockClear();
    driver.state.appState.isCompacting = true;
    driver.state.editor.onCtrlC?.();

    expect(session.cancelCompaction).toHaveBeenCalledTimes(1);
  });

  it('dispatches the next queued message after compaction is cancelled', async () => {
    vi.useFakeTimers();
    try {
      const { driver } = await makeDriver();
      const sendQueued = vi.fn();
      driver.handleEvent(
        {
          type: 'compaction.started',
          agentId: 'main',
          sessionId: 'ses-1',
          trigger: 'manual',
        } as Event,
        sendQueued,
      );
      driver.state.queuedMessages = [{ text: 'next' }];

      driver.handleEvent(
        {
          type: 'compaction.cancelled',
          agentId: 'main',
          sessionId: 'ses-1',
        } as Event,
        sendQueued,
      );
      await vi.runAllTimersAsync();

      expect(driver.state.appState.isCompacting).toBe(false);
      expect(driver.state.appState.streamingPhase).toBe('idle');
      expect(driver.state.queuedMessages).toEqual([]);
      expect(sendQueued).toHaveBeenCalledWith({ text: 'next' });
      expect(driver.state.transcriptContainer.render(120).map(stripSgr).join('\n')).toContain(
        'Compaction cancelled',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders an error instead of prompting when no model is selected', async () => {
    const { driver, session } = await makeDriver();
    driver.state.appState.model = '';

    driver.handleUserInput('hello');

    expect(session.prompt).not.toHaveBeenCalled();
    expect(driver.state.transcriptContainer.render(120).join('\n')).toContain('LLM not set');
  });

  it('dispatches /init to the active session and clears busy state after completion', async () => {
    let resolveInit: (() => void) | undefined;
    const session = makeSession({
      init: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveInit = resolve;
          }),
      ),
    });
    const { driver, harness } = await makeDriver(session);
    harness.track.mockClear();

    driver.handleUserInput('/init');

    await vi.waitFor(() => {
      expect(session.init).toHaveBeenCalledTimes(1);
    });
    expect(session.prompt).not.toHaveBeenCalled();
    expect(driver.state.appState.isStreaming).toBe(true);
    expect(driver.state.livePane.mode).toBe('waiting');

    resolveInit?.();

    await vi.waitFor(() => {
      expect(driver.state.appState.isStreaming).toBe(false);
    });
    expect(driver.state.livePane.mode).toBe('idle');
    expect(harness.track).toHaveBeenCalledWith('init_complete', undefined);
  });

  it('queues Ctrl-S input instead of steering while /init is running', async () => {
    let resolveInit: (() => void) | undefined;
    const session = makeSession({
      init: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveInit = resolve;
          }),
      ),
    });
    const { driver } = await makeDriver(session);

    driver.handleUserInput('/init');
    await vi.waitFor(() => {
      expect(session.init).toHaveBeenCalledTimes(1);
    });

    driver.state.editor.setText('apply after init');
    driver.state.editor.onCtrlS?.();

    expect(session.steer).not.toHaveBeenCalled();
    expect(driver.state.queuedMessages).toEqual([{ text: 'apply after init', agentId: 'main' }]);
    expect(stripSgr(driver.state.queueContainer.render(120).join('\n'))).not.toContain(
      'ctrl-s to steer immediately',
    );

    resolveInit?.();

    await vi.waitFor(() => {
      expect(session.prompt).toHaveBeenCalledWith('apply after init');
    });
    expect(driver.state.queuedMessages).toEqual([]);
  });

  it('cancels the active /init request through the session', async () => {
    let resolveInit: (() => void) | undefined;
    const session = makeSession({
      init: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveInit = resolve;
          }),
      ),
    });
    const { driver } = await makeDriver(session);

    driver.handleUserInput('/init');
    await vi.waitFor(() => {
      expect(session.init).toHaveBeenCalledTimes(1);
    });

    driver.state.editor.onEscape?.();

    await vi.waitFor(() => {
      expect(session.cancel).toHaveBeenCalledTimes(1);
    });

    resolveInit?.();
  });

  it('/login opens provider setup', async () => {
    const { driver } = await makeDriver();
    driver.handleUserInput('/login');
    await Promise.resolve();
    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript, '/login should not say "Unknown slash command"').not.toContain(
      'Unknown slash command',
    );
    expect(transcript, '/login should not say "removed"').not.toContain('removed');
  });

  it('/logout opens provider selector with configured providers', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'key-oai' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
          'gpt-4o': { provider: 'openai', model: 'gpt-4o', maxContextSize: 128000 },
        },
        defaultModel: 'gpt-4o',
      })),
    });
    const { driver } = await makeDriver(session, harness);

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    const output = stripSgr(picker.render(120).join('\n'));
    expect(output).toContain('deepseek');
    expect(output).toContain('openai');
    expect(output).toContain('openai ← current');
  });

  it('/logout with no configured providers shows error', async () => {
    const { driver } = await makeDriver();

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const transcript = stripSgr(renderTranscript(driver));
      expect(transcript).toContain('No providers configured');
      expect(transcript).toContain('/login');
      expect(transcript).toContain('/connect');
    });
  });

  it('/logout selecting a provider removes it and its models', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'key-oai' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
          'gpt-4o': { provider: 'openai', model: 'gpt-4o', maxContextSize: 128000 },
        },
        defaultModel: 'gpt-4o',
      })),
      removeProvider: vi.fn(async () => ({})),
      setConfig: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    // List is sorted alphabetically: deepseek, openai
    // defaultModel is gpt-4o (openai), so openai is highlighted at index 1
    // Navigate up to deepseek (index 0)
    picker.handleInput('\u001B[A');
    picker.handleInput('\r');

    await vi.waitFor(() => {
      expect(harness.removeProvider).toHaveBeenCalledWith('deepseek');
    });
    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('Provider "deepseek" removed');
  });

  it('/logout clears appState.model when active model is removed', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
        },
        defaultModel: 'deepseek-chat',
      })),
      removeProvider: vi.fn(async () => ({})),
      setConfig: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);

    // Simulate active session model belonging to deepseek
    driver.state.appState.model = 'deepseek-chat';

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    picker.handleInput('\r');

    await vi.waitFor(() => {
      const transcript = stripSgr(renderTranscript(driver));
      expect(transcript).toContain('Provider "deepseek" removed');
      expect(transcript).toContain('No active model');
      expect(transcript).toContain('/login');
    });
  });

  it('/logout preserves other providers and models', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'key-oai' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
          'gpt-4o': { provider: 'openai', model: 'gpt-4o', maxContextSize: 128000 },
        },
        defaultModel: 'gpt-4o',
      })),
      removeProvider: vi.fn(async (id: string) => {
        const config: {
          providers?: Record<string, unknown>;
          models: Record<string, { provider?: string; model: string; maxContextSize: number }>;
        } = await harness.getConfig();
        if (config.providers) delete config.providers[id];
        for (const [key, model] of Object.entries(config.models)) {
          if (model.provider === id) delete config.models[key];
        }
        return config;
      }),
      setConfig: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    // Navigate to deepseek (index 0, default is openai at index 1)
    picker.handleInput('\u001B[A');
    picker.handleInput('\r');

    await vi.waitFor(() => {
      expect(harness.removeProvider).toHaveBeenCalledWith('deepseek');
    });
    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('Provider "deepseek" removed');
    expect(transcript).not.toContain('No active model');
  });

  it('/disconnect alias opens selector and removes provider like /logout', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
        },
      })),
      removeProvider: vi.fn(async () => ({})),
      setConfig: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);

    driver.handleUserInput('/disconnect');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    picker.handleInput('\r');

    await vi.waitFor(() => {
      expect(harness.removeProvider).toHaveBeenCalledWith('deepseek');
    });
    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('Provider "deepseek" removed');
  });

  it('/logout removes active model provider even when defaultModel differs', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'key-oai' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
          'gpt-4o': { provider: 'openai', model: 'gpt-4o', maxContextSize: 128000 },
        },
        defaultModel: 'gpt-4o',
      })),
      removeProvider: vi.fn(async () => ({})),
      setConfig: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);

    // Active session uses deepseek-chat while defaultModel is gpt-4o (openai)
    driver.state.appState.model = 'deepseek-chat';

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    // Navigate to deepseek (index 0, default highlight is openai at index 1)
    picker.handleInput('\u001B[A');
    picker.handleInput('\r');

    await vi.waitFor(() => {
      const transcript = stripSgr(renderTranscript(driver));
      expect(transcript).toContain('Provider "deepseek" removed');
      expect(transcript).toContain('No active model');
    });
  });

  it('/logout clears appState.model when active provider is removed', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
        },
        defaultModel: 'deepseek-chat',
      })),
      removeProvider: vi.fn(async () => ({})),
      setConfig: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);

    // Active model belongs to deepseek
    driver.state.appState.model = 'deepseek-chat';
    expect(driver.state.appState.model).toBeTruthy();

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    picker.handleInput('\r');

    await vi.waitFor(() => {
      expect(driver.state.appState.model).toBe('');
    });
  });

  it('/logout cancelling with Escape makes no state changes', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
        },
        defaultModel: 'deepseek-chat',
      })),
      removeProvider: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);
    driver.state.appState.model = 'deepseek-chat';

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    picker.handleInput('\u001B'); // Escape

    await vi.waitFor(() => {
      expect(driver.state.editorContainer.children[0]).not.toBeInstanceOf(ChoicePickerComponent);
    });

    expect(harness.removeProvider).not.toHaveBeenCalled();
    expect(driver.state.appState.model).toBe('deepseek-chat');
  });

  it('/logout removing non-active provider preserves appState.model', async () => {
    const session = makeSession();
    const harness = makeHarness(session, {
      getConfig: vi.fn(async () => ({
        providers: {
          deepseek: { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'key-ds' },
          openai: { baseUrl: 'https://api.openai.com/v1', apiKey: 'key-oai' },
        },
        models: {
          'deepseek-chat': { provider: 'deepseek', model: 'deepseek-chat', maxContextSize: 64000 },
          'gpt-4o': { provider: 'openai', model: 'gpt-4o', maxContextSize: 128000 },
        },
        defaultModel: 'gpt-4o',
      })),
      removeProvider: vi.fn(async () => ({})),
      setConfig: vi.fn(async () => ({})),
    });
    const { driver } = await makeDriver(session, harness);

    // Active session uses deepseek-chat; defaultModel is gpt-4o (openai)
    driver.state.appState.model = 'deepseek-chat';

    driver.handleUserInput('/logout');

    await vi.waitFor(() => {
      const picker = driver.state.editorContainer.children[0];
      expect(picker).toBeInstanceOf(ChoicePickerComponent);
    });

    const picker = driver.state.editorContainer.children[0] as ChoicePickerComponent;
    // defaultModel is gpt-4o (openai), so openai is highlighted at index 1
    // Press Enter to select openai — this is NOT the active model's provider
    picker.handleInput('\r');

    await vi.waitFor(() => {
      expect(harness.removeProvider).toHaveBeenCalledWith('openai');
    });

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('Provider "openai" removed');
    expect(transcript).not.toContain('No active model');
  });

  it('does not run /init when no model is selected', async () => {
    const { driver, session } = await makeDriver();
    driver.state.appState.model = '';

    driver.handleUserInput('/init');

    expect(session.init).not.toHaveBeenCalled();
    expect(driver.state.transcriptContainer.render(120).join('\n')).toContain('LLM not set');
  });

  it('shows /login and /connect in model picker when no models are configured', async () => {
    const { driver } = await makeDriver();
    driver.state.appState.availableModels = {};

    driver.handleUserInput('/model');

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('No models configured');
    expect(transcript).toContain('/login');
    expect(transcript).toContain('/connect');
  });

  it('shows the login prompt for auth.login_required session errors', async () => {
    const { driver } = await makeDriver();

    driver.handleEvent(
      {
        type: 'error',
        agentId: 'main',
        sessionId: 'ses-1',
        code: 'auth.login_required',
        message: 'OAuth provider credentials were rejected.',
        retryable: false,
      } as Event,
      vi.fn(),
    );

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain(
      'Authentication required. Use /login or /connect to configure a provider.',
    );
    expect(transcript).not.toContain('[auth.login_required]');
    expect(transcript).not.toContain('byf export');
  });

  it('appends the byf export hint beneath session error messages', async () => {
    const { driver } = await makeDriver();

    driver.handleEvent(
      {
        type: 'error',
        agentId: 'main',
        sessionId: 'ses-1',
        code: 'compaction.failed',
        message:
          "APIStatusError: 400 the message at position 82 with role 'assistant' must not be empty",
        retryable: false,
      } as Event,
      vi.fn(),
    );

    const transcript = stripSgr(driver.state.transcriptContainer.render(200).join('\n'));
    expect(transcript).toContain('Error: [compaction.failed]');
    expect(transcript).toContain('If this persists, run `byf export ses-1`');
    expect(transcript).toContain("Please don't share it publicly");
  });

  it('skips the byf export hint when no active session id is set', async () => {
    const { driver } = await makeDriver();
    driver.state.appState.sessionId = '';

    driver.handleEvent(
      {
        type: 'error',
        agentId: 'main',
        sessionId: '',
        code: 'compaction.failed',
        message: 'boom',
        retryable: false,
      } as Event,
      vi.fn(),
    );

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('Error: [compaction.failed]');
    expect(transcript).not.toContain('byf export');
  });

  it('renders /status using the active session runtime status', async () => {
    const session = makeSession({
      getStatus: vi.fn(async () => ({
        model: 'k2',
        thinkingLevel: 'high',
        permission: 'auto',
        contextTokens: 25,
        maxContextTokens: 100,
        contextUsage: 0.25,
      })),
    });
    const { driver } = await makeDriver(session);
    const getStatus = vi.mocked(session.getStatus);
    const previousStatusCalls = getStatus.mock.calls.length;

    driver.handleUserInput('/status');

    await vi.waitFor(() => {
      expect(getStatus).toHaveBeenCalledTimes(previousStatusCalls + 1);
      const output = stripSgr(driver.state.transcriptContainer.render(120).join('\n'));
      expect(output).toContain(' Status ');
      expect(output).toContain('>_ BYF');
      expect(output).toContain('Model');
      expect(output).toContain('thinking on');
      expect(output).toContain('Permissions  auto');
      expect(output).toContain('Context window');
      expect(output).toContain('25.0%');
    });
  });

  it('renders /mcp using a fresh MCP server snapshot', async () => {
    const session = makeSession({
      listMcpServers: vi.fn(async () => [
        {
          name: 'local-tools',
          transport: 'stdio',
          status: 'connected',
          toolCount: 2,
        },
        {
          name: 'remote-tools',
          transport: 'http',
          status: 'failed',
          toolCount: 0,
          error: 'connection refused',
        },
        {
          name: 'linear',
          transport: 'http',
          status: 'needs-auth',
          toolCount: 0,
        },
        {
          name: 'disabled-tools',
          transport: 'stdio',
          status: 'disabled',
          toolCount: 0,
        },
      ]),
    });
    const { driver } = await makeDriver(session);
    const listMcpServers = vi.mocked(session.listMcpServers);
    const previousCalls = listMcpServers.mock.calls.length;

    driver.handleUserInput('/mcp');

    await vi.waitFor(() => {
      expect(listMcpServers).toHaveBeenCalledTimes(previousCalls + 1);
      const output = stripSgr(driver.state.transcriptContainer.render(140).join('\n'));
      expect(output).toContain(' MCP (4) ');
      expect(output).toContain('Servers');
      expect(output).toContain('local-tools');
      expect(output).toContain('connected');
      expect(output).toContain('stdio');
      expect(output).toContain('2 tools');
      expect(output).toContain('remote-tools');
      expect(output).toContain('failed');
      expect(output).toContain('connection refused');
      expect(output).toContain('linear');
      expect(output).toContain('needs auth');
      expect(output).toContain('/mcp-config login linear');
      expect(output).toContain('disabled-tools');
      expect(output).toContain('disabled');
      expect(output).toContain(
        '1 connected · 1 needs auth · 1 failed · 1 disabled · 2 tools available',
      );
    });
  });

  it('renders an empty /mcp state when no MCP servers are configured', async () => {
    const session = makeSession({
      listMcpServers: vi.fn(async () => []),
    });
    const { driver } = await makeDriver(session);

    driver.handleUserInput('/mcp');

    await vi.waitFor(() => {
      const output = stripSgr(driver.state.transcriptContainer.render(120).join('\n'));
      expect(output).toContain('No MCP servers configured. Run /mcp-config to add one.');
    });
  });

  it('renders /mcp list failures as command boundary errors', async () => {
    const session = makeSession({
      listMcpServers: vi.fn(async () => {
        throw new Error('rpc unavailable');
      }),
    });
    const { driver } = await makeDriver(session);

    driver.handleUserInput('/mcp');

    await vi.waitFor(() => {
      const output = stripSgr(driver.state.transcriptContainer.render(120).join('\n'));
      expect(output).toContain('Error: Failed to load MCP servers: rpc unavailable');
    });
  });

  it('applies /model selection with inline thinking state', async () => {
    const session = makeSession();
    const setConfig = vi.fn(async () => ({ providers: {} }));
    const { driver } = await makeDriver(session, {
      getConfig: vi.fn(async () => ({
        models: {
          k2: {
            provider: 'test-provider',
            model: 'byf-k2',
            maxContextSize: 100,
            displayName: 'ByF K2',
            capabilities: ['thinking'],
          },
          turbo: {
            provider: 'test-provider',
            model: 'byf-turbo',
            maxContextSize: 100,
            displayName: 'ByF Turbo',
            capabilities: ['thinking'],
          },
        },
        defaultModel: 'k2',
        defaultThinking: false,
      })),
      setConfig,
    });

    driver.handleUserInput('/model turbo');

    const picker = driver.state.editorContainer.children[0];
    expect(picker).toBeInstanceOf(ModelSelectorComponent);
    const pickerOutput = stripSgr((picker as ModelSelectorComponent).render(120).join('\n'));
    expect(pickerOutput).toContain('ByF K2 (test-provider) ← current');
    expect(pickerOutput).toContain('❯ ByF Turbo (test-provider)');
    (picker as ModelSelectorComponent).handleInput('t');
    (picker as ModelSelectorComponent).handleInput('u');
    const filteredOutput = stripSgr((picker as ModelSelectorComponent).render(120).join('\n'));
    expect(filteredOutput).toContain('Search: tu');
    expect(filteredOutput).toContain('ByF Turbo (test-provider)');
    expect(filteredOutput).not.toContain('ByF K2 (test-provider)');
    (picker as ModelSelectorComponent).handleInput('\u001B[D');
    (picker as ModelSelectorComponent).handleInput('\r');

    await vi.waitFor(() => {
      expect(session.setModel).toHaveBeenCalledWith('turbo');
      expect(session.setThinking).toHaveBeenCalledWith('high');
      expect(setConfig).toHaveBeenCalledWith({
        defaultModel: 'turbo',
        defaultThinking: true,
        thinking: {
          mode: 'on',
          effort: 'high',
        },
      });
    });
    expect(driver.state.appState.model).toBe('turbo');
    expect(driver.state.appState.thinkingEffort).toBe('high');
  });

  it('persists /model selection even when runtime state is unchanged', async () => {
    const session = makeSession();
    const setConfig = vi.fn(async () => ({ providers: {} }));
    const { driver } = await makeDriver(session, {
      getConfig: vi.fn(async () => ({
        models: {
          k2: {
            provider: 'test-provider',
            model: 'byf-k2',
            maxContextSize: 100,
            displayName: 'Byf K2',
            capabilities: ['thinking'],
          },
        },
        defaultModel: 'old-default',
        defaultThinking: true,
      })),
      setConfig,
    });

    driver.handleUserInput('/model k2');

    const picker = driver.state.editorContainer.children[0];
    expect(picker).toBeInstanceOf(ModelSelectorComponent);
    (picker as ModelSelectorComponent).handleInput('\r');

    await vi.waitFor(() => {
      expect(setConfig).toHaveBeenCalledWith({
        defaultModel: 'k2',
        defaultThinking: false,
        thinking: {
          mode: 'off',
          effort: 'high',
        },
      });
    });
    expect(session.setModel).not.toHaveBeenCalled();
    expect(session.setThinking).not.toHaveBeenCalled();
  });

  it('prefers config thinking.effort when refreshing defaults after login', async () => {
    const session = makeSession();
    let configReads = 0;
    const { driver } = await makeDriver(session, {
      getConfig: vi.fn(async () => {
        configReads += 1;
        if (configReads === 1) {
          return {
            models: {
              k2: {
                provider: 'test-provider',
                model: 'byf-k2',
                maxContextSize: 100,
                capabilities: ['thinking_effort'],
              },
            },
            defaultModel: 'k2',
            defaultThinking: true,
          };
        }
        return {
          models: {
            k2: {
              provider: 'test-provider',
              model: 'byf-k2',
              maxContextSize: 100,
              capabilities: ['thinking_effort'],
            },
          },
          providers: {},
          defaultModel: 'k2',
          defaultThinking: true,
          thinking: {
            mode: 'on',
            effort: 'low',
          },
        };
      }),
    });

    const refreshDriver = driver as unknown as { refreshConfigAfterLogin(): Promise<void> };
    await refreshDriver.refreshConfigAfterLogin();

    expect(session.setThinking).toHaveBeenCalledWith('low');
    expect(driver.state.appState.thinkingEffort).toBe('low');
  });

  it('enables search in the model selector', async () => {
    const session = makeSession();
    const { driver } = await makeDriver(session, {
      getConfig: vi.fn(async () => ({
        models: {
          alpha: {
            provider: 'test-provider',
            model: 'byf-alpha',
            maxContextSize: 100,
            displayName: 'ByF Alpha',
            capabilities: ['thinking'],
          },
          turbo: {
            provider: 'test-provider',
            model: 'byf-turbo',
            maxContextSize: 100,
            displayName: 'ByF Turbo',
            capabilities: ['thinking'],
          },
        },
        defaultModel: 'alpha',
        defaultThinking: false,
      })),
    });

    driver.handleUserInput('/model');

    const picker = driver.state.editorContainer.children[0];
    expect(picker).toBeInstanceOf(ModelSelectorComponent);
    (picker as ModelSelectorComponent).handleInput('t');
    (picker as ModelSelectorComponent).handleInput('u');

    const output = stripSgr((picker as ModelSelectorComponent).render(120).join('\n'));
    expect(output).toContain('Search: tu');
    expect(output).toContain('ByF Turbo (test-provider)');
    expect(output).not.toContain('ByF Alpha (test-provider)');

    (picker as ModelSelectorComponent).handleInput('\u001B');
    (picker as ModelSelectorComponent).handleInput('\u001B');
  });

  it('deletes Kitty inline images when /new clears the transcript', async () => {
    setCapabilities({ images: 'kitty', trueColor: true, hyperlinks: true });
    const { driver, harness } = await makeDriver(makeSession({ id: 'ses-1' }));
    const nextSession = makeSession({ id: 'ses-2' });
    harness.createSession.mockResolvedValueOnce(nextSession);
    const write = vi.spyOn(driver.state.terminal, 'write').mockImplementation(() => {});

    driver.handleUserInput('/new');

    await vi.waitFor(() => {
      expect(harness.createSession).toHaveBeenCalledTimes(2);
      expect(driver.getCurrentSessionId()).toBe('ses-2');
    });
    expect(write).toHaveBeenCalledWith(deleteAllKittyImages());
  });

  it('forks the active session and switches to the returned session', async () => {
    const originalTitle = process.title;
    const source = makeSession({
      id: 'ses-source',
      summary: { title: 'Source title' },
    });
    const forked = makeSession({
      id: 'ses-fork',
      summary: { title: 'Fork: Source title' },
    });
    const forkSession = vi.fn(async () => forked);
    const { driver, harness } = await makeDriver(source, { forkSession });

    // /fork now opens a rewind picker; seed one user message so the picker
    // has content, then select "full copy" (the last option) to reproduce the
    // pre-rewind whole-session fork behavior.
    driver.state.transcriptEntries.push({
      id: 'msg-1',
      kind: 'user',
      renderMode: 'plain',
      content: 'hello',
    });

    try {
      driver.handleUserInput('/fork ignored args');

      const picker = await vi.waitFor(() => {
        const p = driver.state.editorContainer.children[0];
        expect(p).toBeInstanceOf(ChoicePickerComponent);
        return p as ChoicePickerComponent;
      });
      // Navigate to the trailing "full copy" option and confirm.
      picker.handleInput('\u001B[B');
      picker.handleInput('\r');

      await vi.waitFor(() => {
        expect(forkSession).toHaveBeenCalledWith({
          id: 'ses-source',
          title: 'Fork: Source title',
        });
        expect(driver.getCurrentSessionId()).toBe('ses-fork');
      });
      expect(process.title).toBe('Fork: Source title');
      expect(source.close).toHaveBeenCalledOnce();
      expect(forked.onEvent).toHaveBeenCalledOnce();
      expect(harness.resumeSession).not.toHaveBeenCalled();
      expect(driver.state.transcriptContainer.render(120).join('\n')).toContain(
        'Session forked (ses-fork).',
      );
    } finally {
      process.title = originalTitle;
    }
  });

  it('keeps the current session when fork fails', async () => {
    const forkSession = vi.fn(async () => {
      throw new Error('fork unavailable');
    });
    const { driver } = await makeDriver(makeSession({ id: 'ses-source' }), { forkSession });

    driver.state.transcriptEntries.push({
      id: 'msg-1',
      kind: 'user',
      renderMode: 'plain',
      content: 'hello',
    });

    driver.handleUserInput('/fork');

    const picker = await vi.waitFor(() => {
      const p = driver.state.editorContainer.children[0];
      expect(p).toBeInstanceOf(ChoicePickerComponent);
      return p as ChoicePickerComponent;
    });
    // Select "full copy" (last option).
    picker.handleInput('\u001B[B');
    picker.handleInput('\r');

    await vi.waitFor(() => {
      expect(forkSession).toHaveBeenCalledWith({
        id: 'ses-source',
        title: 'Fork: ses-source',
      });
      expect(driver.getCurrentSessionId()).toBe('ses-source');
      expect(driver.state.transcriptContainer.render(120).join('\n')).toContain(
        'Failed to fork session: fork unavailable',
      );
    });
  });

  it('renders newly streamed thinking expanded when ctrl+o toggle was already active', async () => {
    const { driver } = await makeDriver();
    driver.state.toolOutputExpanded = true;

    const longThinking = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'].join('\n');
    driver.handleEvent(
      {
        type: 'thinking.delta',
        agentId: 'main',
        sessionId: 'ses-1',
        delta: longThinking,
      } as Event,
      vi.fn(),
    );
    driver.handleEvent(
      {
        type: 'assistant.delta',
        agentId: 'main',
        sessionId: 'ses-1',
        delta: 'answer',
      } as Event,
      vi.fn(),
    );

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('t7');
    expect(transcript).not.toContain('ctrl+o to expand');
  });

  it('renders hook results without XML tags', async () => {
    const { driver } = await makeDriver();

    driver.handleEvent(
      {
        type: 'hook.result',
        agentId: 'main',
        sessionId: 'ses-1',
        turnId: 1,
        hookEvent: 'UserPromptSubmit',
        content: '{}',
      } as Event,
      vi.fn(),
    );

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('UserPromptSubmit hook');
    expect(transcript).toContain('{}');
    expect(transcript).not.toContain('<hook_result');
  });

  it('renders empty hook results as empty status text', async () => {
    const { driver } = await makeDriver();

    driver.handleEvent(
      {
        type: 'hook.result',
        agentId: 'main',
        sessionId: 'ses-1',
        turnId: 1,
        hookEvent: 'UserPromptSubmit',
        content: '',
      } as Event,
      vi.fn(),
    );

    const transcript = stripSgr(renderTranscript(driver));
    expect(transcript).toContain('UserPromptSubmit hook');
    expect(transcript).toContain('(empty)');
    expect(transcript).not.toContain('<hook_result');
  });
});

// Bun keeps mock.module across files; restore so later suites see real modules (#215).
afterAll(() => {
  bunMock.restore();
});
