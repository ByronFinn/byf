import { mock as bunMock } from 'bun:test';

import { ErrorCodes, ByfError } from '@byfriends/sdk';
import { afterEach, beforeEach, describe, expect, it, vi, afterAll } from 'vitest';

import type { CLIOptions } from '#/cli/options';

const mocks = vi.hoisted(() => {
  const parse = vi.fn();
  return {
    parse,
    createProgram: vi.fn(() => ({ parse })),
    getVersion: vi.fn(() => '0.0.1-alpha.2'),
    validateOptions: vi.fn(),
    runUpdatePreflight: vi.fn(),
    runShell: vi.fn(),
    runPrompt: vi.fn(),
  };
});

// Bun does not hoist vi.mock before static imports — register mocks first, then
// dynamically import subjects so they see the mocked graph.
vi.mock('../../src/cli/commands', () => ({
  createProgram: mocks.createProgram,
}));

vi.mock('../../src/cli/version', () => ({
  getVersion: mocks.getVersion,
}));

const __optionsActual = await import('../../src/cli/options');
vi.mock('../../src/cli/options', () => ({
  ...__optionsActual,
  validateOptions: mocks.validateOptions,
}));

vi.mock('../../src/cli/update/preflight', () => ({
  runUpdatePreflight: mocks.runUpdatePreflight,
}));

vi.mock('../../src/cli/run-shell', () => ({
  runShell: mocks.runShell,
}));

vi.mock('../../src/cli/run-prompt', () => ({
  runPrompt: mocks.runPrompt,
}));

const { validateOptions } = await import('#/cli/options');
const { runPrompt } = await import('#/cli/run-prompt');
const { runShell } = await import('#/cli/run-shell');
const { formatStartupError } = await import('#/cli/startup-error');
const { runUpdatePreflight } = await import('#/cli/update/preflight');
const { handleMainCommand, main } = await import('#/main');

class ExitCalled extends Error {
  constructor(readonly code: number) {
    super(`exit(${code})`);
  }
}

function defaultOpts(): CLIOptions {
  return {
    session: undefined,
    continue: false,
    yolo: false,
    model: undefined,
    outputFormat: undefined,
    prompt: undefined,
    skillsDirs: [],
  };
}

async function runHandleMainCommand(opts: CLIOptions): Promise<number | null> {
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
    throw new ExitCalled(Number(code ?? 0));
  });
  try {
    await handleMainCommand(opts, '0.0.1-alpha.2');
    return null;
  } catch (error) {
    if (error instanceof ExitCalled) {
      return error.code;
    }
    throw error;
  } finally {
    exitSpy.mockRestore();
  }
}

describe('main entry command handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs update preflight before starting the shell', async () => {
    const opts = defaultOpts();
    mocks.validateOptions.mockReturnValue({ options: opts, uiMode: 'shell' });
    mocks.runUpdatePreflight.mockResolvedValue('continue');
    mocks.runShell.mockResolvedValue(void 0);

    const exitCode = await runHandleMainCommand(opts);

    expect(exitCode).toBeNull();
    expect(validateOptions).toHaveBeenCalledWith(opts);
    expect(runUpdatePreflight).toHaveBeenCalledWith('0.0.1-alpha.2', {});
    expect(mocks.runUpdatePreflight.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.runShell.mock.invocationCallOrder[0],
    );
    expect(runShell).toHaveBeenCalledWith(opts, '0.0.1-alpha.2');
  });

  it('runs prompt mode without interactive update preflight', async () => {
    const opts: CLIOptions = {
      ...defaultOpts(),
      prompt: 'explain the repo',
    };
    mocks.validateOptions.mockReturnValue({ options: opts, uiMode: 'print' });
    mocks.runUpdatePreflight.mockResolvedValue('continue');
    mocks.runPrompt.mockResolvedValue(void 0);

    const exitCode = await runHandleMainCommand(opts);

    expect(exitCode).toBeNull();
    expect(runUpdatePreflight).toHaveBeenCalledWith('0.0.1-alpha.2', {
      isTTY: false,
    });
    expect(runPrompt).toHaveBeenCalledWith(opts, '0.0.1-alpha.2');
    expect(runShell).not.toHaveBeenCalled();
  });

  it('keeps shell mode update preflight interactive by default', async () => {
    const opts = defaultOpts();
    mocks.validateOptions.mockReturnValue({ options: opts, uiMode: 'shell' });
    mocks.runUpdatePreflight.mockResolvedValue('continue');
    mocks.runShell.mockResolvedValue(void 0);

    const exitCode = await runHandleMainCommand(opts);

    expect(exitCode).toBeNull();
    expect(runUpdatePreflight).toHaveBeenCalledWith('0.0.1-alpha.2', {});
    expect(runShell).toHaveBeenCalledWith(opts, '0.0.1-alpha.2');
  });

  it('exits early when update preflight requests process exit', async () => {
    const opts = defaultOpts();
    mocks.validateOptions.mockReturnValue({ options: opts, uiMode: 'shell' });
    mocks.runUpdatePreflight.mockResolvedValue('exit');
    mocks.runShell.mockResolvedValue(void 0);

    const exitCode = await runHandleMainCommand(opts);

    expect(exitCode).toBe(0);
    expect(runShell).not.toHaveBeenCalled();
  });

  it('parses CLI arguments via commander', () => {
    main();

    expect(mocks.parse).toHaveBeenCalledWith(process.argv);
  });

  it('formats Byf startup errors with structured fields', () => {
    const error = new ByfError(
      ErrorCodes.SHELL_GIT_BASH_NOT_FOUND,
      'Git Bash was not found on this Windows host. Checked: C:\\Program Files\\Git\\bin\\bash.exe.',
    );
    const red = (text: string): string => `\u001B[31m${text}\u001B[39m`;

    expect(formatStartupError(error, { errorStyle: red })).toBe(
      [
        '\u001B[31merror: Git Bash not found\u001B[39m',
        '',
        '\u001B[31mmessage:\u001B[39m',
        '\u001B[31mGit Bash was not found on this Windows host. Checked: C:\\Program Files\\Git\\bin\\bash.exe.\u001B[39m',
        '',
      ].join('\n'),
    );
  });

  it('keeps generic startup errors on the legacy fallback path', () => {
    expect(formatStartupError(new Error('Provider not set'), { errorStyle: (text) => text })).toBe(
      'error: failed to start shell: Provider not set\n',
    );
  });

  it('formats generic prompt mode errors without saying shell', () => {
    expect(
      formatStartupError(new Error('Provider not set'), {
        errorStyle: (text) => text,
        operation: 'run prompt',
      }),
    ).toBe('error: failed to run prompt: Provider not set\n');
  });
});

// Bun keeps mock.module across files; restore so later suites see real modules (#215).
afterAll(() => {
  bunMock.restore();
});
