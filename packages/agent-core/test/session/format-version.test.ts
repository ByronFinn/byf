import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ByfError, ErrorCodes } from '../../src/errors';
import { SessionStore } from '../../src/session/store';
import { appendSessionIndexEntry, readSessionIndex } from '../../src/session/store/session-index';

/**
 * PRD-0037 #322：session_index 格式版本字段 + 旧会话列表隐藏（ADR-0040）。
 *
 * - 旧 1.1 会话在 formatVersion '2.0' 过滤下从列表消失，磁盘文件保留；
 * - 2.0 会话（会话级 wire.jsonl 布局）正常列出与打开；
 * - 误打开旧格式目录得到 SESSION_FORMAT_UNSUPPORTED 清晰错误，进程不崩溃。
 */
describe('SessionStore format version (PRD-0037 #322)', () => {
  let homeDir: string;
  let store: SessionStore;
  const workDir = '/test/work';

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'byf-format-version-'));
    store = new SessionStore(homeDir);
  });
  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true });
  });

  function sessionDirFor(sessionId: string): string {
    return store.sessionDirFor({ id: sessionId, workDir });
  }

  async function registerIndex(sessionId: string, formatVersion?: string): Promise<void> {
    await appendSessionIndexEntry(homeDir, {
      sessionId,
      sessionDir: sessionDirFor(sessionId),
      workDir,
      formatVersion,
    });
  }

  /** 旧 1.1 布局：agents/main/wire.jsonl。 */
  async function writeLegacySession(sessionId: string): Promise<void> {
    const dir = sessionDirFor(sessionId);
    const wireDir = join(dir, 'agents', 'main');
    await mkdir(wireDir, { recursive: true });
    await writeFile(
      join(wireDir, 'wire.jsonl'),
      `${JSON.stringify({ type: 'metadata', protocol_version: '1.1', created_at: 1 })}\n`,
      'utf-8',
    );
    await writeFile(
      join(dir, 'state.json'),
      JSON.stringify({ title: 'legacy', createdAt: '2026-01-01T00:00:00.000Z' }),
      'utf-8',
    );
    await registerIndex(sessionId, '1.1');
  }

  /** 2.0 布局：会话级单文件 wire.jsonl。 */
  async function writeV2Session(sessionId: string): Promise<void> {
    const dir = sessionDirFor(sessionId);
    await mkdir(dir, { recursive: true });
    const header = JSON.stringify({
      kind: 'header',
      formatVersion: '2.0',
      sessionId,
      createdAt: 1,
    });
    await writeFile(join(dir, 'wire.jsonl'), `${header}\n`, 'utf-8');
    await registerIndex(sessionId, '2.0');
  }

  it('hides legacy 1.1 sessions when filtering for 2.0, keeping files on disk', async () => {
    await writeLegacySession('legacy-a');
    await writeV2Session('fresh-b');

    const unfiltered = await store.list({ workDir });
    expect(unfiltered.map((s) => s.id).toSorted()).toEqual(['fresh-b', 'legacy-a']);

    const v2Only = await store.list({ workDir, formatVersion: '2.0' });
    expect(v2Only.map((s) => s.id)).toEqual(['fresh-b']);

    const v1Only = await store.list({ workDir, formatVersion: '1.1' });
    expect(v1Only.map((s) => s.id)).toEqual(['legacy-a']);

    // 磁盘保留：旧会话目录与文件未被删除或改写
    const legacyWire = join(sessionDirFor('legacy-a'), 'agents', 'main', 'wire.jsonl');
    const content = await readFile(legacyWire, 'utf-8');
    expect(content).toContain('protocol_version');
  });

  it('reports summaries with detected formatVersion', async () => {
    await writeLegacySession('legacy-a');
    await writeV2Session('fresh-b');
    const summaries = await store.list({ workDir });
    expect(summaries.find((s) => s.id === 'legacy-a')?.formatVersion).toBe('1.1');
    expect(summaries.find((s) => s.id === 'fresh-b')?.formatVersion).toBe('2.0');
  });

  it('rejects opening a legacy session directory with a clear error (no crash)', async () => {
    await writeLegacySession('legacy-a');
    let captured: unknown;
    try {
      await store.assertDirectory('legacy-a', { requireFormat: '2.0' });
    } catch (error) {
      captured = error;
    }
    const error = captured;
    expect(error).toBeInstanceOf(ByfError);
    expect((error as ByfError).code).toBe(ErrorCodes.SESSION_FORMAT_UNSUPPORTED);
    expect((error as ByfError).message).toContain('旧版本');
    expect((error as ByfError).message).toContain('legacy-a');
  });

  it('opens a 2.0 session directory under the format guard', async () => {
    await writeV2Session('fresh-b');
    const dir = await store.assertDirectory('fresh-b', { requireFormat: '2.0' });
    expect(dir).toBe(sessionDirFor('fresh-b'));
    // 不带守卫的旧行为不变
    expect(await store.assertDirectory('fresh-b')).toBe(sessionDirFor('fresh-b'));
  });

  it('session_index entries carry the formatVersion field for new sessions', async () => {
    await store.create({ id: 'created-1', workDir });
    const index = await readSessionIndex(homeDir, store.sessionsDir);
    expect(index.get('created-1')?.formatVersion).toBe('1.1'); // 当前引擎仍写 1.1
  });

  it('missing-format sessions (no wire yet) pass no-format filters only', async () => {
    const dir = sessionDirFor('empty-session');
    await mkdir(dir, { recursive: true });
    await registerIndex('empty-session');
    const all = await store.list({ workDir });
    expect(all.map((s) => s.id)).toContain('empty-session');
    const v2 = await store.list({ workDir, formatVersion: '2.0' });
    expect(v2.map((s) => s.id)).not.toContain('empty-session');
  });
});
