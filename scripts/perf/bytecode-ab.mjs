#!/usr/bin/env bun
/**
 * PRD-0038 R4 / AC-4.2 — `bun build --compile --bytecode` A/B adjudication.
 *
 * Usage
 *   bun scripts/perf/bytecode-ab.mjs [--samples=12] [--outdir=DIR] [--skip-build]
 *
 * Every arm is compiled from the *same* generated intermediate with the *same*
 * defines, so the only difference between arms is the flag under test. The
 * product's own `scripts/compile/build.mjs` is never modified: `--bytecode`
 * adoption is a human decision, this script only produces the evidence.
 *
 * A size/startup delta alone would be worthless here, because the two things
 * that make byf's binary non-trivial — an embedded N-API addon and ~330
 * embedded SPA assets — are exactly the two things a bytecode pipeline is most
 * likely to break. So every arm additionally has to pass:
 *   1. `--version` / `--help` (graph loads and Commander output is intact),
 *   2. the product's own native-asset smoke (BYF_CODE_NATIVE_ASSET_SMOKE=1),
 *   3. `/proc/<pid>/maps` provenance for the `.node` (embedded, not host disk),
 *   4. `byf web` actually serving index.html + a hashed JS chunk over HTTP.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import {
  dispersion,
  evictAll,
  fmt,
  fmtBytes,
  getEvictor,
  measureOnce,
  pct,
  relDelta,
  rejectOutliers,
  runOnce,
  sample,
} from './lib/bench.mjs';
import {
  CLI_ROOT,
  INTERMEDIATES,
  REPO_ROOT,
  ensureNativeBinary,
  makePerfEnv,
  tokenizeCommand,
} from './lib/targets.mjs';

const { values: flags } = parseArgs({
  options: {
    samples: { type: 'string' },
    outdir: { type: 'string' },
    'skip-build': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (flags.help) {
  console.log(
    'usage: bun scripts/perf/bytecode-ab.mjs [--samples=12] [--outdir=DIR] [--skip-build]',
  );
  process.exit(0);
}

const sampleCount = Math.max(10, Number(flags.samples ?? 12) || 12);
const OUT = flags.outdir ?? join(tmpdir(), 'byf-bytecode-ab');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const ARMS = [
  {
    id: 'plain',
    label: 'no minify, no bytecode (build:native:compile --profile=local)',
    flags: [],
    entry: 'repaired',
  },
  {
    id: 'minify',
    label: '--minify (release profile as shipped today)',
    flags: ['--minify'],
    entry: 'repaired',
  },
  { id: 'bytecode', label: '--bytecode only', flags: ['--bytecode'], entry: 'repaired' },
  {
    id: 'minifyBytecode',
    label: '--minify --bytecode',
    flags: ['--minify', '--bytecode'],
    entry: 'repaired',
  },
  // The first --bytecode attempt fails on the entry's top-level `await import()`.
  // These two arms isolate whether the blocker is the flag itself or only the
  // entry's shape: same bytes, top-level await moved inside an async function.
  {
    id: 'bytecodeAsyncEntry',
    label: '--bytecode, entry await wrapped in async fn',
    flags: ['--bytecode'],
    entry: 'asyncWrapped',
  },
  {
    id: 'minifyBytecodeAsyncEntry',
    label: '--minify --bytecode, wrapped entry',
    flags: ['--minify', '--bytecode'],
    entry: 'asyncWrapped',
  },
  {
    id: 'asyncEntryControl',
    label: 'wrapped entry, no bytecode (control for the wrap itself)',
    flags: [],
    entry: 'asyncWrapped',
  },
];

/**
 * Move the generated entry's top-level `await import(...)` into an async
 * function. Semantically identical boot order (catalog and asset map are still
 * assigned to globalThis before main's graph is imported), but it removes the
 * one construct `--bytecode` rejects. Written next to the product intermediates
 * without touching them.
 */
function asyncWrapEntry(text) {
  return text.replace(
    /^const \{ main \} = await import\((.*)\);\nmain\(\);\s*$/m,
    'async function boot() {\n  const { main } = await import($1);\n  main();\n}\nvoid boot();\n',
  );
}

// ---------------------------------------------------------------------------
// 1. produce one binary per arm from a single shared intermediate
// ---------------------------------------------------------------------------

/**
 * The reference argv, recovered from the official build's own log line rather
 * than re-derived here, so this script cannot drift from the product pipeline
 * without failing loudly.
 */
async function referenceCompileArgv() {
  const argvPath = join(INTERMEDIATES, 'official-argv.txt');
  let built = await ensureNativeBinary({ quiet: true });
  if (Bun.file(argvPath).size === 0) {
    // The binary was reused, so the product never logged an argv: force one run.
    built = await ensureNativeBinary({ quiet: true, force: true });
  }
  if (built.path === null) {
    console.error(`cannot prepare a native binary to derive flags from: ${built.error}`);
    process.exit(2);
  }
  const officialArgv = tokenizeCommand((await Bun.file(argvPath).text()).trim());
  const entryText = await Bun.file(join(INTERMEDIATES, 'compile-entry.ts')).text();
  const repairedPath = join(INTERMEDIATES, 'compile-entry.bench.ts');
  // Use the product entry once compile-entry.ts is valid again; until then the
  // repaired copy is byte-identical apart from the missing member-access dot.
  const entryPath = entryText.includes(').__BYF_WEB_EMBEDDED_ASSETS__')
    ? join(INTERMEDIATES, 'compile-entry.ts')
    : repairedPath;
  return { officialArgv, entryPath, source: built.source };
}

/**
 * Strip the per-arm-varying parts out of the official argv so each arm differs
 * from the shipped release command by exactly the flag under test.
 */
function baseCompileArgs(officialArgv) {
  const args = officialArgv[0] === 'bun' ? officialArgv.slice(1) : [...officialArgv];
  return args.filter(
    (a) =>
      !a.startsWith('--outfile=') &&
      !a.endsWith('compile-entry.ts') &&
      !a.endsWith('compile-entry.bench.ts'),
  );
}

async function buildArm({ officialArgv, entryPath, extraFlags, outfile }) {
  // `build --compile --target=… --no-compile-autoload-dotenv --define=…` come
  // straight from the product; only the arm flag, outfile and entry are ours.
  const args = [...baseCompileArgs(officialArgv), ...extraFlags, `--outfile=${outfile}`, entryPath];
  const t0 = Bun.nanoseconds();
  const r = await runOnce({
    argv: [process.execPath, ...args],
    cwd: CLI_ROOT,
    env: { ...process.env },
    timeoutMs: 1_800_000,
  });
  return {
    argv: args,
    exitCode: r.exitCode,
    buildMs: Number(((Bun.nanoseconds() - t0) / 1e6).toFixed(0)),
    stderr: r.stderr,
    bytes: Bun.file(outfile).size || null,
  };
}

// ---------------------------------------------------------------------------
// 2. functional verification
// ---------------------------------------------------------------------------

/** Native addon provenance: is the `.node` mapped from the binary or from disk? */
async function nodeProvenance(bin, env) {
  const child = Bun.spawn([bin, '--help'], {
    cwd: CLI_ROOT,
    env,
    stdout: 'ignore',
    stderr: 'ignore',
  });
  const seen = new Set();
  let hostPaths = 0;
  for (;;) {
    let text;
    try {
      text = await Bun.file(`/proc/${child.pid}/maps`).text();
    } catch {
      break;
    }
    for (const line of text.split('\n')) {
      if (!/\.node\b/.test(line)) continue;
      const path = line.trim().split(/\s+/).slice(5).join(' ');
      if (path.length === 0) continue;
      if (path.includes('node_modules')) hostPaths++;
      seen.add(path.replace(/\s*\(deleted\)$/, '').replace(/\.node$/, '.node'));
    }
    if (text.includes('State:\tZ')) break;
    await Bun.sleep(2);
  }
  await child.exited;
  const paths = [...seen];
  return {
    mapped: paths,
    embedded: paths.length > 0 && hostPaths === 0,
    hostFallback: hostPaths > 0,
  };
}

/** Serve the embedded SPA over real HTTP and check the bytes round-trip. */
async function spaAssetsServe(bin, env, port) {
  const publicDir = join(REPO_ROOT, 'apps/web/server/dist/public');
  const indexDisk = await Bun.file(join(publicDir, 'index.html'))
    .text()
    .catch(() => null);
  if (indexDisk === null) return { ok: false, reason: 'no on-disk index.html to compare against' };
  const child = Bun.spawn([bin, 'web', '--port', String(port), '--no-open'], {
    cwd: CLI_ROOT,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  try {
    let root = null;
    for (let i = 0; i < 80; i++) {
      await Bun.sleep(250);
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) });
        if (res.status === 200) {
          root = await res.text();
          break;
        }
      } catch {
        /* not listening yet */
      }
    }
    if (root === null) return { ok: false, reason: 'server never answered on the port' };
    const indexMatches = root.trim() === indexDisk.trim();
    const assetName = /assets\/[\w.-]+\.js/.exec(root)?.[0] ?? null;
    let assetBytes = 0;
    let assetOk = false;
    if (assetName !== null) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/${assetName}`, {
          signal: AbortSignal.timeout(10_000),
        });
        const buf = await res.arrayBuffer();
        assetBytes = buf.byteLength;
        const disk = Bun.file(join(publicDir, assetName));
        assetOk = res.status === 200 && (await disk.exists()) && buf.byteLength === disk.size;
      } catch {
        /* counted as a failure below */
      }
    }
    return {
      ok: indexMatches && assetOk,
      indexMatches,
      assetName,
      assetBytes,
      assetByteMatchDisk: assetOk,
      reason: indexMatches && assetOk ? null : 'embedded SPA bytes differ from the on-disk build',
    };
  } finally {
    try {
      child.kill(9);
    } catch {
      /* already gone */
    }
  }
}

function statsOf(values) {
  const kept = rejectOutliers(values, { absFloor: 2 }).kept;
  return { ...dispersion(values), ...dispersion(kept), raw: values.length };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const env = makePerfEnv();
const evictor = await getEvictor();
const { officialArgv, entryPath, source: entrySource } = await referenceCompileArgv();
const repairedText = await Bun.file(entryPath).text();
const entries = {
  repaired: entryPath,
  asyncWrapped: join(INTERMEDIATES, 'compile-entry.async.ts'),
};
const wrapped = asyncWrapEntry(repairedText);
if (wrapped === repairedText) {
  console.error(
    'asyncWrapEntry did not match — the generated entry shape changed; update this script',
  );
  process.exit(2);
}
await Bun.write(entries.asyncWrapped, wrapped);
console.error(`entry (as used): ${entryPath}  (native binary prepared via: ${entrySource})`);
console.error(`entry (await wrapped): ${entries.asyncWrapped}`);
console.error(`official argv: ${officialArgv.join(' ')}`);

const results = [];
let port = 4700;
for (const arm of ARMS) {
  const outfile = join(OUT, `byf-${arm.id}`);
  console.error(`\n=== arm ${arm.id} :: ${arm.label} ===`);
  const build = flags['skip-build']
    ? {
        exitCode: Bun.file(outfile).size > 0 ? 0 : 1,
        bytes: Bun.file(outfile).size || null,
        buildMs: null,
        argv: [],
      }
    : await buildArm({
        officialArgv,
        entryPath: entries[arm.entry],
        extraFlags: arm.flags,
        outfile,
      });
  console.error(
    `  build exit=${build.exitCode}  bytes=${fmtBytes(build.bytes)}  ${build.buildMs}ms`,
  );
  if (build.exitCode !== 0) {
    const topLevelAwait = /"await" can only be used inside an "async" function/.test(build.stderr);
    const klass = topLevelAwait ? 'top-level-await-unsupported' : 'build-error';
    console.error(`  BUILD FAILED (${klass}):\n${build.stderr.slice(0, 700)}`);
    results.push({ ...arm, build, unusable: `build failed: ${klass}` });
    continue;
  }
  await Bun.spawn(['chmod', '+x', outfile]).exited;

  const version = await runOnce({
    argv: [outfile, '--version'],
    cwd: CLI_ROOT,
    env,
    timeoutMs: 60_000,
  });
  const help = await runOnce({ argv: [outfile, '--help'], cwd: CLI_ROOT, env, timeoutMs: 60_000 });
  const smoke = await runOnce({
    argv: [outfile],
    cwd: CLI_ROOT,
    env: { ...env, BYF_CODE_NATIVE_ASSET_SMOKE: '1' },
    timeoutMs: 60_000,
  });
  const node = await nodeProvenance(outfile, env);
  const spa = await spaAssetsServe(outfile, env, port++);

  const cells = {};
  for (const cmd of ['--version', '--help']) {
    cells[cmd] = {};
    for (const cache of ['cold', 'warm']) {
      const rs = await sample(
        async () => {
          if (cache === 'cold') await evictAll([outfile]);
          return measureOnce({ argv: [outfile, cmd], cwd: CLI_ROOT, env, timeoutMs: 300_000 });
        },
        { count: sampleCount, warmup: cache === 'cold' ? 1 : 3 },
      );
      cells[cmd][cache] = {
        ...statsOf(rs.map((r) => r.ms)),
        rss: statsOf(rs.map((r) => r.peakRssKb ?? 0).filter((v) => v > 0)),
        invalid: rs.filter((r) => r.exitCode !== 0).length,
      };
    }
    console.error(
      `  ${cmd.padEnd(10)} cold med ${fmt(cells[cmd].cold.median)}ms  ` +
        `warm med ${fmt(cells[cmd].warm.median)}ms  ` +
        `RSS ${fmt(cells[cmd].warm.rss.median / 1024, 1)}M`,
    );
  }

  const ok =
    version.exitCode === 0 &&
    help.exitCode === 0 &&
    smoke.exitCode === 0 &&
    node.embedded &&
    spa.ok;
  console.error(
    `  functional: --version ${version.exitCode === 0 ? 'ok' : 'FAIL'}  ` +
      `--help ${help.exitCode === 0 ? 'ok' : 'FAIL'}  ` +
      `native-smoke ${smoke.exitCode === 0 ? 'ok' : 'FAIL'}  ` +
      `.node embedded=${node.embedded} hostFallback=${node.hostFallback}  ` +
      `SPA ${spa.ok ? 'ok' : `FAIL (${spa.reason})`}`,
  );
  results.push({
    ...arm,
    build,
    cells,
    version: version.stdout.trim(),
    smoke: smoke.stdout.trim(),
    node,
    spa,
    ok,
  });
}

// ---------------------------------------------------------------------------
// adjudication table
// ---------------------------------------------------------------------------

const ref = results.find((r) => r.id === 'minify');
console.log('\n\n=== PRD-0038 AC-4.2  --bytecode A/B ===');
console.log(
  `samples/arm: ${sampleCount} per cell, warmup discarded, cold = posix_fadvise(${evictor ? 'ok' : 'UNAVAILABLE'})`,
);
console.log(`reference arm: minify (what build:native:release ships today)\n`);
console.log(
  'arm                   bytes     Δbytes   v.cold   Δ        v.warm   Δ        help.warm  Δ        RSS     Δ       functional',
);
const cell = (r, cmd, cache) => r.cells?.[cmd]?.[cache] ?? null;
for (const r of results) {
  if (r.unusable) {
    console.log(`${r.id.padEnd(16)} ${r.unusable}`);
    continue;
  }
  const d = (a, b) => (Number.isFinite(relDelta(a, b)) ? pct(relDelta(a, b), 1) : 'n/a');
  const vc = cell(r, '--version', 'cold');
  const vw = cell(r, '--version', 'warm');
  const hw = cell(r, '--help', 'warm');
  const refVc = ref && !ref.unusable ? cell(ref, '--version', 'cold') : null;
  const refVw = ref && !ref.unusable ? cell(ref, '--version', 'warm') : null;
  const refHw = ref && !ref.unusable ? cell(ref, '--help', 'warm') : null;
  console.log(
    r.id.padEnd(22) +
      ' ' +
      `${(r.build.bytes / 1024 / 1024).toFixed(2)}M`.padEnd(9) +
      ' ' +
      (ref && !ref.unusable ? d(r.build.bytes, ref.build.bytes).padStart(8) : '     n/a') +
      '  ' +
      fmt(vc?.median).padStart(7) +
      '  ' +
      (refVc ? d(vc.median, refVc.median).padStart(8) : '     n/a') +
      '  ' +
      fmt(vw?.median).padStart(7) +
      '  ' +
      (refVw ? d(vw.median, refVw.median).padStart(8) : '     n/a') +
      '  ' +
      fmt(hw?.median).padStart(8) +
      '  ' +
      (refHw ? d(hw.median, refHw.median).padStart(8) : '     n/a') +
      '  ' +
      (vw ? `${fmt(vw.rss.median / 1024, 1)}M`.padStart(7) : '    n/a') +
      ' ' +
      (refVw ? d(vw.rss.median, refVw.rss.median).padStart(8) : '     n/a') +
      '  ' +
      (r.ok ? 'PASS' : 'FAIL'),
  );
}

const bc = results.find((r) => r.id === 'bytecodeAsyncEntry');
const mb = results.find((r) => r.id === 'minifyBytecodeAsyncEntry');
const wrapCtrl = results.find((r) => r.id === 'asyncEntryControl');
console.log('\n-- per-arm detail --');
for (const r of results.filter((x) => !x.unusable)) {
  const c = cell(r, '--version', 'cold');
  const w = cell(r, '--version', 'warm');
  const hc = cell(r, '--help', 'cold');
  const h = cell(r, '--help', 'warm');
  console.log(`  ${r.id}: --version="${r.version}"  smoke="${r.smoke}"`);
  console.log(
    `      node=${r.node.mapped.join(',') || 'none'}  spa=${r.spa.assetName ?? '-'} (${r.spa.assetBytes ?? 0}B)` +
      `\n      version cold ${fmt(c.median)}±${fmt(c.stddev)}ms  warm ${fmt(w.median)}±${fmt(w.stddev)}ms (cv ${pct(w.cv)})  ` +
      `help cold ${fmt(hc.median)}±${fmt(hc.stddev)}ms  warm ${fmt(h.median)}±${fmt(h.stddev)}ms (cv ${pct(h.cv)})  invalid ${w.invalid}`,
  );
}

console.log('\n-- verdict inputs (vs the shipped --minify arm) --');
for (const [name, arm] of [
  ['--bytecode (product entry)', results.find((r) => r.id === 'bytecode')],
  ['--minify --bytecode (product entry)', results.find((r) => r.id === 'minifyBytecode')],
  ['await-wrapped entry control', wrapCtrl],
  ['--bytecode (await-wrapped)', bc],
  ['--minify --bytecode (await-wrapped)', mb],
]) {
  if (!arm) continue;
  if (arm.unusable) {
    console.log(`  ${name}: ${arm.unusable}`);
    continue;
  }
  if (!ref || ref.unusable) {
    console.log(`  ${name}: no reference arm`);
    continue;
  }
  const dHelp = relDelta(cell(arm, '--help', 'warm').median, cell(ref, '--help', 'warm').median);
  const dHelpCold = relDelta(
    cell(arm, '--help', 'cold').median,
    cell(ref, '--help', 'cold').median,
  );
  const dVer = relDelta(
    cell(arm, '--version', 'warm').median,
    cell(ref, '--version', 'warm').median,
  );
  const dCold = relDelta(
    cell(arm, '--version', 'cold').median,
    cell(ref, '--version', 'cold').median,
  );
  const dRss = relDelta(
    cell(arm, '--version', 'warm').rss.median,
    cell(ref, '--version', 'warm').rss.median,
  );
  const dSize = relDelta(arm.build.bytes, ref.build.bytes);
  console.log(
    `  ${name}: Δversion.warm ${pct(dVer)}  Δversion.cold ${pct(dCold)}  ` +
      `Δhelp.warm ${pct(dHelp)}  Δhelp.cold ${pct(dHelpCold)}  ` +
      `ΔRSS ${pct(dRss)}  Δsize ${pct(dSize)}  functional=${arm.ok ? 'PASS' : 'FAIL'}`,
  );
}

await Bun.write(
  join(OUT, 'bytecode-ab.json'),
  `${JSON.stringify({ sampleCount, entrySource, results }, null, 2)}\n`,
);
console.log(`\nraw JSON -> ${join(OUT, 'bytecode-ab.json')}`);
clearPerfHomeCleanup();

function clearPerfHomeCleanup() {
  if (typeof env?.BYF_HOME === 'string') rmSync(env.BYF_HOME, { recursive: true, force: true });
}
