import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SqliteSessionStorage, StorageLeaseError } from '../src/sqlite-storage';

/** PRD-0037 #337：lease 单写者（跨进程第二写入者被拒；心跳超时接管；多会话互不阻塞）。 */
describe('sqlite leases (#337)', () => {
  it('rejects a second writer with a fresh lease; takeover after staleness', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-lease-'));
    try {
      const dbPath = join(dir, 'sessions.db');
      const first = SqliteSessionStorage.open(dbPath, 's1', { owner: 'writer-1' });
      first.heartbeat();
      // 新鲜 lease：第二写入者被拒
      let rejected = false;
      try {
        SqliteSessionStorage.open(dbPath, 's1', { owner: 'writer-2' });
      } catch (error) {
        rejected = error instanceof StorageLeaseError;
      }
      expect(rejected).toBe(true);
      // 心跳超时（接管阈值注入为极小值）：自动接管
      const second = SqliteSessionStorage.open(dbPath, 's1', {
        owner: 'writer-2',
        leaseStaleMs: -1, // 立即过期
      });
      second.heartbeat();
      await second.close();
      await first.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('independent leases per session in the same database (multi-session non-blocking)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byf-multi-'));
    try {
      const dbPath = join(dir, 'sessions.db');
      const a = SqliteSessionStorage.open(dbPath, 'session-a', { owner: 'w-a' });
      a.heartbeat();
      // 同库不同会话：互不阻塞
      const b = SqliteSessionStorage.open(dbPath, 'session-b', { owner: 'w-b' });
      b.heartbeat();
      await a.createLane({ laneId: 'main' });
      await b.createLane({ laneId: 'main' });
      const entryA = await a.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: { role: 'user', content: [{ type: 'text', text: 'a' }] },
      });
      const entryB = await b.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: { role: 'user', content: [{ type: 'text', text: 'b' }] },
      });
      expect((await a.getEntries()).length).toBe(1);
      expect((await b.getEntries()).length).toBe(1);
      // entry id 会话内唯一即可（复合主键），不同会话可重名
      await a.close();
      await b.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
