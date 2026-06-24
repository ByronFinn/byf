import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ByfHarness } from '#/index';
import type { ByfError } from '#/index';

import {
  SessionStore,
  encodeWorkDirKey,
  sessionIndexPath,
} from '../../agent-core/src/session/store';
import { TEST_IDENTITY } from './test-identity';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'byf-sdk-list-'));
  tempDirs.push(dir);
  return dir;
}

async function writeSessionState(
  sessionDir: string,
  state: Record<string, unknown>,
): Promise<string> {
  const statePath = join(sessionDir, 'state.json');
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  return statePath;
}

describe('SessionStore.list', () => {
  it('returns an empty array when the workDir bucket does not exist', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    await expect(store.list({ workDir })).resolves.toEqual([]);
  });

  it('creates workDir-scoped session directories and a root session index', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const summary = await store.create({ id: 'ses_list_full', workDir });

    expect(summary).toMatchObject({
      id: 'ses_list_full',
      workDir,
      title: undefined,
    });
    expect(summary.sessionDir).not.toBe(join(homeDir, 'sessions', 'ses_list_full'));
    expect(basename(summary.sessionDir)).toBe('ses_list_full');
    const workdirKey = basename(dirname(summary.sessionDir));
    expect(workdirKey).toBe(encodeWorkDirKey(workDir));
    expect(workdirKey.length).toBeLessThan(70);
    expect(existsSync(join(summary.sessionDir, 'state.json'))).toBe(false);

    const indexRaw = await readFile(sessionIndexPath(homeDir), 'utf-8');
    expect(indexRaw).toContain('"sessionId":"ses_list_full"');
    expect(indexRaw).toContain(summary.sessionDir);
    expect(indexRaw).toContain(`"workDir":"${workDir}"`);
  });

  it('forks a session directory and rewrites fork metadata', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const source = await store.create({ id: 'ses_fork_source', workDir });
    const sourceAgentDir = join(source.sessionDir, 'agents', 'main');
    await mkdir(sourceAgentDir, { recursive: true });
    await writeFile(join(sourceAgentDir, 'wire.jsonl'), '{"type":"context.clear"}\n', 'utf-8');
    await writeSessionState(source.sessionDir, {
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
      title: 'Source title',
      isCustomTitle: true,
      agents: {
        main: {
          homedir: sourceAgentDir,
          type: 'main',
        },
      },
      custom: {
        source: true,
      },
    });

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_fork_child',
      title: 'Fork title',
      metadata: { child: true },
    });

    const forkState = JSON.parse(await readFile(join(fork.sessionDir, 'state.json'), 'utf-8')) as {
      title?: string;
      isCustomTitle?: boolean;
      forkedFrom?: string;
      agents?: { main?: { homedir?: string } };
      custom?: Record<string, unknown>;
    };
    expect(forkState.title).toBe('Fork title');
    expect(forkState.isCustomTitle).toBe(true);
    expect(forkState.forkedFrom).toBe(source.id);
    expect(forkState.agents?.main?.homedir).toBe(join(fork.sessionDir, 'agents', 'main'));
    expect(forkState.custom).toMatchObject({ source: true, child: true });
    await expect(
      readFile(join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'), 'utf-8'),
    ).resolves.toBe('{"type":"context.clear"}\n');

    const sourceState = JSON.parse(
      await readFile(join(source.sessionDir, 'state.json'), 'utf-8'),
    ) as { forkedFrom?: string };
    expect(sourceState.forkedFrom).toBeUndefined();
    const sessions = await store.list({ workDir });
    expect(sessions.map((session) => session.id).toSorted()).toEqual(
      [source.id, fork.id].toSorted(),
    );
  });

  it('returns only sessions from the requested workDir bucket', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const otherWorkDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    await store.create({ id: 'ses_list_a', workDir });
    await store.create({ id: 'ses_other_workdir', workDir: otherWorkDir });

    const sessions = await store.list({ workDir });
    expect(sessions.map((session) => session.id)).toEqual(['ses_list_a']);
  });

  it('reads title from customTitle before title', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const custom = await store.create({ id: 'ses_custom_title', workDir });
    await writeSessionState(custom.sessionDir, {
      title: 'Base Title',
      customTitle: 'Custom Title',
    });
    const fallback = await store.create({ id: 'ses_fallback_title', workDir });
    await writeSessionState(fallback.sessionDir, {
      title: 'Fallback Title',
    });

    const sessions = await store.list({ workDir });
    expect(sessions.find((session) => session.id === custom.id)?.title).toBe('Custom Title');
    expect(sessions.find((session) => session.id === fallback.id)?.title).toBe('Fallback Title');
  });

  it('keeps sessions visible when state.json is missing or malformed', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    await store.create({ id: 'ses_no_state', workDir });
    const malformed = await store.create({ id: 'ses_bad_state', workDir });
    await writeFile(join(malformed.sessionDir, 'state.json'), '{bad json', 'utf-8');

    const sessions = await store.list({ workDir });
    expect(sessions.map((session) => session.id).toSorted()).toEqual([
      'ses_bad_state',
      'ses_no_state',
    ]);
    expect(sessions.every((session) => session.title === undefined)).toBe(true);
  });

  it('sorts by filesystem activity descending', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const oldSession = await store.create({ id: 'ses_old', workDir });
    const newSession = await store.create({ id: 'ses_new', workDir });
    const oldTime = new Date('2030-04-18T12:00:00Z');
    const newTime = new Date('2030-04-18T12:00:10Z');
    await writeFile(join(oldSession.sessionDir, 'wire.jsonl'), '{}\n', 'utf-8');
    await writeFile(join(newSession.sessionDir, 'wire.jsonl'), '{}\n', 'utf-8');
    await utimes(join(oldSession.sessionDir, 'wire.jsonl'), oldTime, oldTime);
    await utimes(join(newSession.sessionDir, 'wire.jsonl'), newTime, newTime);

    const sessions = await store.list({ workDir });
    expect(sessions.map((session) => session.id)).toEqual(['ses_new', 'ses_old']);
  });

  it('does not scan legacy flat session directories', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    await mkdir(join(homeDir, 'sessions', 'ses_legacy_flat'), { recursive: true });
    await writeSessionState(join(homeDir, 'sessions', 'ses_legacy_flat'), {
      session_id: 'ses_legacy_flat',
      workspace_dir: workDir,
      custom_title: 'Legacy Flat',
    });

    const store = new SessionStore(homeDir);
    await expect(store.list({ workDir })).resolves.toEqual([]);
    await expect(store.get('ses_legacy_flat')).rejects.toMatchObject({
      name: 'ByfError',
      code: 'session.not_found',
    });
  });
});

describe('SessionStore.fork (backward compatibility)', () => {
  // AC5 / Issue #184: when upToMessage is omitted, fork behaves EXACTLY as
  // before the change — a full recursive copy of the session directory, the
  // main agent wire.jsonl preserved byte-for-byte, and forkedFrom set. These
  // tests are the regression net: they pass against the current (unchanged)
  // code and must continue to pass once the optional upToMessage field lands.

  async function seedSourceSession(store: SessionStore, workDir: string) {
    const source = await store.create({ id: 'ses_bc_source', workDir });
    // Main agent directory with a multi-record wire (mirrors a real session:
    // metadata head, context/turn records, a loop event, a tool result).
    const mainAgentDir = join(source.sessionDir, 'agents', 'main');
    await mkdir(mainAgentDir, { recursive: true });
    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"first user question"}],"origin":{"kind":"user"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"second user question"}],"origin":{"kind":"user"}}\n';
    await writeFile(join(mainAgentDir, 'wire.jsonl'), mainWire, 'utf-8');

    // A second (sub-)agent directory with its own wire — exercises that the
    // full recursive copy includes nested agent directories, not just main.
    const subAgentDir = join(source.sessionDir, 'agents', 'sub-agent-1');
    await mkdir(subAgentDir, { recursive: true });
    await writeFile(join(subAgentDir, 'wire.jsonl'), '{"type":"context.clear"}\n', 'utf-8');

    await writeSessionState(source.sessionDir, {
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
      title: 'Backwards compat source',
      isCustomTitle: false,
      lastPrompt: 'second user question',
      agents: {
        main: { homedir: mainAgentDir, type: 'main' },
        'sub-agent-1': { homedir: subAgentDir, type: 'sub' },
      },
      custom: { marker: 'source' },
    });

    return { source, mainWire };
  }

  it('copies the entire source session directory when upToMessage is omitted', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const { source } = await seedSourceSession(store, workDir);
    const fork = await store.fork({ sourceId: source.id, targetId: 'ses_bc_copy' });

    // Every nested file from the source tree is present in the target tree.
    const expectedRelPaths = [
      'state.json',
      'agents/main/wire.jsonl',
      'agents/sub-agent-1/wire.jsonl',
    ];
    for (const rel of expectedRelPaths) {
      await expect(readFile(join(source.sessionDir, rel), 'utf-8')).resolves.toBeDefined();
      await expect(readFile(join(fork.sessionDir, rel), 'utf-8')).resolves.toBeDefined();
    }
  });

  it('preserves the main agent wire.jsonl byte-for-byte when upToMessage is omitted', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const { source, mainWire } = await seedSourceSession(store, workDir);
    const fork = await store.fork({ sourceId: source.id, targetId: 'ses_bc_wire' });

    const forkedMainWire = await readFile(
      join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'),
      'utf-8',
    );
    // No truncation happened: both user-question turn.prompt records are still
    // present, and the content matches the source byte-for-byte.
    expect(forkedMainWire).toBe(mainWire);
    expect(forkedMainWire).toContain('first user question');
    expect(forkedMainWire).toContain('second user question');

    const sourceMainWire = await readFile(
      join(source.sessionDir, 'agents', 'main', 'wire.jsonl'),
      'utf-8',
    );
    expect(sourceMainWire).toBe(mainWire);
  });

  it('records forkedFrom in state.json when upToMessage is omitted', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const { source } = await seedSourceSession(store, workDir);
    const fork = await store.fork({ sourceId: source.id, targetId: 'ses_bc_state' });

    const forkState = JSON.parse(await readFile(join(fork.sessionDir, 'state.json'), 'utf-8')) as {
      forkedFrom?: string;
      agents?: Record<string, { homedir?: string }>;
      custom?: Record<string, unknown>;
    };
    expect(forkState.forkedFrom).toBe(source.id);
    // writeForkedState remaps nested agent homedirs into the target tree even
    // on a full copy — assert the main agent homedir now points at the fork.
    expect(forkState.agents?.['main']?.homedir).toBe(join(fork.sessionDir, 'agents', 'main'));
    expect(forkState.agents?.['sub-agent-1']?.homedir).toBe(
      join(fork.sessionDir, 'agents', 'sub-agent-1'),
    );
    // Existing source custom metadata is carried through untouched.
    expect(forkState.custom).toMatchObject({ marker: 'source' });
  });
});

describe('SessionStore.fork with upToMessage truncation', () => {
  // AC1 / AC3 / Issue #184: when upToMessage is set, the forked session's main
  // agent wire.jsonl keeps every record BEFORE the Nth user-origin
  // turn.prompt/turn.steer record and drops that record + everything after it
  // (edit-message semantics — see ADR-0020). The ordinal counts ONLY records
  // whose origin.kind === 'user'; background_task / skill_activation /
  // hook_result origins are not user-selectable rewind points.

  async function seedSession(
    store: SessionStore,
    workDir: string,
    mainWire: string,
  ): Promise<{ source: { id: string; sessionDir: string }; mainAgentDir: string }> {
    const source = await store.create({ id: 'ses_trunc_source', workDir });
    const mainAgentDir = join(source.sessionDir, 'agents', 'main');
    await mkdir(mainAgentDir, { recursive: true });
    await writeFile(join(mainAgentDir, 'wire.jsonl'), mainWire, 'utf-8');

    await writeSessionState(source.sessionDir, {
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
      title: 'Truncation source',
      agents: {
        main: { homedir: mainAgentDir, type: 'main' },
      },
    });

    return { source, mainAgentDir };
  }

  async function readForkedWireTypes(fork: { sessionDir: string }): Promise<string[]> {
    const raw = await readFile(join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'), 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => (JSON.parse(line) as { type: string }).type);
  }

  it('truncates the main wire to records before the 2nd user turn.prompt (upToMessage=2)', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q1"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q2"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q3"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n';
    const { source } = await seedSession(store, workDir, mainWire);

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_trunc_two',
      upToMessage: 2,
    });

    const types = await readForkedWireTypes(fork);
    expect(types).toEqual([
      'metadata',
      'context.clear',
      'turn.prompt', // q1 — the only surviving user turn
      'context.append_loop_event',
    ]);
    const forkedRaw = await readFile(
      join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'),
      'utf-8',
    );
    expect(forkedRaw).not.toContain('q2');
    expect(forkedRaw).not.toContain('q3');
  });

  it('drops the first user message and everything after it when upToMessage=1', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q1"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q2"}],"origin":{"kind":"user"}}\n';
    const { source } = await seedSession(store, workDir, mainWire);

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_trunc_one',
      upToMessage: 1,
    });

    const types = await readForkedWireTypes(fork);
    expect(types).toEqual(['metadata', 'context.clear']);
    const forkedRaw = await readFile(
      join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'),
      'utf-8',
    );
    expect(forkedRaw).not.toContain('q1');
    expect(forkedRaw).not.toContain('q2');
  });

  it('rejects and leaves no target directory when upToMessage exceeds the user-turn count', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q1"}],"origin":{"kind":"user"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q2"}],"origin":{"kind":"user"}}\n';
    const { source } = await seedSession(store, workDir, mainWire);

    await expect(
      store.fork({
        sourceId: source.id,
        targetId: 'ses_trunc_oor',
        upToMessage: 4,
      }),
    ).rejects.toThrow();

    await expect(store.get('ses_trunc_oor')).rejects.toMatchObject({
      code: 'session.not_found',
    });
    expect(existsSync(join(homeDir, 'sessions', 'ses_trunc_oor'))).toBe(false);
  });

  it('counts only user-origin turns and ignores background_task turn.prompt records', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"user q1"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"bg task prompt"}],"origin":{"kind":"background_task","taskId":"bg-1"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"user q2"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"user q3"}],"origin":{"kind":"user"}}\n';
    const { source } = await seedSession(store, workDir, mainWire);

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_trunc_origin',
      upToMessage: 2,
    });

    const forkedRaw = await readFile(
      join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'),
      'utf-8',
    );
    expect(forkedRaw).toContain('user q1');
    expect(forkedRaw).toContain('bg task prompt');
    expect(forkedRaw).not.toContain('user q2');
    expect(forkedRaw).not.toContain('user q3');
  });

  it('preserves interleaved context records of a kept turn and drops those after the cut', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"keep me"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_message","message":{"role":"assistant","content":[{"type":"text","text":"reply1"}]}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"drop me"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_message","message":{"role":"assistant","content":[{"type":"text","text":"reply2"}]}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n';
    const { source } = await seedSession(store, workDir, mainWire);

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_trunc_interleave',
      upToMessage: 2,
    });

    const types = await readForkedWireTypes(fork);
    expect(types).toEqual([
      'metadata',
      'context.clear',
      'turn.prompt',
      'context.append_message',
      'context.append_loop_event',
    ]);
    const forkedRaw = await readFile(
      join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'),
      'utf-8',
    );
    expect(forkedRaw).toContain('keep me');
    expect(forkedRaw).toContain('reply1');
    expect(forkedRaw).not.toContain('drop me');
    expect(forkedRaw).not.toContain('reply2');
  });

  it('counts turn.steer user-origin records in the ordinal alongside turn.prompt', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"prompt1"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.steer","input":[{"type":"text","text":"steer1"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"step.end"}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"prompt2"}],"origin":{"kind":"user"}}\n';
    const { source } = await seedSession(store, workDir, mainWire);

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_trunc_steer',
      upToMessage: 2,
    });

    const types = await readForkedWireTypes(fork);
    expect(types).toEqual([
      'metadata',
      'context.clear',
      'turn.prompt',
      'context.append_loop_event',
    ]);
    const forkedRaw = await readFile(
      join(fork.sessionDir, 'agents', 'main', 'wire.jsonl'),
      'utf-8',
    );
    expect(forkedRaw).toContain('prompt1');
    expect(forkedRaw).not.toContain('steer1');
    expect(forkedRaw).not.toContain('prompt2');
  });
});

describe('SessionStore.fork orphan sub-agent cleanup', () => {
  // Issue #185: truncating the main wire must also remove sub-agents spawned
  // by the dropped turns. A sub-agent is "referenced" when its
  // parentToolCallId appears as a tool.call in the retained wire prefix.
  // Orphans are removed from state.json metadata.agents AND their
  // agents/<id>/ wire directory is deleted. Retained sub-agents survive.

  async function seedSessionWithSubagents(
    store: SessionStore,
    workDir: string,
  ): Promise<{
    source: { id: string; sessionDir: string };
    mainWire: string;
    keptSubAgentDir: string;
    orphanSubAgentDir: string;
  }> {
    const source = await store.create({ id: 'ses_orphan_source', workDir });
    const mainAgentDir = join(source.sessionDir, 'agents', 'main');
    await mkdir(mainAgentDir, { recursive: true });

    // Two user turns, each spawns a sub-agent via an Agent tool call.
    // Turn 1's tool call (call_keep) is RETAINED when forking at message 2.
    // Turn 2's tool call (call_drop) is DROPPED.
    const mainWire =
      '{"type":"metadata","version":1}\n' +
      '{"type":"context.clear"}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q1"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"tool.call","toolCallId":"call_keep","name":"Agent","args":{"prompt":"sub1"}}}\n' +
      '{"type":"turn.prompt","input":[{"type":"text","text":"q2"}],"origin":{"kind":"user"}}\n' +
      '{"type":"context.append_loop_event","event":{"type":"tool.call","toolCallId":"call_drop","name":"Agent","args":{"prompt":"sub2"}}}\n';
    await writeFile(join(mainAgentDir, 'wire.jsonl'), mainWire, 'utf-8');

    const keptSubAgentDir = join(source.sessionDir, 'agents', 'agent-keep');
    const orphanSubAgentDir = join(source.sessionDir, 'agents', 'agent-drop');
    await mkdir(keptSubAgentDir, { recursive: true });
    await mkdir(orphanSubAgentDir, { recursive: true });
    await writeFile(
      join(keptSubAgentDir, 'wire.jsonl'),
      '{"type":"metadata","version":1}\n',
      'utf-8',
    );
    await writeFile(
      join(orphanSubAgentDir, 'wire.jsonl'),
      '{"type":"metadata","version":1}\n',
      'utf-8',
    );

    await writeSessionState(source.sessionDir, {
      createdAt: '2030-01-01T00:00:00.000Z',
      updatedAt: '2030-01-01T00:00:00.000Z',
      title: 'Orphan source',
      agents: {
        main: { homedir: mainAgentDir, type: 'main', parentAgentId: null },
        'agent-keep': {
          homedir: keptSubAgentDir,
          type: 'sub',
          parentAgentId: 'main',
          parentToolCallId: 'call_keep',
        },
        'agent-drop': {
          homedir: orphanSubAgentDir,
          type: 'sub',
          parentAgentId: 'main',
          parentToolCallId: 'call_drop',
        },
      },
    });

    return { source, mainWire, keptSubAgentDir, orphanSubAgentDir };
  }

  it('removes orphaned sub-agents from state.json and deletes their wire directory', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const { source } = await seedSessionWithSubagents(store, workDir);

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_orphan_fork',
      upToMessage: 2,
    });

    const forkState = JSON.parse(await readFile(join(fork.sessionDir, 'state.json'), 'utf-8')) as {
      agents: Record<string, { parentToolCallId?: string }>;
    };

    // Retained sub-agent (spawned in the kept turn 1) survives.
    expect(forkState.agents['agent-keep']).toBeDefined();
    expect(forkState.agents['agent-keep']?.parentToolCallId).toBe('call_keep');
    await expect(
      readFile(join(fork.sessionDir, 'agents', 'agent-keep', 'wire.jsonl'), 'utf-8'),
    ).resolves.toBeDefined();

    // Orphaned sub-agent (spawned in the dropped turn 2) is gone.
    expect(forkState.agents['agent-drop']).toBeUndefined();
    await expect(
      readFile(join(fork.sessionDir, 'agents', 'agent-drop', 'wire.jsonl'), 'utf-8'),
    ).rejects.toThrow();
  });

  it('keeps all sub-agents when upToMessage is omitted (full copy)', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const store = new SessionStore(homeDir);

    const { source } = await seedSessionWithSubagents(store, workDir);

    const fork = await store.fork({
      sourceId: source.id,
      targetId: 'ses_orphan_full',
    });

    const forkState = JSON.parse(await readFile(join(fork.sessionDir, 'state.json'), 'utf-8')) as {
      agents: Record<string, unknown>;
    };

    expect(forkState.agents['agent-keep']).toBeDefined();
    expect(forkState.agents['agent-drop']).toBeDefined();
    await expect(
      readFile(join(fork.sessionDir, 'agents', 'agent-drop', 'wire.jsonl'), 'utf-8'),
    ).resolves.toBeDefined();
  });
});

describe('ByfHarness.listSessions', () => {
  it('rejects whitespace-only workDir with request.work_dir_required', async () => {
    const homeDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      await expect(harness.listSessions({ workDir: '   ' })).rejects.toMatchObject({
        name: 'ByfError',
        code: 'request.work_dir_required',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('rejects undefined payload as ByfError(internal)', async () => {
    const homeDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      await expect(harness.listSessions(undefined as never)).rejects.toMatchObject({
        name: 'ByfError',
        code: 'internal',
      } satisfies Partial<ByfError>);
    } finally {
      await harness.close();
    }
  });

  it('resolves relative workDir inputs before filtering', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });
    const originalCwd = process.cwd();

    try {
      process.chdir(workDir);
      const session = await harness.createSession({ id: 'ses_relative_workdir', workDir: '.' });

      const sessions = await harness.listSessions({ workDir: '.' });
      expect(sessions.map((item) => item.id)).toEqual([session.id]);
    } finally {
      process.chdir(originalCwd);
      await harness.close();
    }
  });

  it('lists persisted sessions after the active Session has been closed', async () => {
    const homeDir = await makeTempDir();
    const workDir = await makeTempDir();
    const harness = new ByfHarness({
      identity: TEST_IDENTITY,
      homeDir,
    });

    try {
      const session = await harness.createSession({ id: 'ses_closed_but_listed', workDir });
      await harness.closeSession(session.id);

      const sessions = await harness.listSessions({ workDir });
      expect(sessions.map((item) => item.id)).toEqual([session.id]);
    } finally {
      await harness.close();
    }
  });
});
