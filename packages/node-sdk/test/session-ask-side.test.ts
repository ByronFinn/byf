import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import type * as KosongModule from '@byfriends/kosong';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ByfError, Event } from '#/index';

const fakeProviderState = vi.hoisted(() => ({
  responseText: 'config/runtime.toml',
}));

vi.mock('@byfriends/kosong', async (importOriginal) => {
  const actual = await importOriginal<typeof KosongModule>();
  return {
    ...actual,
    createProvider: () => ({
      name: 'fake',
      modelName: 'fake-model',
      thinkingEffort: null,
      async generate() {
        return {
          id: 'fake-response',
          usage: {
            inputOther: 0,
            output: 1,
            inputCacheRead: 0,
            inputCacheCreation: 0,
          },
          finishReason: 'completed',
          rawFinishReason: 'stop',
          async *[Symbol.asyncIterator]() {
            yield { type: 'text', text: fakeProviderState.responseText };
          },
        };
      },
      withThinking() {
        return this;
      },
    }),
  };
});

const { ByfHarness } = await import('#/index');

const tempDirs: string[] = [];

beforeEach(() => {
  fakeProviderState.responseText = 'config/runtime.toml';
});

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await removeTempDir(dir);
  }
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-sdk-askside-'));
  tempDirs.push(dir);
  return dir;
}

async function removeTempDir(dir: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOTEMPTY' && code !== 'EBUSY' && code !== 'EPERM') {
        throw error;
      }
      await delay(10);
    }
  }
  await rm(dir, { recursive: true, force: true });
}

async function configureFakeProvider(harness: InstanceType<typeof ByfHarness>): Promise<void> {
  await harness.setConfig({
    providers: {
      local: {
        type: 'openai-completions',
        apiKey: 'sk-test',
      },
    },
    models: {
      'fake-model': {
        provider: 'local',
        model: 'fake-model',
        maxContextSize: 262144,
      },
    },
    defaultModel: 'fake-model',
  });
}

function waitForEvent(
  session: {
    onEvent(listener: (event: Event) => void): () => void;
  },
  predicate: (event: Event) => boolean,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for session event'));
    }, 1_000);
    const unsubscribe = session.onEvent((event) => {
      if (predicate(event)) {
        clearTimeout(timeout);
        unsubscribe();
        resolve(event);
      }
    });
  });
}

describe('Session.askSide', () => {
  it('emits a btw.started → btw.delta → btw.completed sequence', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ id: 'ses_ask_side_events', workDir });
      const events: Event[] = [];
      session.onEvent((event) => {
        events.push(event);
      });

      await session.askSide('what is the config file name?');

      await waitForEvent(session, (event) => event.type === 'btw.completed');

      const started = events.find((e) => e.type === 'btw.started');
      const deltas = events.filter((e) => e.type === 'btw.delta');
      const completed = events.find((e) => e.type === 'btw.completed');

      expect(started).toMatchObject({
        type: 'btw.started',
      });
      expect(started).not.toHaveProperty('query');
      expect(deltas.map((e) => (e as { delta: string }).delta).join('')).toBe(
        'config/runtime.toml',
      );
      expect(completed).toMatchObject({ type: 'btw.completed', text: 'config/runtime.toml' });
    } finally {
      await harness.close();
    }
  });

  it('uses the same queryId across the btw lifecycle', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ id: 'ses_ask_side_queryid', workDir });
      const events: Event[] = [];
      session.onEvent((event) => {
        events.push(event);
      });

      await session.askSide('quick one');

      const completed = await waitForEvent(session, (event) => event.type === 'btw.completed');
      const queryId = (completed as { queryId: string }).queryId;

      const btwEvents = events.filter((e) => e.type.startsWith('btw.'));
      for (const event of btwEvents) {
        expect((event as { queryId: string }).queryId).toBe(queryId);
      }
    } finally {
      await harness.close();
    }
  });

  it('does not emit turn.started / assistant.delta for a side query', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ id: 'ses_ask_side_no_leak', workDir });
      const events: Event[] = [];
      session.onEvent((event) => {
        events.push(event);
      });

      await session.askSide('quick one');

      await waitForEvent(session, (event) => event.type === 'btw.completed');

      const turnLeaks = events.filter(
        (e) =>
          e.type === 'turn.started' ||
          e.type === 'turn.ended' ||
          e.type === 'assistant.delta' ||
          e.type === 'tool.call.started',
      );
      expect(turnLeaks).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('rejects empty side query input', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir });

    try {
      const session = await harness.createSession({ id: 'ses_ask_side_empty', workDir });

      await expect(session.askSide('   ')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'request.invalid',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('rejects after the session is closed', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir });

    try {
      const session = await harness.createSession({ id: 'ses_ask_side_closed', workDir });
      await session.close();

      await expect(session.askSide('hello')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.closed',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('returns the queryId and accepts a caller-supplied queryId', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir });

    try {
      await configureFakeProvider(harness);
      const session = await harness.createSession({ id: 'ses_ask_side_queryid_opt', workDir });

      const { queryId: generated } = await session.askSide('quick one');
      expect(generated.startsWith('sdk-btw-')).toBe(true);

      const { queryId: supplied } = await session.askSide('another', { queryId: 'my-qid' });
      expect(supplied).toBe('my-qid');

      await waitForEvent(session, (event) => event.type === 'btw.completed');
    } finally {
      await harness.close();
    }
  });

  it('rejects cancelSideQuery after the session is closed', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir });

    try {
      const session = await harness.createSession({ id: 'ses_cancel_side_closed', workDir });
      await session.close();

      await expect(session.cancelSideQuery('any')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.closed',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });
});
