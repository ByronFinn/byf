import { jest, mock, vi } from 'bun:test';
/**
 * Bun test preload — Vitest compatibility shims for the #215 migration.
 *
 * Bun's `vi` is a subset of Vitest. This preload fills the gaps used by this
 * monorepo so tests can keep importing from `vitest` (remapped to `bun:test`).
 *
 * Loaded via root `bunfig.toml` `[test] preload`.
 *
 * Full monorepo runs must use process isolation (`bun run test` / `make test` →
 * `build/run-tests.mjs`). Bun's `mock.module` / `vi.mock` is process-global and
 * `mock.restore()` does not reliably unhook modules across files (ADR 0028 / #215).
 */
import { existsSync, readFileSync } from 'node:fs';
import * as nodeOs from 'node:os';
import { join } from 'node:path';

/** Flags whose next argv token is a value, not a test path. */
const FLAGS_WITH_VALUE = new Set([
  '--preload',
  '--timeout',
  '-t',
  '--test-name-pattern',
  '--rerun-each',
  '--max-concurrency',
  '--seed',
  '--reporter',
  '--coverage-reporter',
  '--coverage-dir',
  '--bail',
  '--dots',
]);

function isByfMonorepoRoot(cwd: string): boolean {
  if (!existsSync(join(cwd, 'build/run-tests.mjs'))) return false;
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
      name?: string;
    };
    return pkg.name === '@byfriends/monorepo';
  } catch {
    return false;
  }
}

/**
 * Bun rewrites `process.argv` to `[bun, <current-test-file>]` while the suite
 * runs, so we recover the original CLI from the OS process command line
 * (bare `bun test` vs `bun test path/to/file.test.ts`).
 */
function readOsCmdline(): string[] | null {
  if (process.platform === 'linux') {
    try {
      const parts = readFileSync('/proc/self/cmdline', 'utf8').split('\0').filter(Boolean);
      return parts.length > 0 ? parts : null;
    } catch {
      return null;
    }
  }
  // macOS / BSD — best-effort; fail closed at monorepo root if unreadable.
  try {
    const proc = Bun.spawnSync(['ps', '-p', String(process.pid), '-www', '-o', 'args='], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (proc.exitCode !== 0) return null;
    const line = new TextDecoder().decode(proc.stdout).trim();
    if (!line) return null;
    return line.split(/\s+/).filter(Boolean);
  } catch {
    return null;
  }
}

/** True when the original `bun test` CLI included explicit file/dir targets. */
function hasExplicitTestTargets(cmd: string[]): boolean {
  const testIdx = cmd.findIndex((a) => a === 'test');
  const start = testIdx >= 0 ? testIdx + 1 : 1;
  for (let i = start; i < cmd.length; i++) {
    const a = cmd[i]!;
    if (a === '--') continue;
    if (a.startsWith('-')) {
      const flag = a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
      if (!a.includes('=') && FLAGS_WITH_VALUE.has(flag)) {
        i += 1; // skip value
      }
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Refuse root-level full-suite `bun test` without process isolation.
 * Package-scoped runs (`cd packages/foo && bun test`) and path-scoped
 * `bun test path/to/file.test.ts` remain allowed.
 */
function rejectUnisolatedMonorepoRootFullSuite(): void {
  if (process.env.BYF_TEST_ISOLATED === '1') return;
  if (process.env.BYF_ALLOW_UNISOLATED_TEST === '1') return;
  if (!isByfMonorepoRoot(process.cwd())) return;

  const cmd = readOsCmdline();
  // Fail closed when the OS cmdline is unavailable: path-scoped users can set
  // BYF_ALLOW_UNISOLATED_TEST=1 or use package cwd; CI always sets ISOLATED.
  if (cmd !== null && hasExplicitTestTargets(cmd)) return;

  console.error(`
error: full-suite \`bun test\` at the monorepo root is not the CI gate.

  Bun runs all files in one process. \`mock.module\` / \`vi.mock\` leak across
  files, so a green package-scoped run can still fail (or pass spuriously) when
  the whole tree is loaded together. See ADR 0028 / #215.

  Use the process-isolated runner instead:

    make test
    bun run test

  Package-scoped or path-scoped runs are fine:

    cd packages/agent-core && bun test
    bun test apps/cli/test/cli/options.test.ts

  To force a single-process full suite (debug only):

    BYF_ALLOW_UNISOLATED_TEST=1 bun test
`);
  process.exit(1);
}

rejectUnisolatedMonorepoRootFullSuite();

// Bun caches the process home directory and ignores later process.env.HOME
// changes. Vitest's vi.stubEnv('HOME', ...) expects Node-like re-read behavior
// for skill path resolution tests. Prefer env when set.
const realHomedir = nodeOs.homedir.bind(nodeOs);
mock.module('node:os', () => ({
  ...nodeOs,
  homedir(): string {
    if (typeof process.env.HOME === 'string' && process.env.HOME.length > 0) {
      return process.env.HOME;
    }
    if (typeof process.env.USERPROFILE === 'string' && process.env.USERPROFILE.length > 0) {
      return process.env.USERPROFILE;
    }
    return realHomedir();
  },
}));

type WaitForOptions = {
  timeout?: number;
  interval?: number;
};

function waitFor<T>(fn: () => T | Promise<T>, options: WaitForOptions = {}): Promise<T> {
  const timeout = options.timeout ?? 1000;
  const interval = options.interval ?? 20;
  const start = Date.now();

  return (async () => {
    let lastError: unknown;
    while (Date.now() - start < timeout) {
      try {
        // Vitest returns the callback result (used as `const x = await vi.waitFor(() => x)`).
        return await fn();
      } catch (error) {
        lastError = error;
        await Bun.sleep(interval);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`vi.waitFor timed out after ${String(timeout)}ms`);
  })();
}

// Bun vi is a partial surface we extend at runtime.
const viAny = vi as any;

// Vitest runs hoisted factories before imports; Bun does not hoist, so calling
// the factory immediately at module evaluation is the correct equivalent.
viAny.hoisted = <T>(factory: () => T): T => factory();

viAny.waitFor = waitFor;

// Type-only cast helper in Vitest; identity is enough at runtime.
viAny.mocked = <T>(item: T): T => item;

viAny.importActual = (path: string) => import(path);

/** Flush microtasks so promise chains attached to fake timers can settle. */
async function flushMicrotasks(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

viAny.runAllTimersAsync = async () => {
  // Drain chained timers (retry backoff schedules the next sleep after the previous).
  for (let i = 0; i < 100; i++) {
    vi.runOnlyPendingTimers();
    await flushMicrotasks();
    if (!vi.isFakeTimers() || vi.getTimerCount() === 0) break;
  }
};

viAny.runOnlyPendingTimersAsync = async () => {
  vi.runOnlyPendingTimers();
  await flushMicrotasks();
};

viAny.advanceTimersByTimeAsync = async (ms: number) => {
  // Vitest drains microtasks so in-flight async work can schedule timers before
  // the clock moves (e.g. GrepTool: await exec → setTimeout(timeout)). Then it
  // advances nested timers scheduled during the window. Bun needs both steps.
  for (let i = 0; i < 100 && vi.isFakeTimers() && vi.getTimerCount() === 0; i++) {
    await flushMicrotasks(8);
  }

  const step = 50;
  let remaining = ms;
  while (remaining > 0) {
    // Keep flushing so chained setTimeouts (retry backoff, SIGTERM grace) run.
    await flushMicrotasks(4);
    const chunk = Math.min(step, remaining);
    vi.advanceTimersByTime(chunk);
    remaining -= chunk;
    await flushMicrotasks(8);
  }
  await flushMicrotasks();
};

viAny.advanceTimersToNextTimerAsync = async () => {
  vi.advanceTimersToNextTimer();
  await flushMicrotasks();
};

// Bun exposes setSystemTime on jest, not vi.
viAny.setSystemTime = (now?: number | Date) => {
  jest.setSystemTime(now as number | Date);
};

// Vitest env stubs — Bun has no built-in vi.stubEnv.
const envSnapshots = new Map<string, string | undefined>();

viAny.stubEnv = (name: string, value: string) => {
  if (!envSnapshots.has(name)) {
    envSnapshots.set(name, process.env[name]);
  }
  process.env[name] = value;
};

viAny.unstubAllEnvs = () => {
  for (const [name, previous] of envSnapshots) {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  }
  envSnapshots.clear();
};

// Vitest global stubs.
const globalSnapshots = new Map<
  string | symbol | number,
  { target: object; had: boolean; value: unknown }
>();

viAny.stubGlobal = (name: string, value: unknown) => {
  const target = globalThis as Record<string, unknown>;
  if (!globalSnapshots.has(name)) {
    globalSnapshots.set(name, {
      target,
      had: Object.prototype.hasOwnProperty.call(target, name),
      value: target[name],
    });
  }
  target[name] = value;
};

viAny.unstubAllGlobals = () => {
  for (const [name, snap] of globalSnapshots) {
    const target = snap.target as Record<string | symbol | number, unknown>;
    if (snap.had) {
      target[name] = snap.value;
    } else {
      delete target[name];
    }
  }
  globalSnapshots.clear();
};

// Vitest module registry reset is not available in Bun. Best-effort no-op so
// tests that only need a soft isolation boundary can continue; doMock still
// applies for subsequent dynamic imports when used.
viAny.resetModules = () => {
  /* no-op under Bun */
};

viAny.doMock = (path: string, factory: () => unknown) => {
  // Alias to mock.module / vi.mock for Bun.
  vi.mock(path, factory as () => unknown);
};

// expect.addSnapshotSerializer exists but throws "Not implemented". Make it a
// no-op so modules that register serializers can load; snapshot formatting is
// handled by explicit format helpers in the agent-core test harness.
import { expect } from 'bun:test';

// Bun ships a stub that throws "Not implemented".
(expect as any).addSnapshotSerializer = () => {
  // no-op — see packages/agent-core/test/agent/harness/snapshots.ts
};
