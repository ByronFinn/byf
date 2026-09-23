/**
 * AC-5.3 (PRD-0038 R5) — a change to a publishable package needs a changeset.
 *
 * `bun run publish` / release-npm.yml derive versions from `.changeset/*.md`. Until
 * now nothing checked that a PR touching e.g. `packages/agent-core/src/**` actually
 * added one, so a merged change could silently ship with no version bump and no
 * changelog line — or, worse, ride along inside someone else's bump.
 *
 * Two sides, both required by the AC:
 *   - hard red when a *publishable* package's shippable content changes with no
 *     changeset naming that package;
 *   - no false red for pure docs / test-only / internal-tooling changes, which is
 *     what `gen-changesets` rule 6 already says ("纯文档 / 纯测试改动通常不需要
 *     changeset") — enforced here instead of remembered.
 *
 * The publishable set is *not* duplicated here: it comes from
 * `scripts/lib/list-publishable-packages.mjs` (AC-2.2), so this gate and the
 * publish set can never drift apart.
 *
 * Shape follows `scripts/lib/check-app-layering.mjs`: pure functions over text +
 * an explicit, reasoned exemption list + a negative self-test.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { listPublishablePackages } from './list-publishable-packages.mjs';

/**
 * Paths inside a publishable package that do not ship and therefore do not need a
 * changeset. Kept as an explicit list with reasons so it cannot silently widen.
 *
 * @type {ReadonlyArray<{ pattern: RegExp, reason: string }>}
 */
export const CHANGESET_EXEMPT_PATHS = Object.freeze([
  {
    pattern: /(^|\/)(?:test|tests|__tests__)\//,
    reason: 'test sources are not published (excluded by every package `files` list)',
  },
  { pattern: /\.test\.[cm]?[jt]sx?$/, reason: 'test colocated with source, not shipped' },
  { pattern: /\.md$/, reason: 'prose: README / docs / CHANGELOG (gen-changesets rule 6)' },
  { pattern: /^\.changeset\//, reason: 'the changesets themselves' },
  { pattern: /(^|\/)AGENTS\.md$/, reason: 'agent instructions, not package content' },
]);

/**
 * A changesets *version* commit moves every package.json + CHANGELOG.md and drains
 * `.changeset/`. Requiring a new changeset for it would deadlock the release, so a
 * diff made only of those paths is exempt.
 */
const RELEASE_BUMP_PATH = /(^|\/)(?:package\.json|CHANGELOG\.md)$|(?:^|\/)\.changeset\/[^/]+\.md$/;

export function isReleaseBumpDiff(changedPaths) {
  return (
    changedPaths.length > 0 && changedPaths.every((candidate) => RELEASE_BUMP_PATH.test(candidate))
  );
}

/**
 * Parse the frontmatter of one changeset file.
 *
 * @param {string} text full `.changeset/<name>.md` content
 * @returns {{ packages: string[], bumps: Record<string, string> }}
 */
export function parseChangeset(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return { packages: [], bumps: {} };
  const bumps = {};
  for (const line of (match[1] ?? '').split('\n')) {
    const entry = /^\s*['"]?([^'":\s]+)['"]?\s*:\s*['"]?(patch|minor|major)['"]?\s*,?\s*$/.exec(
      line,
    );
    if (!entry?.[1] || !entry[2]) continue;
    bumps[entry[1]] = entry[2];
  }
  return { packages: Object.keys(bumps), bumps };
}

/** Longest workspace prefix wins, so `apps/web/server` beats `apps`. */
function owningPackage(changedPath, packagesByDir) {
  let best = null;
  for (const [dir, name] of packagesByDir) {
    const prefix = `${dir}/`;
    if (!changedPath.startsWith(prefix)) continue;
    if (best === null || dir.length > best.dir.length) best = { dir, name };
  }
  return best;
}

export function isExemptPath(changedPath) {
  return CHANGESET_EXEMPT_PATHS.some((entry) => entry.pattern.test(changedPath));
}

/**
 * @param {object} input
 * @param {string[]} input.changedPaths repository-relative paths
 * @param {Array<{ name: string, packages: string[] }>} input.changesets parsed `.changeset/*.md`
 * @param {Array<{ name: string, path: string }>} input.publishablePackages
 * @param {string} repoRoot absolute repository root, for turning package dirs relative
 * @returns {{ missing: Array<{ package: string, changesetPackages: string[], samplePaths: string[] }>, releaseBump: boolean }}
 */
export function findMissingChangesets({ changedPaths, changesets, publishablePackages, repoRoot }) {
  if (isReleaseBumpDiff(changedPaths)) return { missing: [], releaseBump: true };

  const packagesByDir = new Map(
    publishablePackages.map((pkg) => [toRepoRelative(repoRoot, pkg.path), pkg.name]),
  );
  const declared = new Set(changesets.flatMap((entry) => entry.packages));

  /** @type {Map<string, string[]>} */
  const touched = new Map();
  for (const changedPath of changedPaths) {
    if (isExemptPath(changedPath)) continue;
    const owner = owningPackage(changedPath, packagesByDir);
    if (owner === null) continue; // docs / scripts / CI — outside any published package
    touched.set(owner.name, [...(touched.get(owner.name) ?? []), changedPath]);
  }

  const missing = [...touched.entries()]
    .filter(([name]) => !declared.has(name))
    .map(([name, paths]) => ({
      package: name,
      changesetPackages: [...declared].sort((a, b) => a.localeCompare(b)),
      samplePaths: paths.slice(0, 3),
    }))
    .sort((a, b) => a.package.localeCompare(b.package));

  return { missing, releaseBump: false };
}

function toRepoRelative(repoRoot, absolute) {
  return path.relative(repoRoot, absolute).split(path.sep).join('/').replace(/\/$/, '');
}

/**
 * Collect changed paths against a base ref.
 *
 * @param {string} repoRoot
 * @param {string} baseRef
 * @param {(cmd: string[], cwd: string) => string} runGit injected for testability
 */
export function collectChangedPaths(repoRoot, baseRef, runGit) {
  const diff = runGit(['diff', '--name-only', `${baseRef}...HEAD`], repoRoot);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard'], repoRoot);
  return [
    ...new Set(
      `${diff}\n${untracked}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * @param {string} repoRoot
 * @returns {Promise<Array<{ file: string, name: string, packages: string[] }>>}
 */
export async function readPendingChangesets(repoRoot) {
  const dir = path.join(repoRoot, '.changeset');
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const result = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.md') || entry === 'README.md') continue;
    const text = await readFile(path.join(dir, entry), 'utf8');
    const { packages } = parseChangeset(text);
    result.push({ file: `.changeset/${entry}`, name: entry, packages });
  }
  return result;
}

/**
 * Run the gate against the working tree.
 *
 * @param {string} repoRoot
 * @param {string[]} changedPaths
 */
export async function checkChangesetCoverage(repoRoot, changedPaths) {
  const publishable = await listPublishablePackages();
  const changesets = await readPendingChangesets(repoRoot);
  return {
    ...findMissingChangesets({
      changedPaths,
      changesets,
      publishablePackages: publishable,
      repoRoot,
    }),
    changesets,
    publishableNames: publishable.map((pkg) => pkg.name).sort(),
  };
}
