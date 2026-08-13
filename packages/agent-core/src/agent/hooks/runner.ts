import { localKaos, type Kaos, type KaosProcess } from '@byfriends/kaos';
import { z } from 'zod';

import type { HookResult } from './types';

export interface RunHookOptions {
  readonly timeout: number;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
  /**
   * 用于拉起 hook 命令的执行后端。默认经 {@link createKaosHookExec} 使用本地
   * {@link Kaos} 环境;生产接线(HookEngine → Session)注入运行时的活跃 Kaos,
   * 使 hook 执行跟随用户的工作目录,包括未来 SSHKaos 场景(ADR 0006)。
   */
  readonly exec?: HookExec;
}

/**
 * {@link runHook} 使用的执行后端。
 *
 * hook 在用户的项目工作目录中运行,而该目录正是 `SSHKaos`(ADR 0006)落地后
 * 变为远程的路径。经 `Kaos.execWithEnv()` 路由 spawn,使 hook 执行保持在
 * 本地 / 远程边界的正确一侧,而不是总在 BYF 宿主上拉起。
 */
export interface HookExec {
  /**
   * 以可选工作目录与环境拉起一条由 shell 解释的命令,返回运行中的进程。
   * 镜像 `Kaos.execWithEnv`,使本地实现可直接委托。
   */
  exec(
    command: string,
    options: { readonly cwd?: string; readonly env?: Record<string, string> },
  ): Promise<KaosProcess>;
}

/**
 * 构建由活跃 {@link Kaos} 环境支撑的 {@link HookExec}。
 *
 * `Kaos.execWithEnv` 不经 shell 解释,且在 Kaos 实例自身的 cwd( BYF 宿主
 * 进程目录,跨会话共享)中拉起,因此 hook 命令在到达 `execWithEnv` 前需要
 * 两处适配:
 *
 * 1. **Shell 解释** — hook 命令是自由格式的 shell 字符串(管道、变量、
 *    `&&`、脚本)。按 Bash 工具使用的同一跨平台 shell 探测,包装为
 *    `["<shell>", "-c", cmd]`。
 * 2. **工作目录** — Kaos 实例是共享的,无法为每个 hook 切换其目录。在
 *    shell 内部经 `cd '<cwd>' && <command>` 切换(POSIX 单引号转义),
 *    镜像 Bash 工具的做法。未给出 cwd 时使用 shell 继承的 cwd(Kaos cwd),
 *    保留此前的回退行为。
 *
 * 这使 hook 执行保持在本地 / 远程边界的正确一侧(ADR 0006):
 * `SSHKaos` 落地后,shell 与 cd 都在远程运行。
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
