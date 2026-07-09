import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionStore } from '../../src/session/store';

/**
 * AC-7：fork 清空 goal。
 *
 * fork 后若源/截断点存在未清空的 goal.create，目标会话 main wire 追加一条
 * goal.clear record（ADR-0023）。无 goal 或已被 clear 覆盖时不追加。
 */
describe('SessionStore fork clears goal (AC-7)', () => {
  let homeDir: string;
  let store: SessionStore;
  const workDir = '/test/work';

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'byf-goal-fork-'));
    store = new SessionStore(homeDir);
  });
  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  function sessionDirFor(sessionId: string): string {
    return store.sessionDirFor({ id: sessionId, workDir });
  }

  async function writeMainWire(sessionId: string, lines: readonly string[]): Promise<void> {
    const dir = sessionDirFor(sessionId);
    const wireDir = join(dir, 'agents', 'main');
    await mkdir(wireDir, { recursive: true });
    await writeFile(join(wireDir, 'wire.jsonl'), lines.join('\n') + '\n', 'utf-8');
    // writeForkedState 要求源 session 有合法 state.json。
    await writeFile(
      join(dir, 'state.json'),
      JSON.stringify({ title: 'src', createdAt: '2026-01-01T00:00:00.000Z' }),
      'utf-8',
    );
  }

  async function readMainWire(sessionId: string): Promise<string[]> {
    const dir = sessionDirFor(sessionId);
    const content = await readFile(join(dir, 'agents', 'main', 'wire.jsonl'), 'utf-8');
    return content.split('\n').filter((line) => line.trim().length > 0);
  }

  function metadataLine(): string {
    return JSON.stringify({ type: 'metadata', protocol_version: '1.1', created_at: 1 });
  }

  function userPromptLine(text: string): string {
    return JSON.stringify({
      type: 'turn.prompt',
      input: [{ type: 'text', text }],
      origin: { kind: 'user' },
    });
  }

  it('fork with goal.create in wire appends goal.clear to target', async () => {
    await store.create({ id: 'src', workDir });
    await writeMainWire('src', [
      metadataLine(),
      JSON.stringify({ type: 'goal.create', objective: 'obj', budget: {}, createdAt: 1000 }),
      userPromptLine('first'),
    ]);

    await store.fork({ sourceId: 'src', targetId: 'tgt' });

    const lines = await readMainWire('tgt');
    const types = lines.map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types.at(-1)).toBe('goal.clear');
    // goal.create 仍在（截断点前），goal.clear 追加在后
    expect(types).toContain('goal.create');
  });

  it('fork without goal.create does not append goal.clear', async () => {
    await store.create({ id: 'src', workDir });
    await writeMainWire('src', [metadataLine(), userPromptLine('first')]);

    await store.fork({ sourceId: 'src', targetId: 'tgt' });

    const lines = await readMainWire('tgt');
    const types = lines.map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types).not.toContain('goal.clear');
    expect(types).not.toContain('goal.create');
  });

  it('fork where goal already cleared (goal.create then goal.clear) does not append another', async () => {
    await store.create({ id: 'src', workDir });
    await writeMainWire('src', [
      metadataLine(),
      JSON.stringify({ type: 'goal.create', objective: 'obj', budget: {}, createdAt: 1000 }),
      JSON.stringify({ type: 'goal.clear' }),
      userPromptLine('first'),
    ]);

    await store.fork({ sourceId: 'src', targetId: 'tgt' });

    const lines = await readMainWire('tgt');
    const types = lines.map((line) => (JSON.parse(line) as { type: string }).type);
    // 只有一个 goal.clear（源本来的那条），fork 不再追加
    expect(types.filter((t) => t === 'goal.clear')).toHaveLength(1);
  });
});
