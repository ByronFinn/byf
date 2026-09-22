/**
 * PRD-0038 release review — machine checks over the *shape* of the release
 * pipeline, not over whether it happens to be green.
 *
 * Everything in this file exists because of one specific failure mode this
 * repository has now hit three times: **a green pipeline that verified the wrong
 * thing.**
 *
 * 1. `.github/workflows/release.yml` used to build with `bun run build:packages`,
 *    whose filter is `./packages/*`. The SPA lives in
 *    `apps/web/server/dist/public` (staged there by
 *    `apps/web/scripts/copy-web-dist.mjs`, the last step of
 *    `@byfriends/web-server`'s own build), so on the release path that directory
 *    never existed, `writeEmbeddedAssetsEntry` returned `null`,
 *    `apps/cli/scripts/compile/build.mjs` printed
 *    `==> web SPA assets not found … (byf web will be API-only)` and exited **0**.
 *    Verified against the shipped artifact rather than the YAML: `byf` inside
 *    `byf-linux-x64.zip` from the `@byfriends/cli@0.6.1` release contains zero
 *    `assets/index-*.js` strings and exactly two `/$bunfs/root/` entries
 *    (`byf`, `clipboard.linux-x64-gnu-*.node`) — i.e. every binary ever published
 *    shipped an API-only `byf web` / `byf vis`.
 * 2. The only CI job that ever embedded the SPA was `ci.yml` → `macos-smoke`
 *    (job 106199441931: `==> Embedded web SPA assets from
 *    …/apps/web/server/dist/public`) — because its `bun run typecheck` step
 *    builds the web workspace as a side effect. The verification step was
 *    silently supplying the release step's precondition, which is exactly why
 *    these tests assert the two jobs feed compile with *the same command*.
 * 3. `scripts/compile/build.mjs` once emitted `(globalThis as …).__BYF_…`
 *    (fixed in 36064cf). Its commit message reads 「带 SPA 资产时官方 release
 *    管线产不出二进制」 — which is only true *where assets are present*, a state
 *    the official pipeline never reached. The severity narrative belongs in
 *    PRD-0038; what belongs here is the check that a workbench-less binary can
 *    never again be produced without somebody noticing.
 *
 * The assertions are written as pure predicates over text so the last `describe`
 * block can feed each one a **mutated copy** of the real input and require it to
 * go red. A shape check that has never been observed to fail is a decoration,
 * and this pipeline's history is green checks that verified nothing.
 *
 * No `process.cwd()` anywhere: this file is run per-test-file by
 * `build/run-tests.mjs` from the repo root *and* by a bare
 * `bun test scripts/lib/release-workflow-shape.test.ts` from anywhere else, and a
 * cwd-relative root produces false reds on the second path.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..');

const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';
const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const BUILD_SCRIPT_PATH = 'apps/cli/scripts/compile/build.mjs';
const SMOKE_SCRIPT_PATH = 'apps/cli/scripts/native/smoke.mjs';
const COPY_WEB_DIST_PATH = 'apps/web/scripts/copy-web-dist.mjs';

/** The two package tasks that put built SPA assets where `build.mjs` looks. */
const SPA_PROVIDER_TASKS = ['@byfriends/web-client#build', '@byfriends/web-server#build'];

/** The single canonical full build both workflows must feed compile with. */
const CANONICAL_BUILD = 'bun run build';

/** Where the compile pipeline embeds from, relative to the repo root. */
const SPA_PUBLIC_DIR_RELATIVE = 'apps/web/server/dist/public';

const COMPILE_TASK = 'build:native:release';
const SMOKE_TASK = 'test:native:smoke';

// ---------------------------------------------------------------------------
// fixtures / types
// ---------------------------------------------------------------------------

interface PackageJsonLike {
  name?: string;
  private?: boolean;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

interface WorkflowStep {
  order: number;
  name: string | null;
  uses: string | null;
  run: string | null;
}

interface WorkflowJob {
  id: string;
  steps: WorkflowStep[];
}

async function readRepoFile(relativePath: string): Promise<string> {
  return await readFile(path.join(REPO_ROOT, relativePath), 'utf8');
}

async function readRepoJson(relativePath: string): Promise<PackageJsonLike> {
  return JSON.parse(await readRepoFile(relativePath)) as PackageJsonLike;
}

const RELEASE_TEXT = await readRepoFile(RELEASE_WORKFLOW_PATH);
const CI_TEXT = await readRepoFile(CI_WORKFLOW_PATH);
const ROOT_MANIFEST = await readRepoJson('package.json');
const ROOT_SCRIPTS = ROOT_MANIFEST.scripts ?? {};
const BUILD_SCRIPT_TEXT = await readRepoFile(BUILD_SCRIPT_PATH);
const SMOKE_SCRIPT_TEXT = await readRepoFile(SMOKE_SCRIPT_PATH);
const COPY_WEB_DIST_TEXT = await readRepoFile(COPY_WEB_DIST_PATH);

// ---------------------------------------------------------------------------
// workflow reader — no YAML dependency, on purpose (precedent:
// scripts/lib/check-no-node-invocations.mjs's extractRunBlocks)
// ---------------------------------------------------------------------------

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/**
 * Minimal structural reader for GitHub workflow YAML: jobs, their ordered steps,
 * and each step's `name` / `uses` / `run`, including `|` / `>` block scalars.
 *
 * A helper like this can silently find nothing, which would turn every assertion
 * below into a vacuous pass; `describe('the checker is not a no-op')` and the
 * mutation block at the bottom exist to keep it honest.
 */
function parseWorkflow(text: string): WorkflowJob[] {
  const lines = text.split('\n');
  const jobs: WorkflowJob[] = [];
  let job: WorkflowJob | null = null;
  let step: WorkflowStep | null = null;
  let inSteps = false;
  let inJobs = false;
  let order = 0;
  let block: { step: WorkflowStep; body: string[] } | null = null;
  const STEP_FIELD_INDENT = 8;

  const closeBlock = (): void => {
    if (block === null) return;
    block.step.run = block.body.join('\n');
    block = null;
  };
  const closeStep = (): void => {
    closeBlock();
    if (step !== null && job !== null) job.steps.push(step);
    step = null;
  };
  const closeJob = (): void => {
    closeStep();
    if (job !== null) jobs.push(job);
    job = null;
    inSteps = false;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (block !== null) {
      if (trimmed.length === 0) {
        block.body.push('');
        continue;
      }
      if (indentOf(raw) > STEP_FIELD_INDENT) {
        block.body.push(raw.slice(STEP_FIELD_INDENT + 2));
        continue;
      }
      closeBlock();
    }

    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;
    const indent = indentOf(raw);

    if (indent === 0) {
      closeJob();
      inJobs = trimmed === 'jobs:';
      continue;
    }
    if (!inJobs) continue;

    if (indent === 2) {
      const jobId = /^([A-Za-z0-9_-]+):$/.exec(trimmed)?.[1];
      if (jobId !== undefined) {
        closeJob();
        job = { id: jobId, steps: [] };
        inSteps = false;
      }
      continue;
    }
    if (job === null) continue;

    if (indent === 4) {
      if (trimmed === 'steps:') {
        inSteps = true;
      } else {
        closeStep();
        inSteps = false;
      }
      continue;
    }
    if (!inSteps) continue;

    if (indent === 6 && trimmed.startsWith('- ')) {
      closeStep();
      const started: WorkflowStep = { order: order++, name: null, uses: null, run: null };
      step = started;
      const inline = /^([A-Za-z_-]+):\s*(.*)$/.exec(trimmed.slice(2).trim());
      if (inline !== null) applyStepField(started, inline[1] ?? '', (inline[2] ?? '').trim());
      continue;
    }
    if (step === null) continue;

    if (indent === STEP_FIELD_INDENT) {
      const field = /^([A-Za-z_-]+):\s*(.*)$/.exec(trimmed);
      if (field === null) continue;
      const value = (field[2] ?? '').trim();
      if (value === '|' || value === '|-' || value === '>' || value === '>-') {
        block = { step, body: [] };
        continue;
      }
      applyStepField(step, field[1] ?? '', value);
    }
  }
  closeJob();
  return jobs;
}

function applyStepField(step: WorkflowStep, key: string, value: string): void {
  const clean = value.replace(/^['"]/, '').replace(/['"]$/, '');
  if (key === 'name') step.name = clean;
  else if (key === 'uses') step.uses = clean;
  else if (key === 'run') step.run = clean;
}

function jobOf(jobs: WorkflowJob[], id: string): WorkflowJob {
  const found = jobs.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(
      `no job "${id}" (jobs found: ${jobs.map((entry) => entry.id).join(', ') || 'none'})`,
    );
  }
  return found;
}

function stepMatches(step: WorkflowStep, needle: string): boolean {
  return `${step.run ?? ''}\n${step.uses ?? ''}\n${step.name ?? ''}`.includes(needle);
}

function stepIndexOf(job: WorkflowJob, needle: string): number {
  return job.steps.findIndex((step) => stepMatches(step, needle));
}

/** The contiguous `#` comment block directly above the first line matching `needle`. */
function commentsAbove(text: string, needle: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line.includes(needle));
  if (at === -1) return '';
  const collected: string[] = [];
  for (let i = at - 1; i >= 0; i--) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      collected.push(trimmed.replace(/^#+\s?/, ''));
      continue;
    }
    if (trimmed.length === 0 && collected.length === 0) continue;
    break;
  }
  return collected.toReversed().join('\n');
}

function macosTestComment(ciText: string): string {
  const marker = ciText.indexOf('  macos-smoke:');
  if (marker === -1) return '';
  return commentsAbove(ciText.slice(marker), '- name: Test');
}

// ---------------------------------------------------------------------------
// package.json script closure (pure over the manifest, so it is mutation-testable)
// ---------------------------------------------------------------------------

function scriptRefs(command: string): { roots: string[]; tasks: string[] } {
  const roots: string[] = [];
  const tasks: string[] = [];
  for (const match of command.matchAll(/bun run --filter\s+['"]?([^\s'"]+)['"]?\s+([\w:.-]+)/g)) {
    const pkg = match[1];
    const task = match[2];
    if (pkg !== undefined && task !== undefined) tasks.push(`${pkg}#${task}`);
  }
  for (const match of command.matchAll(/bun run\s+(?!-)([\w:.-]+)/g)) {
    const name = match[1];
    if (name !== undefined) roots.push(name);
  }
  return { roots, tasks };
}

/**
 * Transitive closure of a root script: which root scripts and which
 * `<package>#<task>` invocations it reaches. This is what lets the assertions
 * talk about the pipeline instead of about a step's display name.
 */
function rootScriptClosure(scripts: Record<string, string>, entry: string): Set<string> {
  const roots = new Set<string>();
  const tasks = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || roots.has(name)) continue;
    roots.add(name);
    const body = scripts[name];
    if (body === undefined) continue;
    const refs = scriptRefs(body);
    for (const task of refs.tasks) tasks.add(task);
    for (const nested of refs.roots) {
      if (!roots.has(nested)) queue.push(nested);
    }
  }
  return tasks;
}

/** True when running `command` provably produces the built SPA asset directory. */
function commandSuppliesWebSpa(command: string, scripts: Record<string, string>): boolean {
  const refs = scriptRefs(command);
  const seen = new Set(refs.tasks);
  for (const root of refs.roots) {
    for (const task of rootScriptClosure(scripts, root)) seen.add(task);
  }
  return SPA_PROVIDER_TASKS.every((task) => seen.has(task));
}

interface CompileFeederReport {
  jobFound: boolean;
  compileIndex: number;
  feederRun: string;
  feederIsCanonical: boolean;
  feederSuppliesSpa: boolean;
}

/** What actually runs immediately before a job's compile step, and whether it is enough. */
function compileFeederReport(
  workflowText: string,
  jobId: string,
  scripts: Record<string, string>,
): CompileFeederReport {
  const jobs = parseWorkflow(workflowText);
  const job = jobs.find((entry) => entry.id === jobId);
  if (job === undefined) {
    return {
      jobFound: false,
      compileIndex: -1,
      feederRun: '',
      feederIsCanonical: false,
      feederSuppliesSpa: false,
    };
  }
  const compileIndex = stepIndexOf(job, COMPILE_TASK);
  const feederRun = (job.steps[compileIndex - 1]?.run ?? '').trim();
  return {
    jobFound: true,
    compileIndex,
    feederRun,
    feederIsCanonical: feederRun === CANONICAL_BUILD,
    feederSuppliesSpa: compileIndex >= 1 && commandSuppliesWebSpa(feederRun, scripts),
  };
}

/** `run:` lines only, so a prose comment can never satisfy or violate these checks. */
function runLinesOf(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => /^\s*(?:-\s+)?run:/.test(line))
    .map((line) => line.trim());
}

/** How many times build.mjs consults the release-family asset policy. */
function policyCallCount(buildScriptText: string): number {
  return buildScriptText.match(/webAssetEmbeddingPolicy\(/g)?.length ?? 0;
}

function buildScriptImportsPolicy(buildScriptText: string): boolean {
  // The *import*, not a prose mention of the filename — a comment alone would
  // satisfy `includes('web-asset-policy.mjs')` and leave the gate dead.
  return /from '\.\/web-asset-policy\.mjs'/.test(buildScriptText);
}

function buildScriptFailsOnPolicy(buildScriptText: string): boolean {
  return buildScriptText.includes('spaPolicy.fatal');
}

/** copy-web-dist's destination, as the relative directory it lands in. */
function copyWebDistTarget(copyText: string): string | null {
  const match = /const dst = join\(root,\s*((?:'[^']+',?\s*)+)\)/.exec(copyText);
  if (match === null) return null;
  const parts = [...(match[1] ?? '').matchAll(/'([^']+)'/g)].map((part) => part[1] ?? '');
  return parts.length === 0 ? null : path.posix.join('apps/web', ...parts);
}

/** The directory build.mjs embeds, resolved against the repo root. */
function embeddedAssetDir(buildScriptText: string): string | null {
  const match = /const webServerPublicDir = resolve\(appRoot, '([^']+)'\)/.exec(buildScriptText);
  if (match === null) return null;
  return path.posix.normalize(path.posix.join('apps/cli', match[1] ?? ''));
}

function smokeChecksEmbeddedSpa(smokeText: string): boolean {
  return (
    smokeText.includes('assertEmbeddedSpaServesOverHttp') &&
    smokeText.includes('await assertEmbeddedSpaServesOverHttp();') &&
    smokeText.includes("'web'") &&
    smokeText.includes('MIN_SPA_CHUNK_BYTES')
  );
}

/** Workspace directories that would re-admit the deleted visualizer by path. */
function visPathLeaks(dirs: string[]): string[] {
  return dirs.filter((dir) => dir === 'apps/vis' || dir.startsWith('apps/vis/'));
}

function visNameLeaks(entries: Array<{ dir: string; name: string | undefined }>): string[] {
  return entries
    .filter((entry) => entry.name === '@byfriends/vis-server')
    .map((entry) => `${entry.dir} (name)`);
}

// ---------------------------------------------------------------------------
// fs helpers
// ---------------------------------------------------------------------------

async function readDirNames(absDir: string): Promise<string[]> {
  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/** Expand the root `workspaces` globs into the directories Bun treats as packages. */
async function expandWorkspaceDirs(): Promise<string[]> {
  const declared = ROOT_MANIFEST.workspaces;
  const globs = Array.isArray(declared) ? declared : (declared?.packages ?? []);
  const dirs = new Set<string>();
  for (const glob of globs) {
    if (glob.endsWith('/*')) {
      const prefix = glob.slice(0, -2);
      for (const child of await readDirNames(path.join(REPO_ROOT, prefix))) {
        if (child.startsWith('.')) continue;
        dirs.add(path.posix.join(prefix, child));
      }
      continue;
    }
    if (glob.endsWith('/*/*')) {
      const outer = glob.slice(0, -4);
      for (const middle of await readDirNames(path.join(REPO_ROOT, outer))) {
        const inner = path.posix.join(outer, middle);
        for (const leaf of await readDirNames(path.join(REPO_ROOT, inner))) {
          dirs.add(path.posix.join(inner, leaf));
        }
      }
      continue;
    }
    dirs.add(glob);
  }
  return [...dirs].sort((a, b) => a.localeCompare(b));
}

async function pathExists(relativePath: string): Promise<boolean> {
  try {
    await readFile(path.join(REPO_ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// shared failure text for the merge guard
// ---------------------------------------------------------------------------

const MERGE_NOTE =
  'Reproduce with `git merge-tree --write-tree main HEAD`: it reports `CONFLICT ' +
  '(modify/delete): apps/vis/server/package.json deleted in HEAD and modified in main` and ' +
  "leaves main's version in the merged tree, so `apps/vis/server/{package.json,CHANGELOG.md}` " +
  "come back. Root `workspaces` includes `apps/*`, and main's vis-server manifest carries " +
  'publishConfig + files + a build script, so @byfriends/vis-server re-enters BOTH the workspace ' +
  'graph and the publish set — undoing AC-5.6. Resolve by deleting, never by keeping: run ' +
  '`git rm -r apps/vis` at conflict time, then re-run `bun run test`, `bun run sherif` and ' +
  '`bun run gate:changesets` on the merged result before pushing.';

// ---------------------------------------------------------------------------
// 0. the reader itself
// ---------------------------------------------------------------------------

describe('release-workflow-shape: the reader is not a no-op', () => {
  it('discovers the jobs and steps every assertion below depends on', () => {
    expect(parseWorkflow(RELEASE_TEXT).map((job) => job.id)).toEqual(
      expect.arrayContaining(['build-native', 'release']),
    );
    expect(parseWorkflow(CI_TEXT).map((job) => job.id)).toEqual(
      expect.arrayContaining(['quality', 'macos-smoke']),
    );

    const buildNative = jobOf(parseWorkflow(RELEASE_TEXT), 'build-native');
    expect(buildNative.steps.length).toBeGreaterThanOrEqual(10);
    for (const needle of [COMPILE_TASK, SMOKE_TASK, 'package:native', 'package:npm-platforms']) {
      expect(stepIndexOf(buildNative, needle), `missing step for ${needle}`).toBeGreaterThanOrEqual(
        1,
      );
    }

    const macos = jobOf(parseWorkflow(CI_TEXT), 'macos-smoke');
    expect(stepIndexOf(macos, COMPILE_TASK)).toBeGreaterThanOrEqual(1);
    expect(stepIndexOf(macos, SMOKE_TASK)).toBeGreaterThanOrEqual(1);

    // Block scalars survive the parse, or the npm publish step would look empty.
    const releaseJob = jobOf(parseWorkflow(RELEASE_TEXT), 'release');
    const publish = releaseJob.steps.find((step) => (step.run ?? '').includes('npm publish'));
    expect(publish?.run ?? '').toContain('npm publish');
    // …and the reader does not mistake YAML noise for commands.
    expect(runLinesOf(RELEASE_TEXT).length).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// F1 — the release pipeline must build the SPA, and cannot ship without it
// ---------------------------------------------------------------------------

describe('F1: the release pipeline builds the SPA and cannot silently drop it', () => {
  it('both workflows feed their compile step with the SAME canonical full build', () => {
    const release = compileFeederReport(RELEASE_TEXT, 'build-native', ROOT_SCRIPTS);
    const macos = compileFeederReport(CI_TEXT, 'macos-smoke', ROOT_SCRIPTS);

    expect(release.jobFound && macos.jobFound, 'a workflow lost the job this check reads').toBe(
      true,
    );
    expect(
      macos.feederRun,
      `macos-smoke compiles after "${macos.feederRun}" while release.yml compiles after ` +
        `"${release.feederRun}". They must be one command: the day they differ, the macOS job ` +
        `can go green by building what the release job never builds — which is exactly how ` +
        `@byfriends/cli@0.6.1 shipped an API-only \`byf web\` out of an all-green CI.`,
    ).toBe(release.feederRun);
    expect(release.feederIsCanonical, `release feeder was "${release.feederRun}"`).toBe(true);
    expect(macos.feederIsCanonical, `macos feeder was "${macos.feederRun}"`).toBe(true);
  });

  it('that command reaches the web SPA through package.json, not through a step name', () => {
    const tasks = rootScriptClosure(ROOT_SCRIPTS, 'build');
    for (const provider of SPA_PROVIDER_TASKS) {
      expect(
        tasks.has(provider),
        `root "build" must reach ${provider}; it reached ${[...tasks].join(', ') || '(nothing)'}. ` +
          'If apps/web was renamed or a build step dropped, release binaries go back to being ' +
          'API-only — fix the build sequence, do not relax this test.',
      ).toBe(true);
    }
    expect(compileFeederReport(RELEASE_TEXT, 'build-native', ROOT_SCRIPTS).feederSuppliesSpa).toBe(
      true,
    );
    expect(compileFeederReport(CI_TEXT, 'macos-smoke', ROOT_SCRIPTS).feederSuppliesSpa).toBe(true);
  });

  it('release.yml never narrows a run step back to build:packages', () => {
    const offenders = runLinesOf(RELEASE_TEXT).filter((line) => line.includes('build:packages'));
    expect(
      offenders,
      '`bun run build:packages` filters ./packages/* only, so it never builds the SPA. That is ' +
        'precisely how every published binary through @byfriends/cli@0.6.1 shipped API-only.',
    ).toEqual([]);
    expect(runLinesOf(RELEASE_TEXT)).toContain(`run: ${CANONICAL_BUILD}`);
  });

  it('the directory the pipeline embeds from is the directory the SPA build writes to', () => {
    // Chain: @byfriends/web-server#build -> copy-web-dist.mjs -> that directory
    // -> build.mjs embeds it. If any link is renamed the embed silently degrades
    // to "nothing found" — the exact failure this file exists to prevent.
    expect(embeddedAssetDir(BUILD_SCRIPT_TEXT)).toBe(SPA_PUBLIC_DIR_RELATIVE);
    expect(copyWebDistTarget(COPY_WEB_DIST_TEXT)).toBe(SPA_PUBLIC_DIR_RELATIVE);
  });

  it('the native smoke runs before anything is packaged or uploaded', () => {
    const buildNative = jobOf(parseWorkflow(RELEASE_TEXT), 'build-native');
    const smokeAt = stepIndexOf(buildNative, SMOKE_TASK);
    expect(smokeAt).toBeGreaterThanOrEqual(0);
    for (const needle of ['package:native', 'package:npm-platforms', 'upload-artifact']) {
      const at = stepIndexOf(buildNative, needle);
      expect(
        at,
        `"${needle}" must run after the smoke step (found at ${String(at)}, smoke at ` +
          `${String(smokeAt)}): nothing a user receives may be packaged before something ran it`,
      ).toBeGreaterThan(smokeAt);
    }
  });

  it('build.mjs consults the release-family asset policy on both paths', () => {
    // The pure policy itself is exercised below; this asserts the production
    // script cannot dodge it — an unused module is a dead gate.
    expect(buildScriptImportsPolicy(BUILD_SCRIPT_TEXT)).toBe(true);
    expect(policyCallCount(BUILD_SCRIPT_TEXT)).toBeGreaterThanOrEqual(2);
    expect(buildScriptFailsOnPolicy(BUILD_SCRIPT_TEXT)).toBe(true);
  });

  it('the policy aborts a release build with no SPA and stays quiet for local', async () => {
    const policyUrl = new URL(
      '../../apps/cli/scripts/compile/web-asset-policy.mjs',
      import.meta.url,
    ).href;
    const mod = (await import(policyUrl)) as unknown as {
      webAssetEmbeddingPolicy: (input: {
        profile: string;
        assetsFound: boolean;
        publicDir: string;
      }) => { fatal: boolean; message: string };
    };
    const publicDir = '/tmp/release-workflow-shape/absent/dist/public';

    for (const profile of ['release', 'bytecode']) {
      const verdict = mod.webAssetEmbeddingPolicy({ profile, assetsFound: false, publicDir });
      expect(verdict.fatal, `--profile=${profile} must abort when there is no SPA`).toBe(true);
      // The old failure was silent *and* unactionable; the message must name the
      // command that fixes it.
      expect(verdict.message).toContain('bun run build:web');
      expect(verdict.message).toContain(CANONICAL_BUILD);
    }
    expect(
      mod.webAssetEmbeddingPolicy({ profile: 'local', assetsFound: false, publicDir }).fatal,
      '--profile=local must keep working without a built SPA',
    ).toBe(false);
    for (const profile of ['local', 'release', 'bytecode']) {
      expect(
        mod.webAssetEmbeddingPolicy({ profile, assetsFound: true, publicDir }).fatal,
        `${profile} with assets must not abort`,
      ).toBe(false);
    }
  });

  it('test:native:smoke actually asserts the SPA over HTTP, with no skip branch', () => {
    // The smoke is the only thing standing between "the binary boots" and "the
    // binary has a workbench"; a quietly-skipped check is the same bug again.
    expect(smokeChecksEmbeddedSpa(SMOKE_SCRIPT_TEXT)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F2 — apps/vis must stay out of the workspace and publish graphs
// ---------------------------------------------------------------------------

describe('F2: the deleted @byfriends/vis-server must not come back through a merge', () => {
  it('the tree carries no apps/vis after PRD-0038 R5', async () => {
    for (const candidate of [
      'apps/vis',
      'apps/vis/server/package.json',
      'apps/vis/server/CHANGELOG.md',
    ]) {
      expect(await pathExists(candidate), `${candidate} reappeared. ${MERGE_NOTE}`).toBe(false);
    }
  });

  it('no expanded workspace entry is apps/vis or @byfriends/vis-server', async () => {
    const dirs = await expandWorkspaceDirs();
    expect(dirs.length, 'workspace glob expansion found nothing').toBeGreaterThan(5);
    const manifests = await Promise.all(
      dirs.map(async (dir) => {
        try {
          return { dir, name: (await readRepoJson(path.posix.join(dir, 'package.json'))).name };
        } catch {
          return { dir, name: undefined };
        }
      }),
    );
    const leaks = [...visPathLeaks(dirs), ...visNameLeaks(manifests)];
    expect(
      leaks,
      `the workspace graph admits the deleted visualizer: ${leaks.join(', ')}. ${MERGE_NOTE}`,
    ).toEqual([]);
  });

  it('the publish set excludes @byfriends/vis-server', async () => {
    // scripts/lib/publishability.test.ts already pins the set to
    // EXPECTED_PUBLISH_SET, which does not contain vis-server, so a merge cannot
    // re-add it to `changeset publish` quietly. This is the named, merge-specific
    // duplicate whose failure text says what to do about it.
    const helperUrl = new URL('./list-publishable-packages.mjs', import.meta.url).href;
    const mod = (await import(helperUrl)) as unknown as {
      inspectPublishablePackages: () => Promise<{ included: Array<{ name: string }> }>;
    };
    const { included } = await mod.inspectPublishablePackages();
    expect(
      included.map((pkg) => pkg.name),
      MERGE_NOTE,
    ).not.toContain('@byfriends/vis-server');
  });

  it('the CLI platform package name agrees across table, launcher, manifests and optionalDeps', async () => {
    // main renamed the Linux platform package to @byfriends/cli-linux (the old
    // name is locked by an npm unpublish) across four surfaces at once. The
    // three-way merge takes main's copy of each *individually and cleanly*, so a
    // half-applied rename is possible; this makes it loud.
    const cliManifest = await readRepoJson('apps/cli/package.json');
    const optional = Object.keys(cliManifest.optionalDependencies ?? {}).sort((a, b) =>
      a.localeCompare(b),
    );
    const table = await readRepoFile('apps/cli/scripts/npm/platform-packages.mjs');
    const tableNames = [...table.matchAll(/packageName:\s*'([^']+)'/g)]
      .map((match) => match[1] ?? '')
      .sort((a, b) => a.localeCompare(b));
    const launcher = await readRepoFile('apps/cli/bin/byf.cjs');
    const launcherNames = new Set(
      [...launcher.matchAll(/packageName:\s*'([^']+)'/g)].map((match) => match[1] ?? ''),
    );
    const manifestNames: string[] = [];
    for (const dir of await readDirNames(path.join(REPO_ROOT, 'apps/cli/npm'))) {
      const manifest = await readRepoJson(path.posix.join('apps/cli/npm', dir, 'package.json'));
      if (typeof manifest.name === 'string') manifestNames.push(manifest.name);
    }
    manifestNames.sort((a, b) => a.localeCompare(b));

    expect(tableNames.length).toBeGreaterThanOrEqual(2);
    expect(optional, '@byfriends/cli optionalDependencies must match the platform table').toEqual(
      tableNames,
    );
    expect(
      manifestNames,
      'apps/cli/npm/*/package.json names must match the platform table',
    ).toEqual(tableNames);
    for (const name of tableNames) {
      expect(launcherNames.has(name), `bin/byf.cjs must know ${name}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// F3 — CI comments must state the conclusion they were written to test
// ---------------------------------------------------------------------------

describe('F3: the macOS concurrency comment carries the adjudicated conclusion', () => {
  it("records #343's outcome, the run that proved it, and the trigger to undo it", () => {
    const comment = macosTestComment(CI_TEXT);
    expect(comment.length, 'no comment block above the macOS Test step').toBeGreaterThan(0);
    expect(
      comment,
      'BYF_TEST_CONCURRENCY must state the adjudicated conclusion, not the original hypothesis: ' +
        '#343 closed 2026-09-21 with run 35555363429 as the evidence',
    ).toContain('#343');
    expect(comment).toContain('35555363429');
    expect(comment).toContain('BYF_TEST_CONCURRENCY');
    expect(comment.toLowerCase()).not.toContain('hypothesis under test');
    expect(comment).not.toContain('Green at 2 means');
    // A permanent >halving of macOS test throughput with no removal trigger is a
    // workaround nobody deletes.
    expect(comment, 'the re-test / removal trigger must live in the YAML').toContain('RE-TEST');
    expect(comment).toContain('cores');
  });

  it('states the inner-guard / it-timeout ordering invariant and its precedent', () => {
    const comment = macosTestComment(CI_TEXT);
    expect(comment).toContain('STRICTLY BELOW');
    expect(comment).toContain('connection-manager.test.ts');
    expect(comment).toContain('6d91a19');
  });
});

// ---------------------------------------------------------------------------
// the gate discriminates: every check above, replayed against a mutated input
// ---------------------------------------------------------------------------

describe('the gate discriminates (mutated inputs must go red)', () => {
  it('a release.yml that reverts to build:packages is detected', () => {
    const mutated = RELEASE_TEXT.replace(
      `      - name: Build (packages + CLI + web SPA)\n        run: ${CANONICAL_BUILD}\n`,
      '      - name: Build packages\n        run: bun run build:packages\n',
    );
    expect(mutated).not.toBe(RELEASE_TEXT);
    const report = compileFeederReport(mutated, 'build-native', ROOT_SCRIPTS);
    expect(report.feederIsCanonical).toBe(false);
    expect(report.feederSuppliesSpa).toBe(false);
    expect(
      runLinesOf(mutated)
        .filter((line) => line.includes('build:packages'))
        .join('\n'),
    ).toContain('build:packages');
  });

  it('a macos-smoke that stops running the canonical build is detected', () => {
    const at = CI_TEXT.indexOf(`      - name: Build (packages + CLI + web SPA)\n`);
    expect(at).toBeGreaterThan(0);
    const resumeAt = CI_TEXT.indexOf('      # The real shipped artifact', at);
    expect(
      resumeAt,
      'the mutation target moved; update this test so it keeps cutting the Build step out',
    ).toBeGreaterThan(at);
    const mutated = `${CI_TEXT.slice(0, at)}${CI_TEXT.slice(resumeAt)}`;
    expect(mutated).toContain('macos-smoke:');
    const report = compileFeederReport(mutated, 'macos-smoke', ROOT_SCRIPTS);
    expect(report.feederIsCanonical).toBe(false);
    expect(report.feederRun).not.toBe(
      compileFeederReport(RELEASE_TEXT, 'build-native', ROOT_SCRIPTS).feederRun,
    );
  });

  it('a root build script that drops build:web is detected', () => {
    const mutated: Record<string, string> = {
      ...ROOT_SCRIPTS,
      build: "bun run --filter './packages/*' build && bun run --filter '@byfriends/cli' build",
    };
    expect(rootScriptClosure(mutated, 'build').has(SPA_PROVIDER_TASKS[1] ?? '')).toBe(false);
    expect(commandSuppliesWebSpa(CANONICAL_BUILD, mutated)).toBe(false);
    // And the unmutated manifest really is the thing that passes.
    expect(commandSuppliesWebSpa(CANONICAL_BUILD, ROOT_SCRIPTS)).toBe(true);
  });

  it('a renamed SPA output directory on either side of the chain is detected', () => {
    expect(
      embeddedAssetDir(
        BUILD_SCRIPT_TEXT.replace(SPA_PUBLIC_DIR_RELATIVE, 'apps/web/x/dist/public'),
      ),
    ).not.toBe(SPA_PUBLIC_DIR_RELATIVE);
    expect(copyWebDistTarget(COPY_WEB_DIST_TEXT.replace("'public'", "'publik'"))).not.toBe(
      SPA_PUBLIC_DIR_RELATIVE,
    );
    expect(embeddedAssetDir(BUILD_SCRIPT_TEXT), 'the two must agree on the unmutated tree').toBe(
      copyWebDistTarget(COPY_WEB_DIST_TEXT),
    );
  });

  it('a build.mjs that bypasses the policy is detected', () => {
    expect(policyCallCount(BUILD_SCRIPT_TEXT)).toBeGreaterThanOrEqual(2);
    expect(policyCallCount(BUILD_SCRIPT_TEXT.replace(/webAssetEmbeddingPolicy\(/g, 'noop('))).toBe(
      0,
    );
    expect(
      buildScriptImportsPolicy(BUILD_SCRIPT_TEXT.replace(/web-asset-policy\.mjs/g, 'x.mjs')),
    ).toBe(false);
    expect(buildScriptFailsOnPolicy(BUILD_SCRIPT_TEXT.replace('spaPolicy.fatal', 'x'))).toBe(false);
  });

  it('a smoke that stops checking the SPA is detected', () => {
    expect(
      smokeChecksEmbeddedSpa(
        SMOKE_SCRIPT_TEXT.replace('await assertEmbeddedSpaServesOverHttp();', '// removed'),
      ),
    ).toBe(false);
    expect(smokeChecksEmbeddedSpa(SMOKE_SCRIPT_TEXT)).toBe(true);
  });

  it('a resurrected apps/vis is detected by path and by package name', () => {
    expect(visPathLeaks(['apps/cli', 'apps/web', 'apps/vis', 'apps/vis/server'])).toEqual([
      'apps/vis',
      'apps/vis/server',
    ]);
    expect(visPathLeaks(['apps/cli', 'apps/web'])).toEqual([]);
    expect(
      visNameLeaks([
        { dir: 'apps/cli', name: '@byfriends/cli' },
        { dir: 'apps/vis/server', name: '@byfriends/vis-server' },
      ]),
    ).toEqual(['apps/vis/server (name)']);
    expect(visNameLeaks([{ dir: 'apps/vis/server', name: undefined }])).toEqual([]);
  });

  it('a comment that drifts back to the original hypothesis is detected', () => {
    const mutated = CI_TEXT.replace(
      '# ADJUDICATED, not a hypothesis: these darwin hangs were runner load',
      '# Concurrency is dialled down from the default 10 on purpose, and it is a\n      # hypothesis under test rather than a workaround to keep:',
    );
    const comment = macosTestComment(mutated);
    expect(comment.toLowerCase()).toContain('hypothesis under test');
    // …which the real file does not.
    expect(macosTestComment(CI_TEXT).toLowerCase()).not.toContain('hypothesis under test');
  });

  it('a half-applied platform-package rename is detected', async () => {
    // Naming-agnostic on purpose: dev still says @byfriends/cli-linux-x64 and
    // main renamed it to @byfriends/cli-linux, so this must express "the four
    // surfaces disagree", not "the four surfaces say cli-linux-x64".
    const namesOf = (text: string): string[] =>
      [...text.matchAll(/packageName:\s*'([^']+)'/g)].map((match) => match[1] ?? '');
    const platformTable = await readRepoFile('apps/cli/scripts/npm/platform-packages.mjs');
    const cliManifest = await readRepoJson('apps/cli/package.json');
    const optional = Object.keys(cliManifest.optionalDependencies ?? {});

    expect(namesOf(platformTable).sort()).toEqual([...optional].sort());

    const mutatedTable = platformTable.replace(
      /packageName:\s*'[^']+'/,
      "packageName: '@byfriends/cli-solaris'",
    );
    expect(namesOf(mutatedTable)).not.toEqual(expect.arrayContaining(optional));
  });
});
