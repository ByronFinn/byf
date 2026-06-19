import { readdirSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

export interface SuggestFilesParams {
  workDir: string;
  query?: string;
}

export interface FileSuggestion {
  path: string;
  name: string;
  mtime: number;
  score: number; // higher = better match
}

/**
 * Suggest files in a workspace directory based on a query.
 *
 * Uses git recency (git log --name-only) for ranking, with mtime as fallback.
 * - Empty query: returns most recently edited files (top 15)
 * - Non-empty query: starts-with → contains → fuzzy (top 50)
 *
 * Follows the PRD decision to keep file suggestion logic in the subprocess
 * (gui-core), not in Swift, so sorting is single-source-of-truth.
 */
export async function suggestFiles(params: SuggestFilesParams): Promise<{ files: FileSuggestion[] }> {
  const { workDir, query = '' } = params;

  // 1. Gather all files in the workspace (shallow for speed, or recursive)
  const allFiles: FileSuggestion[] = [];

  try {
    // Walk directories up to 2 levels deep
    const entries = listFilesRecursive(workDir, workDir, 2);
    for (const entry of entries) {
      try {
        const st = statSync(entry.fullPath);
        if (st.isFile()) {
          allFiles.push({
            path: entry.relativePath,
            name: entry.fileName,
            mtime: st.mtimeMs,
            score: 0,
          });
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // If we can't read the workspace, return empty
    return { files: [] };
  }

  // 2. Get git recency weights (if available)
  const recentFiles = getGitRecentFiles(workDir);
  const recentSet = new Set(recentFiles);

  // 3. Score each file
  const scored = allFiles.map((f) => {
    let score = 0;

    // Git recency bonus
    if (recentSet.has(f.path)) {
      const recencyIndex = recentFiles.indexOf(f.path);
      score += Math.max(0, 100 - recencyIndex); // earlier = higher bonus
    }

    // mtime bonus (normalized to 0-50)
    const now = Date.now();
    const ageHours = (now - f.mtime) / (1000 * 60 * 60);
    score += Math.max(0, 50 - ageHours); // recent files get bonus

    // Query-match bonus
    if (query) {
      const lowerName = f.name.toLowerCase();
      const lowerPath = f.path.toLowerCase();
      const lowerQuery = query.toLowerCase();

      if (lowerName === lowerQuery) {
        score += 200; // Exact name match
      } else if (lowerName.startsWith(lowerQuery)) {
        score += 100; // Prefix match
      } else if (lowerName.includes(lowerQuery)) {
        score += 50; // Substring match
      } else if (lowerPath.includes(lowerQuery)) {
        score += 20; // Path contains query
      } else if (fuzzyMatch(lowerName, lowerQuery)) {
        score += 10; // Fuzzy match
      } else {
        score = -1; // No match at all
      }
    }

    return { ...f, score };
  });

  // 4. Filter and sort
  const filtered = scored
    .filter((f) => f.score >= 0)
    .sort((a, b) => b.score - a.score);

  // 5. Limit results
  const limit = query ? 50 : 15;
  const files = filtered.slice(0, limit);

  return { files };
}

// ── Helpers ────────────────────────────────────────────────────────────

interface FileEntry {
  fullPath: string;
  relativePath: string;
  fileName: string;
}

function listFilesRecursive(rootDir: string, currentDir: string, maxDepth: number): FileEntry[] {
  if (maxDepth < 0) return [];

  const results: FileEntry[] = [];
  try {
    const entries = readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // Skip hidden files/dirs
      if (entry.name === 'node_modules') continue; // Skip node_modules

      const fullPath = join(currentDir, entry.name);
      const relativePath = relative(rootDir, fullPath);

      if (entry.isDirectory()) {
        results.push(...listFilesRecursive(rootDir, fullPath, maxDepth - 1));
      } else if (entry.isFile()) {
        results.push({ fullPath, relativePath, fileName: entry.name });
      }
    }
  } catch {
    // Skip directories we can't read
  }
  return results;
}

function getGitRecentFiles(workDir: string): string[] {
  try {
    const output = execSync(
      'git log --name-only --pretty=format: --max-count=50 --diff-filter=ACM',
      { cwd: workDir, encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const files = output
      .split('\n')
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
    // Deduplicate preserving order
    return [...new Set(files)];
  } catch {
    return [];
  }
}

function fuzzyMatch(text: string, query: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < query.length; ti++) {
    if (text[ti] === query[qi]) {
      qi++;
    }
  }
  return qi === query.length;
}
