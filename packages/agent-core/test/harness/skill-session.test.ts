import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRPC,
  type ApprovalResponse,
  type CoreAPI,
  type CoreRPC,
  type Event,
  type SDKAPI,
} from '../../src';
// `ByfCore` is an engine-internal concrete class (not part of the public
// package surface — see src/rpc/index.ts). Engine tests import it directly
// from its module so the public API stays narrowed to the CoreAPI contract.
import { ByfCore } from '../../src/rpc/core-impl';

describe('HarnessAPI session skills', () => {
  let tmp: string;
  let homeDir: string;
  let workDir: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'byf-core-skills-'));
    homeDir = join(tmp, 'home');
    workDir = join(tmp, 'work');
    await mkdir(workDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('lists session skills without exposing content', async () => {
    await writeSkill('phase-one-review', [
      '---',
      'name: phase-one-review',
      'description: Review code',
      'disable_model_invocation: true',
      '---',
      '',
      'Review the requested file.',
    ]);
    const { rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_skill_list', workDir });

    const skills = await rpc.listSkills({ sessionId: created.id });
    const listed = skills.find((skill) => skill.name === 'phase-one-review');

    expect(listed).toMatchObject({
      name: 'phase-one-review',
      description: 'Review code',
      source: 'project',
      disableModelInvocation: true,
    });
    expect(listed?.path.endsWith('/.byf/skills/phase-one-review/SKILL.md')).toBe(true);
    expect(JSON.stringify(skills)).not.toContain('Review the requested file.');
  });

  it('uses the first body line when a flat skill description is missing', async () => {
    await writeFlatSkill('body-described', [
      '',
      '  First useful line that describes it.  ',
      '',
      'Full instructions stay private.',
    ]);
    const { rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_skill_description_fallback', workDir });

    const skills = await rpc.listSkills({ sessionId: created.id });
    const listed = skills.find((skill) => skill.name === 'body-described');

    expect(listed).toMatchObject({
      name: 'body-described',
      description: 'First useful line that describes it.',
      source: 'project',
    });
    expect(JSON.stringify(skills)).not.toContain('Full instructions stay private.');
  });

  it('lists bundled built-in skills by default', async () => {
    const { rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_builtin_skill_list', workDir });

    const skills = await rpc.listSkills({ sessionId: created.id });
    const listed = skills.find((skill) => skill.name === 'mcp-config');

    expect(listed).toMatchObject({
      name: 'mcp-config',
      description: 'Configure MCP servers and handle MCP OAuth login.',
      source: 'builtin',
    });
    expect(listed?.path).toBe('builtin://mcp-config');

    const updateConfig = skills.find((skill) => skill.name === 'update-config');
    expect(updateConfig).toMatchObject({
      name: 'update-config',
      source: 'builtin',
      disableModelInvocation: true,
    });
    expect(updateConfig?.path).toBe('builtin://update-config');

    expect(JSON.stringify(skills)).not.toContain('Your tool list contains one synthetic tool');
  });

  it('hides the update-config skill from the model and activates it via slash', async () => {
    const { core, events, rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_skill_update_config', workDir });

    const session = core.sessions.get(created.id);
    expect(session).toBeDefined();
    // disableModelInvocation: the model cannot invoke it via the Skill tool,
    // and it is absent from the model-visible skill listing.
    const invocable = session!.skills.listInvocableSkills();
    expect(invocable.some((skill) => skill.name === 'update-config')).toBe(false);
    expect(session!.skills.getModelSkillListing()).not.toContain('update-config');

    await rpc.activateSkill({
      sessionId: created.id,
      agentId: 'main',
      name: 'update-config',
    });
    const activated = await waitForEvent(events, (event) => event.type === 'skill.activated');
    expect(activated).toMatchObject({
      type: 'skill.activated',
      skillName: 'update-config',
      trigger: 'user-slash',
      skillSource: 'builtin',
    });

    await session?.flushMetadata();
    const records = await readMainWire(created.sessionDir);
    const prompt = records.find((record) => record['type'] === 'turn.prompt');
    expect(prompt).toMatchObject({
      type: 'turn.prompt',
      origin: {
        kind: 'skill_activation',
        skillName: 'update-config',
        skillSource: 'builtin',
      },
    });
    // The skill body must carry the secret-handling instruction (config.toml
    // holds plaintext api_key values) and point at the schema source of truth.
    const promptInput = (prompt as { input?: ReadonlyArray<{ text?: string }> } | undefined)?.input;
    expect(promptInput?.[0]?.text).toContain('Never echo secrets');
    expect(promptInput?.[0]?.text).toContain('schema.ts');
  });

  it('resolves user skills from the OS home directory, not from the byf home', async () => {
    const processHome = join(tmp, 'process-home');
    vi.stubEnv('HOME', processHome);
    await writeUserSkill(processHome, 'real-home-only', 'Real home skill');
    await writeUserSkill(homeDir, 'sandbox-only', 'Sandbox skill');
    const { rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_skill_sandbox_home', workDir });

    const names = new Set(
      (await rpc.listSkills({ sessionId: created.id })).map((skill) => skill.name),
    );

    expect(names.has('real-home-only')).toBe(true);
    expect(names.has('sandbox-only')).toBe(false);
  });

  it('resolves user skills from the OS home directory even when BYF_HOME is set', async () => {
    const processHome = join(tmp, 'env-process-home');
    vi.stubEnv('HOME', processHome);
    vi.stubEnv('BYF_HOME', homeDir);
    await writeUserSkill(processHome, 'env-real-home-only', 'Env real home skill');
    await writeUserSkill(homeDir, 'env-sandbox-only', 'Env sandbox skill');
    const { rpc } = await createTestRpc({});
    const created = await rpc.createSession({ id: 'ses_skill_env_home', workDir });

    const names = new Set(
      (await rpc.listSkills({ sessionId: created.id })).map((skill) => skill.name),
    );

    expect(names.has('env-real-home-only')).toBe(true);
    expect(names.has('env-sandbox-only')).toBe(false);
  });

  it('activates an inline skill through core and records display origin metadata', async () => {
    await writeSkill('phase-one-review', [
      '---',
      'name: phase-one-review',
      'description: Review code',
      'disable_model_invocation: true',
      '---',
      '',
      'Review the requested file.',
    ]);
    const { core, events, rpc } = await createTestRpc({
      homeDir,
    });
    const created = await rpc.createSession({ id: 'ses_skill_activate', workDir });

    await rpc.activateSkill({
      sessionId: created.id,
      agentId: 'main',
      name: 'phase-one-review',
      args: 'src/app.ts',
    });
    await waitForEvent(events, (event) => event.type === 'skill.activated');
    await core.sessions.get(created.id)?.flushMetadata();

    const skillEvent = events.find((event) => event.type === 'skill.activated');
    expect(skillEvent).toMatchObject({
      type: 'skill.activated',
      agentId: 'main',
      sessionId: created.id,
      skillName: 'phase-one-review',
      skillArgs: 'src/app.ts',
      trigger: 'user-slash',
      skillSource: 'project',
    });
    expect(JSON.stringify(skillEvent)).not.toContain('Review the requested file.');

    const skillIndex = events.findIndex((event) => event.type === 'skill.activated');
    const turnIndex = events.findIndex((event) => event.type === 'turn.started');
    expect(skillIndex).toBeGreaterThanOrEqual(0);
    expect(turnIndex).toBeGreaterThan(skillIndex);

    const records = await readMainWire(created.sessionDir);
    const prompt = records.find((record) => record['type'] === 'turn.prompt');
    const userMessage = records.find((record) => record['type'] === 'context.append_message');
    const skillDir = await realpath(join(workDir, '.byf', 'skills', 'phase-one-review'));
    const expectedPrompt = [
      `Base directory for this skill: ${skillDir}`,
      'Relative paths in this skill are relative to this base directory.',
      '',
      'Review the requested file.',
      '',
      'ARGUMENTS: src/app.ts',
    ].join('\n');
    expect(prompt).toMatchObject({
      type: 'turn.prompt',
      input: [{ type: 'text', text: expectedPrompt }],
      origin: {
        kind: 'skill_activation',
        skillName: 'phase-one-review',
        skillArgs: 'src/app.ts',
        trigger: 'user-slash',
        skillSource: 'project',
      },
    });
    expect(userMessage).toMatchObject({
      type: 'context.append_message',
      message: {
        role: 'user',
        content: [{ type: 'text', text: expectedPrompt }],
        origin: {
          kind: 'skill_activation',
          skillName: 'phase-one-review',
          skillArgs: 'src/app.ts',
          trigger: 'user-slash',
          skillSource: 'project',
        },
      },
    });
    expect(
      (prompt as { origin?: { activationId?: string } } | undefined)?.origin?.activationId,
    ).toBe((skillEvent as { activationId?: string } | undefined)?.activationId);
    expect((skillEvent as { activationId?: string } | undefined)?.activationId).toBe(
      (userMessage as { message?: { origin?: { activationId?: string } } } | undefined)?.message
        ?.origin?.activationId,
    );

    const context = await rpc.getContext({ sessionId: created.id, agentId: 'main' });
    expect(context.history.at(0)).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: expectedPrompt }],
      toolCalls: [],
      origin: {
        kind: 'skill_activation',
        skillName: 'phase-one-review',
        skillArgs: 'src/app.ts',
        trigger: 'user-slash',
        skillSource: 'project',
      },
    });
  });

  it('appends <byf-skill-loaded> system reminder on user slash activation', async () => {
    await writeSkill('phase-one-review', [
      '---',
      'name: phase-one-review',
      'description: Review code',
      '---',
      '',
      'Review the requested file.',
    ]);
    const { core, rpc } = await createTestRpc({ homeDir });
    const created = await rpc.createSession({ id: 'ses_skill_loaded_reminder', workDir });

    await rpc.activateSkill({
      sessionId: created.id,
      agentId: 'main',
      name: 'phase-one-review',
      args: 'src/app.ts',
    });
    await core.sessions.get(created.id)?.flushMetadata();

    const context = await rpc.getContext({ sessionId: created.id, agentId: 'main' });
    // The user message with skill_activation origin
    const userMsg = context.history.find((msg) => msg.origin?.kind === 'skill_activation');
    expect(userMsg).toBeDefined();
    // A system-reminder message containing <byf-skill-loaded>
    const reminder = context.history.find((msg) =>
      msg.content.some(
        (part) =>
          part.type === 'text' && part.text.includes('<byf-skill-loaded name="phase-one-review">'),
      ),
    );
    expect(reminder).toBeDefined();
    const reminderText =
      reminder?.content[0] && reminder.content[0].type === 'text' ? reminder.content[0].text : '';
    expect(reminderText).toContain('<byf-skill-loaded name="phase-one-review">');
    expect(reminderText).toContain('</byf-skill-loaded>');
  });

  it('expands skill body placeholders on user slash activation', async () => {
    await writeSkill('templated-review', [
      '---',
      'name: templated-review',
      'description: Review with template variables',
      'arguments:',
      '  - target',
      '  - mode',
      '---',
      '',
      'Target: $target',
      'Mode: $mode',
      'Raw: $ARGUMENTS',
      'Dir: ${BYF_SKILL_DIR}',
      'Session: ${BYF_SESSION_ID}',
    ]);
    const { core, rpc } = await createTestRpc({ homeDir });
    const created = await rpc.createSession({ id: 'ses_skill_template', workDir });

    await rpc.activateSkill({
      sessionId: created.id,
      agentId: 'main',
      name: 'templated-review',
      args: '"src/app.ts" careful',
    });
    await core.sessions.get(created.id)?.flushMetadata();

    const records = await readMainWire(created.sessionDir);
    const prompt = records.find((record) => record['type'] === 'turn.prompt');
    const skillDir = await realpath(join(workDir, '.byf', 'skills', 'templated-review'));
    const expectedPrompt = [
      `Base directory for this skill: ${skillDir}`,
      'Relative paths in this skill are relative to this base directory.',
      '',
      'Target: src/app.ts',
      'Mode: careful',
      'Raw: "src/app.ts" careful',
      `Dir: ${skillDir}`,
      'Session: ses_skill_template',
    ].join('\n');
    expect(prompt).toMatchObject({
      type: 'turn.prompt',
      input: [{ type: 'text', text: expectedPrompt }],
      origin: {
        kind: 'skill_activation',
        skillName: 'templated-review',
        skillArgs: '"src/app.ts" careful',
      },
    });
    expect(JSON.stringify(prompt)).not.toContain('ARGUMENTS:');
  });

  it('does not re-emit skill activation live events on resume', async () => {
    await writeSkill('phase-one-review', [
      '---',
      'name: phase-one-review',
      'description: Review code',
      '---',
      '',
      'Review the requested file.',
    ]);
    const first = await createTestRpc();
    const created = await first.rpc.createSession({ id: 'ses_skill_resume', workDir });
    await first.rpc.activateSkill({
      sessionId: created.id,
      agentId: 'main',
      name: 'phase-one-review',
      args: 'src/app.ts',
    });
    await waitForEvent(first.events, (event) => event.type === 'skill.activated');
    await first.core.sessions.get(created.id)?.flushMetadata();

    const second = await createTestRpc();
    const resumed = await second.rpc.resumeSession({ sessionId: created.id });

    expect(second.events.some((event) => event.type === 'skill.activated')).toBe(false);
    const context = await second.rpc.getContext({ sessionId: created.id, agentId: 'main' });
    const resumeSkillDir = await realpath(join(workDir, '.byf', 'skills', 'phase-one-review'));
    const resumeExpectedPrompt = [
      `Base directory for this skill: ${resumeSkillDir}`,
      'Relative paths in this skill are relative to this base directory.',
      '',
      'Review the requested file.',
      '',
      'ARGUMENTS: src/app.ts',
    ].join('\n');
    expect(context.history).toMatchObject([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: resumeExpectedPrompt,
          },
        ],
        origin: {
          kind: 'skill_activation',
          skillName: 'phase-one-review',
          skillArgs: 'src/app.ts',
          trigger: 'user-slash',
          skillSource: 'project',
        },
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: expect.stringContaining('<byf-skill-loaded name="phase-one-review">'),
          },
        ],
        origin: {
          kind: 'skill_activation',
          skillName: 'phase-one-review',
          skillArgs: 'src/app.ts',
          trigger: 'user-slash',
          skillSource: 'project',
        },
      },
    ]);
    const replay = resumed.agents['main']?.replay ?? [];
    expect(replay).toContainEqual(
      expect.objectContaining({
        type: 'message',
        message: expect.objectContaining({
          origin: expect.objectContaining({
            kind: 'skill_activation',
            skillName: 'phase-one-review',
          }),
        }),
      }),
    );
    expect(replay).not.toContainEqual(
      expect.objectContaining({
        type: 'turn.prompt',
        origin: expect.objectContaining({ kind: 'skill_activation' }),
      }),
    );
  });

  it('registers builtin mcp-config skill, hides it from the model, and activates it via slash', async () => {
    const { core, events, rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_skill_builtin', workDir });

    const skills = await rpc.listSkills({ sessionId: created.id });
    const builtin = skills.find((skill) => skill.name === 'mcp-config');
    expect(builtin).toMatchObject({
      name: 'mcp-config',
      source: 'builtin',
      disableModelInvocation: true,
    });

    const session = core.sessions.get(created.id);
    expect(session).toBeDefined();
    const invocable = session!.skills.listInvocableSkills();
    expect(invocable.some((skill) => skill.name === 'mcp-config')).toBe(false);
    expect(session!.skills.getModelSkillListing()).not.toContain('mcp-config');

    await rpc.activateSkill({
      sessionId: created.id,
      agentId: 'main',
      name: 'mcp-config',
    });
    const activated = await waitForEvent(events, (event) => event.type === 'skill.activated');
    expect(activated).toMatchObject({
      type: 'skill.activated',
      skillName: 'mcp-config',
      trigger: 'user-slash',
      skillSource: 'builtin',
    });

    await session?.flushMetadata();
    const records = await readMainWire(created.sessionDir);
    const prompt = records.find((record) => record['type'] === 'turn.prompt');
    expect(prompt).toMatchObject({
      type: 'turn.prompt',
      origin: {
        kind: 'skill_activation',
        skillName: 'mcp-config',
        skillSource: 'builtin',
      },
    });
    const promptInput = (prompt as { input?: ReadonlyArray<{ text?: string }> } | undefined)?.input;
    expect(promptInput?.[0]?.text).toContain('Interactive MCP server configuration');
    expect(promptInput?.[0]?.text).toContain('AskUserQuestion');
  });

  it('lets a user-supplied skill override the builtin of the same name', async () => {
    await writeSkill('mcp-config', [
      '---',
      'name: mcp-config',
      'description: Project-local override',
      '---',
      '',
      'Local override body.',
    ]);
    const { rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_skill_builtin_override', workDir });

    const skills = await rpc.listSkills({ sessionId: created.id });
    const listed = skills.find((skill) => skill.name === 'mcp-config');
    expect(listed).toMatchObject({
      name: 'mcp-config',
      source: 'project',
      description: 'Project-local override',
    });
  });

  it('rejects missing and non-inline skills with structured errors', async () => {
    const { core, rpc } = await createTestRpc();
    const created = await rpc.createSession({ id: 'ses_skill_errors', workDir });

    await expect(
      rpc.activateSkill({ sessionId: created.id, agentId: 'main', name: 'missing' }),
    ).rejects.toMatchObject({
      name: 'ByfError',
      code: 'skill.not_found',
    });

    const session = core.sessions.get(created.id);
    session?.skills.registerBuiltinSkill({
      name: 'forked',
      description: 'Forked skill',
      path: '/skills/forked/SKILL.md',
      dir: '/skills/forked',
      content: 'fork body',
      metadata: { type: 'fork' },
      source: 'builtin',
    });

    await expect(
      rpc.activateSkill({ sessionId: created.id, agentId: 'main', name: 'forked' }),
    ).rejects.toMatchObject({
      name: 'ByfError',
      code: 'skill.type_unsupported',
    });
  });

  async function writeSkill(name: string, lines: readonly string[]): Promise<void> {
    const dir = join(workDir, '.byf', 'skills', name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), lines.join('\n'));
  }

  async function writeUserSkill(
    userHomeDir: string,
    name: string,
    description: string,
  ): Promise<void> {
    const dir = join(userHomeDir, '.byf', 'skills', name);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'SKILL.md'),
      ['---', `name: ${name}`, `description: ${description}`, '---', '', `${description}.`].join(
        '\n',
      ),
    );
  }

  async function writeFlatSkill(name: string, lines: readonly string[]): Promise<void> {
    const dir = join(workDir, '.byf', 'skills');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${name}.md`), lines.join('\n'));
  }

  async function createTestRpc(options?: { readonly homeDir?: string }): Promise<{
    core: ByfCore;
    events: Event[];
    rpc: CoreRPC;
  }> {
    const [coreRpc, sdkRpc] = createRPC<CoreAPI, SDKAPI>();
    const events: Event[] = [];
    const configuredHomeDir = options === undefined ? homeDir : options.homeDir;
    const core = new ByfCore(coreRpc, { homeDir: configuredHomeDir });
    const rpc = await sdkRpc({
      emitEvent: (event) => {
        events.push(event);
      },
      requestApproval: vi.fn(async (): Promise<ApprovalResponse> => ({ decision: 'rejected' })),
      requestQuestion: vi.fn(async () => null),
      toolCall: vi.fn(async () => ({ output: '' })),
    });
    return { core, events, rpc };
  }
});

async function waitForEvent(
  events: readonly Event[],
  predicate: (event: Event) => boolean,
): Promise<Event> {
  const deadline = Date.now() + 1_000;
  while (Date.now() < deadline) {
    const event = events.find(predicate);
    if (event !== undefined) return event;
    await delay(10);
  }
  throw new Error('Timed out waiting for event');
}

async function readMainWire(sessionDir: string): Promise<Array<Record<string, unknown>>> {
  const raw = await readFile(join(sessionDir, 'agents', 'main', 'wire.jsonl'), 'utf-8');
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}
