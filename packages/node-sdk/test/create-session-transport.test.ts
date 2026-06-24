import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ByfHarness } from '#/index';
import type { ByfError } from '#/index';

import { waitForAgentWireEvent } from './session-runtime-helpers';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-sdk-create-'));
  tempDirs.push(dir);
  return dir;
}

async function writeTestModelConfig(homeDir: string, modelName = 'byf-test-model'): Promise<void> {
  await writeFile(
    join(homeDir, 'config.toml'),
    `
[providers.local]
type = "openai-completions"
base_url = "https://example.test/v1"
api_key = "sk-test"

[models."${modelName}"]
provider = "local"
model = "${modelName}"
max_context_size = 1000
`,
    'utf-8',
  );
}

describe('ByfHarness.createSession transport link', () => {
  it('creates metadata and keeps the session active in the harness', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    await writeTestModelConfig(homeDir);
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({
        id: 'ses_transport_link',
        workDir,
        model: 'byf-test-model',
      });

      expect(session.id).toBe('ses_transport_link');
      expect(session.workDir).toBe(workDir);
      await expect(session.getStatus()).resolves.toMatchObject({ model: 'byf-test-model' });
      expect(harness.sessions.get(session.id)).toBe(session);
      const configEvent = await waitForAgentWireEvent(
        homeDir,
        session.id,
        'config.update',
        (event) => event['modelAlias'] === 'byf-test-model',
      );
      expect(configEvent).toMatchObject({
        type: 'config.update',
        modelAlias: 'byf-test-model',
      });
      expect(configEvent).not.toHaveProperty('provider');

      const summaries = await harness.listSessions({ workDir });
      const summary = summaries.find((item) => item.id === session.id);
      expect(summary?.sessionDir).not.toBe(join(homeDir, 'sessions', session.id));
      expect(summary?.sessionDir).toContain(join(homeDir, 'sessions'));
      expect(existsSync(join(summary!.sessionDir, 'state.json'))).toBe(true);
      expect(await readFile(join(homeDir, 'session_index.jsonl'), 'utf-8')).toContain(session.id);
    } finally {
      await harness.close();
    }
  });

  it('accepts configured model aliases while creating the core session', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    await writeFile(
      join(homeDir, 'config.toml'),
      `
default_model = "alias-model"

[providers.local]
type = "openai-completions"
base_url = "https://example.test/v1"
api_key = "sk-test"

[models.alias-model]
provider = "local"
model = "real-model"
max_context_size = 1000

[thinking]
effort = "medium"
`,
      'utf-8',
    );
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({ id: 'ses_alias_model', workDir });
      expect(session.id).toBe('ses_alias_model');
      await expect(session.getStatus()).resolves.toMatchObject({ model: 'alias-model' });
      expect(harness.sessions.get(session.id)).toBe(session);
      const configEvent = await waitForAgentWireEvent(
        homeDir,
        session.id,
        'config.update',
        (event) => event['modelAlias'] === 'alias-model',
      );
      expect(configEvent).toMatchObject({
        type: 'config.update',
        modelAlias: 'alias-model',
      });
      expect(configEvent).not.toHaveProperty('provider');
    } finally {
      await harness.close();
    }
  });

  it('does not require provider config or API keys before prompt is implemented', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({ id: 'ses_empty_config', workDir });
      expect(session.id).toBe('ses_empty_config');
      expect((await session.getStatus()).model).toBeUndefined();
      expect(harness.sessions.get(session.id)).toBe(session);
    } finally {
      await harness.close();
    }
  });

  it('runs harness.shellExec in first active session workDir by default', async () => {
    const homeDir = await makeTempDir();
    const firstWorkDir = await makeTempDir();
    const secondWorkDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      await harness.createSession({ id: 'ses_shell_default_cwd_1', workDir: firstWorkDir });
      await harness.createSession({ id: 'ses_shell_default_cwd_2', workDir: secondWorkDir });

      await expect(harness.shellExec('pwd')).resolves.toMatchObject({
        stdout: `${firstWorkDir}\n`,
        exitCode: 0,
        timedOut: false,
      });
      await expect(harness.shellExec('pwd', { cwd: secondWorkDir })).resolves.toMatchObject({
        stdout: `${secondWorkDir}\n`,
        exitCode: 0,
        timedOut: false,
      });
    } finally {
      await harness.close();
    }
  });

  it('requires a non-empty workDir on createSession', async () => {
    const homeDir = await makeTempDir();
    const harness = new ByfHarness({ homeDir, identity: TEST_IDENTITY });

    try {
      await expect(
        harness.createSession({ id: 'ses_missing_workdir' } as never),
      ).rejects.toMatchObject({
        name: 'ByfError',
        code: 'request.work_dir_required',
      } satisfies Partial<ByfError>);
      await expect(
        harness.createSession({ id: 'ses_blank_workdir', workDir: '   ' }),
      ).rejects.toMatchObject({
        name: 'ByfError',
        code: 'request.work_dir_required',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('does not persist a session record when MCP config validation fails', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    // Project-local mcp.json is intentionally ignored, so plant the malformed
    // file under the user home dir where the loader actually reads from.
    await writeFile(join(homeDir, 'mcp.json'), '{not json}', 'utf-8');
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      await expect(
        harness.createSession({ id: 'ses_bad_mcp_config', workDir }),
      ).rejects.toMatchObject({
        name: 'ByfError',
        code: 'config.invalid',
      });
      expect(await harness.listSessions({ workDir })).toEqual([]);
      expect(existsSync(join(homeDir, 'session_index.jsonl'))).toBe(false);
    } finally {
      await harness.close();
    }
  });

  it('closes active runtime handles through closeSession, session.close, and close', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    await writeTestModelConfig(homeDir);
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    const first = await harness.createSession({
      id: 'ses_close_one',
      workDir,
      model: 'byf-test-model',
    });
    const second = await harness.createSession({
      id: 'ses_close_two',
      workDir,
      model: 'byf-test-model',
    });
    expect(Array.from(harness.sessions.keys())).toEqual([first.id, second.id]);

    await harness.closeSession(first.id);
    expect(harness.getSession(first.id)).toBeUndefined();
    expect(Array.from(harness.sessions.keys())).toEqual([second.id]);

    await second.close();
    expect(harness.getSession(second.id)).toBeUndefined();
    expect(Array.from(harness.sessions.keys())).toEqual([]);

    await harness.close();
    expect(harness.sessions.size).toBe(0);
  });

  it('rejects explicitly empty model names', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      await expect(
        harness.createSession({ id: 'ses_empty_model', workDir, model: '   ' }),
      ).rejects.toMatchObject({
        name: 'ByfError',
        code: 'model.config_invalid',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('applies initial thinking and permission runtime options', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({
        id: 'ses_initial_runtime_options',
        workDir,
        thinking: 'low',
        permission: 'auto',
      });

      await expect(
        waitForAgentWireEvent(
          homeDir,
          session.id,
          'config.update',
          (event) => event['thinkingLevel'] === 'low',
        ),
      ).resolves.toMatchObject({
        type: 'config.update',
        thinkingLevel: 'low',
      });
      await expect(
        waitForAgentWireEvent(
          homeDir,
          session.id,
          'permission.set_mode',
          (event) => event['mode'] === 'auto',
        ),
      ).resolves.toMatchObject({
        type: 'permission.set_mode',
        mode: 'auto',
      });
    } finally {
      await harness.close();
    }
  });

  it('applies configured default permission mode to new sessions', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    await writeFile(join(homeDir, 'config.toml'), 'default_permission_mode = "auto"\n', 'utf-8');
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({
        id: 'ses_default_permission_mode',
        workDir,
      });

      await expect(session.getStatus()).resolves.toMatchObject({ permission: 'auto' });
      await expect(
        waitForAgentWireEvent(
          homeDir,
          session.id,
          'permission.set_mode',
          (event) => event['mode'] === 'auto',
        ),
      ).resolves.toMatchObject({
        type: 'permission.set_mode',
        mode: 'auto',
      });

      const explicit = await harness.createSession({
        id: 'ses_default_permission_explicit_override',
        workDir,
        permission: 'manual',
      });
      await expect(explicit.getStatus()).resolves.toMatchObject({ permission: 'manual' });
    } finally {
      await harness.close();
    }
  });
});
