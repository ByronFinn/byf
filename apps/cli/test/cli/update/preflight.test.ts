import { mock as bunMock } from 'bun:test';
import type * as ChildProcess from 'node:child_process';
import { EventEmitter } from 'node:events';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { emptyUpdateCache, type UpdateCache } from '#/cli/update/types';

const mocks = vi.hoisted(() => ({
  readUpdateCache: vi.fn(),
  detectInstallSource: vi.fn(),
  promptForInstallConfirmation: vi.fn(),
  refreshUpdateCache: vi.fn(),
  spawn: vi.fn(),
}));

const __cacheActual = await import('../../../src/cli/update/cache');
vi.mock('../../../src/cli/update/cache', () => ({
  ...__cacheActual,
  readUpdateCache: mocks.readUpdateCache,
}));

const __sourceActual = await import('../../../src/cli/update/source');
vi.mock('../../../src/cli/update/source', () => ({
  ...__sourceActual,
  detectInstallSource: mocks.detectInstallSource,
}));

const __promptActual = await import('../../../src/cli/update/prompt');
vi.mock('../../../src/cli/update/prompt', () => ({
  ...__promptActual,
  promptForInstallConfirmation: mocks.promptForInstallConfirmation,
}));

const __refreshActual = await import('../../../src/cli/update/refresh');
vi.mock('../../../src/cli/update/refresh', () => ({
  ...__refreshActual,
  refreshUpdateCache: mocks.refreshUpdateCache,
}));

const __childActual = await import('node:child_process');
vi.mock('node:child_process', () => ({
  ...__childActual,
  spawn: mocks.spawn,
}));

const { readUpdateCache } = await import('#/cli/update/cache');
const { runUpdatePreflight } = await import('#/cli/update/preflight');
const { promptForInstallConfirmation } = await import('#/cli/update/prompt');
const { refreshUpdateCache } = await import('#/cli/update/refresh');
const { detectInstallSource } = await import('#/cli/update/source');

function cacheWith(version: string): UpdateCache {
  return {
    source: 'cdn',
    checkedAt: '2026-04-23T08:00:00.000Z',
    latest: version,
  };
}

function captureOutput(): {
  stdout: string[];
  stderr: string[];
  options: {
    stdout: { write(chunk: string): boolean };
    stderr: { write(chunk: string): boolean };
    isTTY: boolean;
  };
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    options: {
      stdout: {
        write: (chunk: string) => {
          stdout.push(chunk);
          return true;
        },
      },
      stderr: {
        write: (chunk: string) => {
          stderr.push(chunk);
          return true;
        },
      },
      isTTY: true,
    },
  };
}

function mockSpawnExit(code: number, signal: NodeJS.Signals | null = null): void {
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => {
      child.emit('exit', code, signal);
    });
    return child;
  });
}

describe('runUpdatePreflight', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('continues on first launch with empty cache, still refreshes in background', async () => {
    mocks.readUpdateCache.mockResolvedValue(emptyUpdateCache());
    mocks.refreshUpdateCache.mockResolvedValue(emptyUpdateCache());
    const { options } = captureOutput();

    await expect(runUpdatePreflight('0.4.0', options)).resolves.toBe('continue');
    expect(readUpdateCache).toHaveBeenCalledTimes(1);
    expect(refreshUpdateCache).toHaveBeenCalledTimes(1);
    expect(detectInstallSource).not.toHaveBeenCalled();
  });

  it('skips when non-interactive', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    const { options } = captureOutput();
    await expect(runUpdatePreflight('0.4.0', { ...options, isTTY: false })).resolves.toBe(
      'continue',
    );
    expect(detectInstallSource).not.toHaveBeenCalled();
  });

  it('npm-global: prompts and spawns npm install -g', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('npm-global');
    mocks.promptForInstallConfirmation.mockResolvedValue(true);
    mockSpawnExit(0);
    const { stdout, options } = captureOutput();

    await expect(runUpdatePreflight('0.4.0', options)).resolves.toBe('exit');
    expect(mocks.promptForInstallConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        installCommand: 'npm install -g @byfriends/cli@0.5.0',
        installSource: 'npm-global',
      }),
    );
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^npm(\.cmd)?$/),
      ['install', '-g', '@byfriends/cli@0.5.0'],
      { stdio: 'inherit' },
    );
    expect(stdout.join('')).toContain('Updated @byfriends/cli to 0.5.0');
  });

  it('pnpm-global: spawns pnpm add -g', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('pnpm-global');
    mocks.promptForInstallConfirmation.mockResolvedValue(true);
    mockSpawnExit(0);
    const { options } = captureOutput();
    await runUpdatePreflight('0.4.0', options);
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^pnpm(\.cmd)?$/),
      ['add', '-g', '@byfriends/cli@0.5.0'],
      { stdio: 'inherit' },
    );
  });

  it('yarn-global: spawns yarn global add', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('yarn-global');
    mocks.promptForInstallConfirmation.mockResolvedValue(true);
    mockSpawnExit(0);
    const { options } = captureOutput();
    await runUpdatePreflight('0.4.0', options);
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^yarn(\.cmd)?$/),
      ['global', 'add', '@byfriends/cli@0.5.0'],
      { stdio: 'inherit' },
    );
  });

  it('bun-global: spawns bun add -g', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('bun-global');
    mocks.promptForInstallConfirmation.mockResolvedValue(true);
    mockSpawnExit(0);
    const { options } = captureOutput();
    await runUpdatePreflight('0.4.0', options);
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^bun(\.exe)?$/),
      ['add', '-g', '@byfriends/cli@0.5.0'],
      { stdio: 'inherit' },
    );
  });

  it('native on darwin: spawns bash -c curl|bash', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('native');
    mocks.promptForInstallConfirmation.mockResolvedValue(true);
    mockSpawnExit(0);
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    try {
      const { options } = captureOutput();
      await runUpdatePreflight('0.4.0', options);
      expect(mocks.spawn).toHaveBeenCalledWith(
        'bash',
        [
          '-c',
          expect.stringContaining(
            'curl -fsSL https://github.com/ByronFinn/byf/releases/latest/download/install.sh',
          ),
        ],
        { stdio: 'inherit' },
      );
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('native on win32: prints manual powershell command, does not spawn', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('native');
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      const { stdout, options } = captureOutput();
      await expect(runUpdatePreflight('0.4.0', options)).resolves.toBe('continue');
      expect(stdout.join('')).toContain(
        'irm https://github.com/ByronFinn/byf/releases/latest/download/install.ps1 | iex',
      );
      expect(promptForInstallConfirmation).not.toHaveBeenCalled();
      expect(mocks.spawn).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    }
  });

  it('unsupported: prints fallback npm command', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('unsupported');
    const { stdout, options } = captureOutput();
    await expect(runUpdatePreflight('0.4.0', options)).resolves.toBe('continue');
    expect(stdout.join('')).toContain('npm install -g @byfriends/cli@0.5.0');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('declined install continues without spawn', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('npm-global');
    mocks.promptForInstallConfirmation.mockResolvedValue(false);
    const { options } = captureOutput();
    await expect(runUpdatePreflight('0.4.0', options)).resolves.toBe('continue');
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('warns and continues when spawn exits non-zero', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('npm-global');
    mocks.promptForInstallConfirmation.mockResolvedValue(true);
    mockSpawnExit(1);
    const { stderr, options } = captureOutput();
    await expect(runUpdatePreflight('0.4.0', options)).resolves.toBe('continue');
    expect(stderr.join('')).toContain('warning: failed to install');
  });
});

// Bun keeps mock.module across files; restore so later suites see real modules (#215).
afterAll(() => {
  bunMock.restore();
});
