/**
 * AC-2.1 (PRD-0038 R2) — layered-architecture gate for the `apps/**` layer.
 *
 * The constraint being enforced is a pre-existing hard rule, previously prose-only:
 *   - root `AGENTS.md`: "apps/cli … must not depend directly on @byfriends/agent-core"
 *   - `apps/cli/AGENTS.md`: "apps/cli may only use core capabilities through @byfriends/sdk"
 *   - ADR-0006 「关键不变式」: 禁止 CLI → agent-core 依赖；SDK 是唯一访问路径
 *   - `apps/web/AGENTS.md`: web-server / web-client 运行时不得直引 @byfriends/agent-core
 *
 * Shape follows the in-repo precedent `apps/cli/test/tui/printable-key-guard.test.ts`:
 * plain regex scan over source text + an explicit exception table + a negative
 * self-test so the gate itself is provably not a no-op. No new tooling
 * (no dependency-cruiser / eslint-plugin-boundaries) per PRD-0038 Technical Approach.
 *
 * Scopes:
 *   - `src`  — files under an `apps/**` `src/` directory that are not test files.
 *              A violation here FAILS the gate.
 *   - `test` — test/spec files anywhere under `apps/**`, or files under a
 *              `test/` / `tests/` / `__tests__` directory. Counted and reported
 *              separately against `APP_TEST_VIOLATION_BUDGET` so app tests can be
 *              migrated without blocking the source-layer rule.
 *
 * Detection is deliberately structural (module-specifier positions only):
 * `from '…'`, bare `import '…'`, `import('…')`, `require('…')`. Relative
 * specifiers that escape into `packages/agent-core/**` count too, otherwise the
 * package-name rule could be bypassed with `../../../packages/agent-core/src/…`.
 * Comments are skipped line-by-line; the scan is not a full parse.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** Packages the apps layer may never import directly. */
export const FORBIDDEN_PACKAGES = Object.freeze(['@byfriends/agent-core']);

/** Repo directories the apps layer may never reach through a relative specifier. */
export const FORBIDDEN_RELATIVE_DIRS = Object.freeze(['packages/agent-core']);

/**
 * Explicit exception table. Every entry is one exact file plus a written reason.
 *
 * Deliberately empty. Both candidate exceptions were checked against the code and
 * neither needs an entry:
 *   - `byf vis`: removed in PRD-0038 R5 (AC-5.6). `apps/vis/server/src/**` was a
 *     deprecated re-export shim of `@byfriends/web-server` (PRD-0035 R-B5 /
 *     ADR-0037 D1) that imported `@byfriends/agent-core` nowhere, so the retired
 *     `apps/cli/AGENTS.md` vis-server clause described a transitive dependency that
 *     no longer existed. The package directory is gone; nothing here can reference it.
 *   - Test files: no app test imports the package by name, and the single
 *     test-scope escape that did exist (a relative reach into
 *     `packages/agent-core/src/logging/logger` from
 *     `apps/cli/test/e2e/local-logging-export.e2e.test.ts`) was closed by routing
 *     that test through `@byfriends/sdk`'s public surface, so the test budget below
 *     is 0 rather than a whitelisted exception.
 *
 * A directory prefix, glob or wildcard is rejected by `validateExceptionTable`, so
 * an exception can never silently widen into a whole-folder exemption.
 *
 * @type {ReadonlyArray<{ file: string, specifier: string, reason: string }>}
 */
export const LAYERING_EXCEPTIONS = Object.freeze([]);

/** Budget for violations found in the `test` scope. Ratchet — lower it, never
 * raise it without a written justification in the PRD-0038 record.
 *
 * 0 as of PRD-0038 R5 (AC-2.1 收口). It was introduced at 1 to hold a single known
 * escape — an e2e test reaching `__resetRootLoggerForTest` (an `@internal` hook) by
 * relative path. That test now flushes through `flushDiagnosticLogs()` from
 * `@byfriends/sdk` and lets `ByfHarness` re-point the root logger, which is the
 * documented public behaviour, so there is nothing left to tolerate. The source
 * layer (hard fail, budget 0) and the test layer are now held to the same line.
 */
export const APP_TEST_VIOLATION_BUDGET = 0;

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.jsx']);

/** Directory names never walked (build output, installed copies, VCS, coverage). */
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'dist-types',
  'coverage',
  'build',
  '.git',
]);

const TEST_FILE_PATTERN = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const TEST_DIRECTORY_SEGMENTS = new Set(['test', 'tests', '__tests__']);

// Module-specifier positions. `\s*` then an optional `(` lets `import('x')` and
// `require('x')` match while `importFoo('x')` cannot (no separator after `import`).
const MODULE_SPECIFIER = /\b(?:from|import|require)\s*(?:\(\s*)?['"]([^'"\n]+)['"]/g;

/**
 * @param {string} repoRoot absolute repository root
 * @returns {Promise<Array<{ absolute: string, relative: string, scope: 'src' | 'test' }>>}
 */
export async function collectAppFiles(repoRoot) {
  const appsRoot = path.join(repoRoot, 'apps');
  const files = [];
  await walkApps(appsRoot, repoRoot, files);
  files.sort((a, b) => a.relative.localeCompare(b.relative));
  return files;
}

async function walkApps(dir, repoRoot, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // no `apps/` directory in this checkout
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      await walkApps(full, repoRoot, out);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    const relative = path.relative(repoRoot, full).split(path.sep).join('/');
    const scope = classifyScope(relative, entry.name);
    if (scope === null) continue;
    out.push({ absolute: full, relative, scope });
  }
}

/**
 * `test` wins over `src` so a spec file that happens to live inside `src/`
 * (e.g. `apps/web/server/src/web-server.test.ts`) is judged by the test budget.
 *
 * @returns {'src' | 'test' | null}
 */
function classifyScope(relative, basename) {
  const segments = relative.split('/');
  const directorySegments = segments.slice(0, -1);
  const isTest =
    TEST_FILE_PATTERN.test(basename) ||
    directorySegments.some((segment) => TEST_DIRECTORY_SEGMENTS.has(segment));
  if (isTest) return 'test';
  return directorySegments.includes('src') ? 'src' : null;
}

/**
 * All module specifiers referenced by a source text, with line numbers.
 *
 * @param {string} text
 * @returns {Array<{ specifier: string, line: number, snippet: string }>}
 */
export function extractSpecifiers(text) {
  const found = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    // Skip comment lines: prose legitimately names the forbidden package.
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    MODULE_SPECIFIER.lastIndex = 0;
    let match;
    while ((match = MODULE_SPECIFIER.exec(line)) !== null) {
      found.push({ specifier: match[1] ?? '', line: i + 1, snippet: trimmed });
    }
  }
  return found;
}

/**
 * @param {string} specifier
 * @param {string} fileAbsolute absolute path of the importing file
 * @param {string} repoRoot
 * @returns {string | null} the forbidden package/directory this specifier reaches
 */
export function classifySpecifier(specifier, fileAbsolute, repoRoot) {
  for (const pkg of FORBIDDEN_PACKAGES) {
    if (specifier === pkg || specifier.startsWith(`${pkg}/`)) return pkg;
  }
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const resolved = path.resolve(path.dirname(fileAbsolute), specifier);
    const relative = path.relative(repoRoot, resolved).split(path.sep).join('/');
    for (const dir of FORBIDDEN_RELATIVE_DIRS) {
      if (relative === dir || relative.startsWith(`${dir}/`)) return dir;
    }
  }
  return null;
}

/**
 * Scan one file body for forbidden module specifiers.
 *
 * @param {string} text
 * @param {{ absolute: string, relative: string }} file
 * @param {string} repoRoot
 */
export function findForbiddenImportsInText(text, file, repoRoot) {
  const violations = [];
  for (const hit of extractSpecifiers(text)) {
    const forbidden = classifySpecifier(hit.specifier, file.absolute, repoRoot);
    if (forbidden === null) continue;
    violations.push({ ...file, ...hit, forbidden });
  }
  return violations;
}

/**
 * @param {{ file: string, specifier?: string }[]} exceptions
 * @returns {string[]} problems with the exception table itself (shape violations)
 */
export function validateExceptionTable(exceptions) {
  const problems = [];
  const seen = new Set();
  for (const exception of exceptions) {
    const file = exception.file;
    if (typeof file !== 'string' || file.length === 0) {
      problems.push('exception entry is missing an exact `file` path');
      continue;
    }
    if (file.endsWith('/') || file.includes('*') || file.includes('?')) {
      problems.push(
        `exception "${file}" is a directory/glob pattern; only exact file paths are allowed ` +
          '(a folder-wide exemption is what this gate exists to prevent)',
      );
      continue;
    }
    if (seen.has(file)) problems.push(`duplicate exception entry for "${file}"`);
    seen.add(file);
    if (!exception.reason) problems.push(`exception "${file}" has no reason`);
  }
  return problems;
}

function isExceptioned(violation, exceptions) {
  return exceptions.some(
    (exception) =>
      exception.file === violation.relative &&
      (exception.specifier == null ||
        exception.specifier === violation.forbidden ||
        violation.specifier === exception.specifier),
  );
}

/**
 * Run the gate.
 *
 * @param {string} repoRoot
 * @param {{ exceptions?: ReadonlyArray<{ file: string, specifier?: string, reason: string }> }} [options]
 */
export async function checkAppLayering(repoRoot, options = {}) {
  const exceptions = options.exceptions ?? LAYERING_EXCEPTIONS;
  const files = await collectAppFiles(repoRoot);
  const all = [];
  for (const file of files) {
    let text;
    try {
      text = await readFile(file.absolute, 'utf8');
    } catch {
      continue;
    }
    all.push(...findForbiddenImportsInText(text, file, repoRoot));
  }

  const exceptioned = all.filter((violation) => isExceptioned(violation, exceptions));
  const remaining = all.filter((violation) => !isExceptioned(violation, exceptions));
  const exceptionFiles = new Set(exceptioned.map((violation) => violation.relative));

  return {
    filesScanned: files.length,
    srcViolations: remaining.filter((violation) => violation.scope === 'src'),
    testViolations: remaining.filter((violation) => violation.scope === 'test'),
    exceptioned,
    // An exception whose file no longer violates is a rot signal, not a free pass:
    // it would silently swallow the next violation added to that file.
    staleExceptions: exceptions
      .filter((exception) => !exceptionFiles.has(exception.file))
      .map((exception) => exception.file),
    tableProblems: validateExceptionTable([...exceptions]),
  };
}
