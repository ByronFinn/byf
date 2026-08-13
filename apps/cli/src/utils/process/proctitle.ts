/**
 * 早期启动的进程名初始化。
 *
 * 设置进程标题,使 `ps`/`top` 与终端标签页从二进制启动那一刻起就显示
 * `Byf Code`——在 Commander 解析 argv 之前、任何预检之前,
 * 甚至在 `--help`/`--version` 上也是如此。
 *
 * OSC 写入 stderr(而非 stdout),使它仍能到达终端
 * when stdout is piped, e.g. `byf --print | grep ...`.
 */
import { PRODUCT_NAME } from '#/constant/app';
import { BEL, ESC } from '#/constant/terminal';

export function setProcessTitle(label: string): void {
  try {
    process.title = label;
  } catch {
    /* noop */
  }
  try {
    if (process.stderr.isTTY) {
      process.stderr.write(`${ESC}]0;${label}${BEL}`);
    }
  } catch {
    /* noop */
  }
}

export function initProcessName(name: string = PRODUCT_NAME): void {
  setProcessTitle(name);
}
