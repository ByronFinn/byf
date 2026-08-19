import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ByfError, ByfHarness, type Event } from '#/index';

import { SessionStore } from '../../agent-core/src/session/store';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-sdk-rename-'));
  tempDirs.push(dir);
  return dir;
}

async function writeSessionState(
  sessionDir: string,
  state: Record<string, unknown>,
): Promise<void> {
  await writeFile(join(sessionDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

async function readSessionState(sessionDir: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(sessionDir, 'state.json'), 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function findRenamedEvent(
  events: readonly Event[],
): Extract<Event, { readonly type: 'session.meta.updated' }> {
  const event = events.find((item) => item.type === 'session.meta.updated');
  if (event === undefined || event.type !== 'session.meta.updated') {
    throw new Error('session_meta_updated event not found');
  }
  return event;
}

describe('SessionStore.rename', () => {
  it('persists custom title state and preserves existing state fields', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const summary = await store.create({
      id: 'ses_store_rename',
      workDir,
    });
    await writeSessionState(summary.sessionDir, {
      session_id: 'ses_store_rename',
      title: 'Original Title',
      updated_at: 1_000,
      model: 'byf-for-coding',
      nested: { enabled: true },
    });

    await store.rename('ses_store_rename', 'New Store Title');

    const state = await readSessionState(summary.sessionDir);
    expect(state).toMatchObject({
      session_id: 'ses_store_rename',
      title: 'New Store Title',
      updated_at: 1_000,
      model: 'byf-for-coding',
      isCustomTitle: true,
      nested: { enabled: true },
    });

    const renamed = await store.get('ses_store_rename');
    expect(renamed.title).toBe('New Store Title');
    expect(renamed.metadata).toBeUndefined();
  });

  it('rejects indexed sessions with missing state without creating state.json', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);
    const summary = await store.create({ id: 'ses_no_state_rename', workDir });

    await expect(store.rename(summary.id, 'Missing State')).rejects.toMatchObject({
      name: 'ByfError',
      code: 'session.state_not_found',
    } satisfies Partial<ByfError>);
    expect(existsSync(join(summary.sessionDir, 'state.json'))).toBe(false);
  });

  it('rejects invalid state.json without overwriting it', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);
    const summary = await store.create({ id: 'ses_bad_state_rename', workDir });
    await writeFile(join(summary.sessionDir, 'state.json'), '[]', 'utf-8');

    await expect(store.rename(summary.id, 'Bad State')).rejects.toMatchObject({
      name: 'ByfError',
      code: 'session.state_invalid',
    } satisfies Partial<ByfError>);
    expect(await readFile(join(summary.sessionDir, 'state.json'), 'utf-8')).toBe('[]');
  });

  it('rejects missing session ids without creating state', async () => {
    const homeDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    await expect(store.rename('ses_missing', 'Missing Title')).rejects.toMatchObject({
      name: 'ByfError',
      code: 'session.not_found',
      details: { sessionId: 'ses_missing' },
    } satisfies Partial<ByfError>);
    expect(existsSync(join(homeDir, 'sessions', 'ses_missing', 'state.json'))).toBe(false);
  });
});

describe('ByfHarness.renameSession', () => {
  it('persists titles through the public Harness API and emits an active session event', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({
        id: 'ses_harness_rename',
        workDir,
      });
      const summary = (await harness.listSessions({ workDir })).find(
        (item) => item.id === session.id,
      )!;
      await writeSessionState(summary.sessionDir, {
        session_id: session.id,
        title: 'Base Title',
      });
      const events: Event[] = [];
      const unsubscribe = session.onEvent((event) => {
        events.push(event);
      });

      await harness.renameSession({ id: session.id, title: 'Harness Title' });
      unsubscribe();

      const sessions = await harness.listSessions({ workDir });
      expect(sessions.find((item) => item.id === session.id)?.title).toBe('Harness Title');

      const state = await readSessionState(summary.sessionDir);
      expect(state['title']).toBe('Harness Title');
      expect(state['isCustomTitle']).toBe(true);

      const event = findRenamedEvent(events);
      expect(event).toMatchObject({
        type: 'session.meta.updated',
        sessionId: session.id,
        agentId: 'main',
        title: 'Harness Title',
      });
    } finally {
      await harness.close();
    }
  });

  it('renames persisted sessions even when they are not active in memory', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({ id: 'ses_inactive_rename', workDir });
      const summary = (await harness.listSessions({ workDir })).find(
        (item) => item.id === session.id,
      )!;
      await writeSessionState(summary.sessionDir, {
        session_id: session.id,
        title: 'Inactive Base',
      });
      const events: Event[] = [];
      session.onEvent((event) => {
        events.push(event);
      });

      await harness.closeSession(session.id);
      events.length = 0;

      await harness.renameSession({ id: session.id, title: 'Inactive Title' });

      const sessions = await harness.listSessions({ workDir });
      expect(sessions.find((item) => item.id === session.id)?.title).toBe('Inactive Title');
      expect(events.some((event) => event.type === 'session.meta.updated')).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('rejects missing session ids', async () => {
    const homeDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const missingRename = harness.renameSession({
        id: 'ses_missing',
        title: 'Missing Title',
      });
      await expect(missingRename).rejects.toBeInstanceOf(ByfError);
      await expect(missingRename).rejects.toMatchObject({
        code: 'session.not_found',
        details: { sessionId: 'ses_missing' },
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });
});

describe('session metadata pinned/archived (PRD-0034)', () => {
  it('SessionStore.updateMetadata persists pinned and projects it onto the summary', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const summary = await store.create({ id: 'ses_meta_pin', workDir });
    await writeSessionState(summary.sessionDir, {
      session_id: 'ses_meta_pin',
      title: 'Original Title',
      updated_at: 1_000,
      nested: { enabled: true },
    });

    await store.updateMetadata('ses_meta_pin', { pinned: true });

    const state = await readSessionState(summary.sessionDir);
    expect(state).toMatchObject({
      title: 'Original Title',
      pinned: true,
      nested: { enabled: true },
    });

    const updated = await store.get('ses_meta_pin');
    expect(updated.pinned).toBe(true);
    expect(updated.archived).toBeUndefined();
  });

  it('SessionStore.updateMetadata archives and unarchives', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const summary = await store.create({ id: 'ses_meta_archive', workDir });
    await writeSessionState(summary.sessionDir, { session_id: 'ses_meta_archive', title: 'A' });

    await store.updateMetadata('ses_meta_archive', { archived: true });
    expect((await store.get('ses_meta_archive')).archived).toBe(true);

    await store.updateMetadata('ses_meta_archive', { archived: false });
    expect((await store.get('ses_meta_archive')).archived).toBe(false);
  });

  it('ByfHarness.updateSessionMetadata pins persisted sessions without resuming them', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);
    const summary = await store.create({ id: 'ses_harness_pin', workDir });
    await writeSessionState(summary.sessionDir, {
      session_id: 'ses_harness_pin',
      title: 'Inactive Base',
    });

    const harness = new ByfHarness({ identity: TEST_IDENTITY, homeDir });
    try {
      await harness.updateSessionMetadata({ id: 'ses_harness_pin', metadata: { pinned: true } });

      const sessions = await harness.listSessions({ workDir });
      expect(sessions.find((item) => item.id === 'ses_harness_pin')?.pinned).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('ByfHarness.updateSessionMetadata emits session.meta.updated for active sessions', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ identity: TEST_IDENTITY, homeDir });

    try {
      const session = await harness.createSession({ id: 'ses_harness_meta_live', workDir });
      const summary = (await harness.listSessions({ workDir })).find(
        (item) => item.id === session.id,
      )!;
      await writeSessionState(summary.sessionDir, {
        session_id: session.id,
        title: 'Base Title',
      });
      const events: Event[] = [];
      const unsubscribe = session.onEvent((event) => {
        events.push(event);
      });

      await harness.updateSessionMetadata({
        id: session.id,
        metadata: { pinned: true, archived: false },
      });
      unsubscribe();

      const metaEvent = events.find((item) => item.type === 'session.meta.updated');
      expect(metaEvent).toMatchObject({
        type: 'session.meta.updated',
        sessionId: session.id,
        agentId: 'main',
      });

      const state = await readSessionState(summary.sessionDir);
      expect(state['pinned']).toBe(true);

      const sessions = await harness.listSessions({ workDir });
      expect(sessions.find((item) => item.id === session.id)?.pinned).toBe(true);
    } finally {
      await harness.close();
    }
  });

  it('fork does not inherit pinned or archived flags', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const summary = await store.create({ id: 'ses_fork_flags', workDir });
    await writeSessionState(summary.sessionDir, {
      session_id: 'ses_fork_flags',
      title: 'Source',
      pinned: true,
      archived: true,
    });

    const forked = await store.fork({
      sourceId: 'ses_fork_flags',
      targetId: 'ses_fork_flags_copy',
    });
    expect(forked.pinned).toBeUndefined();
    expect(forked.archived).toBeUndefined();
  });
});
