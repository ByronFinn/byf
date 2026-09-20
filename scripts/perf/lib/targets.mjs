/**
 * PRD-0038 R4 — arm definitions for the binary baseline.
 *
 * Three arms is not a stylistic choice: `bun src` measures the source tree,
 * `bun dist` measures the bundler, and the compiled binary measures the runtime
 * bootstrap. A two-arm design attributes the wrong delta to the wrong stage —
 * e.g. comparing only `bun src` against the binary lumps "bundle the graph"
 * together with "embed the interpreter", which have completely different fixes.
 * A `control` arm (bare `bun -e 0`) is added so the shared fork/exec + runtime
 * init floor can be subtracted instead of guessed at.
 */

import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { measureOnce, runOnce } from './bench.mjs';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const CLI_ROOT = join(REPO_ROOT, 'apps/cli');
export const NATIVE_BIN = join(CLI_ROOT, 'dist-native/bin/linux-x64/byf');
export const INTERMEDIATES = join(CLI_ROOT, 'dist-native/intermediates');
export const DIST_ENTRY = join(CLI_ROOT, 'dist/main.mjs');
export const SRC_ENTRY = join(CLI_ROOT, 'src/main.ts');

/**
 * A shell-ish tokenizer for the command `build.mjs` echoes to its log.
 *
 * Embedded double quotes are *kept*: `--define=__BYF_CODE_VERSION__="0.5.0"` is
 * a single argv element whose value must reach bun as the JS literal `"0.5.0"`,
 * not as the shell-stripped `0.5.0`.
 */
export function tokenizeCommand(line) {
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let started = false;
  for (const ch of line) {
    if (ch === '"') {
      current += ch;
      inQuotes = !inQuotes;
      started = true;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (started) tokens.push(current);
      current = '';
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) tokens.push(current);
  return tokens;
}

/**
 * An isolated BYF_HOME per process so a baseline run never reads the developer's
 * real config, session index or credentials — those would change both the timing
 * and the failure mode, and a CI runner must not touch user state.
 */
export function makePerfEnv(extra = {}) {
  const home = join(tmpdir(), `byf-perf-home-${process.pid}`);
  mkdirSync(home, { recursive: true });
  return {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: process.env.HOME ?? home,
    LANG: 'C.UTF-8',
    NO_COLOR: '1',
    TERM: 'xterm-256color',
    BYF_HOME: home,
    // Belt and braces: never let an ambient key leak into a startup measurement.
    ...extra,
  };
}

export function clearPerfHome(env) {
  if (typeof env?.BYF_HOME === 'string' && env.BYF_HOME.includes('byf-perf-home-')) {
    rmSync(env.BYF_HOME, { recursive: true, force: true });
  }
}

/**
 * Resolve the module graph a given entry would read at runtime, so the cold
 * recipe can evict exactly that set instead of guessing at directories.
 *
 * `bun build --metafile` is the only dependency-free way to ask this question:
 * it reports every input the resolver reaches, which is precisely the file set
 * whose pages must be absent for a launch to count as cold. Paths are relative
 * to `cwd`, matching bun's metafile output.
 */
export async function resolveColdSet(entry, cacheDir, buildCwd = CLI_ROOT) {
  mkdirSync(cacheDir, { recursive: true });
  const metaPath = join(cacheDir, `meta-${entry.replaceAll(/[^\w]/g, '_')}.json`);
  const outDir = join(cacheDir, 'discard');
  rmSync(outDir, { recursive: true, force: true });
  rmSync(metaPath, { force: true });
  const probe = await runOnce({
    argv: [
      process.execPath,
      'build',
      entry,
      '--target=bun',
      `--outdir=${outDir}`,
      `--metafile=${metaPath}`,
    ],
    // A relocated bundle must be resolved from its own directory, otherwise the
    // build fails and the caller silently ends up with a warm-only "cold" cell.
    cwd: buildCwd,
    env: makePerfEnv(),
    timeoutMs: 600_000,
  });
  if (probe.exitCode !== 0) {
    return { files: [], error: `metafile build failed (${probe.exitCode})` };
  }
  try {
    const meta = await Bun.file(metaPath).json();
    // bun reports metafile inputs relative to the build cwd; entries outside it
    // (e.g. a temp dist variant) come back absolute and must not be re-rooted.
    const files = Object.keys(meta.inputs ?? {}).map((rel) =>
      rel.startsWith('/') ? rel : resolve(buildCwd, rel),
    );
    rmSync(outDir, { recursive: true, force: true });
    return { files, error: null };
  } catch (error) {
    return { files: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Build the native binary through the official script, and fall back to a
 * byte-identical re-run of the command it logged when the known
 * `compile-entry.ts` syntax defect blocks the pipeline.
 *
 * The defect (apps/cli/scripts/compile/build.mjs, `writeCompileEntry`):
 * `(globalThis as Record<string, unknown>)${set.globalName} = ...` is emitted
 * without the member-access dot, so the generated entry fails to parse whenever
 * SPA assets are present. It is a build-script typo, not a profile choice, so it
 * is patched *in the generated intermediate* here rather than in the product
 * script: the measurement must not depend on touching production code.
 */
export async function ensureNativeBinary({
  outPath = NATIVE_BIN,
  quiet = false,
  force = false,
} = {}) {
  const say = (...args) => {
    if (!quiet) console.error(...args);
  };
  if (!force && Bun.file(outPath).size > 0) {
    return { path: outPath, source: 'preexisting', error: null };
  }

  const build = await runOnce({
    argv: [process.execPath, 'run', '--filter', '@byfriends/cli', 'build:native:compile'],
    cwd: REPO_ROOT,
    env: { ...makePerfEnv(), ...process.env },
    timeoutMs: 1_800_000,
  });
  const logged = /^.*==> bun build --compile .*$/m.exec(build.stdout + build.stderr);
  if (build.exitCode === 0 && Bun.file(outPath).size > 0) {
    return { path: outPath, source: 'official', error: null };
  }
  if (logged === null) {
    return { path: null, source: 'official-failed', error: 'no logged compile command' };
  }

  const output = build.stdout + build.stderr;
  if (logged !== null) {
    // Persist the product's own argv so A/B scripts inherit the exact defines
    // instead of re-deriving them and silently drifting.
    await Bun.write(join(INTERMEDIATES, 'official-argv.txt'), logged[0].replace(/^.*?==> /, ''));
  }
  if (!/Expected ";" but found "__BYF_WEB_EMBEDDED_ASSETS__"/.test(output)) {
    return {
      path: null,
      source: 'official-failed',
      error: `native build failed for an unexpected reason:\n${output.slice(-2000)}`,
    };
  }

  // Known defect: repair the generated entry only, then replay the logged argv.
  say(
    '[binary-baseline] WARN: apps/cli/scripts/compile/build.mjs emits an invalid ' +
      'compile-entry.ts (missing "." before __BYF_WEB_EMBEDDED_ASSETS__).\n' +
      '[binary-baseline] Falling back to a repaired intermediate + replayed compile command.',
  );
  const entryPath = join(INTERMEDIATES, 'compile-entry.ts');
  const entryText = await Bun.file(entryPath).text();
  // A replacer function, not a string: `$` is special in replacement strings and
  // `'$__'` would silently rewrite the identifier instead of restoring the dot.
  const repaired = entryText.replace(
    /\)\s*(__BYF_WEB_EMBEDDED_ASSETS__|__BYF_COMPILE_CATALOG__)\s*=/g,
    (_, name) => `).${name} = `,
  );
  if (repaired === entryText) {
    return { path: null, source: 'fallback', error: 'entry patch did not apply' };
  }
  if (!/\)\.__BYF_WEB_EMBEDDED_ASSETS__ = /.test(repaired)) {
    return { path: null, source: 'fallback', error: 'entry patch produced an invalid assignment' };
  }
  await Bun.write(join(INTERMEDIATES, 'compile-entry.bench.ts'), repaired);

  const argv = tokenizeCommand(logged[0].replace(/^.*?(==> )?bun /, '')).filter(Boolean);
  const args = argv[0] === 'bun' ? argv.slice(1) : argv;
  // Replay against the repaired entry; keep every other flag untouched.
  const entryIdx = args.findIndex((a) => a.endsWith('compile-entry.ts'));
  if (entryIdx === -1) {
    return { path: null, source: 'fallback', error: 'entry not present in logged command' };
  }
  args[entryIdx] = join(INTERMEDIATES, 'compile-entry.bench.ts');
  const outIdx = args.findIndex((a) => a.startsWith('--outfile='));
  if (outIdx !== -1) args[outIdx] = `--outfile=${outPath}`;

  const replay = await runOnce({
    argv: [process.execPath, ...args],
    cwd: CLI_ROOT,
    env: { ...makePerfEnv(), ...process.env },
    timeoutMs: 1_800_000,
  });
  if (replay.exitCode !== 0 || Bun.file(outPath).size === 0) {
    return {
      path: null,
      source: 'fallback',
      error: `replay failed: ${replay.stderr.slice(-2000)}`,
    };
  }
  await Bun.spawn(['chmod', '+x', outPath]).exited;
  return { path: outPath, source: 'repaired-intermediate', error: null };
}

/**
 * Build the JS bundle arm through the repo's own `bun-lib-build.mjs` helper with
 * an explicit `--target`, and make the resulting bundle runnable.
 *
 * Two constraints decide the design, and both were measured rather than assumed:
 *   1. `src/cli/version.ts` walks up from the bundle's directory for a
 *      package.json, so the bundle cannot live outside `apps/cli`.
 *   2. the bundle keeps its npm dependencies external (`chalk`, `zod`, …), so a
 *      copy relocated to a temp directory dies with `Cannot find package 'zod'`.
 * Together they mean the only honest way to measure a different build target is
 * to build it where it will run and put the tree back afterwards. The previous
 * artifact is therefore backed up byte-for-byte and restored in a finally block.
 *
 * Why bother: `apps/cli/scripts/build.mjs` never passes `--target`, and
 * `bun-lib-build.mjs` defaults to `node`, which inlines undici's Node polyfill.
 * Under Bun that throws `webidl.util.markAsUncloneable is not a function` during
 * module init — the exact failure `apps/web/AGENTS.md` records as a hard rule for
 * web-server. So `bun dist/main.mjs` on HEAD is not a slow arm, it is a dead one.
 */
export async function buildDistVariant({ target, quiet = false }) {
  const say = (...args) => {
    if (!quiet) console.error(...args);
  };
  if (target === 'node') return { path: DIST_ENTRY, restore: async () => {}, error: null };
  const backupDir = mkdtempSync(join(tmpdir(), 'byf-dist-backup-'));
  const backup = [];
  for (const name of ['main.mjs', 'main.mjs.map']) {
    const p = join(CLI_ROOT, 'dist', name);
    if (Bun.file(p).size > 0) {
      const dst = join(backupDir, name);
      await Bun.write(dst, await Bun.file(p).arrayBuffer());
      backup.push({ from: dst, to: p });
    }
  }
  const restore = async () => {
    for (const { from, to } of backup) {
      try {
        await Bun.write(to, await Bun.file(from).arrayBuffer());
      } catch {
        /* best effort; reported below */
      }
    }
    rmSync(backupDir, { recursive: true, force: true });
  };

  const { BUILT_IN_CATALOG_DEFINE, builtInCatalogDefine } = await import(
    join(CLI_ROOT, 'scripts/built-in-catalog.mjs')
  );
  const args = [
    join(REPO_ROOT, 'build/bun-lib-build.mjs'),
    './src/main.ts',
    '--shebang',
    '--bundle-workspace',
    '--never-bundle',
    '@byfriends/vis-server',
    '--never-bundle',
    '@byfriends/web-server',
    '--no-splitting',
    `--define=${BUILT_IN_CATALOG_DEFINE}=${builtInCatalogDefine()}`,
    '--target',
    target,
    '--out',
    'dist',
  ];
  const r = await runOnce({
    argv: [process.execPath, ...args],
    cwd: CLI_ROOT,
    env: { ...process.env },
    timeoutMs: 900_000,
  });
  if (r.exitCode !== 0) {
    await restore();
    return {
      path: null,
      restore: async () => {},
      error: `bun-lib-build --target ${target} failed: ${r.stderr.slice(-800)}`,
    };
  }
  const bytes = (Bun.file(DIST_ENTRY).size / 1024 / 1024).toFixed(2);
  say(
    `      built dist variant --target=${target} into apps/cli/dist (${bytes} MiB, previous artifact backed up)`,
  );
  return { path: DIST_ENTRY, restore, error: null };
}

/** The functional smoke that proves a binary is not just small but *working*. */
export async function functionalCheck({ argv, cwd, env, expect }) {
  const r = await runOnce({ argv, cwd, env, timeoutMs: 120_000 });
  const problems = [];
  if (r.exitCode !== 0) problems.push(`exit ${r.exitCode}: ${r.stderr.slice(0, 200)}`);
  for (const needle of expect) {
    if (!r.stdout.includes(needle) && !r.stderr.includes(needle)) {
      problems.push(`missing output ${JSON.stringify(needle)}`);
    }
  }
  return { ok: problems.length === 0, problems, stdout: r.stdout, stderr: r.stderr, ms: r.ms };
}

export async function armVariants({ bunPath, nativePath, env }) {
  /** @type {Record<string, {argv: string[], cwd: string, label: string}>} */
  return {
    control: {
      argv: [bunPath, '-e', '0'],
      cwd: REPO_ROOT,
      label: 'control: bare `bun -e 0` (fork/exec + runtime init floor)',
    },
    bunSrc: { argv: [bunPath, SRC_ENTRY], cwd: CLI_ROOT, label: 'bun ./src/main.ts (source tree)' },
    bunDist: { argv: [bunPath, DIST_ENTRY], cwd: CLI_ROOT, label: 'bun dist/main.mjs (bundled)' },
    native: { argv: [nativePath], cwd: REPO_ROOT, label: 'compiled binary' },
  };
}

export { measureOnce };
