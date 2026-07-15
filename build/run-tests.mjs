#!/usr/bin/env bun
/**
 * Process-isolated test runner for Bun (#215).
 *
 * Bun's `mock.module` / `vi.mock` is process-global and `mock.restore()` does
 * not reliably unhook modules for subsequent files in the same process. Vitest
 * used per-file workers, so suite-level isolation was free. This runner spawns
 * one `bun test` per file (with bounded concurrency) so mocks cannot leak.
 *
 * Usage: `bun build/run-tests.mjs` or via root `bun run test`.
 */
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const root = import.meta.dir.endsWith('/build') ? join(import.meta.dir, '..') : import.meta.dir;
const concurrency = Number(process.env.BYF_TEST_CONCURRENCY ?? 10);
/** Soft wall-clock limit per file (ms). Prevents a single hung file from blocking CI. */
const perFileTimeoutMs = Number(process.env.BYF_TEST_FILE_TIMEOUT_MS ?? 120_000);
// packages/apps: product tests. scripts: pure helpers (publish-manifest rewrite, …).
const roots = ['packages', 'apps', 'scripts'];

async function collectTestFiles(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectTestFiles(full, out);
    } else if (
      /\.test\.tsx?$/.test(entry.name) ||
      /\.e2e\.test\.tsx?$/.test(entry.name) ||
      entry.name.endsWith('.test.mjs')
    ) {
      // Skip e2e that requires explicit env (same as vitest default exclude if any)
      if (entry.name.includes('real-llm-smoke')) continue;
      out.push(full);
    }
  }
  return out;
}

const files = [];
for (const r of roots) {
  await collectTestFiles(join(root, r), files);
}
files.sort((a, b) => a.localeCompare(b));

if (files.length === 0) {
  console.error('No test files found');
  process.exit(1);
}

console.log(
  `Running ${String(files.length)} test files with concurrency=${String(concurrency)} (process-isolated)`,
);

let next = 0;
let failed = 0;
let passedFiles = 0;
const failures = [];

async function worker() {
  while (true) {
    const i = next++;
    if (i >= files.length) return;
    const file = files[i];
    const rel = relative(root, file);
    const proc = Bun.spawn(
      ['bun', 'test', '--preload', join(root, 'build/test-preload.ts'), file],
      {
        cwd: root,
        stdout: 'pipe',
        stderr: 'pipe',
        // BYF_TEST_ISOLATED: allow full-suite via per-file processes; root bare
        // `bun test` is rejected in build/test-preload.ts (mock.module leakage).
        env: { ...process.env, BYF_TEST_ISOLATED: '1' },
      },
    );
    const timeout = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }, perFileTimeoutMs);
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timeout);
    const output = stdout + stderr;
    if (exitCode === 0) {
      passedFiles += 1;
      // Keep output quiet for passes; print summary line if present
      const summary = output
        .split('\n')
        .toReversed()
        .find((l) => /^Ran \d+ tests/.test(l) || /\d+ pass/.test(l));
      if (process.env.BYF_TEST_VERBOSE) {
        process.stdout.write(output);
      } else if (summary) {
        console.log(`ok  ${rel}  ${summary}`);
      } else {
        console.log(`ok  ${rel}`);
      }
    } else {
      failed += 1;
      failures.push(rel);
      console.error(`\nFAIL ${rel} (exit ${String(exitCode)})\n`);
      process.stderr.write(output);
    }
  }
}

const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
await Promise.all(workers);

console.log(
  `\nFiles: ${String(passedFiles)} passed, ${String(failed)} failed / ${String(files.length)} total`,
);
if (failures.length > 0) {
  console.error('Failed files:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
process.exit(0);
