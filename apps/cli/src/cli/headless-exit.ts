import type { Writable } from 'node:stream';

import { HEADLESS_FORCE_EXIT_GRACE_MS, HEADLESS_STDIO_DRAIN_TIMEOUT_MS } from '#/constant/app';

/** 强制终止 headless 运行所需的最小进程表面。 */
export interface ExitableProcess {
  exit(code?: number): void;
}

/**
 * 为已完成的 headless(`byf -p`)运行安排尽力而为的强制退出。
 *
 * 打印模式不调用 `process.exit()`;它依赖 Node 事件循环在运行完成后排空。
 * 若游离的 ref'd 句柄在关停后存活——一个残留 socket(例如被严格防火墙
 * 黑洞掉的连接,或被 PING 保活的 HTTP/2 会话)、一个未清除的定时器,
 * 或管道仍打开的 child——循环永不满空,进程挂起直到外部超时将其杀死。
 *
 * 本函数武装一个 **unref'd** 回退定时器:健康运行会在它触发前自然排空并
 * 退出(行为不变),定时器本身也永不使循环存活。它只强制退出循环已卡死的
 * 运行。退出码在触发时惰性读取,使调用方可在调度后设置
 * `process.exitCode`(例如 goal turn 把终态映射为非零码)。
 *
 * 返回定时器句柄,供调用方 / 测试 `clearTimeout`。
 */
export function scheduleHeadlessForceExit(
  proc: ExitableProcess,
  getExitCode: () => number,
  graceMs: number = HEADLESS_FORCE_EXIT_GRACE_MS,
): NodeJS.Timeout {
  const timer = setTimeout(() => {
    proc.exit(getExitCode());
  }, graceMs);
  timer.unref?.();
  return timer;
}

/** Resolve once a stream's currently-buffered writes have flushed to its sink. */
function flushStream(stream: Writable): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      // An empty write's callback fires after all previously-queued writes have
      // been flushed (writes are ordered), which is the documented way to know a
      // stream's buffer has drained.
      stream.write('', () => {
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

/**
 * 等待给定流上的缓冲输出刷出,以 `timeoutMs` 为上限。
 *
 * 尚未读完全部 stdout/stderr 的慢速或管道消费者,会把管道作为合法 ref'd
 * 句柄使循环保持存活。在任何强制退出前刷出,可避免截断本会成功的运行的
 * 输出。等待有界,使永久卡住的消费者无法重新引入挂起。
 */
export async function drainStdio(
  streams: readonly Writable[],
  timeoutMs: number = HEADLESS_STDIO_DRAIN_TIMEOUT_MS,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([Promise.all(streams.map(flushStream)).then(() => undefined), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * 完成 headless 运行:刷出 stdio,然后武装强制退出兜底。
 *
 * 先排空意味着进行中的合法输出在兜底触发前已完整写出,并且——排空后的
 * stdio 不再持有循环——之后只有真正泄漏的句柄才能使其存活,这正是兜底
 * 的用途。
 */
export async function finalizeHeadlessRun(
  proc: ExitableProcess,
  streams: readonly Writable[],
  getExitCode: () => number,
  options: { drainTimeoutMs?: number; graceMs?: number } = {},
): Promise<void> {
  await drainStdio(streams, options.drainTimeoutMs ?? HEADLESS_STDIO_DRAIN_TIMEOUT_MS);
  scheduleHeadlessForceExit(proc, getExitCode, options.graceMs);
}
