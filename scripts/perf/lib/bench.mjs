/**
 * PRD-0038 R4 — shared primitives for the binary / size / TUI-idle baselines.
 *
 * Deliberately dependency-free: hyperfine is not installed on the target hosts
 * and we must not add a package dependency just to sample a process, so the
 * sampling recipes hyperfine is known for (warmup discard, repeated runs,
 * median + dispersion, outlier rejection) are re-implemented here on top of
 * `Bun.spawn` and `/proc`.
 *
 * Latency and peak RSS are collected in one pass, but the `/proc` reader is an
 * *async* loop: a synchronous busy-poll would block the event loop that drains
 * the child's pipes and deadlock once child output exceeds the 64 KiB pipe
 * buffer.
 */

import { readdirSync, readFileSync } from 'node:fs';

/** Clock ticks per second on Linux (`getconf CLK_TCK`), used by the CPU sampler. */
export const CLK_TCK = 100;

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------

export function sorted(values) {
  return [...values].sort((a, b) => a - b);
}

export function quantile(sortedValues, q) {
  const n = sortedValues.length;
  if (n === 0) return Number.NaN;
  if (n === 1) return sortedValues[0];
  const pos = (n - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (pos - lo);
}

export function median(values) {
  return quantile(sorted(values), 0.5);
}

export function mean(values) {
  if (values.length === 0) return Number.NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

export function stddev(values) {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (const v of values) acc += (v - m) * (v - m);
  return Math.sqrt(acc / (n - 1));
}

/**
 * Robust dispersion, used to derive CI thresholds.
 *
 * MAD (median absolute deviation) scaled by 1.4826 approximates a sigma for a
 * normal sample, but it under-reads the multi-modal tail a shared CI runner
 * produces, so the spread ratios (p75/p25, max/median) travel with it and the
 * gate takes whichever is larger.
 */
export function dispersion(values) {
  const s = sorted(values);
  const med = quantile(s, 0.5);
  const devs = sorted(s.map((v) => Math.abs(v - med)));
  const mad = quantile(devs, 0.5) * 1.4826;
  const p25 = quantile(s, 0.25);
  const p75 = quantile(s, 0.75);
  const last = s[s.length - 1];
  return {
    n: s.length,
    median: med,
    mean: mean(s),
    stddev: stddev(s),
    mad,
    min: s[0] ?? Number.NaN,
    max: last ?? Number.NaN,
    p25,
    p75,
    interquartileRatio: p25 > 0 ? p75 / p25 : Number.NaN,
    /** Worst-case single-sample inflation — what a mean- or max-based gate trips on. */
    maxOverMedian: med > 0 && last !== undefined ? last / med : Number.NaN,
    cv: med > 0 ? stddev(s) / med : Number.NaN,
  };
}

/**
 * Outlier rejection tuned for startup timings, which are right-skewed (a
 * scheduler preemption makes one run slower, essentially never faster).
 *
 * A sample is dropped when it exceeds `median + max(absFloor, 5 * MAD)` — the
 * Tukey-style 5-MAD rule with an absolute floor so a perfectly repeatable
 * measurement (MAD = 0) does not flag every later run. At least 60 % of the
 * samples always survive, so a genuinely noisy cell shrinks instead of
 * collapsing into a single reading.
 */
export function rejectOutliers(values, { absFloor = 0 } = {}) {
  const med = median(values);
  const devs = sorted(values.map((v) => Math.abs(v - med)));
  const mad = quantile(devs, 0.5) * 1.4826;
  const ceiling = med + Math.max(absFloor, 5 * mad);
  const kept = [];
  const dropped = [];
  for (const v of values) (v > ceiling ? dropped : kept).push(v);
  const minKeep = Math.max(1, Math.ceil(values.length * 0.6));
  if (kept.length < minKeep) return { kept: sorted(values).slice(0, minKeep), dropped: [] };
  return { kept, dropped };
}

// ---------------------------------------------------------------------------
// spawn + measure
// ---------------------------------------------------------------------------

/**
 * Run `argv` once, returning wall-clock latency, exit code, captured output and
 * peak RSS (kB) sampled from `/proc/<pid>/status` VmHWM.
 *
 * `Bun.nanoseconds()` brackets the child's whole lifetime including the
 * `Bun.spawn` fork/exec — that overhead is part of what a user waits for and is
 * identical across arms, so it belongs in the number. A control arm (bare
 * `bun -e 0`) reports the floor separately when a runtime-relative figure is
 * wanted.
 */
export async function measureOnce({ argv, cwd, env, timeoutMs = 120_000, drain = true }) {
  const started = Bun.nanoseconds();
  const child = Bun.spawn(argv, {
    cwd,
    env,
    stdout: drain ? 'pipe' : 'ignore',
    stderr: drain ? 'pipe' : 'ignore',
  });

  let peakRssKb = 0;
  let procSamples = 0;
  const statusPath = `/proc/${child.pid}/status`;

  const sampler = (async () => {
    // VmHWM is itself a high-water mark, so the sampler never has to witness the
    // peak instant — one successful read before the process disappears is enough.
    for (;;) {
      let text;
      try {
        text = await Bun.file(statusPath).text();
      } catch {
        break;
      }
      // Zombies keep a readable /proc entry with frozen fields; their peak is final.
      if (text.includes('State:\tZ')) break;
      const m = /VmHWM:\s+(\d+) kB/.exec(text);
      if (m) {
        const kb = Number(m[1]);
        if (kb > peakRssKb) peakRssKb = kb;
      }
      procSamples++;
      // Yield so the parent keeps draining the child's pipes.
      await Bun.sleep(0);
    }
  })();

  const killer = setTimeout(() => {
    try {
      child.kill(9);
    } catch {
      /* already gone */
    }
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    drain ? new Response(child.stdout).text() : Promise.resolve(''),
    drain ? new Response(child.stderr).text() : Promise.resolve(''),
    child.exited,
  ]);
  clearTimeout(killer);
  await sampler;

  return {
    ms: (Bun.nanoseconds() - started) / 1e6,
    exitCode,
    stdout,
    stderr,
    peakRssKb: peakRssKb > 0 ? peakRssKb : null,
    procSamples,
    timedOut: exitCode === null,
  };
}

/**
 * Run `argv` once purely for its output / exit code / wall clock — no `/proc`
 * sampling, used for build steps and capability probes where RSS is irrelevant.
 */
export async function runOnce({ argv, cwd, env, timeoutMs = 120_000 }) {
  const started = Bun.nanoseconds();
  const child = Bun.spawn(argv, { cwd, env, stdout: 'pipe', stderr: 'pipe' });
  const killer = setTimeout(() => {
    try {
      child.kill(9);
    } catch {
      /* already gone */
    }
  }, timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(killer);
  return {
    ms: (Bun.nanoseconds() - started) / 1e6,
    exitCode,
    stdout,
    stderr,
    timedOut: exitCode === null,
  };
}

/** Peak RSS with output discarded, for arms whose stdout is irrelevant. */
export async function sampleRssOnce({ argv, cwd, env }) {
  const r = await measureOnce({ argv, cwd, env, drain: false });
  return r.peakRssKb;
}

let gnuTimeCandidate;
/** `/usr/bin/time` (GNU) — present on Linux runners, absent on macOS. */
export async function findGnuTime() {
  if (gnuTimeCandidate !== undefined) return gnuTimeCandidate;
  gnuTimeCandidate = null;
  for (const candidate of ['/usr/bin/time', '/usr/bin/gtime']) {
    try {
      const probe = Bun.spawn([candidate, '-v', '/bin/true'], {
        stdout: 'ignore',
        stderr: 'pipe',
      });
      const stderr = await new Response(probe.stderr).text();
      if (/Maximum resident set size/.test(stderr)) {
        gnuTimeCandidate = candidate;
        break;
      }
    } catch {
      /* candidate missing */
    }
  }
  return gnuTimeCandidate;
}

/**
 * Peak RSS via GNU time (`ru_maxrss`), used as the cross-check that validates
 * the VmHWM sampler. Returns kB, or null when the tool is unavailable.
 */
export async function maxRssViaGnuTime({ argv, cwd, env }) {
  const time = await findGnuTime();
  if (time === null) return null;
  const child = Bun.spawn([time, '-v', ...argv], {
    cwd,
    env,
    stdout: 'ignore',
    stderr: 'pipe',
  });
  const stderr = await new Response(child.stderr).text();
  await child.exited;
  const m = /Maximum resident set size \(kbytes\): (\d+)/.exec(stderr);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// process-tree CPU (idle-spin detection)
// ---------------------------------------------------------------------------

function readProcStat(pid) {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    // comm can contain spaces and parentheses; parse only after the last ')'.
    const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
    const ppid = Number(fields[1]);
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    if (!Number.isFinite(ppid) || !Number.isFinite(utime) || !Number.isFinite(stime)) return null;
    return { ppid, ticks: utime + stime };
  } catch {
    return null;
  }
}

function listPids() {
  // Bun 1.3.14 has no Bun.globSync, and readdirSync('/proc') is the cheapest
  // complete pid list — the numeric filter also skips /proc/*/{task,fd,...}.
  return readdirSync('/proc')
    .filter((name) => /^\d+$/.test(name))
    .map(Number);
}

/** Snapshot of `rootPid` plus every live descendant, from one /proc walk. */
export function treeSnapshot(rootPid) {
  const byParent = new Map();
  const stats = new Map();
  for (const pid of listPids()) {
    const st = readProcStat(pid);
    if (st === null) continue;
    stats.set(pid, st);
    const list = byParent.get(st.ppid);
    if (list) list.push(pid);
    else byParent.set(st.ppid, [pid]);
  }
  const found = [];
  const seen = new Set();
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    found.push(pid);
    const kids = byParent.get(pid);
    if (kids) for (const k of kids) stack.push(k);
  }
  let totalTicks = 0;
  for (const pid of found) {
    const st = stats.get(pid);
    if (st) totalTicks += st.ticks;
  }
  return { pids: found, totalTicks };
}

/**
 * CPU utilisation of a process tree over `windowMs`, as a percentage of ONE
 * core (100 % = one core fully busy).
 *
 * Per-core rather than per-machine because the failure mode being tested is a
 * single-threaded spin, which a 12-core denominator would hide. Threads of the
 * root process are already folded into its /proc/<pid>/stat by Linux; children
 * that appear mid-window are attributed at the next window.
 */
export async function cpuPercentOfTree(rootPid, windowMs) {
  const before = treeSnapshot(rootPid);
  const t0 = Bun.nanoseconds();
  await Bun.sleep(windowMs);
  const after = treeSnapshot(rootPid);
  const elapsedMs = (Bun.nanoseconds() - t0) / 1e6;
  const deltaTicks = Math.max(0, after.totalTicks - before.totalTicks);
  const cpuMs = (deltaTicks / CLK_TCK) * 1000;
  return {
    pids: after.pids.length,
    ticks: deltaTicks,
    cpuMs,
    windowMs: elapsedMs,
    percentOfOneCore: elapsedMs > 0 ? (cpuMs / elapsedMs) * 100 : 0,
  };
}

// ---------------------------------------------------------------------------
// page-cache eviction (cold-cache recipe)
// ---------------------------------------------------------------------------

let fadvisePromise;

/**
 * `posix_fadvise(POSIX_FADV_DONTNEED)` through `bun:ffi`.
 *
 * No root and no extra binary: dropping a *specific file's* pages is permitted
 * for the file owner, unlike `/proc/sys/vm/drop_caches`, which needs
 * CAP_SYS_ADMIN and is therefore unavailable in this WSL2 session and on hosted
 * runners. Resolves to null when the FFI route is missing, so callers label the
 * run warm-cache-only instead of reporting a fake cold number.
 *
 * Two FFI gotchas verified on Bun 1.3.14 / linux-x64: the descriptor key is
 * `args` (not `params`, which silently yields a no-op binding), and `len = 0`
 * means "offset .. EOF" — passing -1 returns EINVAL(22).
 */
export function getEvictor() {
  fadvisePromise ??= (async () => {
    const libName =
      process.platform === 'linux'
        ? 'libc.so.6'
        : process.platform === 'darwin'
          ? '/usr/lib/libc.dylib'
          : null;
    if (libName === null) return null;
    try {
      const { dlopen, ptr } = await import('bun:ffi');
      const lib = dlopen(libName, {
        open: { args: ['ptr', 'i32'], returns: 'i32' },
        close: { args: ['i32'], returns: 'i32' },
        posix_fadvise: { args: ['i32', 'i64', 'i64', 'i32'], returns: 'i32' },
      });
      const POSIX_FADV_DONTNEED = 4;
      let failures = 0;
      return {
        backend: 'posix_fadvise',
        evict(path) {
          const fd = lib.symbols.open(ptr(Buffer.from(`${path}\0`, 'utf8')), 0);
          if (fd < 0) return false;
          const rc = lib.symbols.posix_fadvise(fd, 0, 0, POSIX_FADV_DONTNEED);
          lib.symbols.close(fd);
          if (rc !== 0) failures++;
          return rc === 0;
        },
        get failures() {
          return failures;
        },
      };
    } catch {
      return null;
    }
  })();
  return fadvisePromise;
}

/**
 * Evict a whole file set. Reports how much was actually dropped — a "cold" run
 * whose eviction count is zero is not cold, so the caller must surface this.
 */
export async function evictAll(paths) {
  const evictor = await getEvictor();
  if (evictor === null) {
    return { backend: 'unavailable', requested: paths.length, evicted: 0, bytes: 0 };
  }
  let evicted = 0;
  let bytes = 0;
  for (const path of paths) {
    bytes += Bun.file(path).size;
    if (evictor.evict(path)) evicted++;
  }
  return { backend: evictor.backend, requested: paths.length, evicted, bytes };
}

// ---------------------------------------------------------------------------
// sampling driver
// ---------------------------------------------------------------------------

/**
 * Repeat `fn` `count` times after `warmup` discarded runs (hyperfine's `-w`).
 * The warmup matters here specifically because the first run of a freshly built
 * binary also pays for its output landing in the page cache, which would
 * otherwise contaminate the "hot" arm.
 */
export async function sample(fn, { count = 12, warmup = 2, onSample } = {}) {
  const kept = [];
  for (let i = 0; i < count + warmup; i++) {
    const r = await fn(i);
    if (i >= warmup) kept.push(r);
    if (onSample) onSample(i, r);
  }
  return kept;
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

export function fmt(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return Number(value).toFixed(digits);
}

export function fmtBytes(bytes) {
  if (bytes === null || bytes === undefined) return 'n/a';
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB (${bytes} B)`;
}

export function relDelta(candidate, reference) {
  if (!Number.isFinite(candidate) || !Number.isFinite(reference) || reference === 0) {
    return Number.NaN;
  }
  return (candidate - reference) / reference;
}

export function pct(value, digits = 1) {
  if (!Number.isFinite(value)) return 'n/a';
  return `${(value * 100).toFixed(digits)}%`;
}
