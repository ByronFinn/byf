import { spawn } from 'node:child_process';

/** 等待用户选择的最长时长(超过视为失败并杀进程)。 */
const PICK_TIMEOUT_MS = 120_000;

/**
 * 经 osascript 弹系统原生目录选择器(macOS),返回 POSIX 路径。
 * - 用户取消(AppleScript `-128` User canceled)→ null;
 * - 选择器本身失败(无 GUI / 无辅助功能权限 / 超时)→ 抛错(路由转 500,
 *   客户端 fallback 路径输入弹窗)——不能与"取消"混为一谈:无 GUI 的
 *   SSH 会话里点击"添加工作区"必须有反馈,而不是静默无操作。
 */
export function pickDirectoryNative(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn('osascript', ['-e', 'POSIX path of (choose folder)'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('directory picker timed out'));
    }, PICK_TIMEOUT_MS);
    child.stdout.on('data', (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(out.trim().length > 0 ? out.trim() : null);
        return;
      }
      const isUserCancel = /[-]128|user canceled/i.test(err);
      if (!isUserCancel) {
        reject(
          new Error(`directory picker failed (exit ${code}): ${err.trim() || 'no error output'}`),
        );
        return;
      }
      resolve(null);
    });
  });
}
