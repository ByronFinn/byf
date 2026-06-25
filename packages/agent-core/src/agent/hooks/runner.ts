import { localKaos, type Kaos, type KaosProcess } from '@byfriends/kaos';
import { z } from 'zod';

import type { HookResult } from './types';

export interface RunHookOptions {
  readonly timeout: number;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
  /**
   * Execution backend used to spawn the hook command. Defaults to the local
   * {@link Kaos} environment via {@link createKaosHookExec}; production wiring
   * (HookEngine → Session) injects the runtime's active Kaos so hook execution
   * follows the user's working directory, including under future SSHKaos
   * (ADR 0006).
   */
  readonly exec?: HookExec;
}

/**
 * Execution backend used by {@link runHook}.
 *
 * Hooks run in the user's project working directory, which is the exact path
 * that becomes remote once `SSHKaos` (per ADR 0006) lands. Routing the spawn
 * through `Kaos.execWithEnv()` keeps hook execution on the correct side of the
 * local/remote boundary instead of always spawning on the BYF host.
 */
export interface HookExec {
  /**
   * Spawn a shell-interpreted command with an optional working directory and
   * environment, returning the running process. Mirrors `Kaos.execWithEnv` so
   * the local implementation can delegate directly.
   */
  exec(
    command: string,
    options: { readonly cwd?: string; readonly env?: Record<string, string> },
  ): Promise<KaosProcess>;
}

/**
 * Build a {@link HookExec} backed by the active {@link Kaos} environment.
 *
 * `Kaos.execWithEnv` spawns without shell interpretation and at the Kaos
 * instance's own cwd (the BYF host process dir, shared across sessions), so a
 * hook command needs two adaptations before it reaches `execWithEnv`:
 *
 * 1. **Shell interpretation** — hook commands are free-form shell strings
 *    (pipes, variables, `&&`, scripts). Wrap them as `["<shell>", "-c", cmd]`
 *    using the same cross-platform shell probe the Bash tool uses.
 * 2. **Working directory** — the Kaos instance is shared, so we cannot chdir
 *    it per hook. Switch directory inside the shell via
 *    `cd '<cwd>' && <command>` (POSIX single-quote escaping), mirroring the
 *    Bash tool's approach. When no cwd is given the shell's inherited cwd
 *    (the Kaos cwd) is used, preserving the previous fallthrough behavior.
 *
 * This keeps hook execution on the correct side of the local/remote boundary
 * (ADR 0006): once `SSHKaos` lands, the shell + cd run remotely.
 */
export function createKaosHookExec(kaos: Kaos, shellPath: string): HookExec {
  return {
    exec: (command, options) =>
      kaos.execWithEnv([shellPath, '-c', shellScript(command, options?.cwd)], options?.env),
  };
}

function shellScript(command: string, cwd: string | undefined): string {
  if (cwd === undefined || cwd.length === 0) return command;
  return `cd ${shellQuote(cwd)} && ${command}`;
}

function shellQuote(s: string): string {
  return `'${s.replaceAll("'", "'\\''")}'`;
}

/**
 * Default execution backend: the local Kaos environment with the ambient
 * shell. Hooks always run through a {@link Kaos} environment (ADR 0006) — this
 * default makes {@link runHook} usable standalone without an explicit exec.
 */
const DEFAULT_HOOK_EXEC: HookExec = createKaosHookExec(
  localKaos,
  process.env['SHELL'] ?? '/bin/sh',
);

const DEFAULT_TIMEOUT_SECONDS = 30;
const KILL_GRACE_MS = 100;
const OptionalStringSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return undefined;
}, z.string().optional());
const HookSpecificOutputSchema = z.preprocess(
  (value) => (isRecord(value) ? value : undefined),
  z
    .looseObject({
      message: OptionalStringSchema,
      permissionDecision: z.unknown().optional(),
      permissionDecisionReason: OptionalStringSchema,
    })
    .optional(),
);
const HookJsonOutputSchema = z.looseObject({
  message: OptionalStringSchema,
  hookSpecificOutput: HookSpecificOutputSchema,
});

export async function runHook(
  command: string,
  input: Record<string, unknown>,
  options: RunHookOptions,
): Promise<HookResult> {
  const exec = options.exec ?? DEFAULT_HOOK_EXEC;
  let proc: KaosProcess;
  try {
    proc = await exec.exec(command, { cwd: options.cwd });
  } catch (error) {
    return allowResult({ stderr: errorMessage(error) });
  }

  return new Promise<HookResult>((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = timeoutSeconds(options.timeout) * 1000;

    const cleanup = (): void => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', onAbort);
    };

    const settle = (result: HookResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      killProcessGracefully(proc);
      settle(allowResult({ stdout, stderr, timedOut: true }));
    }, timeoutMs);

    const onAbort = (): void => {
      killProcessGracefully(proc);
      settle(allowResult({ stdout, stderr }));
    };

    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted === true) {
      onAbort();
      return;
    }

    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');

    // Collect stdout/stderr until each stream ends, AND wait for exit. All
    // three must complete before we settle — KaosProcess streams are buffered
    // (BufferedReadable) and only deliver data as they are consumed, so the
    // exit code can resolve before the buffered output has been drained.
    // Waiting on stream 'end' (not just 'data') guarantees we capture the
    // full output even for fast-exiting hooks. Chunks also accumulate into
    // the shared `stdout`/`stderr` so the timeout/abort paths can return the
    // partial output collected so far.
    const stdoutDone = drainStream(proc.stdout, (chunk) => {
      stdout += chunk;
    });
    const stderrDone = drainStream(proc.stderr, (chunk) => {
      stderr += chunk;
    });

    Promise.all([stdoutDone, stderrDone, proc.wait()])
      .then(([out, err, code]) => {
        settle(resultFromExitCode(code ?? 0, out, err));
      })
      .catch((error: unknown) => {
        settle(allowResult({ stdout, stderr: stderr + errorMessage(error) }));
      });

    // Hooks receive their payload on stdin, then signal EOF. Swallow stdin
    // errors: a hook that exits before reading its payload causes an EPIPE on
    // `.end()`, emitted asynchronously as a stream 'error' event that would
    // otherwise become an unhandled rejection. Both the synchronous throw and
    // the async event are safe to ignore — the exit code is the real signal.
    proc.stdin.on('error', () => {});
    try {
      proc.stdin.end(JSON.stringify(input));
    } catch {
      /* ignore */
    }
  });
}

function timeoutSeconds(timeout: number): number {
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_SECONDS;
}

/**
 * Read a process output stream to completion, returning the full string and
 * forwarding each chunk to `onChunk` for partial-output accumulation. Resolves
 * on the stream's 'end' event so callers can be sure no data is still buffered.
 * Errors are treated as end-of-stream (an empty/partial result) so a failed
 * stream never blocks settlement.
 */
function drainStream(
  stream: KaosProcess['stdout'],
  onChunk: (chunk: string) => void,
): Promise<string> {
  return new Promise<string>((resolve) => {
    let result = '';
    const finish = (): void => {
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onError);
      resolve(result);
    };
    const onData = (chunk: string): void => {
      result += chunk;
      onChunk(chunk);
    };
    const onEnd = (): void => {
      finish();
    };
    const onError = (): void => {
      finish();
    };
    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}

function resultFromExitCode(exitCode: number, stdout: string, stderr: string): HookResult {
  if (exitCode === 2) {
    const message = stderr.trim();
    return {
      action: 'block',
      message,
      reason: message,
      stdout,
      stderr,
      exitCode,
    };
  }

  const structured = exitCode === 0 ? structuredOutput(stdout) : undefined;
  if (structured?.action === 'block') {
    return {
      action: 'block',
      message: structured.message ?? structured.reason,
      reason: structured.reason,
      stdout,
      stderr,
      exitCode,
      structuredOutput: structured.structuredOutput,
    };
  }

  return allowResult({
    message: structured?.message,
    stdout,
    stderr,
    exitCode,
    structuredOutput: structured?.structuredOutput,
  });
}

function structuredOutput(
  stdout: string,
): { action?: 'block'; reason?: string; message?: string; structuredOutput: true } | undefined {
  const text = stdout.trim();
  if (text.length === 0) return undefined;

  try {
    const parsed = JSON.parse(text) as unknown;
    const output = HookJsonOutputSchema.safeParse(parsed);
    if (!output.success) return undefined;

    const { message, hookSpecificOutput } = output.data;
    const result = {
      message: message ?? hookSpecificOutput?.message,
      structuredOutput: true as const,
    };
    if (hookSpecificOutput?.permissionDecision !== 'deny') {
      return result;
    }
    return {
      action: 'block',
      message: result.message,
      reason: hookSpecificOutput.permissionDecisionReason,
      structuredOutput: true,
    };
  } catch {
    return undefined;
  }
}

function allowResult(input: {
  readonly message?: string;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
  readonly timedOut?: boolean;
  readonly structuredOutput?: boolean;
}): HookResult {
  return {
    action: 'allow',
    message: input.message,
    stdout: input.stdout,
    stderr: input.stderr,
    exitCode: input.exitCode,
    timedOut: input.timedOut,
    structuredOutput: input.structuredOutput,
  };
}

/**
 * SIGTERM → grace window → SIGKILL, matching the {@link KaosProcess} contract.
 * `LocalProcess.kill()` already signals the whole process group on POSIX, so
 * this mirrors the previous `process.kill(-pid)` behavior without reaching
 * into Node's `child_process` API directly.
 */
function killProcessGracefully(proc: KaosProcess): void {
  void (async () => {
    try {
      await proc.kill('SIGTERM');
    } catch {
      /* process already gone */
    }
    const exited = proc
      .wait()
      .then(() => true)
      .catch(() => true);
    const raced = await Promise.race([
      exited,
      new Promise<false>((resolve) => {
        const t = setTimeout(() => {
          resolve(false);
        }, KILL_GRACE_MS);
        t.unref();
      }),
    ]);
    if (!raced && proc.exitCode === null) {
      try {
        await proc.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }
    try {
      proc.stdout.destroy();
    } catch {
      /* ignore */
    }
    try {
      proc.stderr.destroy();
    } catch {
      /* ignore */
    }
  })();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
