import { describe, expect, it } from 'bun:test';

import { WireSession } from '../../../src/harness/session/session';
import { InMemorySessionStorage, Wire2StorageError } from '../../../src/harness/storage';
import type { WireEntry } from '../../../src/harness/storage';

function msg(text: string, role: 'user' | 'assistant' = 'user') {
  return {
    role,
    content: [{ type: 'text', text }] as [{ type: 'text'; text: string }],
  };
}

async function makeSession(): Promise<WireSession> {
  return WireSession.create(new InMemorySessionStorage('test-session'));
}

async function appendMessage(
  session: WireSession,
  text: string,
  role: 'user' | 'assistant' = 'user',
): Promise<WireEntry> {
  return session.append({
    laneId: 'main',
    kind: 'message',
    message: {
      role,
      content: [{ type: 'text', text }],
    },
  });
}

describe('WireSession branch queries', () => {
  it('newestFirst walks from leaf toward root', async () => {
    const session = await makeSession();
    const a = await appendMessage(session, 'a');
    const b = await appendMessage(session, 'b');
    const c = await appendMessage(session, 'c');
    const result = await session.branch({ direction: 'newestFirst' });
    expect(result.entries.map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it('oldestFirst walks from root toward leaf', async () => {
    const session = await makeSession();
    const a = await appendMessage(session, 'a');
    const b = await appendMessage(session, 'b');
    const result = await session.branch({ direction: 'oldestFirst' });
    expect(result.entries.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it('stopAtType compaction yields the current context window (inclusive boundary)', async () => {
    const session = await makeSession();
    const m1 = await appendMessage(session, 'old1');
    await appendMessage(session, 'old2');
    const compaction = await session.append({
      laneId: 'main',
      kind: 'compaction',
      summary: 'summary of old',
    });
    const m3 = await appendMessage(session, 'new1');
    const m4 = await appendMessage(session, 'new2');
    const result = await session.branch({ stopAtType: 'compaction' });
    // 窗口 = compaction 边界自身 + 其后全部（newestFirst 序）
    expect(result.entries.map((e) => e.id)).toEqual([m4.id, m3.id, compaction.id]);
    expect(result.entries.every((e) => e.id !== m1.id)).toBe(true);
  });

  it('stopAtId is inclusive', async () => {
    const session = await makeSession();
    const a = await appendMessage(session, 'a');
    const b = await appendMessage(session, 'b');
    const c = await appendMessage(session, 'c');
    const result = await session.branch({ stopAtId: b.id });
    expect(result.entries.map((e) => e.id)).toEqual([c.id, b.id]);
  });

  it('filters by type and customType', async () => {
    const session = await makeSession();
    await appendMessage(session, 'a');
    await session.append({ laneId: 'main', kind: 'model_change', modelAlias: 'kimi' });
    await session.append({
      laneId: 'main',
      kind: 'custom',
      customType: 'goal.create',
      data: { objective: 'x' },
    });
    await session.append({
      laneId: 'main',
      kind: 'custom',
      customType: 'permission.mode',
      data: 'auto',
    });
    const messages = await session.branch({ types: ['message'] });
    expect(messages.entries.length).toBe(1);
    const goals = await session.branch({ customTypes: ['goal.create'] });
    expect(goals.entries.length).toBe(1);
    const goalEntry = goals.entries[0];
    if (goalEntry?.kind === 'custom') expect(goalEntry.customType).toBe('goal.create');
    expect(goalEntry?.kind).toBe('custom');
  });

  it('paginates with limit and cursor in both directions', async () => {
    const session = await makeSession();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push((await appendMessage(session, `m${i}`)).id);
    }
    // newestFirst：每页 2 条
    const page1 = await session.branch({ direction: 'newestFirst', limit: 2 });
    expect(page1.entries.map((e) => e.id)).toEqual([ids[4], ids[3]]);
    expect(page1.nextCursor).toBe(ids[3]);
    const page2 = await session.branch({
      direction: 'newestFirst',
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.entries.map((e) => e.id)).toEqual([ids[2], ids[1]]);
    // oldestFirst：从根向叶分页
    const oldest1 = await session.branch({ direction: 'oldestFirst', limit: 2 });
    expect(oldest1.entries.map((e) => e.id)).toEqual([ids[0], ids[1]]);
    const oldest2 = await session.branch({
      direction: 'oldestFirst',
      limit: 2,
      cursor: oldest1.nextCursor,
    });
    expect(oldest2.entries.map((e) => e.id)).toEqual([ids[2], ids[3]]);
  });

  it('branch from a specific entry (not the leaf)', async () => {
    const session = await makeSession();
    const a = await appendMessage(session, 'a');
    await appendMessage(session, 'b');
    // 从 a 起扫（而非 leaf）
    const result = await session.branch({ fromEntryId: a.id });
    expect(result.entries.map((e) => e.id)).toEqual([a.id]);
  });
});

describe('WireSession view(lane)', () => {
  it('append advances only the bound lane leaf', async () => {
    const session = await makeSession();
    const root = await appendMessage(session, 'root');
    await session.createLane({ laneId: 'side', fromEntryId: root.id });
    const sideView = session.view('side');
    const sideEntry = await sideView.append({
      kind: 'message',
      message: { role: 'user', content: [{ type: 'text', text: 'side msg' }] },
    });
    expect(sideEntry.parentId).toBe(root.id);
    const mainLeaf = await session.view().leaf();
    const sideLeaf = await sideView.leaf();
    expect(sideLeaf?.id).toBe(sideEntry.id);
    expect(mainLeaf?.id).toBe(root.id);
  });

  it('view branch reads default from the lane leaf', async () => {
    const session = await makeSession();
    await appendMessage(session, 'a');
    const b = await appendMessage(session, 'b');
    const result = await session.view().branch({});
    expect(result.entries[0]?.id).toBe(b.id);
  });

  it('navigate moves the lane pointer within the tree', async () => {
    const session = await makeSession();
    const a = await appendMessage(session, 'a');
    const b = await appendMessage(session, 'b');
    await session.view().navigate(a.id);
    expect((await session.view().leaf())?.id).toBe(a.id);
    const c = await appendMessage(session, 'c');
    expect(c.parentId).toBe(a.id);
    expect((await session.branch({})).entries.map((e) => e.id)).toEqual([c.id, a.id]);
  });

  it('main lane cannot be deleted', async () => {
    const session = await makeSession();
    await expect(session.deleteLane('main')).rejects.toThrow();
  });
});

describe('WireSession facts', () => {
  it('keeps history and reads latest; label can be cleared', async () => {
    const session = await makeSession();
    await session.setFact({ name: 'title', value: 'one', label: 'L1' });
    await session.setFact({ name: 'title', value: 'two' });
    await session.setFact({ name: 'title', value: 'three', label: null });
    const facts = await session.facts();
    expect(facts.get('title')!.value).toBe('three');
    expect(facts.get('title')!.label).toBeNull();
    const log = await session.getLog();
    expect(log.filter((line) => line.kind === 'fact').length).toBe(3); // 历史保留
  });
});

describe('WireSession fork', () => {
  it('copies entries only; target idle, source untouched, fork point arbitrary', async () => {
    const source = await makeSession();
    const a = await appendMessage(source, 'a');
    const b = await appendMessage(source, 'b');
    await source.append({
      laneId: 'main',
      kind: 'custom',
      customType: 'goal.create',
      data: { objective: 'do it' },
    });
    await appendMessage(source, 'c');
    await source.storageRef.appendRecord({
      laneId: 'main',
      kind: 'operation_started',
      payload: { x: 1 },
    });
    await source.setFact({ name: 'title', value: 'src' });

    // fork at b（任意 message entry）
    const target = await WireSession.create(new InMemorySessionStorage('fork-target'));
    await source.forkTo(target, { fromEntryId: b.id });

    // 目标：只有 a、b（goal custom entry 被剔除），无 records、无 facts
    const targetBranch = await target.branch({ direction: 'oldestFirst' });
    expect(targetBranch.entries.map((e) => e.kind)).toEqual(['message', 'message']);
    expect((await target.storageRef.getRecords()).length).toBe(0);
    expect((await target.facts()).size).toBe(0);
    expect((await target.leaf())?.id).toBe(targetBranch.entries.at(-1)!.id);
    // 目标 idle：追加直接从 fork 点续链
    const targetLeafBefore = targetBranch.entries.at(-1)!;
    const next = await appendMessage(target, 'after-fork');
    expect(next.parentId).toBe(targetLeafBefore.id);

    // 源未动
    const sourceBranch = await source.branch({ direction: 'oldestFirst' });
    expect(sourceBranch.entries.length).toBe(4); // a、b、goal、c
    expect((await source.storageRef.getRecords()).length).toBe(1);
    expect((await source.facts()).get('title')!.value).toBe('src');
  });

  it('empty session forks to empty session', async () => {
    const source = await makeSession();
    const target = await WireSession.create(new InMemorySessionStorage('fork-empty'));
    await source.forkTo(target);
    expect((await target.branch({})).entries.length).toBe(0);
  });

  it('fork copies compaction boundaries', async () => {
    const source = await makeSession();
    await appendMessage(source, 'a');
    await source.append({ laneId: 'main', kind: 'compaction', summary: 'S' });
    const target = await WireSession.create(new InMemorySessionStorage('fork-compact'));
    await source.forkTo(target);
    const kinds = (await target.branch({ direction: 'oldestFirst' })).entries.map((e) => e.kind);
    expect(kinds).toEqual(['message', 'compaction']);
  });
});

describe('WireSession storage independence', () => {
  it('runs standalone with in-memory storage (AGENTS.md target wording)', async () => {
    const session = await makeSession();
    await appendMessage(session, 'hello');
    const result = await session.branch({});
    expect(result.entries.length).toBe(1);
    await session.close();
    let threw = false;
    try {
      await session.append({ laneId: 'main', kind: 'message', message: msg('x') });
    } catch (error) {
      threw = error instanceof Wire2StorageError;
    }
    expect(threw).toBe(true);
  });
});
