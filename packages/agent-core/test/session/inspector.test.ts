import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildAgentTree,
  isSafeAgentId,
  listInspectableSessions,
  projectContext,
  readAgentWire,
  readSessionDetail,
} from '#/session/inspector';
import { sessionIndexPath } from '#/session/store/session-index';
import { SessionStore } from '#/session/store/session-store';

let home: string;
let sessionsDir: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'byf-inspector-'));
  sessionsDir = join(home, 'sessions');
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

const METADATA = { type: 'metadata', protocol_version: '1.1', created_at: 1_700_000_000_000 };

async function seedSession(id: string, workDir: string, state: unknown, wireLines: unknown[]) {
  const store = new SessionStore(home);
  await store.create({ id, workDir });
  const dir = store.sessionDirFor({ id, workDir });
  await mkdir(join(dir, 'agents', 'main'), { recursive: true });
  await writeFile(join(dir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
  const wire = [METADATA, ...wireLines].map((r) => JSON.stringify(r)).join('\n');
  await writeFile(join(dir, 'agents', 'main', 'wire.jsonl'), `${wire}\n`, 'utf-8');
  return dir;
}

describe('listInspectableSessions', () => {
  test('scans buckets and reports health / wire counts', async () => {
    await seedSession(
      'session_1',
      '/tmp/wp1',
      {
        title: 'hello',
        updatedAt: '2026-08-17T00:00:00.000Z',
        agents: { main: { homedir: 'x', type: 'main', parentAgentId: null } },
      },
      [
        {
          type: 'context.append_message',
          time: 1,
          message: { role: 'user', content: [{ type: 'text', text: 'hi' }], toolCalls: [] },
        },
      ],
    );
    const list = await listInspectableSessions(home);
    const s = list.find((x) => x.sessionId === 'session_1');
    expect(s).toBeDefined();
    expect(s!.health).toBe('ok');
    expect(s!.mainWireRecordCount).toBe(2); // metadata + 1 record
    expect(s!.agentCount).toBe(1);
  });

  test('broken state is reported rather than crashing the list', async () => {
    await seedSession('session_2', '/tmp/wp2', null, []);
    const list = await listInspectableSessions(home);
    expect(list.find((x) => x.sessionId === 'session_2')?.health).toBe('broken_state');
  });
});

describe('readSessionDetail / wire / context / tree', () => {
  test('readSessionDetail returns state + agent inventory', async () => {
    await seedSession(
      'session_3',
      '/tmp/wp3',
      { title: 't', agents: { main: { homedir: 'h', type: 'main', parentAgentId: null } } },
      [],
    );
    const detail = await readSessionDetail(home, 'session_3');
    expect(detail).not.toBeNull();
    expect(detail!.agents[0]!.agentId).toBe('main');
  });

  test('readAgentWire migrates records and reports warnings on unknown protocol', async () => {
    const dir = await seedSession(
      'session_4',
      '/tmp/wp4',
      { agents: { main: { homedir: 'h', type: 'main', parentAgentId: null } } },
      [],
    );
    await writeFile(
      join(dir, 'agents', 'main', 'wire.jsonl'),
      `${JSON.stringify({ type: 'metadata', protocol_version: '99.0', created_at: 1 })}\n${JSON.stringify({ type: 'turn.prompt', time: 2, input: [{ type: 'text', text: 'x' }] })}\n`,
      'utf-8',
    );
    const result = await readAgentWire(join(dir, 'agents', 'main', 'wire.jsonl'));
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.records.length).toBe(1);
  });

  test('projectContext folds a minimal timeline and aggregates usage', () => {
    const entries = [
      {
        lineNo: 1,
        data: { type: 'turn.prompt', time: 1, input: [{ type: 'text', text: 'hi' }] } as never,
        raw: {},
      },
    ];
    const projection = projectContext([]);
    expect(projection.permission.mode).toBeNull();
  });

  test('buildAgentTree nests children under parents', () => {
    const tree = buildAgentTree([
      {
        agentId: 'main',
        type: 'main',
        parentAgentId: null,
        homedir: 'a',
        wireExists: true,
        wireRecordCount: 0,
        wireProtocolVersion: null,
      },
      {
        agentId: 'agent-1',
        type: 'sub',
        parentAgentId: 'bogus-tool-call',
        homedir: 'b',
        wireExists: true,
        wireRecordCount: 0,
        wireProtocolVersion: null,
      },
    ]);
    expect(tree.length).toBe(2);
    expect(tree[0]!.agentId).toBe('main');
  });

  test('isSafeAgentId rejects path escapes', () => {
    expect(isSafeAgentId('..')).toBe(false);
    expect(isSafeAgentId('../x')).toBe(false);
    expect(isSafeAgentId('main')).toBe(true);
  });
});

describe('SessionStore.delete', () => {
  test('removes the directory and rewrites session_index.jsonl atomically', async () => {
    await seedSession('session_keep', '/tmp/wp', { title: 'keep', agents: {} }, []);
    const store = new SessionStore(home);
    await store.delete('session_keep');
    const index = await readFile(sessionIndexPath(home), 'utf-8');
    expect(index).not.toContain('session_keep');
    await expect(listInspectableSessions(home)).resolves.toHaveLength(0);
  });

  test('keeps other sessions in the index', async () => {
    await seedSession('session_a', '/tmp/wp', { title: 'a', agents: {} }, []);
    await seedSession('session_b', '/tmp/wp', { title: 'b', agents: {} }, []);
    const store = new SessionStore(home);
    await store.delete('session_a');
    const index = await readFile(sessionIndexPath(home), 'utf-8');
    expect(index).toContain('session_b');
    expect(index).not.toContain('session_a');
  });

  test('deleting a missing session throws SESSION_NOT_FOUND', async () => {
    const store = new SessionStore(home);
    try {
      await store.delete('session_nope');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { code: string }).code).toBe('session.not_found');
    }
  });
});
