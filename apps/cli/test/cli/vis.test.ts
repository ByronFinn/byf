/**
 * `byf vis`
 *
 * Verifies the CLI layer: flag parsing, session-id deep link, browser open
 * toggle, and error handling (loopback-auth, port-in-use), all through the
 * injected VisDeps seam (startServer / openUrl / waitForShutdown / stdout /
 * stderr / exit).
 */

import { Command } from 'commander';
import { describe, expect, it, vi } from 'vitest';

import { handleVis, registerVisCommand } from '#/cli/sub/vis';
import type { VisDeps, VisOptions } from '#/cli/sub/vis';

class ExitCalled extends Error {
  constructor(public readonly code: number) {
    super(`exit(${code})`);
  }
}

interface StartCall {
  host: string;
  port: number;
}

function makeDeps(overrides: Partial<VisDeps> = {}): {
  deps: VisDeps;
  stdout: string[];
  stderr: string[];
  exitCodes: number[];
  openedUrls: string[];
  startCalls: StartCall[];
  closeSpy: ReturnType<typeof vi.fn>;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const exitCodes: number[] = [];
  const openedUrls: string[] = [];
  const startCalls: StartCall[] = [];
  const closeSpy = vi.fn();
  const deps: VisDeps = {
    startServer: async (opts) => {
      const host = opts.host ?? '127.0.0.1';
      const port = opts.port ?? 3001;
      startCalls.push({ host, port });
      return {
        host,
        port,
        url: `http://${host}:${port}`,
        close: closeSpy,
      };
    },
    openUrl: async (url) => {
      openedUrls.push(url);
    },
    waitForShutdown: async (onClose) => {
      onClose();
    },
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
    exit: ((code: number) => {
      exitCodes.push(code);
      throw new ExitCalled(code);
    }) as VisDeps['exit'],
    ...overrides,
  };
  return { deps, stdout, stderr, exitCodes, openedUrls, startCalls, closeSpy };
}

async function runVis(
  deps: VisDeps,
  sessionId: string | undefined,
  opts: VisOptions,
): Promise<void> {
  try {
    await handleVis(deps, sessionId, opts);
  } catch (error) {
    if (error instanceof ExitCalled) return;
    throw error;
  }
}

describe('byf vis', () => {
  it('starts the server on the default host:port and opens the browser to the list', async () => {
    const { deps, stdout, exitCodes, openedUrls, startCalls } = makeDeps();

    await runVis(deps, undefined, { open: true });

    expect(exitCodes).toEqual([0]);
    expect(startCalls).toEqual([{ host: '127.0.0.1', port: 3001 }]);
    expect(openedUrls).toEqual(['http://127.0.0.1:3001/']);
    expect(stdout.join('')).toContain('http://127.0.0.1:3001');
  });

  it('opens a deep link to the session when a session id is given', async () => {
    const { deps, openedUrls } = makeDeps();

    await runVis(deps, 'session_abc123', { open: true });

    expect(openedUrls).toEqual(['http://127.0.0.1:3001/sessions/session_abc123']);
  });

  it('honors --port and --host overrides', async () => {
    const { deps, openedUrls, startCalls } = makeDeps();

    await runVis(deps, undefined, { port: 4000, host: '127.0.0.1', open: true });

    expect(startCalls).toEqual([{ host: '127.0.0.1', port: 4000 }]);
    expect(openedUrls).toEqual(['http://127.0.0.1:4000/']);
  });

  it('does not open the browser when --no-open is set', async () => {
    const { deps, openedUrls, stdout } = makeDeps();

    await runVis(deps, undefined, { open: false });

    expect(openedUrls).toEqual([]);
    // banner still printed
    expect(stdout.join('')).toContain('http://127.0.0.1:3001');
  });

  it('exits with a friendly auth-token hint when binding a non-loopback host without a token', async () => {
    const { deps, stderr, exitCodes, openedUrls } = makeDeps({
      startServer: async () => {
        throw new Error(
          'VIS_AUTH_TOKEN is required when binding vis-server outside loopback (host=0.0.0.0)',
        );
      },
    });

    await runVis(deps, undefined, { host: '0.0.0.0', open: true });

    expect(exitCodes).toContain(1);
    const msg = stderr.join('');
    expect(msg).toContain('VIS_AUTH_TOKEN');
    expect(msg).toContain('openssl rand -hex 16');
    expect(openedUrls).toEqual([]);
  });

  it('exits with a port-in-use hint when the port is busy', async () => {
    const { deps, stderr, exitCodes, openedUrls } = makeDeps({
      startServer: async () => {
        throw new Error('EADDRINUSE: address already in use');
      },
    });

    await runVis(deps, undefined, { port: 3001, open: true });

    expect(exitCodes).toContain(1);
    const msg = stderr.join('');
    expect(msg).toMatch(/port.*in use|--port/i);
    expect(openedUrls).toEqual([]);
  });

  it('registers the command with port/host/no-open options and a session id argument', () => {
    const program = new Command('byf');
    const { deps } = makeDeps();

    registerVisCommand(program, deps);

    const command = program.commands.find((item) => item.name() === 'vis');
    expect(command).toBeDefined();
    const flagNames = command!.options.map((o) => o.long);
    expect(flagNames).toContain('--port');
    expect(flagNames).toContain('--host');
    expect(flagNames).toContain('--no-open');
  });

  it('parses flags via commander end-to-end', async () => {
    const { deps, openedUrls, startCalls } = makeDeps();
    const program = new Command('byf');
    registerVisCommand(program, deps);

    try {
      await program.parseAsync(['node', 'byf', 'vis', '--port', '5050', 'session_xyz']);
    } catch (error) {
      if (!(error instanceof ExitCalled)) throw error;
    }

    expect(startCalls).toEqual([{ host: '127.0.0.1', port: 5050 }]);
    expect(openedUrls).toEqual(['http://127.0.0.1:5050/sessions/session_xyz']);
  });

  it('closes the server on shutdown', async () => {
    const { deps, closeSpy } = makeDeps();

    await runVis(deps, undefined, { open: true });

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
