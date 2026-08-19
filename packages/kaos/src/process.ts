import type { Readable, Writable } from 'node:stream';

/**
 * {@link Kaos} 环境拉起的运行中进程。
 *
 * 提供对标准 I/O 流、进程 ID 与生命周期管理(wait / kill)的访问。
 * 接口刻意保持最小,使它能由本地子进程、SSH 会话或容器运行时支撑。
 */
export interface KaosProcess {
  /** 连接到进程标准输入的 Writable 流。 */
  readonly stdin: Writable;
  /** Readable stream for the process's standard output. */
  readonly stdout: Readable;
  /** Readable stream for the process's standard error. */
  readonly stderr: Readable;
  /** Operating-system process ID. */
  readonly pid: number;
  /** Exit code if the process has already terminated, otherwise `null`. */
  readonly exitCode: number | null;
  /** Wait for the process to exit and return its exit code. */
  wait(): Promise<number>;
  /** Send a signal to the process (defaults to `SIGTERM`). */
  kill(signal?: NodeJS.Signals): Promise<void>;
}
