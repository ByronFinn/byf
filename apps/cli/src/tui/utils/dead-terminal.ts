/**
 * 检测意味着控制终端(stdout/stderr pty)实际已消失的错误——例如父 shell
 * 崩溃、tmux 服务端消失,或 SSH 连接未送达 SIGHUP 即断开。
 *
 * 继续向死终端写入会在每个渲染 tick 重复触发同一错误并钉死一个 CPU 核。
 * 调用方应跳过任何触碰 stdout/stderr 的清理并立即退出。
 */
const DEAD_TERMINAL_ERROR_CODES = new Set<string>(['EIO', 'EPIPE', 'ENOTCONN']);

export function isDeadTerminalError(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code !== undefined && DEAD_TERMINAL_ERROR_CODES.has(code);
}
