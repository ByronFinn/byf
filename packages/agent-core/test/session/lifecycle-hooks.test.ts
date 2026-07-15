import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Writable } from 'node:stream';

import { localKaos, type KaosProcess } from '@byfriends/kaos';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SDKSessionRPC } from '../../src/rpc';
import { Session } from '../../src/session';

const OS_ENV = {
  osKind: 'Linux',
  osArch: 'arm64',
  osVersion: 'test',
  shellPath: '/bin/bash',
  shellName: 'bash',
} as const;

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
  }
});

describe('Session lifecycle hooks', () => {
  it('fires SessionStart on startup and SessionEnd on close', async () => {
    const { command, logPath, sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-123',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      hooks: [
        { event: 'SessionStart', matcher: 'startup', command, timeout: 5 },
        { event: 'SessionEnd', matcher: 'exit', command, timeout: 5 },
      ],
    });

    await session.createMain();
    await session.close();

    expect(await readHookPayloads(logPath)).toMatchObject([
      {
        hook_event_name: 'SessionStart',
        session_id: 'session-123',
        cwd: workDir,
        source: 'startup',
      },
      {
        hook_event_name: 'SessionEnd',
        session_id: 'session-123',
        cwd: workDir,
        reason: 'exit',
      },
    ]);
  });

  it('fires SessionStart with resume source after loading metadata', async () => {
    const { command, logPath, sessionDir, workDir } = await hookFixture();
    await writeFile(
      join(sessionDir, 'state.json'),
      JSON.stringify({
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        title: 'Resumed Session',
        isCustomTitle: false,
        agents: {},
        custom: {},
      }),
      'utf-8',
    );
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-456',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      hooks: [{ event: 'SessionStart', matcher: 'resume', command, timeout: 5 }],
    });

    await session.resume();

    expect(await readHookPayloads(logPath)).toMatchObject([
      {
        hook_event_name: 'SessionStart',
        session_id: 'session-456',
        cwd: workDir,
        source: 'resume',
      },
    ]);
  });

  it('does not let failing SessionStart or SessionEnd hook commands interrupt startup or close', async () => {
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-reject',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      hooks: [
        { event: 'SessionStart', matcher: 'startup', command: 'exit 1', timeout: 5 },
        { event: 'SessionEnd', matcher: 'exit', command: 'exit 1', timeout: 5 },
      ],
    });

    await expect(session.createMain()).resolves.toBeDefined();
    await expect(session.close()).resolves.toBeUndefined();
  });

  it('stops background tasks on close when keepAliveOnExit is false', async () => {
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-bg-cleanup',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      background: { keepAliveOnExit: false },
    });
    const agent = await session.createMain();
    const { proc, killSpy } = pendingProcess();
    const taskId = agent.background.register(proc, 'sleep 60', 'exit cleanup');

    await session.close();

    expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    expect(agent.background.getTask(taskId)?.status).toBe('killed');
  });

  it('lets the environment override config when deciding background task cleanup', async () => {
    vi.stubEnv('BYF_CODE_BACKGROUND_KEEP_ALIVE_ON_EXIT', '0');
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-bg-env-cleanup',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      background: { keepAliveOnExit: true },
    });
    const agent = await session.createMain();
    const { proc, killSpy } = pendingProcess();
    const taskId = agent.background.register(proc, 'sleep 60', 'env cleanup');

    await session.close();

    expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    expect(agent.background.getTask(taskId)?.status).toBe('killed');
  });
});

describe('Session.waitForBackgroundTasksOnPrint', () => {
  it('waits for background tasks to finish (unconditional, ignores keepAliveOnExit)', async () => {
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-print-drain',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      // keepAliveOnExit: true (default) — drain must run anyway (ADR-0029 §2/§5)
      background: { keepAliveOnExit: true, printWaitCeilingS: 5 },
    });
    const agent = await session.createMain();
    const { proc } = pendingProcess(0); // exit 0 = natural completion
    const taskId = agent.background.register(proc, 'sleep 1', 'print drain test');

    // Start wait; then complete the task shortly after via manual kill
    // (simulates natural completion — drain itself never kills).
    const waitP = session.waitForBackgroundTasksOnPrint();
    await new Promise((r) => setTimeout(r, 50));
    await proc.kill(); // resolves waitPromise → task finishes
    await waitP;

    // Task finished (not killed by drain — drain only waits)
    expect(agent.background.getTask(taskId)?.status).toBe('completed');
    await session.close();
  });

  it('returns immediately when no active background tasks exist', async () => {
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-print-drain-empty',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
    });
    await session.createMain();

    const start = Date.now();
    await session.waitForBackgroundTasksOnPrint();
    expect(Date.now() - start).toBeLessThan(500);
    await session.close();
  });

  it('does not kill tasks on ceiling timeout', async () => {
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-print-drain-timeout',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      background: { printWaitCeilingS: 1 },
    });
    const agent = await session.createMain();
    const { proc, killSpy } = pendingProcess();
    agent.background.register(proc, 'sleep 60', 'timeout test');

    await session.waitForBackgroundTasksOnPrint();

    // Ceiling expired — task NOT killed, still running
    expect(killSpy).not.toHaveBeenCalled();
    // Clean up
    await proc.kill();
    await session.close();
  });

  it('uses env BYF_PRINT_WAIT_CEILING_S when background config omits printWaitCeilingS', async () => {
    // Default path: no printWaitCeilingS in SessionConfig.background — must not
    // hang on NaN deadline (old bug: parseInt('') ?? 3600). Env short-ceiling
    // proves the real shipped resolvePrintWaitCeilingS path fires.
    const prev = process.env['BYF_PRINT_WAIT_CEILING_S'];
    process.env['BYF_PRINT_WAIT_CEILING_S'] = '1';
    try {
      const { sessionDir, workDir } = await hookFixture();
      const session = new Session({
        runtime: { kaos: localKaos, osEnv: OS_ENV },
        id: 'session-print-drain-env-default',
        homedir: sessionDir,
        cwd: workDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        // intentionally no background.printWaitCeilingS
      });
      const agent = await session.createMain();
      const { proc, killSpy } = pendingProcess();
      agent.background.register(proc, 'sleep 60', 'env ceiling test');

      const start = Date.now();
      await session.waitForBackgroundTasksOnPrint();
      const elapsed = Date.now() - start;

      // ~1s ceiling (not 3600s hang, not immediate NaN-deadline skip)
      expect(elapsed).toBeGreaterThanOrEqual(800);
      expect(elapsed).toBeLessThan(5000);
      expect(killSpy).not.toHaveBeenCalled();
      await proc.kill();
      await session.close();
    } finally {
      if (prev === undefined) {
        delete process.env['BYF_PRINT_WAIT_CEILING_S'];
      } else {
        process.env['BYF_PRINT_WAIT_CEILING_S'] = prev;
      }
    }
  });

  it('env overrides config printWaitCeilingS on the real wait path', async () => {
    const prev = process.env['BYF_PRINT_WAIT_CEILING_S'];
    process.env['BYF_PRINT_WAIT_CEILING_S'] = '1';
    try {
      const { sessionDir, workDir } = await hookFixture();
      const session = new Session({
        runtime: { kaos: localKaos, osEnv: OS_ENV },
        id: 'session-print-drain-env-over-config',
        homedir: sessionDir,
        cwd: workDir,
        rpc: createSessionRpc(),
        skills: { explicitDirs: [join(workDir, 'missing-skills')] },
        // Config would wait ~60s if env did not win.
        background: { printWaitCeilingS: 60 },
      });
      const agent = await session.createMain();
      const { proc } = pendingProcess();
      agent.background.register(proc, 'sleep 60', 'env beats config');

      const start = Date.now();
      await session.waitForBackgroundTasksOnPrint();
      expect(Date.now() - start).toBeLessThan(5000);

      await proc.kill();
      await session.close();
    } finally {
      if (prev === undefined) {
        delete process.env['BYF_PRINT_WAIT_CEILING_S'];
      } else {
        process.env['BYF_PRINT_WAIT_CEILING_S'] = prev;
      }
    }
  });

  it('still drains when keepAliveOnExit is false (unconditional, decoupled)', async () => {
    // AC #237: print drain must NOT read keepAliveOnExit — that flag only
    // controls Session.close stopAll. keepAliveOnExit=false must still wait.
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-print-drain-no-keepalive',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      background: { keepAliveOnExit: false, printWaitCeilingS: 5 },
    });
    const agent = await session.createMain();
    const { proc } = pendingProcess(0);
    const taskId = agent.background.register(proc, 'sleep 1', 'no-keepalive drain');

    const waitP = session.waitForBackgroundTasksOnPrint();
    await new Promise((r) => setTimeout(r, 50));
    await proc.kill();
    await waitP;

    expect(agent.background.getTask(taskId)?.status).toBe('completed');
    await session.close();
  });

  it('re-scans for fan-out tasks registered while waiting (multi-pass)', async () => {
    // AC #237: subagent fan-out may register new background tasks after the
    // first enumeration; wait must loop until the active set is empty.
    const { sessionDir, workDir } = await hookFixture();
    const session = new Session({
      runtime: { kaos: localKaos, osEnv: OS_ENV },
      id: 'session-print-drain-fanout',
      homedir: sessionDir,
      cwd: workDir,
      rpc: createSessionRpc(),
      skills: { explicitDirs: [join(workDir, 'missing-skills')] },
      background: { printWaitCeilingS: 8 },
    });
    const agent = await session.createMain();
    const first = pendingProcess(0);
    const second = pendingProcess(0);
    const firstId = agent.background.register(first.proc, 'sleep 1', 'fanout-first');

    const waitP = session.waitForBackgroundTasksOnPrint();
    // While the first task is still active, fan-out a second task so the
    // next scan of waitForBackgroundTasksOnPrint must pick it up.
    await new Promise((r) => setTimeout(r, 30));
    const secondId = agent.background.register(second.proc, 'sleep 1', 'fanout-second');
    await first.proc.kill();
    // Give the wait loop a moment to re-scan before completing the second.
    await new Promise((r) => setTimeout(r, 80));
    await second.proc.kill();
    await waitP;

    expect(agent.background.getTask(firstId)?.status).toBe('completed');
    expect(agent.background.getTask(secondId)?.status).toBe('completed');
    await session.close();
  });
});

async function hookFixture(): Promise<{
  readonly command: string;
  readonly logPath: string;
  readonly sessionDir: string;
  readonly workDir: string;
}> {
  const dir = await makeTempDir();
  const workDir = join(dir, 'work');
  const sessionDir = join(dir, 'session');
  const logPath = join(dir, 'hooks.jsonl');
  const scriptPath = join(dir, 'record-hook.cjs');
  await mkdir(join(workDir, '.git'), { recursive: true });
  await mkdir(sessionDir, { recursive: true });
  await writeFile(
    scriptPath,
    [
      "const { appendFileSync } = require('node:fs');",
      "let input = '';",
      "process.stdin.on('data', (chunk) => { input += chunk; });",
      "process.stdin.on('end', () => { appendFileSync(process.argv[2], `${input.trim()}\\n`); });",
      '',
    ].join('\n'),
    'utf-8',
  );
  return {
    command: `node ${JSON.stringify(scriptPath)} ${JSON.stringify(logPath)}`,
    logPath,
    sessionDir,
    workDir,
  };
}

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-session-hooks-'));
  tempDirs.push(dir);
  return dir;
}

async function readHookPayloads(path: string): Promise<readonly Record<string, unknown>[]> {
  const text = await readFile(path, 'utf-8');
  return text
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function createSessionRpc(): SDKSessionRPC {
  return {
    emitEvent: vi.fn(async () => {}),
    requestApproval: vi.fn(async () => ({ decision: 'cancelled' })),
    requestQuestion: vi.fn(async () => null),
    toolCall: vi.fn(async () => ({
      output: 'custom tools are not supported in this test',
      isError: true,
    })),
  } as SDKSessionRPC;
}

function pendingProcess(exitOnKill = 143): {
  readonly proc: KaosProcess;
  readonly killSpy: ReturnType<typeof vi.fn>;
} {
  let resolveWait: (n: number) => void = () => {
    /* replaced below */
  };
  const waitPromise = new Promise<number>((resolve) => {
    resolveWait = resolve;
  });
  let currentExitCode: number | null = null;
  const killSpy = vi.fn(async () => {
    if (currentExitCode !== null) return;
    currentExitCode = exitOnKill;
    resolveWait(exitOnKill);
  });
  const proc: KaosProcess = {
    stdin: { write: vi.fn(), end: vi.fn() } as unknown as Writable,
    stdout: Readable.from([]),
    stderr: Readable.from([]),
    pid: 54_321,
    get exitCode(): number | null {
      return currentExitCode;
    },
    wait: () => waitPromise,
    kill: killSpy as unknown as KaosProcess['kill'],
  };
  return { proc, killSpy };
}
