import { spawn } from 'node:child_process';

/** 为给定绝对路径解析平台特定的「在文件管理器中显示」命令（自 apps/vis
 *  `lib/reveal.ts` 迁移，PRD-0035 R-B1：reveal 是 host 动作，仅 web-server 实现）。
 *  保持纯函数（无 IO），使可单元测试。 */
export function revealCommandFor(
  path: string,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: readonly string[] } {
  // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- only darwin/win32 differ; all other platforms fall back to xdg-open
  switch (platform) {
    case 'darwin':
      return { command: 'open', args: [path] };
    case 'win32':
      return { command: 'cmd', args: ['/c', 'start', '""', path] };
    default:
      return { command: 'xdg-open', args: [path] };
  }
}

/** 拉起 OS 文件管理器显示 `path`。启动器进程启动后 resolve；仅在启动器本身
 *  无法拉起（缺少二进制等）时 reject。 */
export async function revealInOs(path: string): Promise<void> {
  const { command, args } = revealCommandFor(path);
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    child.once('spawn', () => {
      if (settled) return;
      settled = true;
      child.unref();
      resolve();
    });
  });
}
