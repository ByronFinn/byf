#!/usr/bin/env bun
/**
 * PRD-0038 R4 — binary startup / size / TUI-idle baseline (AC-4.1, AC-4.3).
 *
 * Usage
 *   bun scripts/perf/binary-baseline.mjs measure [--samples=N] [--json=PATH] [--skip-native-build]
 *   bun scripts/perf/binary-baseline.mjs gate --baseline=PATH [--samples=N]
 *   bun scripts/perf/binary-baseline.mjs --help
 *
 * `measure` prints the three-arm table and writes a machine-readable baseline.
 * `gate` re-measures and exits non-zero on a regression past the allowances
 * recorded in the baseline, which is what makes it usable as a CI / nightly step.
 *
 * WIRING STATUS (as of PRD-0038's release review): AC-4.3's gate is run by NO
 * workflow — `grep -rn binary-baseline .github/` returns nothing, so the AC holds
 * as a command and not as a gate; it cannot fail a PR. Left unwired deliberately
 * rather than wired to a red-by-construction step, for two reasons that both have
 * to be closed first:
 *   1. the committed `baselines/linux-x64.json` records two arms that failed the
 *      baseline's own functional smoke (`bunDist`, `bunDistBun`), so a gate wired
 *      today would go red on those rows over stale data, not over a regression.
 *      `gate` now says that out loud — see `deadBaselineArms` /
 *      `reportDeadBaseline`, which print the cause and the re-record command.
 *   2. `gate` calls `runMeasure()`, so it needs `apps/cli/dist/main.mjs` *and* a
 *      compiled `dist-native/bin/<target>/byf`, and it re-derives its allowances
 *      from wall-clock medians. Those are not comparable to a 2-4 vCPU shared
 *      runner from a 12-core WSL2 host, so wiring means choosing a dedicated
 *      runner or a nightly schedule and re-recording per platform — a decision,
 *      not a one-line step.
 *
 * No production code is imported or modified: every arm is launched as a real
 * subprocess, and the cold-cache recipe is `posix_fadvise(DONTNEED)` over the
 * resolver-reported file set rather than a root-only `drop_caches`.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import {
  dispersion,
  evictAll,
  findGnuTime,
  fmt,
  fmtBytes,
  getEvictor,
  maxRssViaGnuTime,
  measureOnce,
  median,
  pct,
  relDelta,
  rejectOutliers,
  runOnce,
  sample,
} from './lib/bench.mjs';
import {
  CLI_ROOT,
  DIST_ENTRY,
  NATIVE_BIN,
  REPO_ROOT,
  SRC_ENTRY,
  armVariants,
  buildDistVariant,
  clearPerfHome,
  ensureNativeBinary,
  functionalCheck,
  makePerfEnv,
  resolveColdSet,
} from './lib/targets.mjs';

const DEFAULT_BASELINE = join(import.meta.dirname, 'baselines/linux-x64.json');
const CACHE_DIR = join(tmpdir(), 'byf-perf-baseline-cache');

const HELP = `
byf binary baseline (PRD-0038 R4)

  measure                 run the three-arm baseline and print the table
    --samples=N           timed samples per cell after warmup (default 12, minimum 10)
    --json=PATH           also write the raw baseline JSON to PATH
    --skip-native-build   reuse an existing dist-native binary (fails if absent)
    --skip-cold           warm cache only (labels the run honestly)
    --fast                fewer arms: warm only, --version only

  gate                    re-measure and exit non-zero on regression
    --baseline=PATH       baseline JSON to compare against (default ${DEFAULT_BASELINE})

  --help, --version       this text
`.trimStart();

const { values: flags } = parseArgs({
  allowPositionals: true,
  options: {
    samples: { type: 'string' },
    json: { type: 'string' },
    baseline: { type: 'string' },
    'skip-native-build': { type: 'boolean', default: false },
    'skip-cold': { type: 'boolean', default: false },
    fast: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

const command = process.argv[2] ?? 'measure';
if (flags.help || command === '--help' || command === 'help') {
  console.log(HELP);
  process.exit(0);
}
if (!['measure', 'gate'].includes(command)) {
  console.error(`unknown command: ${command}\n\n${HELP}`);
  process.exit(2);
}

const sampleCount = Math.max(10, Number(flags.samples ?? (flags.fast ? 10 : 12)) || 12);
const wantCold = !flags['skip-cold'];
const commands = flags.fast ? ['--version'] : ['--version', '--help'];

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function summarize(results) {
  const latencies = results.map((r) => r.ms);
  const rss = results.map((r) => r.peakRssKb).filter((v) => Number.isFinite(v));
  const rejected = rejectOutliers(latencies, { absFloor: 2 });
  return {
    n: results.length,
    raw: latencies.map((v) => Number(v.toFixed(3))),
    latency: {
      ...dispersion(latencies),
      ...dispersion(rejected.kept),
      dropped: rejected.dropped.length,
    },
    rssKb: rss.length > 0 ? dispersion(rss) : null,
    invalid: results.filter((r) => r.exitCode !== 0).length,
    procSamples: Math.max(...results.map((r) => r.procSamples), 0),
  };
}

function fmtCell(s) {
  if (!s) return 'n/a';
  const l = s.latency;
  const rss = s.rssKb ? `${fmt(s.rssKb.median / 1024, 1)}M` : 'n/a';
  const bad = s.invalid > 0 ? `  INVALID×${s.invalid}` : '';
  return (
    `med ${fmt(l.median)}ms  mean ${fmt(l.mean)}ms  sd ${fmt(l.stddev)}ms  ` +
    `min ${fmt(l.min)}ms  p75 ${fmt(l.p75)}ms  max ${fmt(l.max)}ms  cv ${pct(l.cv)}  ` +
    `drop ${l.dropped}  RSS ${rss}${bad}`
  );
}

async function measureCell({ arm, args, cwd, env, coldSet, cold }) {
  let evictReport = null;
  const results = await sample(
    async () => {
      if (cold && coldSet.length > 0) evictReport = await evictAll(coldSet);
      return measureOnce({ argv: [...arm.argv, ...args], cwd, env, timeoutMs: 300_000 });
    },
    { count: sampleCount, warmup: cold ? 1 : 3 },
  );
  const s = summarize(results);
  // A "cold" cell that evicted nothing is not cold; label it rather than
  // reporting a warm number under a cold heading.
  s.cacheVerified = !cold || (evictReport !== null && evictReport.evicted > 0);
  s.eviction = evictReport;
  return s;
}

// ---------------------------------------------------------------------------
// size floor
// ---------------------------------------------------------------------------

async function measureHelloFloor(bunPath) {
  const dir = join(CACHE_DIR, 'hello-floor');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const src = join(dir, 'hello.ts');
  await Bun.write(src, 'console.log("hello");\n');
  // bun's --compile target ids are prefixed with the runtime name.
  const bunTarget = `bun-${process.platform}-${process.arch}`;
  const builds = [];
  for (const [label, extra] of [
    ['bare', []],
    ['minify', ['--minify']],
    ['bytecode', ['--bytecode']],
    ['minify+bytecode', ['--minify', '--bytecode']],
  ]) {
    const outfile = join(dir, `hello-${label.replaceAll('+', '-')}`);
    const r = await runOnce({
      argv: [
        bunPath,
        'build',
        '--compile',
        `--target=${bunTarget}`,
        `--outfile=${outfile}`,
        ...extra,
        src,
      ],
      cwd: dir,
      env: { ...process.env, BYF_HOME: dir },
      timeoutMs: 600_000,
    });
    builds.push({
      label,
      bytes: Bun.file(outfile).size || null,
      buildExit: r.exitCode,
      buildMs: Number(r.ms.toFixed(1)),
      buildError: r.exitCode === 0 ? null : r.stderr.slice(0, 300),
    });
  }
  const version = await runOnce({ argv: [bunPath, '--version'], cwd: dir, env: process.env });
  // Startup sign check on the smallest possible program. The vendor-side
  // literature disagrees in direction at this size (a synthetic 241-module app
  // reports a gain, a hello-world report claims a loss), so the floor doubles as
  // the negative control for the byf-scale result in bytecode-ab.mjs.
  const startup = {};
  for (const b of builds) {
    if (b.bytes === null) continue;
    const outfile = join(dir, `hello-${b.label.replaceAll('+', '-')}`);
    const rs = await sample(
      async () => measureOnce({ argv: [outfile], cwd: dir, env: process.env, timeoutMs: 60_000 }),
      { count: 12, warmup: 3 },
    );
    const lat = rejectOutliers(
      rs.map((r) => r.ms),
      { absFloor: 1 },
    ).kept;
    startup[b.label] = {
      medianMs: Number(median(lat).toFixed(3)),
      n: lat.length,
      invalid: rs.filter((r) => r.exitCode !== 0).length,
    };
  }
  return {
    bunVersion: version.stdout.trim(),
    bunTarget,
    builds,
    startup,
    floor: builds.find((b) => b.label === 'bare')?.bytes ?? null,
  };
}

// ---------------------------------------------------------------------------
// measure
// ---------------------------------------------------------------------------

async function runMeasure() {
  const bunPath = process.execPath;
  const started = Bun.nanoseconds();
  const warnings = [];
  mkdirSync(CACHE_DIR, { recursive: true });

  const evictor = await getEvictor();
  if (evictor === null)
    warnings.push(
      'posix_fadvise unavailable via bun:ffi — cold column will be labelled unavailable',
    );
  const gnuTime = await findGnuTime();

  console.error(`[1/6] capability probe`);
  console.error(
    `      bun ${bunPath}\n      evictor=${evictor ? 'posix_fadvise' : 'unavailable'}  ` +
      `gnuTime=${gnuTime ?? 'absent'}  proc=${await Bun.file('/proc/self/status').exists()}`,
  );

  console.error('[2/6] arms');
  // The `--target bun` bundle variant is the configuration the shipped JS build
  // *should* use; see buildDistVariant's note for why it is measured separately.
  // buildDistVariant rebuilds apps/cli/dist/main.mjs *in place* with --target bun
  // (a relocated bundle cannot resolve its external deps — see lib/targets.mjs),
  // backing the shipped artifact up byte-for-byte. Every exit path below must
  // restore it, or the measurement would mutate the tree.
  const distBun = await buildDistVariant({ target: 'bun' });
  if (distBun.path === null) warnings.push(distBun.error);
  let nativeSource = 'skipped';
  if (flags['skip-native-build']) {
    if (Bun.file(NATIVE_BIN).size === 0) {
      await distBun.restore();
      console.error(`--skip-native-build but ${NATIVE_BIN} is missing`);
      process.exit(2);
    }
    nativeSource = 'preexisting';
  } else {
    const built = await ensureNativeBinary({ quiet: false });
    if (built.path === null) {
      await distBun.restore();
      console.error(`native binary unavailable: ${built.error}`);
      process.exit(2);
    }
    nativeSource = built.source;
  }
  for (const [name, needed] of [
    ['src entry', SRC_ENTRY],
    ['dist bundle', DIST_ENTRY],
    ['native binary', NATIVE_BIN],
  ]) {
    if (Bun.file(needed).size === 0) {
      await distBun.restore();
      console.error(`${name} missing at ${needed} — build it first (see scripts/perf/README.md)`);
      process.exit(2);
    }
  }
  console.error(`      native binary source: ${nativeSource}`);

  const env = makePerfEnv({
    ...(process.env.BYF_PERF_OFFLINE === '0' ? {} : { BYF_DISABLE_UPDATE_CHECK: '1' }),
  });

  // Functional gate first: a fast arm that does not work is not an arm.
  console.error('[3/6] functional smoke (--version / --help)');
  const variants = await armVariants({ bunPath, nativePath: NATIVE_BIN, env });
  if (distBun.path !== null) {
    variants.bunDistBun = {
      argv: [bunPath, distBun.path],
      cwd: CLI_ROOT,
      label: 'bun dist/main.mjs rebuilt with --target bun (hypothetical fix)',
    };
  }
  const smoke = {};
  for (const [key, arm] of Object.entries(variants)) {
    if (key === 'control') continue;
    const v = await functionalCheck({
      argv: [...arm.argv, '--version'],
      cwd: arm.cwd,
      env,
      expect: [],
    });
    const h = await functionalCheck({
      argv: [...arm.argv, '--help'],
      cwd: arm.cwd,
      env,
      expect: [],
    });
    smoke[key] = { version: v.ok, help: h.ok, problems: [...v.problems, ...h.problems] };
    if (!v.ok || !h.ok)
      warnings.push(`arm ${key} failed its functional smoke: ${smoke[key].problems.join('; ')}`);
    console.error(
      `      ${key.padEnd(11)} --version ${v.ok ? 'ok' : 'FAIL'}   --help ${h.ok ? 'ok' : 'FAIL'}`,
    );
  }

  console.error('[4/6] cold-cache file sets (bun build --metafile)');
  const coldSets = {};
  coldSets.control = [bunPath];
  if (wantCold) {
    const entries = [
      ['bunSrc', SRC_ENTRY],
      ['bunDist', DIST_ENTRY],
    ];
    if (distBun.path !== null) entries.push(['bunDistBun', distBun.path]);
    for (const [key, entry] of entries) {
      const { files, error } = await resolveColdSet(entry, CACHE_DIR, dirname(entry));
      if (error)
        warnings.push(`${key}: cold set incomplete (${error}) — that cell is warm-only, not cold`);
      coldSets[key] = [bunPath, ...files];
      console.error(`      ${key.padEnd(11)} ${files.length} graph files`);
    }
    coldSets.native = [NATIVE_BIN];
    console.error(`      native      1 file (the binary carries its own graph)`);
  } else {
    for (const key of ['bunSrc', 'bunDist', 'bunDistBun', 'native']) coldSets[key] = [];
  }

  console.error(`[5/6] sampling (${sampleCount} timed runs per cell, warmup discarded)`);
  const cells = {};
  const rssCrossCheck = {};
  for (const [key, arm] of Object.entries(variants)) {
    cells[key] = {};
    for (const cmd of commands) {
      const args = key === 'control' ? [] : [cmd];
      const label = key === 'control' ? '(noop)' : cmd;
      if (wantCold) {
        const cold = await measureCell({
          arm,
          args,
          cwd: arm.cwd,
          env,
          coldSet: coldSets[key],
          cold: true,
        });
        cells[key][label] = { cold };
        console.error(
          `      ${key.padEnd(11)} ${label.padEnd(10)} COLD  ${fmtCell(cold)}${cold.cacheVerified ? '' : '  [EVICT=0 -> NOT COLD]'}`,
        );
      } else {
        cells[key][label] = {};
      }
      const warm = await measureCell({ arm, args, cwd: arm.cwd, env, coldSet: [], cold: false });
      cells[key][label].warm = warm;
      console.error(`      ${key.padEnd(11)} ${label.padEnd(10)} WARM  ${fmtCell(warm)}`);
    }
    // Validate the in-process VmHWM sampler against GNU time on one cell per arm.
    if (gnuTime !== null) {
      const first = commands[0];
      const args = key === 'control' ? [] : [first];
      const viaTime = await maxRssViaGnuTime({ argv: [...arm.argv, ...args], cwd: arm.cwd, env });
      const viaVmHwm =
        cells[key][key === 'control' ? '(noop)' : first]?.warm?.rssKb?.median ?? null;
      rssCrossCheck[key] = {
        gnuTimeKb: viaTime,
        vmHwmKb: viaVmHwm === null ? null : Math.round(viaVmHwm),
        relError: viaTime && viaVmHwm ? (viaVmHwm - viaTime) / viaTime : null,
      };
    }
  }

  console.error('[6/6] size floor');
  const floor = await measureHelloFloor(bunPath);
  const nativeBytes = Bun.file(NATIVE_BIN).size;
  const floorBytes = floor.floor;
  const deltaBytes = floorBytes === null ? null : nativeBytes - floorBytes;

  clearPerfHome(env);
  const durationSec = (Bun.nanoseconds() - started) / 1e9;

  const report = {
    schema: 1,
    prd: 'PRD-0038 R4',
    generatedAt: new Date().toISOString(),
    durationSec: Number(durationSec.toFixed(1)),
    host: {
      platform: process.platform,
      arch: process.arch,
      bunVersion: floor.bunVersion,
      kernel: (
        await runOnce({ argv: ['uname', '-r'], cwd: REPO_ROOT, env: process.env })
      ).stdout.trim(),
      cpuModel:
        ((await Bun.file('/proc/cpuinfo').text()).match(/^model name\s*:\s*(.+)$/m) ?? [])[1] ??
        null,
      logicalCpus: (await import('node:os')).cpus().length,
      gnuTime,
      evictor: evictor ? 'posix_fadvise' : 'unavailable',
      cacheStates: wantCold ? ['cold(fadvise)', 'warm'] : ['warm'],
    },
    arms: Object.fromEntries(
      Object.entries(variants).map(([k, v]) => [
        k,
        { label: v.label, argv: v.argv, cwd: v.cwd, coldFiles: (coldSets[k] ?? []).length },
      ]),
    ),
    nativeBinary: {
      path: NATIVE_BIN,
      source: nativeSource,
      bytes: nativeBytes,
    },
    smoke,
    cells,
    rssCrossCheck,
    sizeFloor: {
      ...floor,
      byfBytes: nativeBytes,
      deltaBytes,
      deltaMiB: deltaBytes === null ? null : Number((deltaBytes / 1024 / 1024).toFixed(2)),
      note: 'delta over the same-version Bun hello-world floor; re-measure the floor after any Bun upgrade before comparing deltas',
    },
    warnings,
  };

  printReport(report);

  const jsonPath = flags.json ?? null;
  if (jsonPath !== null) {
    mkdirSync(dirname(resolve(jsonPath)), { recursive: true });
    await Bun.write(resolve(jsonPath), `${JSON.stringify(report, null, 2)}\n`);
    console.error(`\nbaseline JSON -> ${resolve(jsonPath)}`);
  }
  // All timing for the bunDist / bunDistBun arms is done; put the shipped bundle
  // back before anything else touches apps/cli/dist.
  await distBun.restore();
  rmSync(CACHE_DIR, { recursive: true, force: true });
  return report;
}

function printReport(report) {
  console.log('\n=== PRD-0038 R4 binary baseline ===');
  console.log(
    `host: ${report.host.platform}-${report.host.arch}  bun ${report.host.bunVersion}  ${report.host.cpuModel ?? ''}`,
  );
  console.log(`cache states measured: ${report.host.cacheStates.join(', ')}`);
  console.log(`cold recipe: ${report.host.evictor}`);
  console.log('');
  console.log(
    'arm        cmd         cache  median   mean     sd      min      p75      max      cv      drop  RSSpeak',
  );
  for (const [key, cmds] of Object.entries(report.cells)) {
    for (const [cmd, states] of Object.entries(cmds)) {
      for (const [state, s] of Object.entries(states)) {
        if (!s) continue;
        console.log(
          key.padEnd(10) +
            ' ' +
            cmd.padEnd(11) +
            ' ' +
            state.padEnd(6) +
            ' ' +
            [
              fmt(s.latency.median).padStart(7),
              fmt(s.latency.mean).padStart(8),
              fmt(s.latency.stddev).padStart(7),
              fmt(s.latency.min).padStart(8),
              fmt(s.latency.p75).padStart(8),
              fmt(s.latency.max).padStart(8),
              pct(s.latency.cv).padStart(7),
              String(s.latency.dropped).padStart(5),
              (s.rssKb ? `${fmt(s.rssKb.median / 1024, 1)}M` : 'n/a').padStart(8),
            ].join('  '),
        );
      }
    }
  }
  console.log('\n-- relative to the control arm (runtime floor), warm, --version --');
  const ctrl = report.cells.control?.['(noop)']?.warm?.latency?.median;
  for (const [key, cmds] of Object.entries(report.cells)) {
    if (key === 'control') continue;
    const s = cmds['--version']?.warm ?? Object.values(cmds)[0]?.warm;
    if (!s || !Number.isFinite(ctrl)) continue;
    console.log(
      `  ${key.padEnd(9)} over-floor +${fmt(s.latency.median - ctrl)}ms  (${pct(relDelta(s.latency.median, ctrl))})`,
    );
  }
  console.log('\n-- size floor --');
  for (const b of report.sizeFloor.builds) {
    const st = report.sizeFloor.startup?.[b.label];
    console.log(
      `  hello-world ${b.label.padEnd(18)} ${fmtBytes(b.bytes)}   build ${b.buildMs}ms (exit ${b.buildExit})` +
        (st ? `   warm startup ${fmt(st.medianMs, 2)}ms (n=${st.n}, invalid ${st.invalid})` : ''),
    );
  }
  console.log(`  byf native           ${fmtBytes(report.sizeFloor.byfBytes)}`);
  console.log(
    `  delta_bytes            ${report.sizeFloor.deltaBytes === null ? 'n/a' : fmtBytes(report.sizeFloor.deltaBytes)}`,
  );
  console.log('\n-- VmHWM sampler vs GNU time cross-check --');
  for (const [k, v] of Object.entries(report.rssCrossCheck)) {
    console.log(
      `  ${k.padEnd(9)} vmHwm ${v.vmHwmKb === null ? 'n/a' : `${fmt(v.vmHwmKb / 1024, 1)}M`}   time ${v.gnuTimeKb === null ? 'n/a' : `${fmt(v.gnuTimeKb / 1024, 1)}M`}   err ${v.relError === null ? 'n/a' : pct(v.relError)}`,
    );
  }
  if (report.warnings.length > 0) {
    console.log('\n-- warnings --');
    for (const w of report.warnings) console.log(`  * ${w}`);
  }
}

// ---------------------------------------------------------------------------
// gate (AC-4.3)
// ---------------------------------------------------------------------------

/**
 * Regression allowance, in relative terms, per cell.
 *
 * These are *not* imported from anywhere external — they are 2x the worst
 * single-sample inflation (max/median - 1) observed on this host in the
 * baseline run, floored at the values below so a suspiciously quiet baseline
 * cannot tighten the gate into a false-red machine. Override the floor with
 * BYF_PERF_GATE_SLACK (percent) when a shared runner is noisier than a
 * dedicated one: a CI run that only re-measures 10 samples on a 2-v4-core
 * runner sees roughly 3x the dispersion of the local runs that produced the
 * default, so the multiplier, not the median, is what protects against red.
 */
const GATE_FLOOR = {
  coldLatency: 0.25,
  warmLatency: 0.15,
  rss: 0.15,
  bytes: 0.05,
};
/** Absolute slack in milliseconds, so sub-10 ms cells do not gate on rounding. */
const ABS_SLACK_MS = 8;

/**
 * Name the arms a committed baseline recorded but which never actually ran.
 *
 * `measure` refuses to call a report with a dead arm usable (it exits 1 on a
 * smoke failure), but `gate` compares numbers and would happily fail against a
 * baseline whose cells were measured on a process that crashed on import. That
 * is not a hypothesis: `baselines/linux-x64.json` was committed with `bunDist`
 * and `bunDistBun` failing their own smoke — the `--target node` undici/webidl
 * polyfill crash that b0e3bc7 later fixed, plus a `buildDistVariant` that
 * relocated the bundle to a temp dir and died on `Cannot find package 'zod'`.
 * Every cell of a dead arm is therefore a number from a non-existent code path,
 * and the honest thing to do on red is say so out loud, name the cause, and
 * print the re-record command — never quietly edit the JSON.
 *
 * @param {any} baseline
 * @returns {string[]} arm names whose recorded smoke failed
 */
function deadBaselineArms(baseline) {
  const smoke = baseline?.smoke;
  if (smoke === null || typeof smoke !== 'object') return [];
  const dead = [];
  for (const [arm, result] of Object.entries(smoke)) {
    if (result === null || typeof result !== 'object') continue;
    if (result.version === true && result.help === true) continue;
    dead.push(arm);
  }
  return dead;
}

/**
 * The gate's own explanation when it is red against a baseline that admits it
 * measured dead arms. Printed *before* the table so nobody reads those FAIL rows
 * as a product regression.
 */
function reportDeadBaseline(baseline, baselinePath, dead) {
  console.error(
    [
      '',
      `THE COMMITTED BASELINE IS NOT SELF-CONSISTENT: ${String(dead.length)} arm(s) recorded`,
      "measurements for a process that failed the baseline's own functional smoke.",
      `See ${baselinePath}:`,
      ...dead.map((arm) => {
        const problems = baseline.smoke?.[arm]?.problems;
        const first = Array.isArray(problems) ? String(problems[0] ?? '') : '';
        const oneLine = first.replace(/\s+/g, ' ').trim();
        return `  * ${arm}: smoke failed — ${oneLine.slice(0, 160)}`;
      }),
      '',
      'Consequence: every latency/RSS cell of those arms was measured on a build that',
      'never started, so the thresholds derived from them are meaningless and the rows',
      'marked [stale] below are expected to fail. This is stale baseline data,',
      'NOT evidence that the product got slower. Do not edit the JSON numbers to make a',
      'row go green — re-measure on a quiet machine and commit the result:',
      '',
      '  bun run build                                          # apps/cli/dist/main.mjs',
      '  bun run --filter @byfriends/cli build:native:compile    # the compiled binary',
      `  bun scripts/perf/binary-baseline.mjs measure --json=${relative('.', baselinePath)}`,
      '  git diff --stat scripts/perf/baselines/                # review, then commit',
      '',
      'Do NOT run that while other builds or tests share the machine: the cold/warm cells',
      'and the maxOverMedian-derived allowances are wall-clock numbers, and a polluted',
      're-measurement is exactly how this baseline went stale the first time.',
      '',
    ].join('\n'),
  );
}

async function runGate() {
  const baselinePath = resolve(flags.baseline ?? DEFAULT_BASELINE);
  if (Bun.file(baselinePath).size === 0) {
    console.error(`baseline not found: ${baselinePath}`);
    process.exit(2);
  }
  const baseline = await Bun.file(baselinePath).json();
  const dead = deadBaselineArms(baseline);
  if (dead.length > 0) reportDeadBaseline(baseline, baselinePath, dead);
  const staleArms = new Set(dead);
  const current = await runMeasure();
  const slackBoost = Number(process.env.BYF_PERF_GATE_SLACK ?? '0') / 100;

  const rows = [];
  const fail = (name, b, c, limit, unit) =>
    rows.push({ name, baseline: b, current: c, limit, verdict: 'FAIL', unit });
  const pass = (name, b, c, limit, unit) =>
    rows.push({ name, baseline: b, current: c, limit, verdict: 'ok', unit });

  for (const [arm, cmds] of Object.entries(baseline.cells)) {
    for (const [cmd, states] of Object.entries(cmds)) {
      for (const [state, bs] of Object.entries(states)) {
        const cs = current.cells[arm]?.[cmd]?.[state];
        if (!cs) continue;
        const observed = (bs.latency.maxOverMedian - 1) * 2;
        const floor = state === 'cold' ? GATE_FLOOR.coldLatency : GATE_FLOOR.warmLatency;
        const allowance = Math.max(floor, observed) + slackBoost;
        const limitMs = bs.latency.median * (1 + allowance) + ABS_SLACK_MS;
        const stale = staleArms.has(arm) ? ' [stale]' : '';
        const name = `${arm} ${cmd} ${state} median${stale}`;
        if (cs.latency.median > limitMs)
          fail(name, bs.latency.median, cs.latency.median, limitMs, 'ms');
        else pass(name, bs.latency.median, cs.latency.median, limitMs, 'ms');

        if (bs.rssKb && cs.rssKb) {
          const rAllow = Math.max(GATE_FLOOR.rss, (bs.rssKb.maxOverMedian - 1) * 2) + slackBoost;
          const rLimit = bs.rssKb.median * (1 + rAllow);
          const rName = `${arm} ${cmd} ${state} RSS`;
          if (cs.rssKb.median > rLimit) fail(rName, bs.rssKb.median, cs.rssKb.median, rLimit, 'kB');
          else pass(rName, bs.rssKb.median, cs.rssKb.median, rLimit, 'kB');
        }
      }
    }
  }

  const bBytes = baseline.sizeFloor?.byfBytes ?? null;
  const cBytes = current.sizeFloor?.byfBytes ?? null;
  if (bBytes !== null && cBytes !== null) {
    // Compare deltas, not absolutes: a Bun upgrade moves the floor and would
    // otherwise read as a code-size regression.
    const bDelta = baseline.sizeFloor.deltaBytes;
    const cDelta = current.sizeFloor.deltaBytes;
    const limit = bDelta * (1 + GATE_FLOOR.bytes) + 512 * 1024;
    const name = 'binary delta-over-hello-floor';
    if (cDelta > limit) fail(name, bDelta, cDelta, limit, 'B');
    else pass(name, bDelta, cDelta, limit, 'B');
    if (
      bBytes !== current.sizeFloor.byfBytes &&
      baseline.host?.bunVersion !== current.host?.bunVersion
    ) {
      console.error(
        `\nNOTE: bun changed (${baseline.host?.bunVersion} -> ${current.host?.bunVersion}); ` +
          'the hello-world floor was re-measured in this run, deltas remain comparable.',
      );
    }
  }

  console.log('\n=== PRD-0038 AC-4.3 regression gate ===');
  let failed = 0;
  for (const r of rows) {
    if (r.verdict === 'FAIL') failed++;
    const unit = r.unit === 'kB' ? 'kB' : r.unit === 'B' ? 'B' : 'ms';
    console.log(
      `  ${r.verdict === 'FAIL' ? 'FAIL' : '  ok'}  ${r.name.padEnd(38)} ` +
        `baseline ${fmt(r.baseline, unit === 'ms' ? 1 : 0).padStart(9)}  ` +
        `current ${fmt(r.current, unit === 'ms' ? 1 : 0).padStart(9)}  ` +
        `limit ${fmt(r.limit, unit === 'ms' ? 1 : 0).padStart(9)}  ${unit}`,
    );
  }
  console.log(`\n${rows.length - failed}/${rows.length} cells within allowance.`);
  if (failed > 0) {
    if (dead.length > 0) {
      console.error(
        `\n${String(dead.length)} of the failing rows belong to arm(s) the baseline itself ` +
          `records as never having run: ${dead.join(', ')}.\n` +
          'Read the "NOT SELF-CONSISTENT" block above this table before concluding anything ' +
          'about a regression.',
      );
    }
    console.error(
      `${failed} cells regressed past their measured allowance. Re-run with --samples=25 before ` +
        'treating it as real, or raise BYF_PERF_GATE_SLACK on a shared runner.',
    );
    process.exit(1);
  }
  process.exit(0);
}

if (command === 'gate') {
  await runGate();
} else {
  const r = await runMeasure();
  const bad = Object.values(r.smoke).some((s) => !s.version || !s.help);
  if (bad) {
    console.error('\none or more arms do not actually run — the baseline is not usable');
    process.exit(1);
  }
}
