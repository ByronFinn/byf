/**
 * CronManager unit tests — real manager with a minimal Agent stub.
 * Covers add/list/stale/coalesce/one-shot paths that AC-C1/AC-C5 require.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CronManager } from '../../../src/agent/cron/manager';
import type { ClockSources } from '../../../src/tools/cron/clock';
import type { CronTask } from '../../../src/tools/cron/types';

const WALL_ANCHOR = Date.UTC(2024, 0, 1, 12, 0, 0);

function createClocks(start = WALL_ANCHOR): {
  clocks: ClockSources;
  advance: (ms: number) => void;
  now: () => number;
} {
  let now = start;
  return {
    clocks: {
      wallNow: () => now,
      monoNow: () => now,
    },
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}

function createAgentStub(options: { hasActiveTurn?: boolean } = {}) {
  let hasActiveTurn = options.hasActiveTurn ?? false;
  const steered: Array<{ content: unknown; origin: unknown }> = [];
  const events: unknown[] = [];
  const agent = {
    type: 'main' as const,
    homedir: undefined as string | undefined,
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    telemetry: { track: vi.fn() },
    turn: {
      get hasActiveTurn() {
        return hasActiveTurn;
      },
      steer(content: unknown, origin: unknown) {
        steered.push({ content, origin });
        return 1;
      },
    },
    emitEvent(event: unknown) {
      events.push(event);
    },
  };
  return {
    agent: agent as never,
    steered,
    events,
    setIdle(idle: boolean) {
      hasActiveTurn = !idle;
    },
  };
}

describe('CronManager', () => {
  beforeEach(() => {
    vi.stubEnv('BYF_CRON_NO_JITTER', '1');
    vi.stubEnv('BYF_CRON_MANUAL_TICK', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('starts empty and supports start/stop', async () => {
    const { agent } = createAgentStub();
    const manager = new CronManager(agent, { pollIntervalMs: null });
    expect(manager.store.list()).toEqual([]);
    expect(manager.getNextFireTime()).toBeNull();
    manager.start();
    manager.start(); // idempotent
    await manager.stop();
    await manager.stop();
  });

  it('addTask + listTaskSnapshots expose nextFireAt', () => {
    const { agent } = createAgentStub();
    const { clocks } = createClocks();
    const manager = new CronManager(agent, { clocks, pollIntervalMs: null });
    const task = manager.addTask({
      cron: '0 9 * * *',
      prompt: 'morning check',
      recurring: true,
    });
    expect(task.id).toMatch(/^[0-9a-f]{8}$/);
    const snaps = manager.listTaskSnapshots();
    expect(snaps).toHaveLength(1);
    expect(snaps[0].id).toBe(task.id);
    expect(snaps[0].recurring).toBe(true);
    expect(snaps[0].nextFireAt).not.toBeNull();
  });

  it('fires when idle and steers with cron_job origin', () => {
    const stub = createAgentStub();
    const { clocks, advance } = createClocks();
    const manager = new CronManager(stub.agent, { clocks, pollIntervalMs: null });
    // Every minute: fire immediately after advancing past the minute boundary.
    manager.addTask({ cron: '* * * * *', prompt: 'tick', recurring: true });
    advance(60_000);
    manager.tick();
    expect(stub.steered.length).toBeGreaterThanOrEqual(1);
    const origin = stub.steered[0].origin as { kind: string; jobId: string };
    expect(origin.kind).toBe('cron_job');
    expect(stub.events.some((e) => (e as { type: string }).type === 'cron.fired')).toBe(true);
  });

  it('defers fire while turn is active (idle delivery)', () => {
    const stub = createAgentStub({ hasActiveTurn: true });
    const { clocks, advance } = createClocks();
    const manager = new CronManager(stub.agent, { clocks, pollIntervalMs: null });
    manager.addTask({ cron: '* * * * *', prompt: 'busy', recurring: true });
    advance(60_000);
    manager.tick();
    expect(stub.steered).toHaveLength(0);
    stub.setIdle(true);
    manager.tick();
    expect(stub.steered.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes one-shot after fire', () => {
    const stub = createAgentStub();
    const { clocks, advance } = createClocks();
    const manager = new CronManager(stub.agent, { clocks, pollIntervalMs: null });
    manager.addTask({ cron: '* * * * *', prompt: 'once', recurring: false });
    advance(60_000);
    manager.tick();
    expect(manager.store.list()).toHaveLength(0);
  });

  it('isStale for recurring older than 7 days; never for one-shot', () => {
    const { agent } = createAgentStub();
    const { clocks, advance } = createClocks();
    const manager = new CronManager(agent, { clocks, pollIntervalMs: null });
    const recurring: CronTask = {
      id: 'aabbccdd',
      cron: '0 0 * * *',
      prompt: 'old',
      createdAt: WALL_ANCHOR,
      recurring: true,
    };
    const oneShot: CronTask = {
      id: '11223344',
      cron: '0 0 * * *',
      prompt: 'once',
      createdAt: WALL_ANCHOR,
      recurring: false,
    };
    expect(manager.isStale(recurring)).toBe(false);
    advance(8 * 24 * 60 * 60 * 1000);
    expect(manager.isStale(recurring)).toBe(true);
    expect(manager.isStale(oneShot)).toBe(false);
  });

  it('removeTasks returns only removed ids', () => {
    const { agent } = createAgentStub();
    const manager = new CronManager(agent, { pollIntervalMs: null });
    const task = manager.addTask({ cron: '0 0 * * *', prompt: 'x' });
    expect(manager.removeTasks([task.id, 'deadbeef'])).toEqual([task.id]);
    expect(manager.store.list()).toHaveLength(0);
  });

  it('persist + loadFromDisk restores id/createdAt; new session dir stays empty (AC-C1)', async () => {
    const sessionDir = await mkdtemp(join(tmpdir(), 'byf-cron-resume-'));
    const otherSessionDir = await mkdtemp(join(tmpdir(), 'byf-cron-new-'));
    try {
      const stub = createAgentStub();
      stub.agent.homedir = sessionDir;
      const { clocks } = createClocks();
      const manager = new CronManager(stub.agent, { clocks, pollIntervalMs: null });
      const task = manager.addTask({
        cron: '0 9 * * *',
        prompt: 'persist me',
        recurring: true,
      });
      const createdAt = task.createdAt;
      await manager.flushPersist();
      await manager.stop();

      // Same session dir: loadFromDisk rehydrates original id + createdAt.
      const resumeStub = createAgentStub();
      resumeStub.agent.homedir = sessionDir;
      const resumed = new CronManager(resumeStub.agent, { clocks, pollIntervalMs: null });
      expect(resumed.store.list()).toHaveLength(0);
      await resumed.loadFromDisk();
      const loaded = resumed.store.list();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].id).toBe(task.id);
      expect(loaded[0].createdAt).toBe(createdAt);
      expect(loaded[0].prompt).toBe('persist me');
      await resumed.stop();

      // New session dir does not inherit tasks.
      const freshStub = createAgentStub();
      freshStub.agent.homedir = otherSessionDir;
      const fresh = new CronManager(freshStub.agent, { clocks, pollIntervalMs: null });
      await fresh.loadFromDisk();
      expect(fresh.store.list()).toHaveLength(0);
      await fresh.stop();
    } finally {
      await rm(sessionDir, { recursive: true, force: true });
      await rm(otherSessionDir, { recursive: true, force: true });
    }
  });

  it('stale recurring fires once with stale:true then deletes (AC-C5)', () => {
    const stub = createAgentStub();
    const { clocks, advance } = createClocks();
    const manager = new CronManager(stub.agent, { clocks, pollIntervalMs: null });
    // Seed a recurring task older than 7 days so the next fire is the final stale delivery.
    manager.store.adopt({
      id: 'aabbcc01',
      cron: '* * * * *',
      prompt: 'ancient',
      createdAt: WALL_ANCHOR - 8 * 24 * 60 * 60 * 1000,
      recurring: true,
    });
    advance(60_000);
    manager.tick();
    expect(stub.steered.length).toBeGreaterThanOrEqual(1);
    const origin = stub.steered[0].origin as { stale?: boolean; kind: string };
    expect(origin.kind).toBe('cron_job');
    expect(origin.stale).toBe(true);
    expect(manager.store.list()).toHaveLength(0);
    expect(stub.events.some((e) => (e as { type: string }).type === 'cron.fired')).toBe(true);
  });
});
