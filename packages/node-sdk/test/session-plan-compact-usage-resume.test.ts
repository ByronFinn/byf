import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ByfHarness, type Event, type ByfError } from '#/index';

import { makeTempDir, removeTempDirs } from './session-runtime-helpers';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe('Session compact, usage, and resume APIs', () => {
  it('starts manual compaction with an optional instruction', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-compact-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-compact-work-');
    await writeTestConfig(homeDir);
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_compact_runtime', workDir });

      const started = waitForSessionEvent(session, (event) => event.type === 'compaction.started');
      await session.compact({ instruction: 'Keep important facts.' });

      await expect(started).resolves.toMatchObject({
        type: 'compaction.started',
        trigger: 'manual',
        instruction: 'Keep important facts.',
      });
    } finally {
      await harness.close();
    }
  });

  it('returns current session usage totals', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-usage-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-usage-work-');
    await writeTestConfig(homeDir);
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_usage_runtime', workDir });

      // With no recorded LLM usage the cache dimensions are absent, but the
      // estimated input breakdown is always computed on demand.
      await expect(session.getUsage()).resolves.toMatchObject({
        inputBreakdown: {
          tokens: expect.any(Object),
          percent: expect.any(Object),
        },
      });
    } finally {
      await harness.close();
    }
  });

  it('resumes a persisted session', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-resume-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-resume-work-');
    await writeTestConfig(homeDir);
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const created = await harness.createSession({
        id: 'ses_resume_runtime',
        workDir,
        model: 'test-model',
      });
      await created.close();
      expect(harness.getSession(created.id)).toBeUndefined();

      const resumed = await harness.resumeSession({ id: created.id });

      expect(resumed.id).toBe(created.id);
      expect(resumed.workDir).toBe(workDir);
      await expect(resumed.getStatus()).resolves.toMatchObject({
        model: 'test-model',
      });
      expect(harness.getSession(created.id)).toBe(resumed);
    } finally {
      await harness.close();
    }
  });

  it('forks a session and returns an active fork session', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-fork-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-fork-work-');
    await writeTestConfig(homeDir);
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const source = await harness.createSession({
        id: 'ses_fork_runtime_source',
        workDir,
        model: 'test-model',
        metadata: { source: true },
      });

      const fork = await harness.forkSession({
        id: source.id,
        forkId: 'ses_fork_runtime_child',
        title: 'Forked runtime',
        metadata: { child: true },
      });

      expect(fork.id).toBe('ses_fork_runtime_child');
      expect(fork.workDir).toBe(workDir);
      await expect(fork.getStatus()).resolves.toMatchObject({ model: 'test-model' });
      expect(harness.getSession(fork.id)).toBe(fork);
      // Fork starts with no recorded LLM usage; only the estimated breakdown
      // is present.
      await expect(fork.getUsage()).resolves.toMatchObject({
        inputBreakdown: {
          tokens: expect.any(Object),
          percent: expect.any(Object),
        },
      });

      const forkSummary = fork.summary;
      expect(forkSummary).toBeDefined();
      const forkState = JSON.parse(
        await readFile(join(forkSummary!.sessionDir, 'state.json'), 'utf-8'),
      ) as {
        title?: string;
        forkedFrom?: string;
        agents?: { main?: { homedir?: string } };
        custom?: Record<string, unknown>;
      };
      expect(forkState.title).toBe('Forked runtime');
      expect(forkState.forkedFrom).toBe(source.id);
      expect(forkState.agents?.main?.homedir).toBe(join(forkSummary!.sessionDir, 'agents', 'main'));
      expect(forkState.custom).toMatchObject({ source: true, child: true });
    } finally {
      await harness.close();
    }
  });

  it('rejects an empty resume id', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-resume-empty-home-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      await expect(harness.resumeSession({ id: '   ' })).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.id_empty',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });
});

function waitForSessionEvent(
  session: { onEvent(listener: (event: Event) => void): () => void },
  predicate: (event: Event) => boolean,
): Promise<Event> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for session event'));
    }, 1_000);
    const unsubscribe = session.onEvent((event) => {
      if (!predicate(event)) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(event);
    });
  });
}

async function writeTestConfig(homeDir: string): Promise<void> {
  await writeFile(
    join(homeDir, 'config.toml'),
    `
default_model = "test-model"

[providers.local]
type = "openai-completions"
base_url = "https://example.test/v1"
api_key = "sk-test"

[models.test-model]
provider = "local"
model = "test-model"
max_context_size = 200000
`,
    'utf-8',
  );
}

async function markdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir).catch((error) => {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return [];
    }
    throw error;
  });
  return entries.filter((entry) => entry.endsWith('.md')).toSorted();
}
