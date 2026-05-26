import type * as ChildProcess from 'node:child_process';
import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readUpdateCache } from '#/cli/update/cache';
import { runUpdatePreflight } from '#/cli/update/preflight';
import { promptForInstallConfirmation } from '#/cli/update/prompt';
import type * as PromptModule from '#/cli/update/prompt';
import { refreshUpdateCache } from '#/cli/update/refresh';
import type * as RefreshModule from '#/cli/update/refresh';
import { detectInstallSource } from '#/cli/update/source';
import { emptyUpdateCache, type UpdateCache } from '#/cli/update/types';

const mocks = vi.hoisted(() => ({
  readUpdateCache: vi.fn(),
  detectInstallSource: vi.fn(),
  promptForInstallConfirmation: vi.fn(),
  refreshUpdateCache: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('../../../src/cli/update/cache', () => ({
  readUpdateCache: mocks.readUpdateCache,
}));

vi.mock('../../../src/cli/update/source', () => ({
  detectInstallSource: mocks.detectInstallSource,
}));

vi.mock('../../../src/cli/update/prompt', async () => {
  const actual = await vi.importActual<typeof PromptModule>('../../../src/cli/update/prompt.js');
  return {
    ...actual,
    promptForInstallConfirmation: mocks.promptForInstallConfirmation,
  };
});

vi.mock('../../../src/cli/update/refresh', async () => {
  const actual = await vi.importActual<typeof RefreshModule>('../../../src/cli/update/refresh.js');
  return {
    ...actual,
    refreshUpdateCache: mocks.refreshUpdateCache,
  };
});

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof ChildProcess>('node:child_process');
  return {
    ...actual,
    spawn: mocks.spawn,
  };
});

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
      stdout: { write: (chunk: string) => { stdout.push(chunk); return true; } },
      stderr: { write: (chunk: string) => { stderr.push(chunk); return true; } },
      isTTY: true,
    },
  };
}

function mockSpawnExit(code: number, signal: NodeJS.Signals | null = null): void {
  mocks.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    queueMicrotask(() => { child.emit('exit', code, signal); });
    return child;
  });
}

describe('runUpdatePreflight', () => {
  afterEach(() => { vi.clearAllMocks(); });

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
    await expect(
      runUpdatePreflight('0.4.0', { ...options, isTTY: false }),
    ).resolves.toBe('continue');
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
        installCommand: 'npm install -g @moonshot-ai/kimi-code@0.5.0',
        installSource: 'npm-global',
      }),
    );
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^npm(\.cmd)?$/),
      ['install', '-g', '@moonshot-ai/kimi-code@0.5.0'],
      { stdio: 'inherit' },
    );
    expect(stdout.join('')).toContain('Updated @moonshot-ai/kimi-code to 0.5.0');
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
      ['add', '-g', '@moonshot-ai/kimi-code@0.5.0'],
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
      ['global', 'add', '@moonshot-ai/kimi-code@0.5.0'],
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
      ['add', '-g', '@moonshot-ai/kimi-code@0.5.0'],
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
        ['-c', expect.stringContaining('curl -fsSL https://code.kimi.com/kimi-code/install.sh')],
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
      expect(stdout.join('')).toContain('irm https://code.kimi.com/kimi-code/install.ps1 | iex');
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
    expect(stdout.join('')).toContain('npm install -g @moonshot-ai/kimi-code@0.5.0');
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

  it('tracks update_prompted telemetry', async () => {
    mocks.readUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.refreshUpdateCache.mockResolvedValue(cacheWith('0.5.0'));
    mocks.detectInstallSource.mockResolvedValue('npm-global');
    mocks.promptForInstallConfirmation.mockResolvedValue(false);
    const { options } = captureOutput();
    const track = vi.fn();
    await runUpdatePreflight('0.4.0', { ...options, track });
    expect(track).toHaveBeenCalledWith('update_prompted', expect.objectContaining({
      current: '0.4.0',
      latest: '0.5.0',
      decision: 'prompt-install',
      source: 'npm-global',
    }));
  });
});
