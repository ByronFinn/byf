/**
 * AC-5.4 (PRD-0038 R5) — test-surface typecheck ratchet.
 *
 * `bun run typecheck:tests` (root package.json) already exists and CI already has
 * a Typecheck step — but the test surface carries a large pre-existing error
 * backlog tracked as #306, so wiring the raw command into CI would be permanently
 * red and would be turned off within a week. The only gate that can be introduced
 * on top of an existing backlog is a ratchet: current error count must never
 * exceed the recorded baseline.
 *
 * The baseline locks the **count**, not the per-file detail. Reason: #306 is being
 * worked down by several people at once, and a checked-in list of 1.8k
 * `file(line,col)` entries would conflict on every unrelated edit (and change on
 * every reformat, since a column moves with any edit above it). The count is the
 * only stable, merge-friendly quantity; the detail stays in the CI log, which
 * prints the current list on every run that goes red.
 *
 * Downward drift is also a failure: a baseline that is higher than reality is
 * silent slack, exactly what this gate exists to prevent. Re-record it with
 * `bun scripts/ci-gates.mjs typecheck-ratchet --update`.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** One tsc diagnostic line: `path/to/file.ts(12,3): error TS2307: …` */
const TSC_ERROR_LINE = /^\s*(\S+?)\(\d+,\d+\):\s+error\s+TS\d+:/;

/**
 * @param {string} output combined stdout+stderr of `tsc --noEmit`
 * @returns {string[]} the error lines
 */
export function extractErrorLines(output) {
  return output.split('\n').filter((line) => TSC_ERROR_LINE.test(line));
}

/** @param {string} output */
export function countErrors(output) {
  return extractErrorLines(output).length;
}

/**
 * @param {{ current: number, baseline: number }} input
 * @returns {{ status: 'green' | 'regression' | 'stale-baseline', current: number, baseline: number }}
 */
export function compareAgainstBaseline({ current, baseline }) {
  if (current > baseline) return { status: 'regression', current, baseline };
  if (current < baseline) return { status: 'stale-baseline', current, baseline };
  return { status: 'green', current, baseline };
}

/**
 * @typedef {{ errors: number, command: string, note: string, detailLock: string }} Baseline
 * @param {string} repoRoot
 * @returns {Promise<Baseline>}
 */
export async function readBaseline(repoRoot) {
  const file = baselinePath(repoRoot);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  if (typeof raw.errors !== 'number' || !Number.isFinite(raw.errors) || raw.errors < 0) {
    throw new Error(`${path.relative(repoRoot, file)}: "errors" must be a non-negative number`);
  }
  return raw;
}

export async function writeBaseline(repoRoot, baseline) {
  await writeFile(baselinePath(repoRoot), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');
}

/**
 * The metadata a baseline needs beyond the count. `--update` keeps whatever is
 * already checked in and only rewrites `errors`, so this is the template for the
 * very first run, when no file exists yet (AC-5.4 initialisation).
 */
export function initialBaseline() {
  return {
    errors: 0,
    command: 'bun run typecheck:tests',
    detailLock:
      'count only, on purpose: #306 is worked on by several people at once and a checked-in ' +
      'list of file(line,col) entries conflicts on every unrelated edit and every reformat. ' +
      'The per-file detail is printed by the gate on every red run.',
    note:
      'Initialised with `bun scripts/ci-gates.mjs typecheck-ratchet --update`. Ratchet, not a ' +
      'target: lower this number by fixing test-surface type errors, and re-record it in the ' +
      'same commit; the gate fails on both regression and unexplained slack.',
  };
}

/**
 * Read the baseline for the `--update` path only. A missing file is not an error
 * there — creating it is exactly what that path is for — while the checking path
 * keeps `readBaseline`'s hard failure (an unconfigured gate must never pass).
 *
 * @param {string} repoRoot
 * @returns {Promise<{ baseline: Baseline, created: boolean }>}
 */
export async function readBaselineForUpdate(repoRoot) {
  try {
    return { baseline: await readBaseline(repoRoot), created: false };
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    return { baseline: initialBaseline(), created: true };
  }
}

export function baselinePath(repoRoot) {
  return path.join(repoRoot, 'scripts', 'lib', 'test-typecheck-baseline.json');
}

/**
 * @param {string} repoRoot
 * @param {{ output: string, exitCode: number, baseline: number }} input
 */
export function evaluateRatchet({ output, exitCode, baseline }) {
  const current = countErrors(output);
  // Non-zero with no parseable diagnostics means tsc itself failed (bad config,
  // crash). That is a hard error, never a "0 errors" pass.
  if (current === 0 && exitCode !== 0) {
    return {
      status: 'tool-failure',
      current,
      baseline,
      errors: extractErrorLines(output),
      message: '`tsc --noEmit` exited non-zero without emitting any parseable diagnostic',
    };
  }
  const verdict = compareAgainstBaseline({ current, baseline });
  return { ...verdict, errors: extractErrorLines(output) };
}
