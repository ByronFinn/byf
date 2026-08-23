import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { JsonlSessionStorage, Wire2StorageError } from '../../../src/harness/storage';
import { runSessionStorageContractTests } from '../../../src/harness/storage/contract-tests';

const tempRoots: string[] = [];

async function makeJsonl(): Promise<JsonlSessionStorage> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-wire2-jsonl-'));
  tempRoots.push(dir);
  const storage = await JsonlSessionStorage.create(join(dir, 'wire.jsonl'), 'jsonl-test');
  await storage.createLane({ laneId: 'main', name: 'main' });
  return storage;
}

/** 契约套件自带 main lane 创建，用裸存储。 */
async function makeBareJsonl(): Promise<JsonlSessionStorage> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-wire2-jsonl-'));
  tempRoots.push(dir);
  return JsonlSessionStorage.create(join(dir, 'wire.jsonl'), 'jsonl-test');
}

afterAll(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

/** 捕获 promise 拒绝（lint-staged 的 no-unassigned-vars 规避写法）。 */
async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('JsonlSessionStorage (contract parity)', () => {
  runSessionStorageContractTests({ make: () => makeBareJsonl() });
});

describe('JsonlSessionStorage torn-tail and corruption', () => {
  it('truncates a torn last line (missing newline) without losing confirmed lines', async () => {
    const storage = await makeJsonl();
    const a = await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'user', content: [{ type: 'text', text: 'a' }] },
    });
    await storage.close();
    const path = storage.path;
    // 模拟崩溃：半行写入（无换行）
    await writeFile(path, '{"kind":"entry","seq":2,"lane":"main"', { flag: 'a' });
    const reopened = await JsonlSessionStorage.open(path);
    const entries = await reopened.getEntries();
    expect(entries.map((e) => e.id)).toEqual([a.id]); // 已确认行无损
    const next = await reopened.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'user', content: [{ type: 'text', text: 'b' }] },
    });
    expect(next.seq).toBe(3); // 复用被截断的行位（lane create=1、entry a=2、撕裂行=3）
    expect(next.parentId).toBe(a.id);
    // 重开一次：截断后追加的行正常存活
    await reopened.close();
    const third = await JsonlSessionStorage.open(path);
    expect((await third.getEntries()).map((e) => e.id)).toEqual([a.id, next.id]);
    await third.close();
  });

  it('truncates an unparseable last line with newline', async () => {
    const storage = await makeJsonl();
    await storage.appendFact({ name: 'title', value: 'ok' });
    await storage.close();
    await writeFile(storage.path, '{broken json\n', { flag: 'a' });
    const reopened = await JsonlSessionStorage.open(storage.path);
    expect((await reopened.getFacts()).get('title')!.value).toBe('ok');
    await reopened.close();
  });

  it('refuses to open when a non-last line is corrupted', async () => {
    const storage = await makeJsonl();
    await storage.appendFact({ name: 'a', value: 1 });
    await storage.appendFact({ name: 'b', value: 2 });
    await storage.close();
    const text = (await readFile(storage.path, 'utf8')).split('\n');
    // 破坏第 2 行（header 后第 1 条数据行）
    text[1] = '{corrupt';
    await writeFile(storage.path, text.join('\n'));
    const error = await captureError(() => JsonlSessionStorage.open(storage.path));
    expect(error).toBeInstanceOf(Wire2StorageError);
    expect((error as Wire2StorageError).code).toBe('CORRUPTED_JOURNAL');
  });

  it('refuses to open journals with wrong format version (old 1.1)', async () => {
    const storage = await makeJsonl();
    await storage.close();
    const text = await readFile(storage.path, 'utf8');
    const replaced = text.replace('"formatVersion":"2.0"', '"formatVersion":"1.1"');
    await writeFile(storage.path, replaced);
    const error = await captureError(() => JsonlSessionStorage.open(storage.path));
    expect(error).toBeInstanceOf(Wire2StorageError);
    expect((error as Wire2StorageError).code).toBe('UNSUPPORTED_FORMAT');
  });

  it('replays lane create/move/delete rows to derive lane leaves', async () => {
    const storage = await makeJsonl();
    const e1 = await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'user', content: [{ type: 'text', text: '1' }] },
    });
    const e2 = await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'assistant', content: [{ type: 'text', text: '2' }] },
    });
    await storage.createLane({ laneId: 'side', fromEntryId: e1.id });
    const side = await storage.appendEntry({
      laneId: 'side',
      kind: 'message',
      message: { role: 'user', content: [{ type: 'text', text: 'side' }] },
    });
    await storage.moveLane('main', e1.id); // 导航回退
    await storage.deleteLane('side');
    await storage.close();

    const reopened = await JsonlSessionStorage.open(storage.path);
    const lanes = await reopened.getLanes();
    expect(lanes.map((l) => l.laneId)).toEqual(['main']); // side 已删
    expect(lanes.find((l) => l.laneId === 'main')!.leafEntryId).toBe(e1.id); // move 重放
    // main 从 e1 续写
    const e3 = await reopened.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: { role: 'user', content: [{ type: 'text', text: '3' }] },
    });
    expect(e3.parentId).toBe(e1.id);
    expect(e2.parentId).toBe(e1.id); // e2 成为旁支保留在树里
    expect(side.parentId).toBe(e1.id);
    await reopened.close();
  });

  it('round-trips records with provisioned ids across reopen (idempotent replay)', async () => {
    const storage = await makeJsonl();
    const r = await storage.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      payload: { input: 'go' },
      id: 'op-42',
    });
    await storage.close();
    const reopened = await JsonlSessionStorage.open(storage.path);
    const again = await reopened.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      payload: { input: 'go' },
      id: 'op-42',
    });
    expect(again.seq).toBe(r.seq);
    expect((await reopened.getRecords()).length).toBe(1);
    await reopened.close();
  });

  it('persists message payloads with tool calls and origins faithfully', async () => {
    const storage = await makeJsonl();
    const entry = await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'calling' }],
        toolCalls: [{ type: 'function', id: 'tc1', name: 'read', arguments: '{"path":"x"}' }],
      },
    });
    const userEntry = await storage.appendEntry({
      laneId: 'main',
      kind: 'message',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'hi' }],
        origin: { kind: 'user', blockedByHook: 'no' },
      },
    });
    await storage.close();
    const reopened = await JsonlSessionStorage.open(storage.path);
    const assistant = await reopened.getEntry(entry.id);
    expect(assistant!.kind === 'message' && assistant!.message.toolCalls?.[0]!.name).toBe('read');
    const user = await reopened.getEntry(userEntry.id);
    expect(user!.kind === 'message' && user!.message.origin?.kind).toBe('user');
    await reopened.close();
  });
});
