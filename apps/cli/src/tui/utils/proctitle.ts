/**
 * 终端窗口标题同步。
 *
 * 会话标题存在时使用它,截断到 80 字符以保持标签页可读。
 * 新会话或无标题会话回退为 `Byf Code`。
 *
 * 同时写入 `process.title`(用于进程列表)与 OSC 0/2 转义序列
 * (多数终端用它设置窗口 / 标签页标题)。stdout 非 TTY 时跳过 OSC 写入。
 */
import { PRODUCT_NAME } from '#/constant/app';
import { MAX_PROCESS_TITLE_LENGTH } from '#/tui/constant/terminal';

export function setProcessTitle(title: string | null, _sessionId: string): void {
  const trimmed = title?.trim() ?? '';
  const label = trimmed.length > 0 ? trimmed.slice(0, MAX_PROCESS_TITLE_LENGTH) : PRODUCT_NAME;
  try {
    process.title = label;
  } catch {
    /* noop */
  }
  try {
    if (process.stdout.isTTY) {
      process.stdout.write(`\u001B]0;${label}\u0007`);
    }
  } catch {
    /* noop */
  }
}
