import { afterEach, describe, expect, it } from 'vitest';

import { ByfHarness, type ByfError } from '#/index';

import { makeTempDir, removeTempDirs } from './session-runtime-helpers';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  await removeTempDirs(tempDirs);
});

describe('Session.listBackgroundTasks / getBackgroundTaskOutput / getBackgroundTaskOutputPath', () => {
  it('lists an empty task set for a fresh session', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_bg_list_empty', workDir });
      const tasks = await session.listBackgroundTasks();
      expect(tasks).toEqual([]);

      const filtered = await session.listBackgroundTasks({ activeOnly: true });
      expect(filtered).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  describe('Session.shellExec', () => {
    it('executes shell commands and returns stdout/stderr/exit info', async () => {
      const homeDir = await makeTempDir(tempDirs, 'byf-sdk-shell-home-');
      const workDir = await makeTempDir(tempDirs, 'byf-sdk-shell-work-');
      const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

      try {
        const session = await harness.createSession({ id: 'ses_shell_exec', workDir });
        await expect(session.shellExec('printf "ok"')).resolves.toMatchObject({
          stdout: 'ok',
          stderr: '',
          exitCode: 0,
          timedOut: false,
        });
        await expect(session.shellExec('echo err >&2; exit 7')).resolves.toMatchObject({
          stdout: '',
          stderr: 'err\n',
          exitCode: 7,
          timedOut: false,
        });
      } finally {
        await harness.close();
      }
    });

    it('supports timeout and reports timedOut=true', async () => {
      const homeDir = await makeTempDir(tempDirs, 'byf-sdk-shell-home-');
      const workDir = await makeTempDir(tempDirs, 'byf-sdk-shell-work-');
      const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

      try {
        const session = await harness.createSession({ id: 'ses_shell_timeout', workDir });
        await expect(
          session.shellExec('node -e "setTimeout(() => {}, 2000)"', { timeout: 100 }),
        ).resolves.toMatchObject({
          timedOut: true,
        });
      } finally {
        await harness.close();
      }
    });

    it('rejects after session is closed', async () => {
      const homeDir = await makeTempDir(tempDirs, 'byf-sdk-shell-home-');
      const workDir = await makeTempDir(tempDirs, 'byf-sdk-shell-work-');
      const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

      try {
        const session = await harness.createSession({ id: 'ses_shell_closed', workDir });
        await session.close();
        await expect(session.shellExec('echo hi')).rejects.toMatchObject({
          name: 'ByfError',
          code: 'session.closed',
        } satisfies Partial<ByfError>);
      } finally {
        await harness.close();
      }
    });
  });

  it('returns empty output and undefined path for an unknown task id', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_bg_unknown', workDir });
      // Unknown task ids must not throw — UI fetches output speculatively.
      await expect(session.getBackgroundTaskOutput('bash-deadbeef')).resolves.toBe('');
      await expect(session.getBackgroundTaskOutputPath('bash-deadbeef')).resolves.toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it('rejects empty task ids with a stable error code', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_bg_empty_id', workDir });
      await expect(session.getBackgroundTaskOutput('')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'background.task_id_empty',
      } satisfies Partial<ByfError>);
      await expect(session.getBackgroundTaskOutputPath('   ')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'background.task_id_empty',
      } satisfies Partial<ByfError>);
      await expect(session.stopBackgroundTask('')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'background.task_id_empty',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('rejects after the session is closed', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_bg_closed', workDir });
      await session.close();

      await expect(session.listBackgroundTasks()).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.closed',
      } satisfies Partial<ByfError>);
      await expect(session.getBackgroundTaskOutput('bash-aaaaaaaa')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.closed',
      } satisfies Partial<ByfError>);
      await expect(session.getBackgroundTaskOutputPath('bash-aaaaaaaa')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.closed',
      } satisfies Partial<ByfError>);
      await expect(session.stopBackgroundTask('bash-aaaaaaaa')).rejects.toMatchObject({
        name: 'ByfError',
        code: 'session.closed',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('stopBackgroundTask is a no-op for an unknown task id', async () => {
    const homeDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-home-');
    const workDir = await makeTempDir(tempDirs, 'byf-sdk-bgtask-work-');
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      const session = await harness.createSession({ id: 'ses_bg_stop_unknown', workDir });
      // Unknown task ids must not throw — the core BPM silently no-ops.
      await expect(
        session.stopBackgroundTask('bash-deadbeef', { reason: 'test' }),
      ).resolves.toBeUndefined();
    } finally {
      await harness.close();
    }
  });
});
