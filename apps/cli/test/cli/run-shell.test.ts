import { execSync } from 'node:child_process';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { runShell } from '#/cli/run-shell';

import { captureProcessWrite, ExitCalled, mockProcessExit } from '../helpers/process';

type CreateByfDeviceId = (homeDir: string, options?: { onFirstLaunch?: (id: string) => void }) => string;

const mocks = vi.hoisted(() => {
  type TuiConfigFallback = {
    theme: 'dark' | 'light' | 'auto';
    editorCommand: string | null;
    notifications: { enabled: boolean; condition: 'unfocused' | 'always' };
  };

  class TuiConfigParseError extends Error {
    readonly fallback: TuiConfigFallback;

    constructor(fallback: TuiConfigFallback) {
      super('Invalid TUI config in ~/.byf/tui.toml; using defaults.');
      this.fallback = fallback;
    }
  }

  return {
    loadTuiConfig: vi.fn(),
    detectTerminalTheme: vi.fn(),
    byfHarnessConstructor: vi.fn(),
    harnessEnsureConfigFile: vi.fn(),
    harnessGetConfig: vi.fn(async () => ({
      providers: {},
      defaultModel: 'k2',
      telemetry: true,
    })),
    harnessGetCachedAccessToken: vi.fn(),
    harnessClose: vi.fn(),
    harnessTrack: vi.fn(),
    byfTuiConstructor: vi.fn(),
    tuiStart: vi.fn(),
    tuiGetStartupMcpMs: vi.fn(async () => 0),
    tuiGetCurrentSessionId: vi.fn(() => ''),
    tuiHasSessionContent: vi.fn(() => false),
    createByfDeviceId: vi.fn<CreateByfDeviceId>(() => 'device-1'),
    resolveByfHome: vi.fn((homeDir?: string) => homeDir ?? '/tmp/byf-test-home'),
    harnessCreatesDeviceIdOnConstruction: false,
    execSync: vi.fn(),
    TuiConfigParseError,
  };
});

vi.mock('@byfriends/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@byfriends/sdk')>();
  return {
    ...actual,
    resolveByfHome: mocks.resolveByfHome,
    ByfHarness: class {
      homeDir: string;
      auth = {
        getCachedAccessToken: mocks.harnessGetCachedAccessToken,
      };
      ensureConfigFile = mocks.harnessEnsureConfigFile;
      getConfig = mocks.harnessGetConfig;
      close = mocks.harnessClose;
      track = mocks.harnessTrack;

      constructor(...args: unknown[]) {
        const options = args[0] as { readonly homeDir?: string } | undefined;
        this.homeDir = options?.homeDir ?? '/tmp/byf-test-home';
        if (mocks.harnessCreatesDeviceIdOnConstruction) {
          mocks.createByfDeviceId(this.homeDir);
        }
        mocks.byfHarnessConstructor(...args);
      }
    },
  };
});

vi.mock('../../src/tui/config', () => ({
  loadTuiConfig: mocks.loadTuiConfig,
  TuiConfigParseError: mocks.TuiConfigParseError,
}));

vi.mock('../../src/tui/index', () => ({
  ByfTui: class {
    onExit?: () => Promise<void>;

    constructor(...args: unknown[]) {
      mocks.byfTuiConstructor(this, ...args);
    }

    start = mocks.tuiStart;
    getStartupMcpMs = mocks.tuiGetStartupMcpMs;
    getCurrentSessionId = mocks.tuiGetCurrentSessionId;
    hasSessionContent = mocks.tuiHasSessionContent;
  },
}));

vi.mock('../../src/tui/theme/detect', () => ({
  detectTerminalTheme: mocks.detectTerminalTheme,
}));

vi.mock('node:child_process', () => ({
  execSync: mocks.execSync,
}));

describe('runShell', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mocks.harnessGetConfig.mockResolvedValue({
      providers: {},
      defaultModel: 'k2',
      telemetry: true,
    });
    mocks.tuiGetStartupMcpMs.mockResolvedValue(0);
    mocks.tuiGetCurrentSessionId.mockReturnValue('');
    mocks.tuiHasSessionContent.mockReturnValue(false);
    mocks.createByfDeviceId.mockImplementation(() => 'device-1');
    mocks.resolveByfHome.mockImplementation(
      (homeDir?: string) => homeDir ?? '/tmp/byf-test-home',
    );
    mocks.harnessCreatesDeviceIdOnConstruction = false;
  });

  it('constructs ByfHarness and ByfTui with startup input', async () => {
    mocks.loadTuiConfig.mockResolvedValue({
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    });
    mocks.tuiStart.mockResolvedValue(undefined);
    mocks.tuiGetStartupMcpMs.mockResolvedValue(47);
    mocks.tuiGetCurrentSessionId.mockReturnValue('ses-startup');

    const cliOptions = {
      session: undefined,
      continue: false,
      yolo: true,
      
      model: undefined,
      outputFormat: undefined,
      prompt: undefined,
      skillsDirs: [],
    };

    await runShell(cliOptions, '1.2.3-test');

    expect(mocks.byfHarnessConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        identity: expect.objectContaining({
          userAgentProduct: 'byf-cli',
          version: '1.2.3-test',
        }),
      }),
    );
    expect(mocks.harnessEnsureConfigFile).toHaveBeenCalledOnce();
    expect(execSync).toHaveBeenCalledWith('stty -ixon', { stdio: 'ignore' });
    expect(mocks.byfTuiConstructor).toHaveBeenCalledTimes(1);

    const [, harness, startupInput] = mocks.byfTuiConstructor.mock.calls[0]!;
    expect(harness).toBeTypeOf('object');
    expect(startupInput).toMatchObject({
      cliOptions,
      tuiConfig: {
        theme: 'dark',
        editorCommand: null,
        notifications: { enabled: true, condition: 'unfocused' },
      },
      version: '1.2.3-test',
      workDir: process.cwd(),
      resolvedTheme: 'dark',
    });
    expect(mocks.tuiStart).toHaveBeenCalledOnce();
  });

  it('marks resumed lifecycle starts from session flags', async () => {
    mocks.loadTuiConfig.mockRejectedValue(
      new mocks.TuiConfigParseError({
        theme: 'auto',
        editorCommand: 'vim',
        notifications: { enabled: true, condition: 'always' },
      }),
    );
    mocks.detectTerminalTheme.mockResolvedValue('light');
    mocks.tuiStart.mockResolvedValue(undefined);

    await runShell(
      {
        session: '',
        continue: false,
        yolo: false,
        
        model: undefined,
        outputFormat: undefined,
        prompt: undefined,
        skillsDirs: [],
      },
      '1.2.3-test',
    );

    expect(mocks.detectTerminalTheme).toHaveBeenCalledOnce();
    const [, , startupInput] = mocks.byfTuiConstructor.mock.calls[0]!;
    expect(startupInput).toMatchObject({
      startupNotice: 'Invalid TUI config in ~/.byf/tui.toml; using defaults.',
      resolvedTheme: 'light',
      tuiConfig: {
        theme: 'auto',
        editorCommand: 'vim',
        notifications: { enabled: true, condition: 'always' },
      },
    });
  });

  it('closes the harness when TUI startup fails', async () => {
    mocks.loadTuiConfig.mockResolvedValue({
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    });
    mocks.tuiStart.mockRejectedValue(new Error('boom'));

    await expect(
      runShell(
        {
          session: undefined,
          continue: false,
          yolo: false,
          
          model: undefined,
          outputFormat: undefined,
          prompt: undefined,
          skillsDirs: [],
        },
        '1.2.3-test',
      ),
    ).rejects.toThrow('boom');

    expect(mocks.harnessClose).toHaveBeenCalledOnce();
  });

  it('tracks exit and prints resume instructions from the TUI exit handler', async () => {
    mocks.loadTuiConfig.mockResolvedValue({
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    });
    mocks.tuiStart.mockResolvedValue(undefined);
    mocks.tuiGetCurrentSessionId.mockReturnValue('ses-1');
    mocks.tuiHasSessionContent.mockReturnValue(true);

    const stdout = captureProcessWrite('stdout');
    const stderr = captureProcessWrite('stderr');
    const exitSpy = mockProcessExit();

    try {
      await runShell(
        {
          session: undefined,
          continue: false,
          yolo: false,
          
          model: undefined,
          outputFormat: undefined,
          prompt: undefined,
          skillsDirs: [],
        },
        '1.2.3-test',
      );
      const [tui] = mocks.byfTuiConstructor.mock.calls[0]!;
      mocks.harnessTrack.mockClear();

      await expect((tui as { onExit: () => Promise<void> }).onExit()).rejects.toBeInstanceOf(
        ExitCalled,
      );

      expect(stdout.text()).toBe(' Bye!\n');
      expect(stderr.text()).toContain(' To resume this session: byf -r ses-1');
    } finally {
      exitSpy.mockRestore();
      stdout.restore();
      stderr.restore();
    }
  });
});
