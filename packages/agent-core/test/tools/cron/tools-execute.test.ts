/**
 * CronCreate / CronList / CronDelete tool execute paths (AC-C1).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CronManager } from '../../../src/agent/cron/manager';
import type { ClockSources } from '../../../src/tools/cron/clock';
import { CronCreateTool, MAX_CRON_JOBS_PER_SESSION } from '../../../src/tools/cron/cron-create';
import { CronDeleteTool } from '../../../src/tools/cron/cron-delete';
import { CronListTool } from '../../../src/tools/cron/cron-list';

const WALL_ANCHOR = Date.UTC(2024, 0, 1, 12, 0, 0);

function createClocks(start = WALL_ANCHOR): ClockSources {
  let now = start;
  return {
    wallNow: () => now,
    monoNow: () => now,
  };
}

function createAgentStub() {
  const agent = {
    type: 'main' as const,
    homedir: undefined as string | undefined,
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
    telemetry: { track: vi.fn() },
    turn: {
      hasActiveTurn: false,
      steer: vi.fn(() => 1),
    },
    emitEvent: vi.fn(),
  };
  return agent as never;
}

describe('Cron tools execute (AC-C1)', () => {
  beforeEach(() => {
    vi.stubEnv('BYF_CRON_NO_JITTER', '1');
    vi.stubEnv('BYF_CRON_MANUAL_TICK', '1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('CronCreate schedules a task; CronList renders it; CronDelete removes it', async () => {
    const agent = createAgentStub();
    const manager = new CronManager(agent, {
      clocks: createClocks(),
      pollIntervalMs: null,
    });
    try {
      const create = new CronCreateTool(manager);
      const list = new CronListTool(manager);
      const del = new CronDeleteTool(manager);

      const createExec = create.resolveExecution({
        cron: '*/5 * * * *',
        prompt: 'ping',
        recurring: true,
      });
      expect(createExec.isError).not.toBe(true);
      const created = await createExec.execute!();
      expect(created.isError).toBe(false);
      expect(String(created.output)).toMatch(/id: [0-9a-f]{8}/);
      expect(String(created.output)).toContain('recurring: true');

      const listExec = list.resolveExecution({});
      const listed = await listExec.execute!();
      expect(listed.isError).toBe(false);
      expect(String(listed.output)).toContain('cron_jobs: 1');
      expect(String(listed.output)).toContain('prompt: "ping"');

      const idMatch = String(created.output).match(/id: ([0-9a-f]{8})/);
      expect(idMatch).not.toBeNull();
      const id = idMatch![1];

      const deleteExec = del.resolveExecution({ id });
      const deleted = await deleteExec.execute!();
      expect(deleted.isError).toBe(false);
      expect(String(deleted.output)).toContain(`Deleted cron job ${id}`);
      expect(manager.store.list()).toHaveLength(0);
    } finally {
      await manager.stop();
    }
  });

  it('CronDelete reports not-found as error', async () => {
    const agent = createAgentStub();
    const manager = new CronManager(agent, {
      clocks: createClocks(),
      pollIntervalMs: null,
    });
    try {
      const del = new CronDeleteTool(manager);
      const exec = del.resolveExecution({ id: 'deadbeef' });
      const result = await exec.execute!();
      expect(result.isError).toBe(true);
      expect(String(result.output)).toContain('No cron job with id deadbeef');
    } finally {
      await manager.stop();
    }
  });

  it('CronCreate rejects when killswitch is on', () => {
    vi.stubEnv('BYF_DISABLE_CRON', '1');
    const agent = createAgentStub();
    const manager = new CronManager(agent, {
      clocks: createClocks(),
      pollIntervalMs: null,
    });
    const create = new CronCreateTool(manager);
    const exec = create.resolveExecution({
      cron: '0 0 * * *',
      prompt: 'nope',
      recurring: true,
    });
    expect(exec.isError).toBe(true);
    expect(String(exec.output)).toContain('BYF_DISABLE_CRON');
  });

  it('CronCreate rejects when session cap is reached', () => {
    const agent = createAgentStub();
    const manager = new CronManager(agent, {
      clocks: createClocks(),
      pollIntervalMs: null,
    });
    for (let i = 0; i < MAX_CRON_JOBS_PER_SESSION; i++) {
      manager.addTask({ cron: '0 0 * * *', prompt: `t${String(i)}`, recurring: true });
    }
    const create = new CronCreateTool(manager);
    const exec = create.resolveExecution({
      cron: '0 1 * * *',
      prompt: 'overflow',
      recurring: true,
    });
    expect(exec.isError).toBe(true);
    expect(String(exec.output)).toContain('cap reached');
  });
});
