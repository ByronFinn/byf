/**
 * BackgroundProcessManager reconcile + persistence integration tests.
 */

import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BackgroundProcessManager } from '../../../src/tools/background/manager';
import { writeTask, listTasks } from '../../../src/tools/background/persist';

let sessionDir: string;

beforeEach(async () => {
  sessionDir = join(
    tmpdir(),
    `byf-bg-reconcile-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await mkdir(sessionDir, { recursive: true });
});

afterEach(async () => {
  await rm(sessionDir, { recursive: true, force: true });
});

describe('BackgroundProcessManager — loadFromDisk + reconcile', () => {
  it('loadFromDisk does nothing when sessionDir not attached', async () => {
    const mgr = new BackgroundProcessManager();
    await mgr.loadFromDisk();
    expect(mgr.list(false)).toEqual([]);
  });

  it('reconciles a previously-running task as lost', async () => {
    // Seed disk as if a previous CLI process registered a task.
    await writeTask(sessionDir, {
      task_id: 'bash-orphan00',
      command: 'npm install',
      description: 'install',
      pid: 99999,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });

    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    const result = await mgr.reconcile();

    expect(result.lost).toEqual(['bash-orphan00']);
    expect(result.lostInfo).toHaveLength(1);
    expect(result.lostInfo[0]?.status).toBe('lost');
    // Persisted state updated
    const onDisk = await listTasks(sessionDir);
    expect(onDisk[0]?.status).toBe('lost');
  });

  it('does not reclassify already-terminal tasks', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-done0000',
      command: 'echo hi',
      description: 'echo',
      pid: 88888,
      started_at: 1_700_000_000,
      ended_at: 1_700_000_010,
      exit_code: 0,
      status: 'completed',
    });
    await writeTask(sessionDir, {
      task_id: 'bash-running0',
      command: 'sleep 1000',
      description: 'sleep',
      pid: 77777,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });

    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    const result = await mgr.reconcile();
    expect([...result.lost].toSorted()).toEqual(['bash-running0']);

    const all = await listTasks(sessionDir);
    const byId = new Map(all.map((t) => [t.task_id, t]));
    expect(byId.get('bash-done0000')?.status).toBe('completed');
    expect(byId.get('bash-running0')?.status).toBe('lost');
  });

  it('list(activeOnly=false) includes ghosts; list(true) excludes them', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-lost0000',
      command: 'x',
      description: 'd',
      pid: 1,
      started_at: 0,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });
    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    await mgr.reconcile();
    expect(mgr.list(true)).toEqual([]); // active-only: no live tasks
    const all = mgr.list(false);
    expect(all).toHaveLength(1);
    expect(all[0]?.status).toBe('lost');
  });

  it('getTask returns ghost when the live process map has no entry', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-ghost000',
      command: 'x',
      description: 'd',
      pid: 1,
      started_at: 0,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });
    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    await mgr.reconcile();
    const t = mgr.getTask('bash-ghost000');
    expect(t?.status).toBe('lost');
  });

  it('forgetTask drops ghost and disk entry', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-forget00',
      command: 'x',
      description: 'd',
      pid: 1,
      started_at: 0,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });
    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    await mgr.reconcile();
    await mgr.forgetTask('bash-forget00');
    expect(mgr.getTask('bash-forget00')).toBeUndefined();
    expect(await listTasks(sessionDir)).toEqual([]);
  });

  it('reconcile returns empty when no ghosts loaded', async () => {
    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    const result = await mgr.reconcile();
    expect(result.lost).toEqual([]);
    expect(result.lostInfo).toEqual([]);
  });

  it('reconcile fires onTerminal for each newly-lost ghost', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-publish0',
      command: 'sleep 9999',
      description: 'publish lost',
      pid: 42,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });
    const mgr = new BackgroundProcessManager();
    const fired: { taskId: string; status: string }[] = [];
    mgr.onTerminal((info) => {
      fired.push({ taskId: info.taskId, status: info.status });
    });
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    await mgr.reconcile();

    expect(fired).toHaveLength(1);
    expect(fired[0]?.taskId).toBe('bash-publish0');
    expect(fired[0]?.status).toBe('lost');
  });

  it('reconcile treats corrupted runtime (awaiting_approval ghost) as lost', async () => {
    // awaiting_approval is non-terminal — when the previous process
    // died mid-approval, the task cannot possibly resume; reconcile
    // must downgrade it to `lost` just like a running ghost.
    await writeTask(sessionDir, {
      task_id: 'bash-corrupt0',
      command: 'do_approval',
      description: 'corrupted approval',
      pid: 7777,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'awaiting_approval',
      approval_reason: 'ghost reason that should be cleared',
    });
    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    const result = await mgr.reconcile();

    expect(result.lost).toEqual(['bash-corrupt0']);
    expect(result.lostInfo[0]?.status).toBe('lost');
    expect(result.lostInfo[0]?.approvalReason).toBeUndefined();
  });

  it('reconcile does not republish already-lost ghosts on second pass', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-nodup000',
      command: 'sleep 9999',
      description: 'dedupe check',
      pid: 42,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });
    const mgr = new BackgroundProcessManager();
    const fired: string[] = [];
    mgr.onTerminal((info) => {
      fired.push(info.taskId);
    });
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    await mgr.reconcile();
    // Second reconcile should find nothing to downgrade.
    const again = await mgr.reconcile();
    expect(again.lost).toEqual([]);
    expect(fired).toEqual(['bash-nodup000']);
  });

  // Stale running task with heartbeat older than threshold gets
  // reclassified as `lost` AND its failure_reason is set to the
  // canonical "heartbeat expired" string.
  it('recover marks a stale heartbeat as lost with the expected failure reason', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-stale001',
      command: 'sleep 10',
      description: 'stale task',
      pid: 111,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });
    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    const result = await mgr.reconcile();
    expect(result.lost).toEqual(['bash-stale001']);
    const ghost = mgr.getTask('bash-stale001');
    // Py: failure_reason == "Background worker heartbeat expired".
    // TS does not carry a failureReason field — gap at the manager
    // surface. Assert the py contract.
    expect((ghost as unknown as { failureReason?: string }).failureReason).toBe(
      'Background worker heartbeat expired',
    );
  });

  // Full reconcile integration: stale-running task is downgraded to
  // lost AND a single `task.lost` notification is published.
  it('full reconcile downgrades a stale task and publishes exactly one task.lost notification', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-publish1',
      command: 'sleep 10',
      description: 'publish lost',
      pid: 333,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });
    const fired: { taskId: string; status: string }[] = [];
    const mgr = new BackgroundProcessManager();
    mgr.onTerminal((info) => {
      fired.push({ taskId: info.taskId, status: info.status });
    });
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    await mgr.reconcile();
    expect(fired).toEqual([{ taskId: 'bash-publish1', status: 'lost' }]);
  });

  // Idempotency: a second reconcile() pass over the same already-terminal
  // task does NOT republish its notification (dedupe by task_id).
  it('idempotent reconcile: a second pass over a terminal task does not republish', async () => {
    await writeTask(sessionDir, {
      task_id: 'bash-once0001',
      command: 'echo done',
      description: 'one-shot',
      pid: 42,
      started_at: 1_700_000_000,
      ended_at: 1_700_000_010,
      exit_code: 0,
      status: 'completed',
    });
    const fired: string[] = [];
    const mgr = new BackgroundProcessManager();
    mgr.onTerminal((info) => {
      fired.push(info.taskId);
    });
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    const first = await mgr.reconcile();
    const second = await mgr.reconcile();
    expect(first.lost).toEqual([]);
    expect(second.lost).toEqual([]);
    expect(fired).toEqual([]);
  });

  it('list() deduplicates when the same taskId exists in both processes and ghosts', async () => {
    // Seed a ghost via disk (simulates a task from a previous session).
    const ghostTaskId = 'bash-overlap0';
    await writeTask(sessionDir, {
      task_id: ghostTaskId,
      command: 'old command',
      description: 'ghost from disk',
      pid: 11111,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'running',
    });

    const mgr = new BackgroundProcessManager();
    mgr.attachSessionDir(sessionDir);
    await mgr.loadFromDisk();
    // Ghost is now loaded.
    expect(mgr.getTask(ghostTaskId)).toBeDefined();

    // Simulate the same taskId also appearing as a live process
    // (e.g. register happened after loadFromDisk but before reconcile,
    // or a race where the random ID collided).
    const internals = mgr as unknown as {
      processes: Map<string, { taskId: string; status: string; [k: string]: unknown }>;
    };
    internals.processes.set(ghostTaskId, {
      taskId: ghostTaskId,
      status: 'running',
      command: 'new command',
      description: 'live duplicate',
      proc: { pid: 22222 },
      exitCode: null,
      startedAt: 1_700_000_100,
      endedAt: null,
      output: '',
      waiters: [],
      terminalFired: false,
      stopRequested: false,
      lifecyclePromise: Promise.resolve(),
      persistWriteQueue: Promise.resolve(),
      outputWriteQueue: Promise.resolve(),
    });

    // list(false) must return exactly one entry for the overlapping taskId.
    const all = mgr.list(false);
    const matching = all.filter((t) => t.taskId === ghostTaskId);
    expect(matching).toHaveLength(1);

    // The live process entry (from `processes`) takes precedence.
    expect(matching[0]?.command).toBe('new command');

    // Other non-overlapping ghosts should still appear.
    await writeTask(sessionDir, {
      task_id: 'bash-solo0000',
      command: 'solo',
      description: 'no overlap',
      pid: 33333,
      started_at: 1_700_000_000,
      ended_at: null,
      exit_code: null,
      status: 'completed',
    });
    // Reload ghosts to pick up the second task.
    await mgr.loadFromDisk();
    // Re-inject the live process (loadFromDisk clears and reloads ghosts,
    // but processes survive).
    internals.processes.set(ghostTaskId, {
      taskId: ghostTaskId,
      status: 'running',
      command: 'new command',
      description: 'live duplicate',
      proc: { pid: 22222 },
      exitCode: null,
      startedAt: 1_700_000_100,
      endedAt: null,
      output: '',
      waiters: [],
      terminalFired: false,
      stopRequested: false,
      lifecyclePromise: Promise.resolve(),
      persistWriteQueue: Promise.resolve(),
      outputWriteQueue: Promise.resolve(),
    });

    const allAfter = mgr.list(false);
    const overlapCount = allAfter.filter((t) => t.taskId === ghostTaskId).length;
    const soloCount = allAfter.filter((t) => t.taskId === 'bash-solo0000').length;
    expect(overlapCount).toBe(1);
    expect(soloCount).toBe(1);
  });
});
