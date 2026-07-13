/**
 * `@file` autocomplete provider for the input box.
 *
 * pi-tui's `CombinedAutocompleteProvider` handles the mechanical parts
 * (extract `@…` prefix, insert completion with the right quoting). This
 * wrapper adds byf-specific ranking + filtering so the default "empty
 * `@`" list surfaces files the user actually wants, not alphabetical
 * noise from `.agents/skills/*` et al.
 *
 * Sort order — empty query:
 *   1. recently edited (from `git log --name-only`)
 *   2. recent fs mtime
 *   3. basename alphabetical
 *   (first 15, not 50 — pi-tui's menu height is ~6-10 lines anyway)
 *
 * Sort order — non-empty query (strict to fuzzy):
 *   cat 0: basename starts-with query
 *   cat 1: basename contains query
 *   cat 2: fuzzyMatch succeeds on full path
 *   tie-break within each cat: recency rank → mtime → basename length
 *   (first 50)
 *
 * Filter — dot directories are hidden by default. User can opt in by starting the query
 * with `.` (e.g. `@.github/`), since those paths rarely need
 * completion.
 *
 * When `fd` is available the inner pi-tui provider owns the `@` branch
 * verbatim — its fd invocation respects `.gitignore` and is strictly
 * better than anything we can cheaply reproduce in TS. We only kick in
 * when `fd` is missing AND we're in a git repo.
 */

import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  CombinedAutocompleteProvider,
  fuzzyFilter,
  fuzzyMatch,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SlashCommand,
} from '@earendil-works/pi-tui';

import type { GitLsFilesCache, GitSnapshot } from '#/utils/git/git-ls-files';

const MAX_SUGGESTIONS_WHEN_QUERY = 50;
const MAX_SUGGESTIONS_WHEN_EMPTY = 15;

// readdir fallback caps. Only walked when both `fd` and git are
// unavailable (no fd on PATH, non-git dir), so the bounds exist purely to
// keep a pathological work dir (e.g. a giant node_modules outside git)
// from blocking the keystroke loop.
const READDIR_MAX_DEPTH = 3;
const READDIR_MAX_ENTRIES = 1000;
const READDIR_SKIP_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.cache']);
const READDIR_SKIP_FILES = new Set(['.DS_Store', 'Thumbs.db']);

// Mirrors pi-tui's PATH_DELIMITERS. Keeping a local copy so @-detection
// stays aligned even if pi-tui extends its set.
const PATH_DELIMITERS = new Set([' ', '\t', '"', "'", '=']);

export class FileMentionProvider implements AutocompleteProvider {
  private readonly inner: CombinedAutocompleteProvider;

  constructor(
    slashCommands: SlashCommand[],
    private readonly workDir: string,
    private readonly fdPath: string | null,
    private readonly gitCache: GitLsFilesCache,
  ) {
    this.inner = new CombinedAutocompleteProvider(slashCommands, workDir, fdPath);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const textBeforeCursor = (lines[cursorLine] ?? '').slice(0, cursorCol);
    const atPrefix = extractAtPrefix(textBeforeCursor);

    // Non-`@` branch (slash commands, `/path`, quoted paths) — pi-tui
    // already owns the edge cases. No intercept.
    if (atPrefix === null) {
      return this.inner.getSuggestions(lines, cursorLine, cursorCol, options);
    }

    // `fd` available → inner's fuzzy search is strictly better than our
    // git fallback (fd respects .gitignore AND covers unstaged paths
    // without a second spawn). Accept its output as-is.
    if (this.fdPath !== null) {
      return this.inner.getSuggestions(lines, cursorLine, cursorCol, options);
    }

    const query = atPrefix.slice(1); // strip leading '@'

    // Primary source: git ls-files cache (fast, respects .gitignore,
    // carries recency/mtime signals). Only available inside a git repo.
    const snapshot = this.gitCache.getSnapshot();
    if (snapshot !== null && snapshot.files.length > 0) {
      const ranked = rankFromSource(snapshot.files, snapshot, query, atPrefix);
      if (ranked !== null) return ranked;
      // Git cache had nothing useful — fall through to readdir (user may
      // be typing a path that exists but isn't tracked yet).
    }

    // Last-resort source when both fd and git are unavailable (no fd on
    // PATH, non-git directory): pi-tui's `@` branch needs `fd` and returns
    // [] without it, so the menu would silently never appear. Walk the
    // work dir ourselves so `@` still works outside git repos.
    const dirFiles = collectFilesViaReaddir(this.workDir, query.startsWith('.'));
    if (dirFiles.length > 0) {
      const emptySnapshot: GitSnapshot = {
        files: dirFiles,
        mtimeByPath: new Map(),
        recencyOrder: new Map(),
      };
      const ranked = rankFromSource(dirFiles, emptySnapshot, query, atPrefix);
      if (ranked !== null) return ranked;
    }

    // readdir also empty / errored → hand off to pi-tui for the remaining
    // branches (`/path`, slash commands). Its `@` branch will return null,
    // matching the empty-result behaviour the caller already tolerates.
    return this.inner.getSuggestions(lines, cursorLine, cursorCol, options);
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    // Reuse pi-tui's insertion logic — it handles `@` prefix, quoted
    // paths, directory trailing slash. Our item shape matches what
    // pi-tui produces.
    return this.inner.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }
}

/**
 * Return the `@…` token ending at the cursor, or `null` if we're not in
 * an `@` mention. Mirrors pi-tui's `extractAtPrefix` — the token
 * boundary is the last PATH_DELIMITER before the cursor, and the token
 * must start with `@`.
 */
function extractAtPrefix(text: string): string | null {
  let tokenStart = 0;
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (PATH_DELIMITERS.has(text[i] ?? '')) {
      tokenStart = i + 1;
      break;
    }
  }
  if (text[tokenStart] !== '@') return null;
  return text.slice(tokenStart);
}

/**
 * Run the shared @ ranking over a candidate source and wrap the result in
 * the `{ items, prefix }` shape pi-tui expects. Returns `null` when the
 * source yields nothing for this query, so the caller can try the next
 * source (git → readdir → pi-tui) instead of showing an empty menu.
 *
 * `prefix` is the raw `@…` token captured from the editor line, used
 * verbatim so pi-tui knows what span to replace on apply.
 */
function rankFromSource(
  files: readonly string[],
  snapshot: GitSnapshot,
  query: string,
  prefix: string,
): AutocompleteSuggestions | null {
  const includeDotDirs = query.startsWith('.');
  const candidates = includeDotDirs ? files : files.filter((p) => !containsDotSegment(p));
  const items =
    query.length === 0
      ? rankForEmptyQuery(candidates, snapshot)
      : rankForQuery(candidates, query, snapshot);
  if (items.length === 0) return null;
  return { items, prefix };
}

/**
 * Walk `workDir` and collect regular-file paths (POSIX, relative to
 * workDir) for the readdir fallback. Bounded by `READDIR_MAX_DEPTH` and
 * `READDIR_MAX_ENTRIES` so a giant non-git tree can't stall the keystroke
 * loop. Skips the usual build/VCS noise directories; opt into dot dirs
 * only when the user's query itself starts with `.` (same semantics as
 * the git branch's dot-directory filter).
 *
 * Errors (ENOENT, EACCES, …) collapse to an empty list — the caller
 * then hands off to pi-tui, which already returns null on empty.
 */
function collectFilesViaReaddir(workDir: string, includeDotDirs: boolean): string[] {
  const out: string[] = [];
  try {
    walkReaddir(workDir, '', 0, includeDotDirs, out);
  } catch {
    // Whole-workDir read failed (permissions, unmounted, …) — nothing to
    // offer; the caller falls through to pi-tui.
  }
  return out;
}

function walkReaddir(
  root: string,
  relDir: string,
  depth: number,
  includeDotDirs: boolean,
  out: string[],
): void {
  if (depth >= READDIR_MAX_DEPTH || out.length >= READDIR_MAX_ENTRIES) return;
  const absDir = relDir.length === 0 ? root : join(root, relDir);
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (out.length >= READDIR_MAX_ENTRIES) return;
    const name = entry.name;
    const isDot = name.startsWith('.');
    if (entry.isDirectory()) {
      if (READDIR_SKIP_DIRS.has(name)) continue;
      // Hide dot-directories unless the user explicitly opted in.
      if (isDot && !includeDotDirs) continue;
      walkReaddir(
        root,
        relDir.length === 0 ? name : `${relDir}/${name}`,
        depth + 1,
        includeDotDirs,
        out,
      );
    } else if (entry.isFile()) {
      if (READDIR_SKIP_FILES.has(name)) continue;
      if (isDot && !includeDotDirs) continue;
      const rel = relDir.length === 0 ? name : `${relDir}/${name}`;
      out.push(rel);
    }
  }
}

/** True when any path segment starts with a dot (e.g. `.github/x.yml`). */
function containsDotSegment(path: string): boolean {
  for (const segment of path.split('/')) {
    if (segment.startsWith('.')) return true;
  }
  return false;
}

/**
 * Empty-query ranking: stratified by signal strength.
 *
 * Layer 1: files touched in the last RECENT_COMMIT_DEPTH commits,
 *          ordered by how recently. Strongest signal — if the user
 *          just worked on it, they probably want to mention it.
 * Layer 2: files with the newest fs mtime (covers uncommitted edits
 *          and files edited but not yet added to git).
 * Layer 3: everything else, alphabetical by basename so
 *          README/package.json-style top-level files bubble up
 *          relative to deeply-nested alphabetical paths.
 *
 * Cap at MAX_SUGGESTIONS_WHEN_EMPTY. Layers fill in order; dedup by
 * path so a recently-edited file isn't also listed in layer 2.
 */
function rankForEmptyQuery(files: readonly string[], snapshot: GitSnapshot): AutocompleteItem[] {
  const picked = new Set<string>();
  const result: string[] = [];
  const cap = MAX_SUGGESTIONS_WHEN_EMPTY;
  const inFiles = new Set(files);

  // Layer 1 — git log recency.
  const byRecency = [...snapshot.recencyOrder.entries()]
    .filter(([path]) => inFiles.has(path))
    .toSorted((a, b) => a[1] - b[1]);
  for (const [path] of byRecency) {
    if (result.length >= cap) break;
    if (picked.has(path)) continue;
    picked.add(path);
    result.push(path);
  }

  // Layer 2 — fs mtime.
  if (result.length < cap) {
    const byMtime = files
      .filter((p) => !picked.has(p) && snapshot.mtimeByPath.has(p))
      .toSorted((a, b) => (snapshot.mtimeByPath.get(b) ?? 0) - (snapshot.mtimeByPath.get(a) ?? 0));
    for (const path of byMtime) {
      if (result.length >= cap) break;
      picked.add(path);
      result.push(path);
    }
  }

  // Layer 3 — alphabetical by basename.
  if (result.length < cap) {
    const rest = files
      .filter((p) => !picked.has(p))
      .toSorted((a, b) => basename(a).localeCompare(basename(b)) || a.localeCompare(b));
    for (const path of rest) {
      if (result.length >= cap) break;
      result.push(path);
    }
  }

  return result.map(toItem);
}

/**
 * Non-empty-query ranking: three strictness tiers, with recency /
 * mtime as tie-breakers inside each tier so "the readme you just
 * edited" beats "a readme deep in a vendor dir".
 */
function rankForQuery(
  files: readonly string[],
  query: string,
  snapshot: GitSnapshot,
): AutocompleteItem[] {
  const lowerQuery = query.toLowerCase();
  const scored: Array<{ path: string; cat: number; fuzzyScore: number }> = [];
  for (const path of files) {
    const base = basename(path).toLowerCase();
    if (base.startsWith(lowerQuery)) {
      scored.push({ path, cat: 0, fuzzyScore: 0 });
      continue;
    }
    if (base.includes(lowerQuery)) {
      scored.push({ path, cat: 1, fuzzyScore: 0 });
      continue;
    }
    const fuzzy = fuzzyMatch(query, path);
    if (fuzzy.matches) {
      scored.push({ path, cat: 2, fuzzyScore: fuzzy.score });
    }
  }

  if (scored.length === 0) {
    // pi-tui's fuzzyFilter is slightly different (token-splitting);
    // try it as a last-resort safety net.
    return fuzzyFilter([...files], query, (p) => p)
      .slice(0, MAX_SUGGESTIONS_WHEN_QUERY)
      .map(toItem);
  }

  scored.sort((a, b) => {
    if (a.cat !== b.cat) return a.cat - b.cat;
    if (a.cat === 2 && a.fuzzyScore !== b.fuzzyScore) return a.fuzzyScore - b.fuzzyScore;
    const ra = snapshot.recencyOrder.get(a.path);
    const rb = snapshot.recencyOrder.get(b.path);
    if (ra !== undefined && rb !== undefined && ra !== rb) return ra - rb;
    if (ra !== undefined && rb === undefined) return -1;
    if (ra === undefined && rb !== undefined) return 1;
    const ma = snapshot.mtimeByPath.get(a.path) ?? 0;
    const mb = snapshot.mtimeByPath.get(b.path) ?? 0;
    if (ma !== mb) return mb - ma;
    const baseLenDiff = basename(a.path).length - basename(b.path).length;
    if (baseLenDiff !== 0) return baseLenDiff;
    return a.path.localeCompare(b.path);
  });

  return scored.slice(0, MAX_SUGGESTIONS_WHEN_QUERY).map((entry) => toItem(entry.path));
}

function toItem(path: string): AutocompleteItem {
  return {
    value: `@${path}`,
    label: basename(path),
    description: path,
  };
}
