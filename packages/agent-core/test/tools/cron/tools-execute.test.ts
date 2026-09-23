/**
 * CronCreate / CronList / CronDelete tool execute paths (AC-C1).
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { CronManager } from '../../../src/agent/cron/manager';
import type {
  ExecutableToolContext,
  ExecutableToolOutput,
  RunnableToolExecution,
  ToolExecution,
} from '../../../src/loop/types';
import type { ClockSources } from '../../../src/tools/cron/clock';
import { CronCreateTool, MAX_CRON_JOBS_PER_SESSION } from '../../../src/tools/cron/cron-create';
import { CronDeleteTool } from '../../../src/tools/cron/cron-delete';
import { CronListTool } from '../../../src/tools/cron/cron-list';
import { vi } from '../../_vitest-vi';

const WALL_ANCHOR = Date.UTC(2024, 0, 1, 12, 0, 0);

function createClocks(start = WALL_ANCHOR): ClockSources {
  let now = start;
  return {
    wallNow: () => now,
    monoNowMs: () => now,
  };
}

/** The per-call context the engine hands to `RunnableToolExecution.execute`. */
function execContext(): ExecutableToolContext {
  return { turnId: '0', toolCallId: 'tc', signal: new AbortController().signal };
}

/**
 * The cron tools always emit a plain string on these paths; surface it for the
 * `.toContain` / `.match` assertions without running the (possibly-object)
 * `ExecutableToolOutput` through `String()`.
 */
function textOf(output: ExecutableToolOutput): string {
  return typeof output === 'string' ? output : '';
}

/**
 * Narrow a resolved `ToolExecution` to its runnable variant. The cron tools
 * only return the error variant at resolve time (killswitch / cap), so a
 * resolve-time error here means the test's precondition is violated — fail
 * loudly rather than reaching for a non-existent `execute`.
 */
function requireRunnable(execution: ToolExecution): RunnableToolExecution {
  if (execution.isError === true) {
    throw new TypeError(
      `expected an executable run, got a resolve-time error: ${textOf(execution.output)}`,
    );
  }
  return execution;
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
      const created = await requireRunnable(createExec).execute(execContext());
      expect(created.isError).toBe(false);
      expect(textOf(created.output)).toMatch(/id: [0-9a-f]{8}/);
      expect(textOf(created.output)).toContain('recurring: true');

      const listExec = list.resolveExecution({});
      const listed = await requireRunnable(listExec).execute(execContext());
      expect(listed.isError).toBe(false);
      expect(textOf(listed.output)).toContain('cron_jobs: 1');
      expect(textOf(listed.output)).toContain('prompt: "ping"');

      const idMatch = textOf(created.output).match(/id: ([0-9a-f]{8})/);
      expect(idMatch).not.toBeNull();
      const id = idMatch?.[1];
      if (id === undefined) {
        throw new Error('expected CronCreate output to include an 8-hex job id');
      }

      const deleteExec = del.resolveExecution({ id });
      const deleted = await requireRunnable(deleteExec).execute(execContext());
      expect(deleted.isError).toBe(false);
      expect(textOf(deleted.output)).toContain(`Deleted cron job ${id}`);
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
      const result = await requireRunnable(exec).execute(execContext());
      expect(result.isError).toBe(true);
      expect(textOf(result.output)).toContain('No cron job with id deadbeef');
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
    if (exec.isError !== true) throw new Error('expected a resolve-time error (killswitch)');
    expect(exec.isError).toBe(true);
    expect(textOf(exec.output)).toContain('BYF_DISABLE_CRON');
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
    if (exec.isError !== true) throw new Error('expected a resolve-time error (cap reached)');
    expect(exec.isError).toBe(true);
    expect(textOf(exec.output)).toContain('cap reached');
  });
});
