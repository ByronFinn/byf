import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  WorkspaceRegistry,
  findSessionWorkDir,
  listIndexedWorkDirs,
  workspaceTitle,
} from '#/home/workspace-registry';
import { appendSessionIndexEntry } from '#/session/store/session-index';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'byf-workspace-registry-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('WorkspaceRegistry', () => {
  test('add/list/hidden/remove round-trips in order', async () => {
    const reg = new WorkspaceRegistry(home);
    expect(await reg.list()).toEqual([]);
    await reg.add('/work/a');
    await reg.add('/work/b');
    expect(await reg.list()).toEqual(['/work/a', '/work/b']);
    expect(await reg.remove('/work/a')).toBe(true);
    expect(await reg.list()).toEqual(['/work/b']);
    expect(await reg.hidden()).toEqual(['/work/a']);
    // 重新添加恢复原位置
    await reg.add('/work/a');
    expect(await reg.list()).toEqual(['/work/a', '/work/b']);
    expect(await reg.hidden()).toEqual([]);
  });

  test('removing a non-registered dir returns false', async () => {
    const reg = new WorkspaceRegistry(home);
    expect(await reg.remove('/work/never')).toBe(false);
  });

  test('legacy string[] format is ignored (grill 决议: 只保留新结构)', async () => {
    await writeFile(join(home, 'workspaces.json'), JSON.stringify(['/old/a', '/old/b']), 'utf-8');
    const reg = new WorkspaceRegistry(home);
    expect(await reg.list()).toEqual([]);
    await reg.add('/new/c');
    const onDisk = JSON.parse(await readFile(join(home, 'workspaces.json'), 'utf-8')) as {
      order: string[];
    };
    expect(onDisk.order).toEqual(['/new/c']);
  });

  test('corrupt file is treated as empty and first write replaces it', async () => {
    await writeFile(join(home, 'workspaces.json'), '{ broken json', 'utf-8');
    const reg = new WorkspaceRegistry(home);
    expect(await reg.list()).toEqual([]);
    await reg.add('/fresh');
    expect(await reg.list()).toEqual(['/fresh']);
  });
});

describe('index helpers', () => {
  test('listIndexedWorkDirs dedupes by workDir in index order', async () => {
    await appendSessionIndexEntry(home, {
      sessionId: 'session_1',
      sessionDir: join(home, 'sessions', 'w', 'session_1'),
      workDir: '/w1',
    });
    await appendSessionIndexEntry(home, {
      sessionId: 'session_2',
      sessionDir: join(home, 'sessions', 'w', 'session_2'),
      workDir: '/w1',
    });
    await appendSessionIndexEntry(home, {
      sessionId: 'session_3',
      sessionDir: join(home, 'sessions', 'w', 'session_3'),
      workDir: '/w2',
    });
    expect(await listIndexedWorkDirs(home)).toEqual(['/w1', '/w2']);
  });

  test('findSessionWorkDir resolves via index', async () => {
    await appendSessionIndexEntry(home, {
      sessionId: 'session_9',
      sessionDir: join(home, 'sessions', 'w', 'session_9'),
      workDir: '/w9',
    });
    expect(await findSessionWorkDir(home, 'session_9')).toBe('/w9');
    expect(await findSessionWorkDir(home, 'session_404')).toBeUndefined();
  });

  test('workspaceTitle uses basename with path suffix stripping', () => {
    expect(workspaceTitle('/home/user/proj/')).toBe('proj');
    expect(workspaceTitle('/home/user/proj')).toBe('proj');
  });
});
