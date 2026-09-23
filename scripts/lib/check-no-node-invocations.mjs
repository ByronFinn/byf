/**
 * AC-5.5 (PRD-0038 R5) — no `node` left in the CI / dev command surface.
 *
 * ADR-0028 makes Bun the only official toolchain, and ADR-0020/0028 removed the
 * Node interpreter from every documented run path. `bun run publish` also runs
 * `bun scripts/with-publish-manifests.mjs`… but until now nothing stopped a
 * `node scripts/…` line from creeping back into a package.json script or a
 * workflow step (release.yml shipped one inline `node -e` for exactly that
 * reason). This gate locks the cleanup down.
 *
 * Scope — only the places where a command line is actually *executed*:
 *   - every workspace `package.json` `scripts.<name>` value
 *   - every `run:` block in `.github/workflows/*.yml`
 * Markdown and comments are deliberately out of scope: prose legitimately names
 * the interpreter (e.g. this file), and `*.sh` installers are end-user code that
 * must work without Bun. Shebangs are out of scope too — no call site executes
 * these files directly; every one is invoked as `bun scripts/…`.
 *
 * Shape follows the in-repo precedent `scripts/lib/check-app-layering.mjs`:
 * regex scan + an explicit exception table (exact key + written reason) + a
 * negative self-test, so the gate provably is not a no-op and an exception can
 * never widen into a whole-folder exemption.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * `node` as a command word, followed by a flag or a path. Deliberately narrow:
 * `nodemon`, `nodejs`, `$node_bin` and `… | node` prose do not match, and neither
 * does `actions/setup-node`.
 */
const NODE_INVOCATION = /\bnode\s+(?:-[\w-]|\.?\/?[\w.$/ -]+\.(?:m|c)?js\b|"[^"\n]*\.mjs")/;

/**
 * Exact-key exception table. Key = `<relative package.json>#<script name>` or
 * `<workflow file>#<step name>`. Every entry needs a reason.
 *
 * `@byfriends/cli#postinstall` is the one command line that must keep running on
 * the *consumer's* machine: npm/yarn/bun invoke it after installing the published
 * tarball, and per PRD-0020 the end user needs neither Bun nor a Node install of
 * their own — the package manager's bundled Node is what is guaranteed to exist.
 * Rewriting it to `bun` would break `npm install -g @byfriends/cli` for everyone
 * without Bun on PATH, so this is a distribution contract, not toolchain drift.
 *
 * @type {ReadonlyArray<{ key: string, reason: string }>}
 */
export const NODE_INVOCATION_EXCEPTIONS = Object.freeze([
  Object.freeze({
    key: 'apps/cli/package.json#postinstall',
    reason:
      'runs on the consumer machine under npm/yarn (PRD-0020: no Bun preinstall required); ' +
      'the package manager guarantees its own Node interpreter',
  }),
]);

/**
 * @param {string} text one command line / `run:` block
 * @returns {string[]} the offending lines
 */
export function findNodeInvocations(text) {
  const hits = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    if (NODE_INVOCATION.test(trimmed)) hits.push(trimmed);
  }
  return hits;
}

/**
 * @param {string} repoRoot
 * @returns {Promise<Array<{ key: string, command: string }>>}
 */
export async function collectCommandSurface(repoRoot) {
  const entries = [];

  for (const manifest of await findWorkspaceManifests(repoRoot)) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(manifest, 'utf8'));
    } catch {
      continue;
    }
    const relative = path.relative(repoRoot, manifest).split(path.sep).join('/');
    for (const [name, command] of Object.entries(parsed.scripts ?? {})) {
      if (typeof command !== 'string') continue;
      entries.push({ key: `${relative}#${name}`, command });
    }
  }

  for (const workflow of await findWorkflows(repoRoot)) {
    const text = await readFile(workflow, 'utf8');
    const relative = path.relative(repoRoot, workflow).split(path.sep).join('/');
    for (const block of extractRunBlocks(text)) {
      entries.push({ key: `${relative}#${block.step}`, command: block.body });
    }
  }

  return entries;
}

/** Every `package.json` reachable from the root `workspaces` globs, plus the root itself. */
async function findWorkspaceManifests(repoRoot) {
  const found = [path.join(repoRoot, 'package.json')];
  let rootManifest;
  try {
    rootManifest = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  } catch {
    return found;
  }
  const globs = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : (rootManifest.workspaces?.packages ?? []);
  for (const glob of globs) {
    for (const dir of await expandGlob(repoRoot, glob)) {
      found.push(path.join(repoRoot, dir, 'package.json'));
    }
  }
  return found;
}

async function expandGlob(repoRoot, glob) {
  if (glob.endsWith('/*')) {
    const prefix = glob.slice(0, -2);
    let entries;
    try {
      entries = await readdir(path.join(repoRoot, prefix), { withFileTypes: true });
    } catch {
      return [];
    }
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => path.join(prefix, entry.name));
  }
  if (glob.endsWith('/*/*')) {
    // `apps/cli/npm/*` style: one extra level.
    const prefix = glob.slice(0, -4);
    let outer;
    try {
      outer = await readdir(path.join(repoRoot, prefix), { withFileTypes: true });
    } catch {
      return [];
    }
    const result = [];
    for (const dir of outer.filter((entry) => entry.isDirectory())) {
      for (const nested of await expandGlob(repoRoot, path.join(prefix, dir.name, '*'))) {
        result.push(nested);
      }
    }
    return result;
  }
  try {
    await stat(path.join(repoRoot, glob));
    return [glob];
  } catch {
    return [];
  }
}

async function findWorkflows(repoRoot) {
  const dir = path.join(repoRoot, '.github', 'workflows');
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => path.join(dir, name));
}

/**
 * Pull each step's `name` + `run` body out of a workflow file.
 *
 * Minimal YAML handling on purpose (no parser dependency): a step block starts at
 * `- ` and its script lives under `run:` as either a single line or an indented
 * `|` / `>` block. Everything more indented than the `run:` key belongs to it.
 *
 * @param {string} text
 * @returns {Array<{ step: string, body: string }>}
 */
export function extractRunBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let currentStep = '(unnamed step)';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const stepName = /^\s*(?:-\s+)?name:\s*['"]?(.+?)['"]?\s*$/.exec(line);
    if (stepName?.[1]) currentStep = stepName[1].trim();
    const run = /^\s*(?:-\s+)?run:\s*(.*)$/.exec(line);
    if (!run) continue;
    const indent = (line.match(/^\s*/)?.[0] ?? '').length;
    const inline = (run[1] ?? '').trim();
    if (inline !== '' && !inline.startsWith('|') && !inline.startsWith('>')) {
      blocks.push({ step: currentStep, body: inline });
      continue;
    }
    const body = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? '';
      const nextIndent = (next.match(/^\s*/)?.[0] ?? '').length;
      if (next.trim() !== '' && nextIndent <= indent) break;
      body.push(next);
    }
    blocks.push({ step: currentStep, body: body.join('\n') });
  }
  return blocks;
}

/**
 * @param {string[]} exceptionKeys
 * @returns {string[]} problems with the exception table itself
 */
export function validateExceptionTable(exceptionKeys) {
  const problems = [];
  const seen = new Set();
  for (const entry of exceptionKeys) {
    const key = entry.key;
    if (typeof key !== 'string' || !key.includes('#')) {
      problems.push(`exception "${key}" must be "<file>#<script or step>"`);
      continue;
    }
    if (key.includes('*') || key.endsWith('#')) {
      problems.push(`exception "${key}" is a pattern; only exact command keys are allowed`);
    }
    if (!entry.reason) problems.push(`exception "${key}" has no reason`);
    if (seen.has(key)) problems.push(`duplicate exception for "${key}"`);
    seen.add(key);
  }
  return problems;
}

/**
 * @param {string} repoRoot
 * @param {{ exceptions?: ReadonlyArray<{ key: string, reason: string }> }} [options]
 */
export async function checkNodeInvocations(repoRoot, options = {}) {
  const exceptions = options.exceptions ?? NODE_INVOCATION_EXCEPTIONS;
  const surface = await collectCommandSurface(repoRoot);
  const exceptionKeys = new Set(exceptions.map((entry) => entry.key));

  const violations = [];
  const exceptioned = [];
  for (const entry of surface) {
    const hits = findNodeInvocations(entry.command);
    if (hits.length === 0) continue;
    const record = { key: entry.key, command: hits[0] ?? '', hits: hits.length };
    if (exceptionKeys.has(entry.key)) exceptioned.push(record);
    else violations.push(record);
  }

  const keys = new Set(surface.map((entry) => entry.key));
  return {
    scanned: surface.length,
    violations,
    exceptioned,
    // An exception whose command no longer invokes node is rot, not a free pass.
    staleExceptions: exceptions
      .filter((entry) => !violations.some((violation) => violation.key === entry.key))
      .filter((entry) => !exceptioned.some((used) => used.key === entry.key))
      .map((entry) => entry.key)
      .filter((key) => keys.has(key)),
    tableProblems: validateExceptionTable([...exceptions]),
  };
}
