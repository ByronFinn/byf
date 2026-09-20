#!/usr/bin/env bun
/**
 * PRD-0038 R4 / AC-4.4 — TUI idle CPU, and the draw-on-change vs fixed-tick
 * comparison that the `STREAMING_UI_FLUSH_MS = 50` adjudication needs.
 *
 * Usage
 *   bun scripts/perf/tui-idle.mjs [--window=2000] [--windows=10] [--arm=native|bunSrc]
 *
 * What this can and cannot show, stated up front:
 *
 * `STREAMING_UI_FLUSH_MS` is *not* a frame clock. In `turn-event-handler.ts`
 * `scheduleStreamingUiFlush()` returns early unless `hasPendingStreamingUiUpdates()`
 * is true, and `clearStreamingUiFlushTimerIfIdle()` disarms the timer as soon as
 * the drafts are empty. So no product code can be instrumented to observe "the
 * 50 ms tick while idle", because there is no tick while idle — which is exactly
 * the claim under test. The honest experiment is therefore split:
 *
 *   phase 1  real byf TUI, true idle (no stdin, no stream)      -> expect ~0 %
 *   phase 2  real byf TUI, input-driven re-render (keystrokes)  -> render cost
 *   phase 3  synthetic control: the same renderer driven by a fixed 50 ms
 *            timer instead of on-change, isolating what a *real* 50 ms tick
 *            would cost if the constant ever were a tick
 *
 * Phase 3 imports only `@earendil-works/pi-tui` (a dependency), never product
 * code, so the comparison is done without instrumenting the shipped TUI.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import {
  cpuPercentOfTree,
  maxRssViaGnuTime,
  findGnuTime,
  median,
  dispersion,
} from './lib/bench.mjs';
import { openPty, ptyAvailable } from './lib/pty.mjs';
import { CLI_ROOT, NATIVE_BIN, SRC_ENTRY, makePerfEnv } from './lib/targets.mjs';

const { values: flags } = parseArgs({
  options: {
    window: { type: 'string' },
    windows: { type: 'string' },
    arm: { type: 'string' },
    'phase3-only': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

if (flags.help) {
  console.log(
    'usage: bun scripts/perf/tui-idle.mjs [--window=2000] [--windows=10] [--arm=native|bunSrc] [--phase3-only]',
  );
  process.exit(0);
}

const windowMs = Math.max(500, Number(flags.window ?? 2000) || 2000);
const windows = Math.max(4, Number(flags.windows ?? 10) || 10);
const armKey = flags.arm ?? 'native';

const ARMS = {
  native: { argv: [NATIVE_BIN], label: 'compiled binary (shipped artifact)' },
  bunSrc: { argv: [process.execPath, SRC_ENTRY], label: 'bun ./src/main.ts' },
};
const arm = ARMS[armKey] ?? ARMS.native;

// ---------------------------------------------------------------------------
// phase 3: synthetic draw-on-change vs fixed-tick control
// ---------------------------------------------------------------------------

/**
 * The control needs a TUI instance under a PTY, driven two ways. It writes no
 * product code: the only import is the renderer dependency.
 */
async function phase3() {
  console.log('\n=== phase 3: synthetic fixed-tick vs draw-on-change (pi-tui only) ===');
  const scriptPath = join(tmpdir(), 'byf-perf-render-control.mjs');
  // Resolved absolutely because the generated script lives outside the repo
  // tree, where bare specifier resolution would not find the dependency.
  const piTui = import.meta.resolve('@earendil-works/pi-tui', join(CLI_ROOT, 'package.json'));
  // Mirrors how the product assembles its renderer (byf-tui.ts createTUIState:
  // `new ProcessTerminal()` + `new TuiMainScreen(terminal)`), but with no
  // session, no SDK and no model — so the only variable left is the drive mode.
  await Bun.write(
    scriptPath,
    `
import { ProcessTerminal, TuiMainScreen, Text } from ${JSON.stringify(piTui)};
const mode = process.argv[2];
const ms = Number(process.argv[3]);
const ui = new TuiMainScreen(new ProcessTerminal());
const label = new Text('mode=' + mode, false, false);
ui.addChild(label);
let ticks = 0;
if (mode === 'fixed-tick') {
  setInterval(() => {
    ticks++;
    label.setText('mode=' + mode + ' tick=' + ticks);
    ui.requestRender();
  }, ms);
} else {
  label.setText('mode=' + mode + ' (rendered once, no driver)');
  ui.requestRender();
}
ui.start();
`,
  );
  const cases = [
    ['draw-on-change', 0],
    ['fixed-tick', 50],
    ['fixed-tick', 100],
    ['fixed-tick', 16],
  ];
  const out = [];
  for (const [mode, ms] of cases) {
    const pty = await openPty({ rows: 20, cols: 80 });
    if (pty === null) {
      console.log('  PTY unavailable — phase 3 skipped');
      return out;
    }
    const child = Bun.spawn([process.execPath, scriptPath, mode, String(ms)], {
      cwd: CLI_ROOT,
      env: { ...process.env, BYF_HOME: join(tmpdir(), `byf-perf-ctl-${process.pid}`) },
      stdin: pty.slave,
      stdout: pty.slave,
      stderr: pty.slave,
    });
    // Keep draining the master: a PTY has a small output buffer, and once it
    // fills the renderer blocks inside write(2). Without this the "fixed-tick"
    // arms decay to 0 % CPU purely because they stalled, not because they are
    // cheap — the first version of this script measured exactly that artefact.
    const pumped = { bytes: 0, stop: false };
    const pump = (async () => {
      while (!pumped.stop) {
        pumped.bytes += pty.drain().length;
        await Bun.sleep(5);
      }
    })();
    await Bun.sleep(1500);
    const samples = [];
    for (let i = 0; i < 4; i++) {
      if (child.exitCode !== null) break;
      samples.push((await cpuPercentOfTree(child.pid, windowMs)).percentOfOneCore);
    }
    pumped.stop = true;
    await pump;
    const d = dispersion(samples);
    console.log(
      `  ${mode.padEnd(14)} ${String(ms).padStart(3)}ms  idle CPU ${samples.map((s) => s.toFixed(2)).join(' / ')} % of one core` +
        `   median ${samples.length ? d.median.toFixed(2) : 'n/a'}%   (drained ${pumped.bytes}B)`,
    );
    out.push({
      mode,
      ms,
      samples,
      median: samples.length ? d.median : null,
      drainedBytes: pumped.bytes,
    });
    try {
      child.kill(15);
    } catch {
      /* gone */
    }
    await Bun.sleep(150);
    pty.drain();
    pty.close();
  }
  rmSync(scriptPath, { force: true });
  return out;
}

// ---------------------------------------------------------------------------
// phases 1-2: the real TUI
// ---------------------------------------------------------------------------

async function phases12() {
  console.log(`\n=== phases 1-2: real byf TUI (${arm.label}) ===`);
  const home = join(tmpdir(), `byf-perf-tui-${process.pid}`);
  mkdirSync(home, { recursive: true });
  const pty = await openPty({ rows: 40, cols: 140 });
  if (pty === null) {
    console.log('  PTY unavailable (posix_openpt via bun:ffi failed) — phases 1-2 skipped');
    return null;
  }
  const env = makePerfEnv({ BYF_HOME: home, TERM: 'xterm-256color' });
  const child = Bun.spawn(arm.argv, {
    cwd: CLI_ROOT,
    env,
    stdin: pty.slave,
    stdout: pty.slave,
    stderr: pty.slave,
  });
  const { closeSync } = await import('node:fs');
  closeSync(pty.slave);

  let rendered = 0;
  const pumpStop = { v: false };
  const pump = (async () => {
    while (!pumpStop.v) {
      rendered += pty.drain().length;
      await Bun.sleep(25);
    }
  })();

  // Boot is not idle: wait for the first full frame, then a settle period, so
  // the startup render / theme detection / clipboard init do not leak into the
  // idle number.
  await Bun.sleep(6000);
  const alive = child.exitCode === null;
  console.log(
    `  launched pid ${child.pid}  alive after 6 s settle: ${alive}  rendered bytes so far: ${rendered}`,
  );
  if (!alive) {
    pumpStop.v = true;
    await pump;
    pty.close();
    rmSync(home, { recursive: true, force: true });
    return null;
  }

  const idleSamples = [];
  for (let i = 0; i < windows; i++) {
    const s = await cpuPercentOfTree(child.pid, windowMs);
    idleSamples.push(s);
    process.stderr.write(
      `\r  phase 1 idle window ${i + 1}/${windows}: ${s.percentOfOneCore.toFixed(2)} % of one core (tree pids ${s.pids})   `,
    );
  }
  process.stderr.write('\n');

  // Phase 2: same process, but driven — a keystroke render storm, which is what
  // the flush throttle actually governs (stream deltas arrive as UI updates).
  const busySamples = [];
  for (let i = 0; i < 4; i++) {
    const driver = (async () => {
      for (let k = 0; k < 400; k++) {
        pty.write('x');
        await Bun.sleep(5);
      }
    })();
    const s = await cpuPercentOfTree(child.pid, windowMs);
    busySamples.push(s);
    await driver;
    process.stderr.write(
      `\r  phase 2 keystroke render window ${i + 1}/4: ${s.percentOfOneCore.toFixed(2)} % of one core   `,
    );
  }
  process.stderr.write('\n');
  await Bun.sleep(500);

  const idlePct = idleSamples.map((s) => s.percentOfOneCore);
  const busyPct = busySamples.map((s) => s.percentOfOneCore);
  const idleD = dispersion(idlePct);
  const busyD = dispersion(busyPct);
  const rss = await maxRssViaGnuTime({
    argv: arm.argv,
    cwd: CLI_ROOT,
    env: { ...env, BYF_PERF_TUI_NO_PTY: '1' },
  });

  try {
    child.kill(2);
  } catch {
    /* gone */
  }
  await Bun.sleep(400);
  pumpStop.v = true;
  await pump;
  pty.drain();
  pty.close();
  rmSync(home, { recursive: true, force: true });

  console.log(
    `  phase 1 IDLE : median ${idleD.median.toFixed(2)}%  max ${idleD.max.toFixed(2)}%  of one core  ` +
      `(n=${idleD.n}, window ${windowMs}ms)`,
  );
  console.log(
    `  phase 2 DRIVEN: median ${busyD.median.toFixed(2)}%  max ${busyD.max.toFixed(2)}%  of one core (n=${busyD.n})`,
  );
  if (rss !== null)
    console.log(`  TUI peak RSS (GNU time, no PTY): ${(rss / 1024).toFixed(1)} MiB`);
  console.log(
    `  /proc accounting granularity is 10 ms, so one 10 ms slice in a ${windowMs} ms window reads ` +
      `${((10 / windowMs) * 100).toFixed(2)}% — values at or below that are indistinguishable from zero.`,
  );
  return { idle: idleD, driven: busyD, rssKb: rss };
}

// ---------------------------------------------------------------------------

if (!(await ptyAvailable())) {
  console.log('bun:ffi PTY route unavailable on this host — nothing to measure');
  process.exit(2);
}
const gnuTime = await findGnuTime();
console.log(
  `PRD-0038 AC-4.4 TUI idle baseline\nhost ${process.platform}-${process.arch}  bun ${Bun.version}  ` +
    `window ${windowMs}ms x ${windows}  gnuTime=${gnuTime ?? 'absent'}`,
);

const p3 = await phase3();
const p12 = flags['phase3-only'] ? null : await phases12();
if (p12) {
  console.log('\n=== adjudication inputs ===');
  console.log(`  idle CPU median: ${p12.idle.median.toFixed(2)} % of one core`);
  console.log(
    `  fixed 50 ms tick control median: ${p3?.find((x) => x.mode === 'fixed-tick' && x.ms === 50)?.median?.toFixed(2) ?? 'n/a'} %`,
  );
  console.log(
    `  draw-on-change control median: ${p3?.find((x) => x.mode === 'draw-on-change')?.median?.toFixed(2) ?? 'n/a'} %`,
  );
}
