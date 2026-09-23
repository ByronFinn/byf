import { describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { acquireSessionLock, SessionLockError } from '../../src/harness/lock';

/**
 * PRD-0037 #326 / R10：会话级单写者（修 D1）。
 * - 第二个进程打开同会话被明确拒绝；
 * - 持有者崩溃（pid 死亡）→ 接管；
 * - 心跳超时（60s 默认，测试注入缩短）→ 接管；
 * - release 后可重新获取；同 pid 重入允许。
 */

describe('session lock (PRD-0037 #326)', () => {
  it('rejects a second holder while the first is fresh and alive', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-lock-'));
    let clock = 1_000_000;
    // 第一持有者用真实存活 pid（本进程）
    const first = await acquireSessionLock(dir, {
      pid: process.pid,
      now: () => clock,
      heartbeatMs: 1_000_000,
    });
    clock += 5_000; // 5s 内：新鲜
    let rejected = false;
    let holder: unknown;
    try {
      // 第二持有者用必然不存在的 pid（模拟另一进程）
      await acquireSessionLock(dir, { pid: 999_999_998, now: () => clock, heartbeatMs: 1_000_000 });
    } catch (error) {
      rejected = error instanceof SessionLockError;
      holder = (error as SessionLockError).holder;
    }
    expect(rejected).toBe(true);
    expect((holder as { pid: number } | undefined)?.pid).toBe(process.pid);
    await first.release();
    await rm(dir, { recursive: true, force: true });
  });

  it('takes over when the heartbeat is stale (default 60s policy)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-lock-'));
    let clock = 1_000_000;
    const first = await acquireSessionLock(dir, {
      pid: 11111,
      now: () => clock,
      heartbeatMs: 1_000_000,
    });
    clock += 61_000; // 超过 60s：心跳超时
    const second = await acquireSessionLock(dir, {
      pid: 22222,
      now: () => clock,
      heartbeatMs: 1_000_000,
    });
    expect(second.pid).toBe(22222);
    await first.release();
    await second.release();
    await rm(dir, { recursive: true, force: true });
  });

  it('takes over when the holder pid is dead', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-lock-'));
    let clock = 1_000_000;
    // pid 999999999 几乎必然不存在
    const first = await acquireSessionLock(dir, {
      pid: 999_999_999,
      now: () => clock,
      heartbeatMs: 1_000_000,
    });
    clock += 1_000; // 心跳新鲜但 pid 已死
    const second = await acquireSessionLock(dir, { pid: process.pid, now: () => clock });
    expect(second.pid).toBe(process.pid);
    await first.release();
    await second.release();
    await rm(dir, { recursive: true, force: true });
  });

  it('same-pid re-entry is allowed (one process is one writer)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-lock-'));
    const first = await acquireSessionLock(dir, { pid: process.pid, heartbeatMs: 1_000_000 });
    const second = await acquireSessionLock(dir, { pid: process.pid, heartbeatMs: 1_000_000 });
    expect(second.pid).toBe(process.pid);
    await first.release();
    await second.release();
    await rm(dir, { recursive: true, force: true });
  });

  it('release frees the lock for the next holder; heartbeat refreshes timestamp', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-lock-'));
    let clock = 1_000_000;
    const first = await acquireSessionLock(dir, {
      pid: process.pid,
      now: () => clock,
      heartbeatMs: 1_000_000,
    });
    clock += 10_000;
    await first.heartbeat();
    const content = JSON.parse(await readFile(join(dir, '.lock'), 'utf8')) as {
      heartbeatAt: number;
    };
    expect(content.heartbeatAt).toBe(1_010_000); // 刷新到注入时钟
    await first.release();
    // release 后：死 pid 的"他进程"也能获取（锁已释放）
    const second = await acquireSessionLock(dir, {
      pid: 999_999_997,
      now: () => clock,
      heartbeatMs: 1_000_000,
    });
    expect(second.pid).toBe(999_999_997);
    await second.release();
    await rm(dir, { recursive: true, force: true });
  });

  it('corrupt lock file is treated as acquirable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-lock-'));
    await writeFile(join(dir, '.lock'), '{not json', 'utf8');
    const handle = await acquireSessionLock(dir, { heartbeatMs: 1_000_000 });
    expect(handle.pid).toBe(process.pid);
    await handle.release();
    await rm(dir, { recursive: true, force: true });
  });
});
