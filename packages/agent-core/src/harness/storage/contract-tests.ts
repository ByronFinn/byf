import { describe, expect, it } from 'bun:test';

import { InMemorySessionStorage } from './memory';
import type { SessionStorage } from './storage';
import type { AppendEntryInput, JournalLine, LaneId, StoredMessage, WireEntry } from './types';

/**
 * SessionStorage 契约测试套件（PRD-0037 #319）。
 *
 * 供全部后端复用（内存参考实现、JSONL、SQLite）——同一套件全绿 = parity。
 * 套件只经由 {@link SessionStorage} 公开面操作存储，不触碰实现细节。
 */

/** 断言 promise 拒绝（bun:test 的 expect().rejects 在 type-aware lint 下误报 await-thenable）。 */
async function expectRejects(promise: Promise<unknown>): Promise<void> {
  let rejected = false;
  try {
    await promise;
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('expected promise to reject');
}

export interface StorageContractSetup {
  /** 每个用例构造全新存储。 */
  make: () => Promise<SessionStorage>;
  /** 用例收尾（缺省 close）。 */
  cleanup?: (storage: SessionStorage) => Promise<void>;
}

export function runSessionStorageContractTests(setup: StorageContractSetup): void {
  const makeStorage = async (): Promise<SessionStorage> => {
    const storage = await setup.make();
    await storage.createLane({ laneId: 'main', name: 'main' });
    return storage;
  };
  const cleanup = async (storage: SessionStorage): Promise<void> => {
    await (setup.cleanup ? setup.cleanup(storage) : storage.close());
  };

  const msg = (text: string): StoredMessage => ({
    role: 'user',
    content: [{ type: 'text', text }],
  });

  describe('SessionStorage contract', () => {
    it('creates lanes and snapshots them', async () => {
      const storage = await makeStorage();
      const lanes = await storage.getLanes();
      expect(lanes.map((lane) => lane.laneId)).toEqual(['main']);
      expect(lanes[0]!.leafEntryId).toBeNull();
      await storage.createLane({ laneId: 'research', name: 'Research' });
      expect((await storage.getLanes()).map((l) => l.laneId)).toEqual(['main', 'research']);
      await cleanup(storage);
    });

    it('rejects duplicate lane creation', async () => {
      const storage = await makeStorage();
      await expectRejects(storage.createLane({ laneId: 'main' }));
      await cleanup(storage);
    });

    it('appendEntry chains parentId from lane leaf and advances it atomically', async () => {
      const storage = await makeStorage();
      const first = await storage.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: msg('a'),
      });
      expect(first.parentId).toBeNull();
      const second = await storage.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: msg('b'),
      });
      expect(second.parentId).toBe(first.id);
      const lanes = await storage.getLanes();
      expect(lanes.find((lane) => lane.laneId === 'main')!.leafEntryId).toBe(second.id);
      await cleanup(storage);
    });

    it('appendEntry to unknown lane fails without side effects', async () => {
      const storage = await makeStorage();
      await expectRejects(
        storage.appendEntry({ laneId: 'ghost', kind: 'message', message: msg('x') }),
      );
      expect(await storage.getEntries()).toEqual([]);
      await cleanup(storage);
    });

    it('second lane forks from an entry without touching the first lane leaf', async () => {
      const storage = await makeStorage();
      const a = await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('a') });
      await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('b') });
      await storage.createLane({ laneId: 'side', fromEntryId: a.id });
      const forked = await storage.appendEntry({
        laneId: 'side',
        kind: 'message',
        message: msg('fork'),
      });
      expect(forked.parentId).toBe(a.id);
      const lanes = await storage.getLanes();
      expect(lanes.find((lane) => lane.laneId === 'main')!.leafEntryId).not.toBe(forked.id);
      expect(lanes.find((lane) => lane.laneId === 'side')!.leafEntryId).toBe(forked.id);
      await cleanup(storage);
    });

    it('moveLane repoints a leaf to an existing entry', async () => {
      const storage = await makeStorage();
      const a = await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('a') });
      const b = await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('b') });
      await storage.moveLane('main', a.id);
      expect((await storage.getLanes()).find((l) => l.laneId === 'main')!.leafEntryId).toBe(a.id);
      const c = await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('c') });
      expect(c.parentId).toBe(a.id);
      expect(b.parentId).toBe(a.id); // b 成为旁支，树保留
      await expectRejects(storage.moveLane('main', 'missing-entry'));
      await cleanup(storage);
    });

    it('deleteLane tombstones without removing entries', async () => {
      const storage = await makeStorage();
      await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('a') });
      await storage.createLane({ laneId: 'side' });
      await storage.appendEntry({ laneId: 'side', kind: 'message', message: msg('s') });
      await storage.deleteLane('side');
      expect((await storage.getLanes()).map((l) => l.laneId)).toEqual(['main']);
      expect((await storage.getEntries()).length).toBe(2);
      await expectRejects(
        storage.appendEntry({ laneId: 'side', kind: 'message', message: msg('t') }),
      );
      await cleanup(storage);
    });

    it('records append, filter, and stay idempotent for provisioned ids', async () => {
      const storage = await makeStorage();
      const r1 = await storage.appendRecord({
        laneId: 'main',
        kind: 'operation_started',
        payload: { op: 'prompt', input: 'hi' },
        id: 'op-1',
      });
      const replay = await storage.appendRecord({
        laneId: 'main',
        kind: 'operation_started',
        payload: { op: 'prompt', input: 'hi' },
        id: 'op-1',
      });
      expect(replay.seq).toBe(r1.seq); // appendIfMissing：恢复可重入
      const r2 = await storage.appendRecord({
        laneId: 'main',
        kind: 'operation_finished',
        payload: { opId: 'op-1' },
      });
      expect(r2.seq).toBeGreaterThan(r1.seq);
      const r3 = await storage.appendRecord({
        laneId: 'side',
        kind: 'queue_enqueued',
        payload: { queue: 'steer' },
      });
      expect((await storage.getRecords()).length).toBe(3);
      expect((await storage.getRecords({ laneId: 'main' })).length).toBe(2);
      expect(
        (await storage.getRecords({ kinds: ['operation_finished'] })).map((r) => r.id),
      ).toEqual([r2.id]);
      expect((await storage.getRecords({ fromSeq: r2.seq })).length).toBe(2);
      expect(await storage.getRecords({ laneId: 'ghost' })).toEqual([]);
      expect(r3.laneId).toBe('side');
      await cleanup(storage);
    });

    it('facts are append-only with latest-wins reads and label semantics', async () => {
      const storage = await makeStorage();
      await storage.appendFact({ name: 'title', value: 'First' });
      await storage.appendFact({ name: 'title', value: 'Second', label: 'work' });
      await storage.appendFact({ name: 'pinned', value: true });
      await storage.appendFact({ name: 'title', value: 'Third', label: null });
      const facts = await storage.getFacts();
      expect(facts.get('title')!.value).toBe('Third');
      expect(facts.get('title')!.label).toBeNull(); // 显式 null 清除
      expect(facts.get('pinned')!.value).toBe(true);
      // label 省略时沿用上一条
      await storage.appendFact({ name: 'title', value: 'Fourth' });
      expect((await storage.getFacts()).get('title')!.label).toBeNull();
      // 历史保留在日志里
      const log = await storage.getLog();
      expect(log.filter((line) => line.kind === 'fact').length).toBe(5);
      await cleanup(storage);
    });

    it('seq is globally monotonic across entries, records, facts, and lane ops', async () => {
      const storage = await makeStorage();
      const entrySeq = (
        await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('a') })
      ).seq;
      const recordSeq = (
        await storage.appendRecord({ laneId: 'main', kind: 'operation_started', payload: {} })
      ).seq;
      const factSeq = (await storage.appendFact({ name: 'k', value: 1 })).seq;
      await storage.createLane({ laneId: 'side' });
      const laneLine = (await storage.getLog()).findLast((line) => line.kind === 'lane')!;
      const sideEntrySeq = (
        await storage.appendEntry({ laneId: 'side', kind: 'message', message: msg('s') })
      ).seq;
      const seen = [entrySeq, recordSeq, factSeq, laneLine.seq, sideEntrySeq];
      for (let i = 1; i < seen.length; i++) {
        expect(seen[i]!).toBeGreaterThan(seen[i - 1]!);
      }
      const log = await storage.getLog();
      for (let i = 1; i < log.length; i++) {
        expect(log[i]!.seq).toBeGreaterThan(log[i - 1]!.seq);
      }
      await cleanup(storage);
    });

    it('getLog merges all four kinds in seq order', async () => {
      const storage = await makeStorage();
      await storage.appendEntry({ laneId: 'main', kind: 'message', message: msg('a') });
      await storage.appendRecord({ laneId: 'main', kind: 'operation_started', payload: {} });
      await storage.appendFact({ name: 'k', value: 1 });
      await storage.createLane({ laneId: 'side' });
      const log = await storage.getLog();
      const kinds = new Set(log.map((line) => line.kind));
      expect(kinds.has('entry')).toBe(true);
      expect(kinds.has('record')).toBe(true);
      expect(kinds.has('fact')).toBe(true);
      expect(kinds.has('lane')).toBe(true);
      await cleanup(storage);
    });

    it('invariant: dropping all records still leaves a complete valid conversation tree', async () => {
      const storage = await makeStorage();
      const inputs: AppendEntryInput[] = [
        { laneId: 'main', kind: 'message', message: msg('hello') },
        {
          laneId: 'main',
          kind: 'message',
          message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        },
        { laneId: 'main', kind: 'model_change', modelAlias: 'kimi' },
        { laneId: 'main', kind: 'custom', customType: 'permission.mode', data: 'auto' },
        { laneId: 'main', kind: 'message', message: msg('again') },
      ];
      for (const input of inputs) {
        await storage.appendEntry(input);
        await storage.appendRecord({
          laneId: 'main',
          kind: 'operation_started',
          payload: { opaque: true },
        });
      }
      await storage.appendFact({ name: 'title', value: 'T' });
      // 模拟"删掉全部 records"：只取 entries
      const entries = await storage.getEntries();
      expect(entries.length).toBe(inputs.length);
      const byId = new Map(entries.map((entry: WireEntry) => [entry.id, entry]));
      const roots: WireEntry[] = [];
      for (const entry of entries) {
        if (entry.parentId === null) {
          roots.push(entry);
        } else {
          expect(byId.has(entry.parentId)).toBe(true); // 父链完整
          const parent = byId.get(entry.parentId)!;
          expect(parent.seq).toBeLessThan(entry.seq); // 父先于子
        }
      }
      expect(roots.length).toBe(1); // 单根完整对话
      // 消息序列可线性化为合法对话（user 开头）
      const firstMessage = entries.find((e) => e.kind === 'message')!;
      expect(firstMessage.kind === 'message' && firstMessage.message.role).toBe('user');
      await cleanup(storage);
    });

    it('supports all seven entry kinds round-trip', async () => {
      const storage = await makeStorage();
      const cases: AppendEntryInput[] = [
        { laneId: 'main', kind: 'message', message: msg('m') },
        { laneId: 'main', kind: 'model_change', modelAlias: 'deepseek-chat' },
        { laneId: 'main', kind: 'thinking_level_change', thinkingLevel: 'high' },
        { laneId: 'main', kind: 'active_tools_change', activeTools: ['read', 'bash'] },
        { laneId: 'main', kind: 'compaction', summary: 'summarized', stats: { before: 100 } },
        { laneId: 'main', kind: 'branch_summary', summary: 'branch note' },
        { laneId: 'main', kind: 'custom', customType: 'goal.create', data: { objective: 'x' } },
      ];
      for (const input of cases) {
        await storage.appendEntry(input);
      }
      const entries = await storage.getEntries();
      expect(entries.map((e) => e.kind)).toEqual([
        'message',
        'model_change',
        'thinking_level_change',
        'active_tools_change',
        'compaction',
        'branch_summary',
        'custom',
      ]);
      const model = entries.find((e) => e.kind === 'model_change');
      expect(model!.kind === 'model_change' && model!.modelAlias).toBe('deepseek-chat');
      const custom = entries.find((e) => e.kind === 'custom');
      expect(custom!.kind === 'custom' && custom!.customType).toBe('goal.create');
      await cleanup(storage);
    });

    it('getEntry returns appended entries and undefined otherwise', async () => {
      const storage = await makeStorage();
      const entry = await storage.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: msg('a'),
      });
      expect((await storage.getEntry(entry.id))?.id).toBe(entry.id);
      expect(await storage.getEntry('nope')).toBeUndefined();
      await cleanup(storage);
    });

    it('appendEntry with a provisioned id is idempotent (appendIfMissing)', async () => {
      const storage = await makeStorage();
      const first = await storage.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: msg('a'),
        id: 'preallocated-1',
      });
      expect(first.id).toBe('preallocated-1');
      const replay = await storage.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: msg('a'),
        id: 'preallocated-1',
      });
      expect(replay.seq).toBe(first.seq); // 恢复可重入：已存在即跳过
      expect((await storage.getEntries()).length).toBe(1);
      const next = await storage.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: msg('b'),
      });
      expect(next.parentId).toBe(first.id);
      await cleanup(storage);
    });

    it('entries on different lanes sharing a fork point stay independent', async () => {
      const storage = await makeStorage();
      const root = await storage.appendEntry({
        laneId: 'main',
        kind: 'message',
        message: msg('root'),
      });
      await storage.createLane({ laneId: 'a', fromEntryId: root.id });
      await storage.createLane({ laneId: 'b', fromEntryId: root.id });
      const ea = await storage.appendEntry({ laneId: 'a', kind: 'message', message: msg('A') });
      const eb = await storage.appendEntry({ laneId: 'b', kind: 'message', message: msg('B') });
      expect(ea.parentId).toBe(root.id);
      expect(eb.parentId).toBe(root.id);
      expect(ea.id).not.toBe(eb.id);
      const lanes = await storage.getLanes();
      expect(lanes.find((l) => l.laneId === 'a')!.leafEntryId).toBe(ea.id);
      expect(lanes.find((l) => l.laneId === 'b')!.leafEntryId).toBe(eb.id);
      await cleanup(storage);
    });
  });
}

/** 便利注册：内存参考实现的契约套件（参考语义）。 */
export function registerInMemoryContractSuite(): void {
  describe('InMemorySessionStorage (reference)', () => {
    runSessionStorageContractTests({
      make: async () => new InMemorySessionStorage('contract-memory'),
    });
  });
}

/** 从合并日志中挑出某 lane 的 lane 行（JSONL 重放推导 leaf 的测试辅助）。 */
export function laneOpsFromLog(log: readonly JournalLine[], laneId: LaneId): JournalLine[] {
  return log.filter((line) => line.kind === 'lane' && line.lane.laneId === laneId);
}
