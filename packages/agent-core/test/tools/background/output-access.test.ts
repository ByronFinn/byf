/**
 * BackgroundProcessManager — output retrieval surface.
 *
 * Covers the two methods consumed by the `/tasks` UI:
 *   - `readOutput(taskId, tail?)` reads the persisted
 *     `<sessionDir>/tasks/<id>/output.log` first so callers are not
 *     limited by the in-memory ring buffer.
 *   - `getOutputPath(taskId)` returns the absolute path when the
 *     persisted output log exists so callers can hand it to a pager.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import type { Writable } from 'node:stream';

import type { KaosProcess } from '@byfriends/kaos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackgroundProcessManager } from '../../../src/tools/background/manager';
import { appendTaskOutput } from '../../../src/tools/background/persist';

function immediateProcess(exitCode: number, stdoutText = ''): KaosProcess {
  return {
    stdin: { write: vi.fn(), end: vi.fn() } as unknown as Writable,
    stdout: Readable.from(stdoutText ? [stdoutText] : []),
    stderr: Readable.from([]),
    pid: 50000 + exitCode,
    exitCode,
    wait: vi.fn().mockResolvedValue(exitCode) as KaosProcess['wait'],
    kill: vi.fn().mockResolvedValue(undefined) as KaosProcess['kill'],
  };
}

async function waitForLiveOutput(
  manager: BackgroundProcessManager,
  taskId: string,
  expected: string,
): Promise<void> {
  for (let i = 0; i < 20; i++) {
    if (manager.getOutput(taskId).includes(expected)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for live output: ${expected}`);
}

/**
 * KaosProcess whose stdout emits `chunks` as separate data events and
 * completes (exit 0) immediately. Exposes `ended` so tests can await all
 * chunks landing in the ring buffer before asserting on output state —
 * needed because `Readable.from` pumps asynchronously and `proc.wait()`
 * resolving does not guarantee every data event has fired.
 */
function chunkedProcess(chunks: string[]): { proc: KaosProcess; ended: Promise<void> } {
  const stdout = Readable.from(chunks);
  const ended = new Promise<void>((resolve) => {
    stdout.once('end', () => {
      resolve();
    });
  });
  return {
    proc: {
      stdin: { write: vi.fn(), end: vi.fn() } as unknown as Writable,
      stdout,
      stderr: Readable.from([]),
      pid: 60000,
      exitCode: 0,
      wait: vi.fn().mockResolvedValue(0) as KaosProcess['wait'],
      kill: vi.fn().mockResolvedValue(undefined) as KaosProcess['kill'],
    },
    ended,
  };
}

/**
 * KaosProcess that stays running until `kill()` is called, then resolves
 * `wait()` with `exitOnKill`. stdout emits `stdoutText` once. Mirrors the
 * `pendingProcess` pattern in manager.test.ts but carries a stdout payload
 * so output can be observed before `stop()`.
 */
function pendingOutputProcess(
  stdoutText: string,
  exitOnKill = 143,
): { proc: KaosProcess; killSpy: ReturnType<typeof vi.fn> } {
  let resolveWait: (n: number) => void = () => {
    /* replaced below */
  };
  const waitPromise = new Promise<number>((res) => {
    resolveWait = res;
  });
  let currentExitCode: number | null = null;
  const killSpy = vi.fn(async () => {
    if (currentExitCode === null) {
      currentExitCode = exitOnKill;
      resolveWait(exitOnKill);
    }
  });
  const proc: KaosProcess = {
    stdin: { write: vi.fn(), end: vi.fn() } as unknown as Writable,
    stdout: Readable.from([stdoutText]),
    stderr: Readable.from([]),
    pid: 54321,
    get exitCode(): number | null {
      return currentExitCode;
    },
    wait: () => waitPromise,
    kill: killSpy as unknown as KaosProcess['kill'],
  };
  return { proc, killSpy };
}

describe('BackgroundProcessManager — readOutput / getOutputPath', () => {
  let sessionDir: string;
  let manager: BackgroundProcessManager;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'bpm-output-'));
    manager = new BackgroundProcessManager();
    manager.attachSessionDir(sessionDir);
  });

  afterEach(() => {
    manager._reset();
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it('getOutputPath returns <sessionDir>/tasks/<id>/output.log when persisted output exists', async () => {
    const taskId = manager.register(immediateProcess(0, 'hello\n'), 'echo', 'demo');
    await waitForLiveOutput(manager, taskId, 'hello');
    await manager.flushOutput(taskId);

    const path = manager.getOutputPath(taskId);
    expect(path).toBeDefined();
    expect(path).toContain(sessionDir);
    expect(path).toContain(taskId);
    expect(path!.endsWith('output.log')).toBe(true);
  });

  it('getOutputPath returns undefined when no persisted log file exists', async () => {
    const taskId = manager.register(immediateProcess(0), 'sleep 1', 'silent task');
    await manager.wait(taskId);
    await manager.flushOutput(taskId);

    expect(manager.getOutputPath(taskId)).toBeUndefined();
  });

  it('getOutputPath returns undefined for unknown task ids', () => {
    expect(manager.getOutputPath('bash-deadbeef')).toBeUndefined();
  });

  it('readOutput returns live ring-buffer content while task is in memory', async () => {
    const taskId = manager.register(immediateProcess(0, 'live content\n'), 'echo', 'demo');
    await new Promise((r) => setTimeout(r, 30));
    const out = await manager.readOutput(taskId);
    expect(out).toContain('live content');
  });

  it('readOutput prefers disk over the live ring buffer when persisted output exists', async () => {
    const taskId = manager.register(immediateProcess(0, 'ring-only\n'), 'echo', 'demo');
    await waitForLiveOutput(manager, taskId, 'ring-only');
    await appendTaskOutput(sessionDir, taskId, 'disk-only\n');

    const out = await manager.readOutput(taskId);

    expect(out).toContain('disk-only');
  });

  it('readOutput falls back to disk for ghost (reconciled lost) tasks', async () => {
    // Stage 1: live manager appends output to disk.
    // Wait deterministically: `manager.wait` resolves only after
    // `persistWriteQueue` drains (so `task.json` is on disk), and
    // `flushOutput` drains `outputWriteQueue` (so `output.log` is too).
    // Sleeping 30ms here was flaky on slow CI disks — `task.json` might
    // still be in flight when the fresh manager scans the session dir,
    // and a missing ghost makes readOutput return ''.
    const taskId = manager.register(immediateProcess(0, 'persisted line\n'), 'echo', 'demo');
    await manager.wait(taskId);
    await manager.flushOutput(taskId);
    expect((await manager.readOutput(taskId)).length).toBeGreaterThan(0);

    // Stage 2: simulate a fresh restart — new manager, same sessionDir.
    const fresh = new BackgroundProcessManager();
    fresh.attachSessionDir(sessionDir);
    await fresh.loadFromDisk();
    await fresh.reconcile();

    // The reloaded task is a ghost (terminal); the in-memory ring buffer
    // is empty but readOutput should still find the disk log.
    const recovered = await fresh.readOutput(taskId);
    expect(recovered).toContain('persisted line');
    fresh._reset();
  });

  it('readOutput respects tail length', async () => {
    const taskId = manager.register(immediateProcess(0, 'aaaaa-bbbbb-ccccc-ddddd'), 'echo', 'demo');
    await new Promise((r) => setTimeout(r, 30));
    const tail = await manager.readOutput(taskId, 5);
    expect(tail.length).toBeLessThanOrEqual(5);
    expect(tail).toBe('ddddd');
  });
});

/**
 * Characterization tests for the output-storage boundaries that commit 2
 * (extract OutputStore) must preserve behavior-for-behavior. These pin
 * the four contracts the refactor will move:
 *   1. Ring buffer drops oldest chunks past the byte cap, but
 *      `outputSizeBytes` still counts the dropped bytes.
 *   2. `getOutputSnapshot` decides disk-vs-ring by whether the disk log
 *      actually exists (silent tasks fall back to the empty ring buffer).
 *   3. `flushOutput` serializes the write queue so every appended chunk
 *      lands on disk before reads observe it.
 *   4. `stop()` does not clear already-appended output.
 *
 * All assertions are written against the CURRENT behavior so the refactor
 * can be verified as behavior-preserving.
 */
describe('BackgroundProcessManager — output store boundaries (characterization)', () => {
  let sessionDir: string;
  let manager: BackgroundProcessManager;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'bpm-output-'));
    manager = new BackgroundProcessManager();
    manager.attachSessionDir(sessionDir);
  });

  afterEach(() => {
    manager._reset();
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it('ring buffer drops oldest chunks past the byte cap; sizeBytes still reports the full total', async () => {
    // MAX_OUTPUT_BYTES in manager.ts is 1024 * 1024 (1 MiB). Write well
    // over the cap split across MULTIPLE chunks: the trim loop guards on
    // `outputChunks.length > 1`, so a single monolithic chunk is never
    // dropped — only multi-chunk output exercises the discard path this
    // test characterizes. Each chunk carries a sentinel so we can also
    // assert WHICH end survived.
    const chunkKiB = 512 * 1024;
    const headChunk = 'H'.repeat(chunkKiB); // dropped once over cap
    const tailChunk = 'T'.repeat(chunkKiB); // retained
    const { proc, ended } = chunkedProcess([headChunk, headChunk, tailChunk, tailChunk]);
    const taskId = manager.register(proc, 'big-output', 'spew 2MiB across chunks');
    const writtenTotal = chunkKiB * 4; // 2 MiB

    // Wait for the process to complete AND every stdout data event to
    // fire, then drain the disk queue — only then is the ring buffer
    // guaranteed trimmed and the disk log complete.
    await manager.wait(taskId);
    await ended;
    await manager.flushOutput(taskId);

    // INVARIANT 1: ring buffer is capped — never grows past the byte
    // limit. Asserted via the invariant (≤ cap), not the exact 1 MiB
    // literal, so a future tweak to the constant still holds.
    const ring = manager.getOutput(taskId);
    expect(ring.length).toBeLessThanOrEqual(1024 * 1024);

    // INVARIANT 1b: the oldest content was actually discarded — the 'H'
    // sentinel is gone from the ring while the newest 'T' sentinel
    // survives.
    expect(ring).not.toContain('H');
    expect(ring).toContain('T');

    // INVARIANT 2: outputSizeBytes counts every byte ever observed,
    // including the ones the ring buffer discarded. The disk log is the
    // source of truth here (it is never trimmed), and it still holds the
    // full history including the dropped 'H' sentinel.
    const snapshot = await manager.getOutputSnapshot(taskId, 1024);
    expect(snapshot.outputSizeBytes).toBeGreaterThanOrEqual(writtenTotal);
    expect(snapshot.fullOutputAvailable).toBe(true);
    expect(snapshot.outputPath).toBeDefined();
    const disk = await manager.readOutput(taskId);
    expect(disk).toContain('H');
    expect(disk).toContain('T');
  });

  it('getOutputSnapshot reports fullOutputAvailable based on disk-log presence', async () => {
    // Output-producing task → disk log exists → snapshot reads from disk.
    const loudId = manager.register(immediateProcess(0, 'real output\n'), 'echo', 'loud');
    await waitForLiveOutput(manager, loudId, 'real output');
    await manager.flushOutput(loudId);

    const loudSnap = await manager.getOutputSnapshot(loudId, 1024);
    expect(loudSnap.fullOutputAvailable).toBe(true);
    expect(loudSnap.outputPath).toBeDefined();
    expect(loudSnap.outputSizeBytes).toBeGreaterThan(0);
    expect(loudSnap.preview).toContain('real output');

    // Silent task → no stdout → no disk log → snapshot falls back to the
    // empty live ring buffer.
    const silentId = manager.register(immediateProcess(0), 'true', 'silent');
    await manager.wait(silentId);
    await manager.flushOutput(silentId);

    const silentSnap = await manager.getOutputSnapshot(silentId, 1024);
    expect(silentSnap.fullOutputAvailable).toBe(false);
    expect(silentSnap.outputPath).toBeUndefined();
    expect(silentSnap.outputSizeBytes).toBe(0);
  });

  it('flushOutput drains the write queue so every chunk lands on disk and in the ring buffer', async () => {
    // Two distinct chunks via a multi-element Readable — `Readable.from`
    // emits each array entry as a separate data event, exercising the
    // serialized `outputWriteQueue` chain in appendOutput.
    const { proc, ended } = chunkedProcess(['aaaa', 'bbbb']);
    const taskId = manager.register(proc, 'multi-chunk', 'two chunks');

    // Wait for the process to finish AND every stdout data event to
    // fire, then drain the disk queue. After this both stores must hold
    // both chunks.
    await manager.wait(taskId);
    await ended;
    await manager.flushOutput(taskId);

    const ring = manager.getOutput(taskId);
    expect(ring).toContain('aaaa');
    expect(ring).toContain('bbbb');

    const disk = await manager.readOutput(taskId); // disk-preferred
    expect(disk).toContain('aaaa');
    expect(disk).toContain('bbbb');
  });

  it('stop() preserves already-appended output', async () => {
    // A pending process emits a chunk while still running; stop() must
    // not clear the ring buffer or the disk log.
    const { proc } = pendingOutputProcess('partial-output\n');
    const taskId = manager.register(proc, 'long-run', 'spews then waits');

    // Wait for the chunk to land before stopping, so the assertion is
    // not racing the stdout pump.
    await waitForLiveOutput(manager, taskId, 'partial-output');

    await manager.stop(taskId);

    expect(manager.getOutput(taskId)).toContain('partial-output');
  });
});
