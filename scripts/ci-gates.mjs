#!/usr/bin/env bun
/**
 * PRD-0038 R5 (AC-5.1 … AC-5.5) — the CI gates that can be reproduced locally.
 *
 * Every gate in `.github/workflows/ci.yml` that is not an off-the-shelf action
 * runs through this file, so `bun run gate:<name>` on a laptop is exactly the
 * command CI runs. A gate nobody can reproduce is not a gate — it is a surprise
 * for the next person who opens a PR.
 *
 *   bun scripts/ci-gates.mjs secrets              AC-5.1  credential shapes
 *   bun scripts/ci-gates.mjs deps [--update]      AC-5.2  OSV / provenance / license
 *   bun scripts/ci-gates.mjs changesets --base X  AC-5.3  changeset existence
 *   bun scripts/ci-gates.mjs typecheck-ratchet    AC-5.4  test-surface type error count
 *   bun scripts/ci-gates.mjs no-node              AC-5.5  no `node` in the command surface
 *
 * `--update` writes a baseline (`deps` re-records the accepted advisory keys,
 * `typecheck-ratchet` the current error count). It is also the only way to create
 * `scripts/lib/test-typecheck-baseline.json` on a fresh clone.
 *
 * `deps` is the one gate that reaches the network (the OSV API). A failed query is
 * a hard red, never silence read as "no known vulnerabilities" — see the error
 * count in `gateDeps`. Reports land in `reports/dependency-audit.{md,json}`: local
 * output that CI uploads as an artifact and nobody is expected to commit.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { checkChangesetCoverage, collectChangedPaths } from './lib/check-changeset-coverage.mjs';
import {
  compareAdvisories,
  findLicenseViolations,
  findProvenanceViolations,
  listShippedDependencies,
  makeNodeModulesLicenseReader,
  parseLockfile,
  queryOsv,
  readAdvisoryBaseline,
  readIcp,
  renderMarkdownReport,
} from './lib/check-dependency-audit.mjs';
import {
  checkNodeInvocations,
  NODE_INVOCATION_EXCEPTIONS,
} from './lib/check-no-node-invocations.mjs';
import {
  applyAllowlist,
  collectFindingsForTrackedFiles,
  formatFindings,
  SECRET_ALLOWLIST,
} from './lib/check-secrets.mjs';
import {
  baselinePath,
  evaluateRatchet,
  readBaseline,
  readBaselineForUpdate,
  writeBaseline,
} from './lib/check-test-typecheck-ratchet.mjs';

const repoRoot = path.resolve(import.meta.dir, '..');

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

/* ------------------------------------------------------------------ secrets */

async function gateSecrets() {
  const findings = await collectFindingsForTrackedFiles(repoRoot, git);
  const { remaining, allowed, stale } = applyAllowlist(findings, SECRET_ALLOWLIST);

  console.log(
    `secrets: ${String(findings.length)} finding(s) across the tracked tree, ` +
      `${String(allowed.length)} allowlisted, ${String(remaining.length)} unacknowledged`,
  );
  if (remaining.length > 0) console.error(formatFindings(remaining));
  if (stale.length > 0) {
    fail(
      `allowlist entries no longer match anything and must be deleted (they would swallow ` +
        `the next real leak):\n${stale.map((key) => `  - ${key}`).join('\n')}`,
    );
  }
  if (remaining.length > 0) {
    fail(
      'credential-shaped content is present. If this value is genuinely not a secret, add an ' +
        'explicit SECRET_ALLOWLIST entry (exact file + rule id + what it is) in ' +
        'scripts/lib/check-secrets.mjs. Never disable the rule.',
    );
  }
  console.log('✓ secrets: clean');
}

/* -------------------------------------------------------------------- deps */

async function gateDeps(argv) {
  const update = argv.includes('--update');
  const skipOsv = argv.includes('--no-osv');
  const icp = await readIcp(repoRoot);
  const locked = parseLockfile(await readFile(path.join(repoRoot, 'bun.lock'), 'utf8'));
  const provenance = findProvenanceViolations(locked, icp);
  const shipped = await listShippedDependencies(repoRoot);
  const { violations: licenses, unresolved } = await findLicenseViolations(
    locked,
    shipped,
    icp,
    makeNodeModulesLicenseReader(repoRoot),
  );

  let advisories = [];
  let errors = 0;
  if (skipOsv) {
    console.warn(
      '! deps: OSV query skipped (--no-osv). Provenance and license judgments still ran. ' +
        'CI never passes this flag.',
    );
  } else {
    const result = await queryOsv(locked);
    advisories = result.advisories;
    errors = result.errors;
  }

  const baselineFile = path.join(repoRoot, 'scripts', 'lib', 'osv-advisory-baseline.json');
  const { keys: baselineKeys } = await readAdvisoryBaseline(repoRoot);
  const { fresh, resolved } = skipOsv
    ? { fresh: [], resolved: [] }
    : compareAdvisories(advisories, baselineKeys);

  const report = renderMarkdownReport({
    locked,
    advisories,
    fresh,
    resolved,
    provenance,
    licenses,
    unresolvedLicenses: unresolved,
    errors,
  });
  const outDir = path.join(repoRoot, 'reports');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'dependency-audit.md'), report, 'utf8');
  await writeFile(
    path.join(outDir, 'dependency-audit.json'),
    `${JSON.stringify({ locked, advisories, fresh, resolved, provenance, licenses, unresolved, errors }, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `deps: ${String(locked.length)} locked packages, ${String(advisories.length)} advisories ` +
      `(${String(fresh.length)} new, ${String(resolved.length)} resolved), ` +
      `${String(provenance.length)} provenance offender(s), ${String(licenses.length)} license ` +
      `offender(s), ${String(unresolved.length)} unresolved license lookups, ${String(errors)} OSV errors`,
  );
  console.log(`deps: report written to reports/dependency-audit.md`);

  if (update) {
    await writeAdvisoryBaseline(baselineFile, advisories, locked.length);
    console.log(`✓ deps: baseline re-recorded at ${path.relative(repoRoot, baselineFile)}`);
    return;
  }

  if (!skipOsv && errors > 0) {
    fail(
      `${String(errors)} of ${String(locked.length)} OSV queries failed — the audit did not complete. ` +
        'Do not read this as "no known vulnerabilities".',
    );
  }
  if (provenance.length > 0) {
    fail(
      `dependency sources outside scripts/lib/dependency-icp.json:\n` +
        provenance.map((entry) => `  - ${entry.host}: ${entry.note}`).join('\n'),
    );
  }
  if (licenses.length > 0) {
    fail(
      `licenses not allowed for redistributed dependencies:\n` +
        licenses.map((entry) => `  - ${entry.name}@${entry.version} → ${entry.license}`).join('\n'),
    );
  }
  if (!skipOsv && fresh.length > 0) {
    fail(
      `${String(fresh.length)} new advisories vs scripts/lib/osv-advisory-baseline.json:\n` +
        fresh
          .slice(0, 20)
          .map((entry) => `  - ${entry.id} ${entry.package}@${entry.version} [${entry.severity}]`)
          .join('\n') +
        (fresh.length > 20
          ? `\n  … ${String(fresh.length - 20)} more in reports/dependency-audit.md`
          : '') +
        `\nUpgrade the package, or record the accepted risk in the baseline with a reason ` +
        `(bun scripts/ci-gates.mjs deps --update writes the keys, not the justification).`,
    );
  }
  if (!skipOsv && resolved.length > 0) {
    fail(
      `${String(resolved.length)} baseline advisories are gone — the baseline is stale slack. ` +
        `Re-record it: bun scripts/ci-gates.mjs deps --update`,
    );
  }
  console.log('✓ deps: no new advisories, sources and licenses within policy');
}

async function writeAdvisoryBaseline(file, advisories, packageCount) {
  const keys = [
    ...new Set(advisories.map((entry) => `${entry.id}|${entry.package}@${entry.version}`)),
  ].sort();
  // Anything the file carries besides the generated keys is a written
  // justification (`_review` and friends) and must survive a re-record — the
  // gate's own failure text asks for that reason, so throwing it away on every
  // `--update` would make the accepted-risk record impossible to keep.
  const previous = await readFile(file, 'utf8')
    .then((raw) => JSON.parse(raw))
    .catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
      return {};
    });
  const preserved = Object.fromEntries(
    Object.entries(previous).filter(
      ([key]) => key !== 'advisories' && key !== 'lockedPackages' && key !== '_comment',
    ),
  );
  await writeFile(
    file,
    `${JSON.stringify(
      {
        _comment:
          'Advisory keys accepted as pre-existing on the day this gate landed (AC-5.2, PRD-0038 R5). ' +
          'Format: <GHSA|OSV id>|<package>@<version>. Anything not listed here fails `bun run gate:deps`. ' +
          'Re-record with `bun scripts/ci-gates.mjs deps --update` after the backlog moves; any other ' +
          'field in this file (e.g. `_review`) is preserved across a re-record.',
        lockedPackages: packageCount,
        ...preserved,
        advisories: keys,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

/* -------------------------------------------------------------- changesets */

async function gateChangesets(argv) {
  const flagIndex = argv.indexOf('--base');
  const base =
    flagIndex >= 0 && argv[flagIndex + 1]
      ? argv[flagIndex + 1]
      : (process.env.CHANGESET_BASE ?? 'origin/main');
  let changed;
  try {
    changed = collectChangedPaths(repoRoot, base, (cmd) => git(cmd));
  } catch (error) {
    fail(
      `cannot diff against "${base}" (${String(error).slice(0, 120)}). In CI the checkout must be ` +
        `full-history (fetch-depth: 0); locally, fetch the base branch first.`,
    );
    return;
  }
  const result = await checkChangesetCoverage(repoRoot, changed);
  if (result.releaseBump) {
    console.log(
      `changesets: ${String(changed.length)} changed path(s) are a version-bump diff — no changeset required`,
    );
    return;
  }
  console.log(
    `changesets: ${String(changed.length)} changed path(s), ${String(result.changesets.length)} pending changeset(s) ` +
      `covering [${result.changesets.flatMap((entry) => entry.packages).join(', ') || 'none'}]`,
  );
  if (result.missing.length === 0) {
    console.log('✓ changesets: every touched publishable package has a changeset');
    return;
  }
  const lines = result.missing.map(
    (entry) =>
      `  - ${entry.package}: ${entry.samplePaths.length} changed file(s) (e.g. ${entry.samplePaths[0]}) ` +
      `and no changeset names it. Pending changesets cover: ${entry.changesetPackages.join(', ') || 'nothing'}.`,
  );
  fail(
    `changed publishable package(s) without a changeset.\n${lines.join('\n')}\n` +
      `  Add one with \`bun run changeset\`, or follow .agents/skills/gen-changesets/SKILL.md ` +
      `(rule 6: pure docs/test changes are exempt — this diff was not).`,
  );
}

/* -------------------------------------------------------- typecheck ratchet */

async function gateTypecheckRatchet(argv) {
  const update = argv.includes('--update');
  const proc = Bun.spawn(['bun', 'x', 'tsc', '-p', 'tsconfig.test.json', '--noEmit'], {
    cwd: repoRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const output = `${stdout}\n${stderr}`;
  // `--update` is the initialisation path as well as the re-recording path, so it
  // must not require a baseline that does not exist yet. The checking path keeps
  // the hard failure: an unconfigured ratchet is not a passing ratchet.
  const { baseline, created } = update
    ? await readBaselineForUpdate(repoRoot)
    : { baseline: await readBaseline(repoRoot), created: false };
  const verdict = evaluateRatchet({ output, exitCode, baseline: baseline.errors });

  console.log(
    `typecheck-ratchet: current ${String(verdict.current)} error(s), baseline ${String(verdict.baseline)}` +
      `${created ? ' (no baseline file yet — --update would create it)' : ''} ` +
      `(${path.relative(repoRoot, baselinePath(repoRoot))})`,
  );

  if (verdict.status === 'tool-failure') {
    fail(`${verdict.message}\n${output.slice(0, 2000)}`);
  }
  if (update) {
    await writeBaseline(repoRoot, { ...baseline, errors: verdict.current });
    console.log(
      `✓ typecheck-ratchet: baseline ${created ? 'initialised' : 're-recorded'} at ` +
        `${String(verdict.current)} error(s)`,
    );
    return;
  }
  if (verdict.status === 'regression') {
    console.error(verdict.errors.slice(0, 40).join('\n'));
    fail(
      `test-surface type errors grew from ${String(verdict.baseline)} to ${String(verdict.current)} (+${String(verdict.current - verdict.baseline)}). ` +
        `#306 tracks the backlog; this gate only holds the line. Fix, or lower the baseline if you removed errors.`,
    );
  }
  if (verdict.status === 'stale-baseline') {
    fail(
      `test-surface type errors dropped to ${String(verdict.current)} but the baseline says ` +
        `${String(verdict.baseline)}. Tighten it: bun scripts/ci-gates.mjs typecheck-ratchet --update`,
    );
  }
  console.log('✓ typecheck-ratchet: at baseline');
}

/* ------------------------------------------------------------------ no-node */

async function gateNoNode() {
  const result = await checkNodeInvocations(repoRoot);
  console.log(
    `no-node: ${String(result.scanned)} command line(s) scanned ` +
      `(package.json scripts + workflow run steps), ${String(result.exceptioned.length)} allowlisted, ` +
      `${String(result.violations.length)} violating`,
  );
  for (const violation of result.violations) {
    console.error(`  - ${violation.key}: ${violation.command}`);
  }
  const problems = [
    ...result.tableProblems,
    ...result.staleExceptions.map((key) => `stale exception: ${key}`),
  ];
  if (problems.length > 0) {
    fail(`exception table is inconsistent:\n${problems.map((line) => `  - ${line}`).join('\n')}`);
  }
  if (result.violations.length > 0) {
    fail(
      `node appears in the command surface. ADR-0028 makes Bun the only toolchain; every script here ` +
        `must run under \`bun\`. The single sanctioned exception is the consumer-facing install hook ` +
        `(${NODE_INVOCATION_EXCEPTIONS.map((entry) => entry.key).join(', ')}).`,
    );
  }
  console.log('✓ no-node: Bun only');
}

/* ------------------------------------------------------------------- router */

const [, , command, ...rest] = process.argv;
switch (command) {
  case 'secrets':
    await gateSecrets();
    break;
  case 'deps':
    await gateDeps(rest);
    break;
  case 'changesets':
    await gateChangesets(rest);
    break;
  case 'typecheck-ratchet':
    await gateTypecheckRatchet(rest);
    break;
  case 'no-node':
    await gateNoNode();
    break;
  default:
    console.error(
      `usage: bun scripts/ci-gates.mjs <secrets|deps|changesets|typecheck-ratchet|no-node> [--update] [--base <ref>]`,
    );
    process.exit(2);
}
