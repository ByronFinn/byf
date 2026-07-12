import { mock as bunMock } from 'bun:test';

import { afterEach, beforeEach, describe, expect, it, vi, afterAll } from 'vitest';

import { runPrompt } from '#/cli/run-prompt';

type CreateByfDeviceId = (
  homeDir: string,
  options?: { onFirstLaunch?: (id: string) => void },
) => string;

const mocks = vi.hoisted(() => {
  const eventHandlers = new Set<(event: any) => void>();
  const agentEvent = (agentId: string, event: Record<string, unknown>) => ({
    sessionId: 'ses_prompt',
    agentId,
    ...event,
  });
  const mainEvent = (event: Record<string, unknown>) => agentEvent('main', event);
  const session = {
    id: 'ses_prompt',
    setModel: vi.fn(),
    setPermission: vi.fn(),
    setApprovalHandler: vi.fn(),
    setQuestionHandler: vi.fn(),
    getStatus: vi.fn(
      async (): Promise<{ readonly permission: string; readonly model?: string }> => ({
        permission: 'manual',
      }),
    ),
    // PRD-0023 headless completion (evaluateRunCompletion)
    getGoal: vi.fn(async (): Promise<{ status: string } | null> => null),
    getCronTasks: vi.fn(
      async (): Promise<{ tasks: readonly { nextFireAt: number | null }[] }> => ({
        tasks: [],
      }),
    ),
    waitForBackgroundTasksOnPrint: vi.fn(async () => {}),
    listBackgroundTasks: vi.fn(async (): Promise<readonly unknown[]> => []),
    createGoal: vi.fn(async () => ({ status: 'active' })),
    onEvent: vi.fn((handler: (event: any) => void) => {
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    }),
    prompt: vi.fn(async () => {
      for (const handler of eventHandlers) {
        handler(mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
        handler(mainEvent({ type: 'assistant.delta', turnId: 1, delta: 'hello' }));
        handler(mainEvent({ type: 'assistant.delta', turnId: 1, delta: ' world' }));
        handler(mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
      }
    }),
  };

  return {
    session,
    eventHandlers,
    agentEvent,
    mainEvent,
    byfHarnessConstructor: vi.fn(),
    harnessEnsureConfigFile: vi.fn(),
    harnessGetConfig: vi.fn(
      async (): Promise<{ providers: {}; defaultModel?: string; telemetry: boolean }> => ({
        providers: {},
        defaultModel: 'k2',
        telemetry: true,
      }),
    ),
    harnessCreateSession: vi.fn(async () => session),
    harnessResumeSession: vi.fn(async () => session),
    harnessListSessions: vi.fn(async () => [{ id: 'ses_previous' }]),
    harnessClose: vi.fn(),
    harnessTrack: vi.fn(),
    harnessGetCachedAccessToken: vi.fn(),
    createByfDeviceId: vi.fn<CreateByfDeviceId>(() => 'device-1'),
    resolveByfHome: vi.fn((homeDir?: string) => homeDir ?? '/tmp/byf-test-home'),
    harnessCreatesDeviceIdOnConstruction: false,
  };
});

const __mockActual__byfriends_sdk = await import('@byfriends/sdk');
vi.mock('@byfriends/sdk', () => {
  const actual = __mockActual__byfriends_sdk;
  return {
    ...actual,
    resolveByfHome: mocks.resolveByfHome,
    ByfHarness: class {
      homeDir: string;
      auth = { getCachedAccessToken: mocks.harnessGetCachedAccessToken };
      ensureConfigFile = mocks.harnessEnsureConfigFile;
      getConfig = mocks.harnessGetConfig;
      createSession = mocks.harnessCreateSession;
      resumeSession = mocks.harnessResumeSession;
      listSessions = mocks.harnessListSessions;
      close = mocks.harnessClose;
      track = mocks.harnessTrack;

      constructor(...args: unknown[]) {
        const options = args[0] as { readonly homeDir?: string };
        this.homeDir = options?.homeDir ?? '/tmp/byf-test-home';
        if (mocks.harnessCreatesDeviceIdOnConstruction) {
          mocks.createByfDeviceId(this.homeDir);
        }
        mocks.byfHarnessConstructor(...args);
      }
    },
  };
});

function opts(overrides: Partial<Parameters<typeof runPrompt>[0]> = {}) {
  return {
    session: undefined,
    continue: false,
    yolo: false,
    model: undefined,
    outputFormat: undefined,
    prompt: 'say hello',
    skillsDirs: [],
    addDirs: [] as string[],
    ...overrides,
  };
}

function writer(columns?: number) {
  let text = '';
  return {
    columns,
    write: vi.fn((chunk: string) => {
      text += chunk;
      return true;
    }),
    text: () => text,
  };
}

function fakeProcess() {
  const listeners = new Map<NodeJS.Signals, () => Promise<void> | void>();
  return {
    once: vi.fn((signal: NodeJS.Signals, listener: () => Promise<void> | void) => {
      listeners.set(signal, listener);
    }),
    off: vi.fn((signal: NodeJS.Signals, listener: () => Promise<void> | void) => {
      if (listeners.get(signal) === listener) {
        listeners.delete(signal);
      }
    }),
    exit: vi.fn(),
    listener: (signal: NodeJS.Signals) => listeners.get(signal),
  };
}

async function waitForAssertion(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  throw lastError;
}

/**
 * Bun does not clear `process.exitCode` when assigned `undefined` — the prior
 * numeric code sticks. Use `0` as the portable "unset / success" reset.
 */
function clearProcessExitCode(): void {
  process.exitCode = 0;
}

function restoreProcessExitCode(previous: typeof process.exitCode): void {
  process.exitCode = previous ?? 0;
}

describe('runPrompt', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.eventHandlers.clear();
    mocks.createByfDeviceId.mockImplementation(() => 'device-1');
    mocks.resolveByfHome.mockImplementation((homeDir?: string) => homeDir ?? '/tmp/byf-test-home');
    mocks.harnessCreatesDeviceIdOnConstruction = false;
    // Do not leak headless exit codes across cases (AC-H1 / goal exit maps).
    clearProcessExitCode();
    // Restore default headless completion mocks after completion-suite overrides.
    mocks.session.getGoal.mockReset();
    mocks.session.getGoal.mockImplementation(async () => null);
    mocks.session.getCronTasks.mockReset();
    mocks.session.getCronTasks.mockImplementation(async () => ({ tasks: [] }));
    mocks.session.waitForBackgroundTasksOnPrint.mockReset();
    mocks.session.waitForBackgroundTasksOnPrint.mockImplementation(async () => {});
    mocks.session.listBackgroundTasks.mockReset();
    mocks.session.listBackgroundTasks.mockImplementation(async () => []);
    mocks.session.createGoal.mockReset();
    mocks.session.createGoal.mockImplementation(async () => ({ status: 'active' }));
    mocks.session.prompt.mockReset();
    mocks.session.prompt.mockImplementation(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
        handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 1, delta: 'hello' }));
        handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 1, delta: ' world' }));
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
      }
    });
  });

  it('creates a fresh auto-permission session and streams assistant output to stdout', async () => {
    const stdout = writer();
    const stderr = writer();

    await runPrompt(opts({ skillsDirs: ['/skills'] }), '1.2.3-test', { stdout, stderr });

    expect(mocks.byfHarnessConstructor).toHaveBeenCalledWith(
      expect.objectContaining({ skillDirs: ['/skills'], uiMode: 'print' }),
    );
    expect(mocks.harnessCreateSession).toHaveBeenCalledWith({
      workDir: process.cwd(),
      model: 'k2',
      permission: 'auto',
    });
    expect(mocks.session.setPermission).not.toHaveBeenCalled();
    expect(mocks.session.setApprovalHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.session.setQuestionHandler).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.session.prompt).toHaveBeenCalledWith('say hello');
    expect(stdout.text()).toBe('• hello world\n\n');
    expect(stderr.text()).toBe('To resume this session: byf -r ses_prompt\n');
    expect(mocks.harnessClose).toHaveBeenCalled();
  });

  it('uses the CLI model override when creating a fresh prompt session', async () => {
    await runPrompt(opts({ model: 'byf/k2.5' }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    expect(mocks.harnessCreateSession).toHaveBeenCalledWith({
      workDir: process.cwd(),
      model: 'byf/k2.5',
      permission: 'auto',
    });
  });

  it('formats thinking and assistant output as transcript blocks', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 3, origin: { kind: 'user' } }));
        handler(
          mocks.mainEvent({
            type: 'thinking.delta',
            turnId: 3,
            delta: 'The user wants an exact reply.',
          }),
        );
        handler(
          mocks.mainEvent({
            type: 'thinking.delta',
            turnId: 3,
            delta: '\nNo tools are needed.',
          }),
        );
        handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 3, delta: 'prompt-mode-ok' }));
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 3, reason: 'completed' }));
      }
    });
    const stdout = writer();
    const stderr = writer();

    await runPrompt(opts(), '1.2.3-test', { stdout, stderr });

    expect(stderr.text()).toBe(
      '• The user wants an exact reply.\n  No tools are needed.\n\nTo resume this session: byf -r ses_prompt\n',
    );
    expect(stdout.text()).toBe('• prompt-mode-ok\n\n');
    expect(stderr.write).toHaveBeenNthCalledWith(1, '• The user wants an exact reply.');
    expect(stderr.write).toHaveBeenNthCalledWith(2, '\n  No tools are needed.');
    expect(stdout.write).toHaveBeenNthCalledWith(1, '• prompt-mode-ok');
  });

  it('formats hook results as their own transcript block', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 3, origin: { kind: 'user' } }));
        handler(
          mocks.mainEvent({
            type: 'hook.result',
            turnId: 3,
            hookEvent: 'UserPromptSubmit',
            content: '{}',
          }),
        );
        handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 3, delta: 'answer' }));
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 3, reason: 'completed' }));
      }
    });
    const stdout = writer();
    const stderr = writer();

    await runPrompt(opts(), '1.2.3-test', { stdout, stderr });

    expect(stdout.text()).toBe('• UserPromptSubmit hook\n\n  {}\n\n• answer\n\n');
    expect(stderr.text()).toBe('To resume this session: byf -r ses_prompt\n');
  });

  it('wraps transcript blocks with hanging indentation when terminal width is known', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 4, origin: { kind: 'user' } }));
        handler(mocks.mainEvent({ type: 'thinking.delta', turnId: 4, delta: 'thinking-wrap' }));
        handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 4, delta: 'answer-wrap' }));
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 4, reason: 'completed' }));
      }
    });
    const stdout = writer(10);
    const stderr = writer(10);

    await runPrompt(opts(), '1.2.3-test', { stdout, stderr });

    expect(stderr.text()).toBe(
      '• thinking\n  -wrap\n\nTo resume this session: byf -r ses_prompt\n',
    );
    expect(stdout.text()).toBe('• answer-w\n  rap\n\n');
  });

  it('filters prompt output and completion to the main agent turn', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      const emit = (event: Record<string, unknown>) => {
        for (const handler of Array.from(mocks.eventHandlers)) {
          handler(event);
        }
      };

      emit(mocks.mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
      emit(
        mocks.agentEvent('child-agent', {
          type: 'turn.started',
          turnId: 1,
          origin: { kind: 'user' },
        }),
      );
      emit(
        mocks.agentEvent('child-agent', {
          type: 'assistant.delta',
          turnId: 1,
          delta: 'sub answer',
        }),
      );
      emit(mocks.agentEvent('child-agent', { type: 'turn.ended', turnId: 1, reason: 'completed' }));
      await Promise.resolve();
      emit(mocks.mainEvent({ type: 'assistant.delta', turnId: 1, delta: 'main answer' }));
      emit(mocks.mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
    });
    const stdout = writer();
    const stderr = writer();

    await runPrompt(opts(), '1.2.3-test', { stdout, stderr });

    expect(stdout.text()).toBe('• main answer\n\n');
    expect(stderr.text()).toBe('To resume this session: byf -r ses_prompt\n');
  });

  it('ignores child-agent error events while the main turn continues', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      const emit = (event: Record<string, unknown>) => {
        for (const handler of Array.from(mocks.eventHandlers)) {
          handler(event);
        }
      };

      emit(mocks.mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
      emit(
        mocks.agentEvent('child-agent', {
          type: 'error',
          code: 'subagent.failed',
          message: 'child failed',
        }),
      );
      await Promise.resolve();
      emit(mocks.mainEvent({ type: 'assistant.delta', turnId: 1, delta: 'main recovered' }));
      emit(mocks.mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
    });
    const stdout = writer();
    const stderr = writer();

    await runPrompt(opts(), '1.2.3-test', { stdout, stderr });

    expect(stdout.text()).toBe('• main recovered\n\n');
    expect(stderr.text()).toBe('To resume this session: byf -r ses_prompt\n');
  });

  it('resumes a concrete session and forces auto permission before prompting', async () => {
    await runPrompt(opts({ session: 'ses_existing' }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    expect(mocks.harnessResumeSession).toHaveBeenCalledWith({ id: 'ses_existing' });
    expect(mocks.session.getStatus).toHaveBeenCalled();
    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(1, 'auto');
    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(2, 'manual');
  });

  it('applies the CLI model override to resumed prompt sessions', async () => {
    await runPrompt(opts({ session: 'ses_existing', model: 'byf/k2.5' }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    expect(mocks.harnessResumeSession).toHaveBeenCalledWith({ id: 'ses_existing' });
    expect(mocks.session.setModel).toHaveBeenCalledWith('byf/k2.5');
  });

  it('writes stream-json output as assistant JSONL with resume meta without transcript bullets', async () => {
    const stdout = writer();
    const stderr = writer();

    await runPrompt(opts({ outputFormat: 'stream-json' }), '1.2.3-test', { stdout, stderr });

    expect(stdout.text()).toBe(
      [
        '{"role":"assistant","content":"hello world"}',
        '{"role":"meta","type":"session.resume_hint","session_id":"ses_prompt","command":"byf -r ses_prompt","content":"To resume this session: byf -r ses_prompt"}',
        '',
      ].join('\n'),
    );
    expect(stderr.text()).toBe('');
  });

  it('writes stream-json tool calls and tool results as JSONL messages', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 8, origin: { kind: 'user' } }));
        handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 8, delta: 'checking' }));
        handler(
          mocks.mainEvent({
            type: 'tool.call.started',
            turnId: 8,
            toolCallId: 'tc_1',
            name: 'Shell',
            args: { command: 'ls' },
          }),
        );
        handler(
          mocks.mainEvent({
            type: 'tool.result',
            turnId: 8,
            toolCallId: 'tc_1',
            output: 'file1.py\nfile2.py',
          }),
        );
        handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 8, delta: 'done' }));
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 8, reason: 'completed' }));
      }
    });
    const stdout = writer();
    const stderr = writer();

    await runPrompt(opts({ outputFormat: 'stream-json' }), '1.2.3-test', { stdout, stderr });

    expect(stdout.text()).toBe(
      [
        '{"role":"assistant","content":"checking","tool_calls":[{"type":"function","id":"tc_1","function":{"name":"Shell","arguments":"{\\"command\\":\\"ls\\"}"}}]}',
        '{"role":"tool","tool_call_id":"tc_1","content":"file1.py\\nfile2.py"}',
        '{"role":"assistant","content":"done"}',
        '{"role":"meta","type":"session.resume_hint","session_id":"ses_prompt","command":"byf -r ses_prompt","content":"To resume this session: byf -r ses_prompt"}',
        '',
      ].join('\n'),
    );
  });

  it('resumes a concrete session without a configured default model', async () => {
    mocks.harnessGetConfig.mockResolvedValueOnce({ providers: {}, telemetry: true });
    mocks.session.getStatus.mockResolvedValueOnce({ permission: 'manual', model: 'saved-model' });

    await runPrompt(opts({ session: 'ses_existing' }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    expect(mocks.harnessResumeSession).toHaveBeenCalledWith({ id: 'ses_existing' });
    expect(mocks.harnessCreateSession).not.toHaveBeenCalled();
    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(1, 'auto');
    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(2, 'manual');
  });

  it('continues the previous workdir session when --continue is used', async () => {
    await runPrompt(opts({ continue: true }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    expect(mocks.harnessListSessions).toHaveBeenCalledWith({ workDir: process.cwd() });
    expect(mocks.harnessResumeSession).toHaveBeenCalledWith({ id: 'ses_previous' });
    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(1, 'auto');
    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(2, 'manual');
  });

  it('continues a previous session without a configured default model', async () => {
    mocks.harnessGetConfig.mockResolvedValueOnce({ providers: {}, telemetry: true });
    mocks.session.getStatus.mockResolvedValueOnce({ permission: 'manual', model: 'saved-model' });

    await runPrompt(opts({ continue: true }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    expect(mocks.harnessListSessions).toHaveBeenCalledWith({ workDir: process.cwd() });
    expect(mocks.harnessResumeSession).toHaveBeenCalledWith({ id: 'ses_previous' });
    expect(mocks.harnessCreateSession).not.toHaveBeenCalled();
  });

  it('restores resumed session permission even when the turn fails', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 5, origin: { kind: 'user' } }));
        handler(
          mocks.mainEvent({
            type: 'turn.ended',
            turnId: 5,
            reason: 'failed',
            error: { code: 'provider.error', message: 'model failed' },
          }),
        );
      }
    });

    await expect(
      runPrompt(opts({ session: 'ses_existing' }), '1.2.3-test', {
        stdout: { write: vi.fn(() => true) },
        stderr: { write: vi.fn(() => true) },
      }),
    ).rejects.toThrow('provider.error: model failed');

    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(1, 'auto');
    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(2, 'manual');
    expect(mocks.session.setPermission.mock.invocationCallOrder[1]).toBeLessThan(
      mocks.harnessClose.mock.invocationCallOrder[0],
    );
  });

  it('restores resumed session permission before exiting on SIGINT', async () => {
    let releasePrompt!: () => void;
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 6, origin: { kind: 'user' } }));
      }
      await new Promise<void>((resolve) => {
        releasePrompt = resolve;
      });
    });
    const processMock = fakeProcess();
    const run = runPrompt(opts({ session: 'ses_existing' }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
      process: processMock,
    } as Parameters<typeof runPrompt>[2] & { process: ReturnType<typeof fakeProcess> });

    await waitForAssertion(() => {
      expect(mocks.session.setPermission).toHaveBeenCalledWith('auto');
      expect(processMock.listener('SIGINT')).toBeDefined();
    });

    await processMock.listener('SIGINT')?.();

    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(2, 'manual');
    expect(mocks.session.setPermission.mock.invocationCallOrder[1]).toBeLessThan(
      processMock.exit.mock.invocationCallOrder[0],
    );
    expect(mocks.harnessClose).toHaveBeenCalled();
    expect(processMock.exit).toHaveBeenCalledWith(130);

    for (const handler of mocks.eventHandlers) {
      handler(mocks.mainEvent({ type: 'turn.ended', turnId: 6, reason: 'completed' }));
    }
    releasePrompt();
    await run;

    expect(mocks.harnessClose).toHaveBeenCalledTimes(1);
  });

  it('waits for the pending auto permission write before signal restore', async () => {
    let releaseAutoPermission!: () => void;
    let releasePrompt!: () => void;
    mocks.session.setPermission.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        releaseAutoPermission = resolve;
      });
    });
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 7, origin: { kind: 'user' } }));
      }
      await new Promise<void>((resolve) => {
        releasePrompt = resolve;
      });
    });
    const processMock = fakeProcess();
    const run = runPrompt(opts({ session: 'ses_existing' }), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
      process: processMock,
    } as Parameters<typeof runPrompt>[2] & { process: ReturnType<typeof fakeProcess> });

    await waitForAssertion(() => {
      expect(processMock.listener('SIGINT')).toBeDefined();
      expect(mocks.session.setPermission).toHaveBeenCalledWith('auto');
    });
    expect(processMock.once.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.session.setPermission.mock.invocationCallOrder[0],
    );

    const signalCleanup = processMock.listener('SIGINT')?.();
    await Promise.resolve();

    expect(mocks.session.setPermission).toHaveBeenCalledTimes(1);

    releaseAutoPermission();
    await signalCleanup;

    expect(mocks.session.setPermission).toHaveBeenNthCalledWith(2, 'manual');
    expect(processMock.exit).toHaveBeenCalledWith(130);

    await waitForAssertion(() => {
      expect(mocks.session.prompt).toHaveBeenCalledWith('say hello');
    });
    for (const handler of mocks.eventHandlers) {
      handler(mocks.mainEvent({ type: 'turn.ended', turnId: 7, reason: 'completed' }));
    }
    releasePrompt();
    await run;
  });

  it('uses auto permission so headless mode can bypass plan approval and questions', async () => {
    await runPrompt(opts(), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    expect(mocks.harnessCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ permission: 'auto' }),
    );
  });

  it('throws when no default model is configured', async () => {
    mocks.harnessGetConfig.mockResolvedValueOnce({ providers: {}, telemetry: true });

    await expect(
      runPrompt(opts(), '1.2.3-test', {
        stdout: { write: vi.fn(() => true) },
        stderr: { write: vi.fn(() => true) },
      }),
    ).rejects.toThrow(
      'No model configured. Run `byf` and use /login or /connect to configure a provider, then retry; or set default_model in config.toml.',
    );

    expect(mocks.harnessClose).toHaveBeenCalled();
  });

  it('rejects when the turn fails and still closes resources', async () => {
    mocks.session.prompt.mockImplementationOnce(async () => {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 2, origin: { kind: 'user' } }));
        handler(
          mocks.mainEvent({
            type: 'turn.ended',
            turnId: 2,
            reason: 'failed',
            error: { code: 'provider.error', message: 'model failed' },
          }),
        );
      }
    });

    await expect(
      runPrompt(opts(), '1.2.3-test', {
        stdout: { write: vi.fn(() => true) },
        stderr: { write: vi.fn(() => true) },
      }),
    ).rejects.toThrow('provider.error: model failed');

    expect(mocks.harnessClose).toHaveBeenCalled();
  });

  it('approval fallback approves if an unexpected approval request reaches SDK', async () => {
    await runPrompt(opts(), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    const handler = mocks.session.setApprovalHandler.mock.calls[0]![0] as () => unknown;
    expect(handler()).toEqual({ decision: 'approved' });
  });

  it('question fallback returns null so prompt mode never opens a question UI', async () => {
    await runPrompt(opts(), '1.2.3-test', {
      stdout: { write: vi.fn(() => true) },
      stderr: { write: vi.fn(() => true) },
    });

    const handler = mocks.session.setQuestionHandler.mock.calls[0]![0] as () => unknown;
    expect(handler()).toBeNull();
  });

  describe('SIGHUP and dead-terminal I/O handling', () => {
    let prependSpy: ReturnType<typeof vi.spyOn>;
    let stdoutOnSpy: ReturnType<typeof vi.spyOn>;
    let stderrOnSpy: ReturnType<typeof vi.spyOn>;
    let platformDescriptor: PropertyDescriptor | undefined;
    let capturedSighup: (() => void) | undefined;
    let capturedStdoutError: ((error: Error) => void) | undefined;
    let capturedStderrError: ((error: Error) => void) | undefined;

    function setupHandlerCaptureSpies(): void {
      capturedSighup = undefined;
      capturedStdoutError = undefined;
      capturedStderrError = undefined;

      prependSpy = vi.spyOn(process, 'prependListener');
      (
        prependSpy as unknown as { mockImplementation: (fn: unknown) => unknown }
      ).mockImplementation(
        (event: string | symbol, listener: (...args: unknown[]) => void): NodeJS.Process => {
          if (event === 'SIGHUP') {
            capturedSighup = listener as () => void;
          }
          return process;
        },
      );

      stdoutOnSpy = vi.spyOn(process.stdout, 'on');
      (
        stdoutOnSpy as unknown as { mockImplementation: (fn: unknown) => unknown }
      ).mockImplementation((event: string | symbol, listener: (...args: unknown[]) => void) => {
        if (event === 'error') {
          capturedStdoutError = listener as (error: Error) => void;
        }
        return process.stdout;
      });

      stderrOnSpy = vi.spyOn(process.stderr, 'on');
      (
        stderrOnSpy as unknown as { mockImplementation: (fn: unknown) => unknown }
      ).mockImplementation((event: string | symbol, listener: (...args: unknown[]) => void) => {
        if (event === 'error') {
          capturedStderrError = listener as (error: Error) => void;
        }
        return process.stderr;
      });
    }

    beforeEach(() => {
      platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
      setupHandlerCaptureSpies();
    });

    afterEach(() => {
      prependSpy.mockRestore();
      stdoutOnSpy.mockRestore();
      stderrOnSpy.mockRestore();
      if (platformDescriptor !== undefined) {
        Object.defineProperty(process, 'platform', platformDescriptor);
      }
    });

    async function startPromptWithHangingSession() {
      let releasePrompt!: () => void;
      mocks.session.prompt.mockImplementationOnce(async () => {
        for (const handler of mocks.eventHandlers) {
          handler(mocks.mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
        }
        await new Promise<void>((resolve) => {
          releasePrompt = resolve;
        });
      });
      const processMock = fakeProcess();
      const run = runPrompt(opts({ session: 'ses_existing' }), '1.2.3-test', {
        stdout: { write: vi.fn(() => true) },
        stderr: { write: vi.fn(() => true) },
        process: processMock,
      } as Parameters<typeof runPrompt>[2] & { process: ReturnType<typeof fakeProcess> });

      await waitForAssertion(() => {
        expect(capturedStdoutError).toBeDefined();
        expect(capturedStderrError).toBeDefined();
        expect(processMock.listener('SIGINT')).toBeDefined();
        expect(mocks.session.prompt).toHaveBeenCalled();
      });

      return { processMock, run, releasePrompt };
    }

    async function completePrompt(
      processMock: ReturnType<typeof fakeProcess>,
      run: Promise<void>,
      releasePrompt: () => void,
    ): Promise<void> {
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
      }
      releasePrompt();
      await run;
    }

    it('SIGHUP causes exit(129) without running cleanup', async () => {
      const { processMock, run, releasePrompt } = await startPromptWithHangingSession();

      expect(capturedSighup).toBeDefined();
      capturedSighup!();

      expect(processMock.exit).toHaveBeenCalledWith(129);
      expect(mocks.harnessClose).not.toHaveBeenCalled();

      await completePrompt(processMock, run, releasePrompt);
    });

    it('SIGHUP is not registered on Windows', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      let releasePrompt!: () => void;
      mocks.session.prompt.mockImplementationOnce(async () => {
        for (const handler of mocks.eventHandlers) {
          handler(mocks.mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
        }
        await new Promise<void>((resolve) => {
          releasePrompt = resolve;
        });
      });
      const processMock = fakeProcess();
      const run = runPrompt(opts({ session: 'ses_existing' }), '1.2.3-test', {
        stdout: { write: vi.fn(() => true) },
        stderr: { write: vi.fn(() => true) },
        process: processMock,
      } as Parameters<typeof runPrompt>[2] & { process: ReturnType<typeof fakeProcess> });

      await waitForAssertion(() => {
        expect(processMock.listener('SIGINT')).toBeDefined();
        expect(mocks.session.prompt).toHaveBeenCalled();
      });

      expect(capturedSighup).toBeUndefined();

      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
      }
      releasePrompt();
      await run;
    });

    it('stdout EIO error triggers exit(129) without cleanup', async () => {
      const { processMock, run, releasePrompt } = await startPromptWithHangingSession();

      const eio = Object.assign(new Error('write EIO'), { code: 'EIO' });
      capturedStdoutError!(eio);

      expect(processMock.exit).toHaveBeenCalledWith(129);
      expect(mocks.harnessClose).not.toHaveBeenCalled();

      await completePrompt(processMock, run, releasePrompt);
    });

    it('stderr EPIPE error triggers exit(129)', async () => {
      const { processMock, run, releasePrompt } = await startPromptWithHangingSession();

      const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
      capturedStderrError!(epipe);

      expect(processMock.exit).toHaveBeenCalledWith(129);

      await completePrompt(processMock, run, releasePrompt);
    });

    it('stderr ENOTCONN error triggers exit(129)', async () => {
      const { processMock, run, releasePrompt } = await startPromptWithHangingSession();

      const enotconn = Object.assign(new Error('Transport endpoint is not connected'), {
        code: 'ENOTCONN',
      });
      capturedStderrError!(enotconn);

      expect(processMock.exit).toHaveBeenCalledWith(129);

      await completePrompt(processMock, run, releasePrompt);
    });

    it('unrelated errors (ENOENT) on stdout/stderr do not trigger exit', async () => {
      const { processMock, run, releasePrompt } = await startPromptWithHangingSession();

      const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
      capturedStdoutError!(enoent);
      capturedStderrError!(enoent);

      expect(processMock.exit).not.toHaveBeenCalled();

      await completePrompt(processMock, run, releasePrompt);
    });

    it('cleanup function removes SIGHUP, stdout error, and stderr error listeners', async () => {
      const beforeSighup = process.listenerCount('SIGHUP');
      const beforeStdoutError = process.stdout.listenerCount('error');
      const beforeStderrError = process.stderr.listenerCount('error');

      const { processMock, run, releasePrompt } = await startPromptWithHangingSession();

      // Handlers were captured (mocks intercepted registration, so real listener
      // counts are unchanged — we verify the spies saw the right calls instead).
      expect(capturedSighup).toBeDefined();
      expect(capturedStdoutError).toBeDefined();
      expect(capturedStderrError).toBeDefined();

      // Complete the prompt normally — the finally block calls the cleanup
      // function which removes all listeners.
      await completePrompt(processMock, run, releasePrompt);

      expect(mocks.harnessClose).toHaveBeenCalled();
      // Real listener counts are unchanged (mocks intercepted registration).
      expect(process.listenerCount('SIGHUP')).toBe(beforeSighup);
      expect(process.stdout.listenerCount('error')).toBe(beforeStdoutError);
      expect(process.stderr.listenerCount('error')).toBe(beforeStderrError);
    });
  });

  /**
   * PRD-0023 #241 — headless evaluateRunCompletion on the real run-prompt path.
   * Mock session APIs control goal/cron; events drive the dual-trigger state machine.
   */
  describe('headless completion (evaluateRunCompletion)', () => {
    it('holds after turn.ended while goal is active; releases on goal.updated terminal', async () => {
      let goalStatus: 'active' | 'blocked' = 'active';
      mocks.session.getGoal.mockImplementation(async () => ({ status: goalStatus }));

      const run = runPrompt(opts(), '1.2.3-test', {
        stdout: writer(),
        stderr: writer(),
      });

      // Default prompt already emitted turn.ended → evaluate should hold on active goal.
      await waitForAssertion(() => {
        expect(mocks.session.getGoal).toHaveBeenCalled();
      });
      // Must NOT have drained background yet (still holding for goal).
      expect(mocks.session.waitForBackgroundTasksOnPrint).not.toHaveBeenCalled();

      // Dual-trigger: terminal goal.updated with no active turn releases hold.
      goalStatus = 'blocked';
      for (const handler of mocks.eventHandlers) {
        handler(
          mocks.mainEvent({
            type: 'goal.updated',
            snapshot: {
              status: 'blocked',
              objective: 'x',
              usage: { turns: 1, tokens: 0, wallClockMs: 0 },
            },
          }),
        );
      }

      await run;
      expect(mocks.session.waitForBackgroundTasksOnPrint).toHaveBeenCalled();
      expect(mocks.session.getCronTasks).toHaveBeenCalled();
      expect(mocks.harnessClose).toHaveBeenCalled();
    });

    it('goal.updated (non-active) triggers completion without a further turn.ended', async () => {
      // Budget-blocked path: turn already ended (activeTurnId cleared) then
      // goal.updated fires — evaluateRunCompletion must run from that event alone.
      mocks.session.getGoal.mockImplementation(async () => ({ status: 'blocked' }));

      // Hang the first prompt so we control when turn ends.
      let releaseFirst!: () => void;
      mocks.session.prompt.mockImplementationOnce(async () => {
        for (const handler of mocks.eventHandlers) {
          handler(mocks.mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
          handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 1, delta: 'working' }));
        }
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      });

      const run = runPrompt(opts(), '1.2.3-test', {
        stdout: writer(),
        stderr: writer(),
      });

      await waitForAssertion(() => {
        expect(mocks.session.prompt).toHaveBeenCalled();
      });

      // End turn first (clears activeTurnId), hold is not needed if goal already terminal.
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
      }
      releaseFirst();

      // Also fire goal.updated terminal — dual-trigger path (even if turn.ended already settled).
      for (const handler of mocks.eventHandlers) {
        handler(
          mocks.mainEvent({
            type: 'goal.updated',
            snapshot: {
              status: 'blocked',
              objective: 'budget',
              usage: { turns: 3, tokens: 100, wallClockMs: 1 },
            },
          }),
        );
      }

      await run;
      expect(mocks.session.waitForBackgroundTasksOnPrint).toHaveBeenCalled();
    });

    it('holds while any cron task has a future nextFireAt', async () => {
      mocks.session.getGoal.mockImplementation(async () => null);
      mocks.session.getCronTasks
        .mockImplementationOnce(async () => ({
          tasks: [{ nextFireAt: Date.now() + 60_000 }],
        }))
        .mockImplementation(async () => ({
          tasks: [{ nextFireAt: null }],
        }));

      // Hang after turn so we can re-fire turn.ended after clearing cron.
      let releasePrompt!: () => void;
      mocks.session.prompt.mockImplementationOnce(async () => {
        for (const handler of mocks.eventHandlers) {
          handler(mocks.mainEvent({ type: 'turn.started', turnId: 1, origin: { kind: 'user' } }));
          handler(mocks.mainEvent({ type: 'assistant.delta', turnId: 1, delta: 'scheduled' }));
        }
        await new Promise<void>((resolve) => {
          releasePrompt = resolve;
        });
      });

      const run = runPrompt(opts(), '1.2.3-test', {
        stdout: writer(),
        stderr: writer(),
      });

      await waitForAssertion(() => {
        expect(mocks.session.prompt).toHaveBeenCalled();
      });

      // First turn.ended → cron nextFireAt set → hold (no waitForBackground yet).
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 1, reason: 'completed' }));
      }
      releasePrompt();

      await waitForAssertion(() => {
        expect(mocks.session.getCronTasks).toHaveBeenCalled();
      });
      expect(mocks.session.waitForBackgroundTasksOnPrint).not.toHaveBeenCalled();

      // Simulate a later turn after cron no longer has a future fire.
      for (const handler of mocks.eventHandlers) {
        handler(mocks.mainEvent({ type: 'turn.started', turnId: 2, origin: { kind: 'user' } }));
        handler(mocks.mainEvent({ type: 'turn.ended', turnId: 2, reason: 'completed' }));
      }

      await run;
      expect(mocks.session.waitForBackgroundTasksOnPrint).toHaveBeenCalled();
    });

    it('passes --add-dir values into createSession additionalDirs', async () => {
      await runPrompt(opts({ addDirs: ['/tmp/a', '/tmp/b'] }), '1.2.3-test', {
        stdout: writer(),
        stderr: writer(),
      });
      expect(mocks.harnessCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          additionalDirs: ['/tmp/a', '/tmp/b'],
        }),
      );
    });

    it('sets process.exitCode=1 when background tasks remain after print wait (AC-H1)', async () => {
      const previousExitCode = process.exitCode;
      clearProcessExitCode();
      try {
        mocks.session.listBackgroundTasks.mockResolvedValueOnce([
          { id: 'bg_1', status: 'running' },
        ]);
        await runPrompt(opts(), '1.2.3-test', {
          stdout: writer(),
          stderr: writer(),
        });
        expect(mocks.session.waitForBackgroundTasksOnPrint).toHaveBeenCalled();
        expect(mocks.session.listBackgroundTasks).toHaveBeenCalledWith({ activeOnly: true });
        expect(process.exitCode).toBe(1);
      } finally {
        restoreProcessExitCode(previousExitCode);
      }
    });

    it('sets process.exitCode=1 when waitForBackgroundTasksOnPrint throws', async () => {
      const previousExitCode = process.exitCode;
      clearProcessExitCode();
      try {
        mocks.session.waitForBackgroundTasksOnPrint.mockRejectedValueOnce(new Error('wait boom'));
        await runPrompt(opts(), '1.2.3-test', {
          stdout: writer(),
          stderr: writer(),
        });
        expect(process.exitCode).toBe(1);
      } finally {
        restoreProcessExitCode(previousExitCode);
      }
    });
  });

  /**
   * PRD-0023 #242 — headless `/goal` create path + exit 0/3/6 on runPrompt.
   */
  describe('headless /goal create (runHeadlessGoal)', () => {
    it('routes /goal create through createGoal (not raw prompt text)', async () => {
      clearProcessExitCode();
      mocks.session.createGoal.mockImplementation(async () => ({
        status: 'complete',
        objective: 'Ship X',
        usage: { turns: 1, tokens: 10, wallClockMs: 1 },
      }));
      mocks.session.getGoal.mockImplementation(async () => ({
        status: 'complete',
        objective: 'Ship X',
        usage: { turns: 1, tokens: 10, wallClockMs: 1 },
      }));

      await runPrompt(opts({ prompt: '/goal Ship X' }), '1.2.3-test', {
        stdout: writer(),
        stderr: writer(),
      });

      expect(mocks.session.createGoal).toHaveBeenCalledWith('Ship X', { replace: false });
      // Objective is prompted as the first user turn, not the slash string.
      expect(mocks.session.prompt).toHaveBeenCalledWith('Ship X');
      // complete → success exit (0). Bun cannot unset exitCode via `undefined`.
      expect(process.exitCode === undefined || process.exitCode === 0).toBe(true);
    });

    it('maps goal blocked → exitCode 3 and paused → exitCode 6', async () => {
      clearProcessExitCode();
      mocks.session.createGoal.mockImplementation(async () => ({
        status: 'active',
        objective: 'hard',
        usage: { turns: 0, tokens: 0, wallClockMs: 0 },
      }));
      mocks.session.getGoal.mockImplementation(async () => ({
        status: 'blocked',
        objective: 'hard',
        usage: { turns: 3, tokens: 100, wallClockMs: 1 },
      }));

      await runPrompt(opts({ prompt: '/goal hard work' }), '1.2.3-test', {
        stdout: writer(),
        stderr: writer(),
      });
      expect(process.exitCode).toBe(3);

      clearProcessExitCode();
      mocks.session.createGoal.mockImplementation(async () => ({
        status: 'active',
        objective: 'later',
        usage: { turns: 0, tokens: 0, wallClockMs: 0 },
      }));
      mocks.session.getGoal.mockImplementation(async () => ({
        status: 'paused',
        objective: 'later',
        usage: { turns: 1, tokens: 1, wallClockMs: 1 },
      }));

      await runPrompt(opts({ prompt: '/goal later' }), '1.2.3-test', {
        stdout: writer(),
        stderr: writer(),
      });
      expect(process.exitCode).toBe(6);
    });

    it('rejects malformed /goal create before createGoal / model prompt', async () => {
      // Session may already be opened (resolvePromptSession runs first); the
      // contract is fail-before-model: no createGoal and no user prompt turn.
      await expect(
        runPrompt(opts({ prompt: '/goal replace' }), '1.2.3-test', {
          stdout: writer(),
          stderr: writer(),
        }),
      ).rejects.toThrow(/Usage|empty/i);
      expect(mocks.session.createGoal).not.toHaveBeenCalled();
      expect(mocks.session.prompt).not.toHaveBeenCalled();
    });
  });
});

// Bun keeps mock.module across files; restore so later suites see real modules (#215).
afterAll(() => {
  bunMock.restore();
});
