import { open, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 会话级单写者锁（PRD-0037 #326 / R10，修 D1 双进程双写）。
 *
 * 会话目录内锁文件（pid + 心跳时间戳）：
 * - 空闲获取：原子创建（'wx'）；
 * - 已被他人持有：pid 存活且心跳新鲜（< staleMs，默认 60s）→ 明确拒绝；
 * - 持有者死亡（pid 不存在）或心跳超时 → 自动接管；
 * - 同 pid 重入：允许（同进程即同写者，测试与重装配场景）；
 * - 持有期间后台心跳刷新；release 删除锁文件。
 * Phase 3 SQLite leases 接管该职责（#337），接口形态对齐。
 */

export const DEFAULT_LOCK_STALE_MS = 60_000;
const DEFAULT_HEARTBEAT_MS = 20_000;

export type SessionLockErrorCode = 'SESSION_LOCKED';

export class SessionLockError extends Error {
  constructor(
    readonly code: SessionLockErrorCode,
    message: string,
    readonly holder: { pid: number; heartbeatAt: number } | undefined,
  ) {
    super(message);
    this.name = 'SessionLockError';
  }
}

interface LockFileContent {
  readonly pid: number;
  readonly heartbeatAt: number;
}

export interface SessionLockOptions {
  /** 心跳超时（接管阈值）；默认 60s。 */
  readonly staleMs?: number;
  /** 心跳刷新间隔；默认 20s。 */
  readonly heartbeatMs?: number;
  /** 时钟注入（测试）。 */
  readonly now?: () => number;
  /** pid 注入（测试）。 */
  readonly pid?: number;
}

export interface SessionLockHandle {
  /** 持有者 pid。 */
  readonly pid: number;
  /** 停止心跳并删除锁文件。 */
  release(): Promise<void>;
  /** 立即刷新一次心跳。 */
  heartbeat(): Promise<void>;
}

function lockFilePath(sessionDir: string): string {
  return join(sessionDir, '.lock');
}

export async function acquireSessionLock(
  sessionDir: string,
  options: SessionLockOptions = {},
): Promise<SessionLockHandle> {
  const staleMs = options.staleMs ?? DEFAULT_LOCK_STALE_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const now = options.now ?? Date.now;
  const pid = options.pid ?? process.pid;
  const path = lockFilePath(sessionDir);

  await ensureDirOf(sessionDir);
  const existing = await readLock(path);
  if (existing && !canTakeOver(existing, pid, staleMs, now)) {
    throw new SessionLockError(
      'SESSION_LOCKED',
      `会话正被进程 ${existing.pid} 使用（心跳 ${Math.round((now() - existing.heartbeatAt) / 1000)}s 前）；` +
        '请关闭该进程或等待其退出后再试。',
      existing,
    );
  }
  await writeFile(
    path,
    `${JSON.stringify({ pid, heartbeatAt: now() } satisfies LockFileContent)}\n`,
  );

  const timer = setInterval(() => {
    void heartbeatOf(path, pid, now);
  }, heartbeatMs);
  timer.unref?.();

  return {
    pid,
    async release() {
      clearInterval(timer);
      try {
        const current = await readLock(path);
        if (current?.pid === pid) await unlink(path); // 只删自己的锁
      } catch {
        // 锁文件已不在：幂等
      }
    },
    async heartbeat() {
      await heartbeatOf(path, pid, now);
    },
  };
}

async function heartbeatOf(path: string, pid: number, now: () => number): Promise<void> {
  try {
    const current = await readLock(path);
    if (current && current.pid === pid) {
      const handle = await open(path, 'w');
      try {
        await handle.write(`${JSON.stringify({ pid: current.pid, heartbeatAt: now() })}\n`);
      } finally {
        await handle.close();
      }
    }
  } catch {
    // 心跳 best-effort
  }
}

function canTakeOver(
  existing: LockFileContent,
  selfPid: number,
  staleMs: number,
  now: () => number,
): boolean {
  if (existing.pid === selfPid) return true; // 同进程重入 = 同写者
  if (now() - existing.heartbeatAt >= staleMs) return true; // 心跳超时
  return !isPidAlive(existing.pid); // 持有者已死
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'; // EPERM = 存在但无权限
  }
}

async function readLock(path: string): Promise<LockFileContent | undefined> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text.trim()) as Partial<LockFileContent>;
    if (typeof parsed.pid !== 'number' || typeof parsed.heartbeatAt !== 'number') return undefined;
    return { pid: parsed.pid, heartbeatAt: parsed.heartbeatAt };
  } catch {
    return undefined; // 无锁文件或损坏 = 可获取
  }
}

async function ensureDirOf(sessionDir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(sessionDir, { recursive: true });
}
