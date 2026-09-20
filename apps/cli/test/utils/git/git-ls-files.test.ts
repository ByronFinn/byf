import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, utimesSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createGitLsFilesCache } from '#/utils/git/git-ls-files';

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function commit(cwd: string, message: string): void {
  git(cwd, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', 'commit', '-m', message);
}

/**
 * 失效信号的来源只有两个：2s TTL 和 `.git/index` 的 mtime（见
 * `#/utils/git/git-ls-files` 的 Rebuild strategy 注释）。这里的 flaky 与
 * `mock.module` 跨文件串扰无关——CI 的 `build/run-tests.mjs` 本来就是 per-file
 * 进程隔离，单进程跑这一个文件同样能复现（实测 HEAD 版本 8 并发 × 48 次跑红 7 次，
 * 红的恒为 `invalidates when .git/index mtime changes` 一例）。
 *
 * 真正的原因是两步叠加：
 *  1. Linux 的 inode 时间戳取自 coarse clock（本机实测同一轮 tick 内多次写入会拿到
 *     完全相同的 mtime），所以 `git commit` 之后紧跟 `git add` 时，新 index mtime
 *     有相当概率恰好等于缓存已经记录的那一格；
 *  2. 旧用例先 `utimesSync(+5000)` 再 `git add`，而后一步会重写 `.git/index`，
 *     把刚设到未来的 mtime 覆盖回「现在」——于是人造的失效信号被自己抹掉了。
 *
 * 结论：失效信号必须由用例在 `git add` **之后**显式推进，不能指望两次 git 调用的
 * 墙钟间隔，也不能在 `git add` 之前 utimes。下面两个用例把这两种情形都钉住。
 */
const INDEX_MTIME_STEP_MS = 5000;

function readIndexMtime(indexPath: string): number {
  return statSync(indexPath).mtimeMs;
}

/** Force the index mtime strictly forward of every timestamp seen so far. */
function advanceIndexMtime(indexPath: string): void {
  const nextMs = Math.max(readIndexMtime(indexPath), Date.now()) + INDEX_MTIME_STEP_MS;
  // Numeric seconds (not `Date`) — `Date` truncates sub-millisecond precision and
  // would not round-trip the coarse-clock timestamps git writes.
  utimesSync(indexPath, nextMs / 1000, nextMs / 1000);
}

/** Pin the index mtime back to a previous value — i.e. simulate one coarse tick. */
function holdIndexMtime(indexPath: string, atMs: number): void {
  utimesSync(indexPath, atMs / 1000, atMs / 1000);
}

describe('createGitLsFilesCache', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'git-ls-files-test-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for a non-git directory', () => {
    const cache = createGitLsFilesCache(dir);
    expect(cache.isGitRepo()).toBe(false);
    expect(cache.list()).toBeNull();
  });

  it('lists tracked files in a git repo', () => {
    git(dir, 'init');
    writeFileSync(join(dir, 'a.ts'), '');
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src/b.ts'), '');
    git(dir, 'add', '.');
    commit(dir, 'init');

    const cache = createGitLsFilesCache(dir);
    expect(cache.isGitRepo()).toBe(true);
    const snap = cache.getSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.files).toContain('a.ts');
    expect(snap!.files).toContain('src/b.ts');
    expect(snap!.mtimeByPath.has('a.ts')).toBe(true);
    expect(snap!.mtimeByPath.get('a.ts')!).toBeGreaterThan(0);
    expect(cache.getSnapshot()).toBe(snap);
  });

  it('includes untracked-but-not-ignored files', () => {
    git(dir, 'init');
    writeFileSync(join(dir, '.gitignore'), 'ignored.ts\n');
    writeFileSync(join(dir, 'tracked.ts'), '');
    git(dir, 'add', 'tracked.ts');
    commit(dir, 'init');

    // Create both an untracked file and one that matches .gitignore.
    writeFileSync(join(dir, 'new.ts'), '');
    writeFileSync(join(dir, 'ignored.ts'), '');

    const cache = createGitLsFilesCache(dir);
    const files = cache.list()!;
    expect(files).toContain('tracked.ts');
    expect(files).toContain('new.ts');
    expect(files).not.toContain('ignored.ts');
  });

  it('builds a recency order from recent commits', () => {
    git(dir, 'init');
    writeFileSync(join(dir, 'old.ts'), '');
    git(dir, 'add', 'old.ts');
    commit(dir, 'old');
    writeFileSync(join(dir, 'new.ts'), '');
    git(dir, 'add', 'new.ts');
    commit(dir, 'new');

    const cache = createGitLsFilesCache(dir);
    const snap = cache.getSnapshot()!;
    const newRank = snap.recencyOrder.get('new.ts');
    const oldRank = snap.recencyOrder.get('old.ts');
    expect(newRank).toBeDefined();
    expect(oldRank).toBeDefined();
    expect(newRank!).toBeLessThan(oldRank!);
  });

  it('invalidates when .git/index mtime changes', () => {
    git(dir, 'init');
    writeFileSync(join(dir, 'a.ts'), '');
    git(dir, 'add', '.');
    commit(dir, 'init');

    const cache = createGitLsFilesCache(dir);
    const first = cache.list()!;
    expect(first).toContain('a.ts');

    // Stage a new file, then *guarantee* the invalidation signal moves: the
    // coarse-clock granularity above makes `git add` alone insufficient.
    writeFileSync(join(dir, 'b.ts'), '');
    git(dir, 'add', 'b.ts');
    const indexPath = join(dir, '.git', 'index');
    advanceIndexMtime(indexPath);

    const second = cache.list()!;
    expect(second).not.toBe(first); // new snapshot
    expect(second).toContain('b.ts');
  });

  it('reuses the cached snapshot while .git/index mtime is unchanged', () => {
    git(dir, 'init');
    writeFileSync(join(dir, 'a.ts'), '');
    git(dir, 'add', '.');
    commit(dir, 'init');

    const cache = createGitLsFilesCache(dir);
    const first = cache.getSnapshot();
    expect(first).not.toBeNull();
    // Same object identity is the point: it proves the TTL + mtime freshness
    // path is what answered, not a coincidentally equal content list.
    expect(cache.getSnapshot()).toBe(first);
  });

  it('does not see a staged file while the index mtime has not advanced', () => {
    // This is the flaky scenario, made deterministic: on a machine whose inode
    // timestamps only move every ~10ms, `git add` can rewrite .git/index with
    // the very mtime the cache already recorded. The documented rebuild rule is
    // "2s TTL plus .git/index mtime invalidation", so nothing is re-read and the
    // caller keeps the previous snapshot. Pinning that here is what keeps the
    // case above honest — it must advance the mtime itself.
    git(dir, 'init');
    writeFileSync(join(dir, 'a.ts'), '');
    git(dir, 'add', '.');
    commit(dir, 'init');

    const cache = createGitLsFilesCache(dir);
    const indexPath = join(dir, '.git', 'index');
    // Prime the cache — that is the moment it records `indexMtime`.
    expect(cache.list()).toEqual(['a.ts']);
    const recorded = readIndexMtime(indexPath);

    writeFileSync(join(dir, 'b.ts'), '');
    git(dir, 'add', 'b.ts');
    holdIndexMtime(indexPath, recorded);

    const stale = cache.list()!;
    expect(stale).not.toContain('b.ts');

    advanceIndexMtime(indexPath);
    expect(cache.list()!).toContain('b.ts');
  });
});
