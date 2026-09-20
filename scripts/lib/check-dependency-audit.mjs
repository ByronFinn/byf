/**
 * AC-5.2 (PRD-0038 R5) — dependency audit in the gate, with a readable report.
 *
 * Three independent judgments, all computed from `bun.lock` (the resolved install
 * state) so they agree with what `bun install` actually puts on disk:
 *
 *   1. **Known vulnerabilities.** Every locked package+version is queried against
 *      OSV (https://api.osv.dev, no API key, no new dependency). The result is
 *      compared against a checked-in advisory baseline: a *new* advisory is red, a
 *      resolved one is red too (stale baseline = silent slack). The backlog is
 *      real (129 advisories over 1288 packages on the day this gate landed), so
 *      the baseline is what makes "don't make it worse" enforceable today rather
 *      than after someone fixes 129 things.
 *   2. **Provenance.** The set of registry hosts in the lock is an allowlist
 *      (`dependency-icp.json`). A dependency fetched from a new host, a git URL or
 *      a local path is red — that is how a hijacked or typosquatted source shows
 *      up before it ships inside `@byfriends/cli`.
 *   3. **License of what we redistribute.** Only the *published* packages' runtime
 *      dependencies are checked, because those are the ones that travel to users
 *      inside a bundle. An unknown or disallowed license there is red.
 *
 * CI additionally runs the upstream `osv-scanner` action (which reads `bun.lock`
 * natively and understands fix versions better than a flat query). That step is
 * report-only for a stated reason in ci.yml; the blocking decision is this file,
 * because this file can be run — and was run — on a contributor machine.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { listPublishablePackages } from './list-publishable-packages.mjs';

const OSV_QUERY_URL = 'https://api.osv.dev/v1/query';
const OSV_ECOSYSTEM = 'npm';
const OSV_CONCURRENCY = 12;

/**
 * @typedef {{ name: string, version: string, source: string }} LockedPackage
 */

/**
 * Bun writes `bun.lock` as JSON with trailing commas, which `JSON.parse` rejects.
 * Stripping the trailing commas is enough and keeps this dependency-free.
 *
 * @param {string} text
 * @returns {LockedPackage[]} external packages only (workspace entries are skipped)
 */
export function parseLockfile(text) {
  const data = JSON.parse(text.replace(/,(\s*[\]}])/g, '$1'));
  const result = [];
  for (const value of Object.values(data.packages ?? {})) {
    if (!Array.isArray(value)) continue;
    const [spec, source] = value;
    if (typeof spec !== 'string' || typeof source !== 'string') continue;
    if (source.startsWith('workspace:')) continue;
    const at = spec.lastIndexOf('@');
    if (at <= 0) continue;
    result.push({ name: spec.slice(0, at), version: spec.slice(at + 1), source });
  }
  return result.sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`));
}

/** Registry host of a tarball source, or `null` when it is not an http(s) URL. */
export function sourceHost(source) {
  if (!/^https?:\/\//i.test(source)) return null;
  try {
    return new URL(source).host;
  } catch {
    return null;
  }
}

/**
 * @param {LockedPackage[]} locked
 * @param {{ allowedRegistryHosts: string[] }} icp
 */
export function findProvenanceViolations(locked, icp) {
  const allowed = new Set(icp.allowedRegistryHosts);
  const offenders = new Map();
  for (const pkg of locked) {
    const host = sourceHost(pkg.source);
    if (host !== null && allowed.has(host)) continue;
    const key = host ?? pkg.source;
    const label = host === null ? 'non-registry source' : `registry host "${host}"`;
    if (!offenders.has(key)) {
      offenders.set(key, { host: key, label, count: 0, sample: '', note: '' });
    }
    const entry = offenders.get(key);
    if (!entry) continue;
    entry.count += 1;
    if (entry.sample === '') entry.sample = `${pkg.name}@${pkg.version}`;
    entry.note =
      host === null
        ? 'not an http(s) tarball — git/file/link protocols bypass the registry integrity story'
        : 'host is not in scripts/lib/dependency-icp.json allowedRegistryHosts';
  }
  return [...offenders.values()];
}

/**
 * `readLicense` resolves a package's declared license from the install tree:
 *   - `{ resolved: false }`  — the package is not on disk (peer-only, optional,
 *        platform-specific, or installed under a different layout). Reported, but
 *        not a violation: the gate has no basis to judge what it cannot read.
 *   - `{ license: NO_LICENSE }` — installed, manifest read, but no license field.
 *        That *is* a redistribution risk and it is blocking.
 *
 * @param {LockedPackage[]} locked
 * @param {Array<{ name: string, range: string }>} directDependencies
 * @param {{ licenseAllowlist: string[] }} icp
 * @param {(name: string, version: string) => Promise<{ resolved: boolean, license: string }>} readLicense
 */
export async function findLicenseViolations(locked, directDependencies, icp, readLicense) {
  const allowed = new Set(icp.licenseAllowlist);
  const byName = new Map();
  for (const pkg of locked) {
    if (!byName.has(pkg.name)) byName.set(pkg.name, []);
    byName.get(pkg.name)?.push(pkg.version);
  }
  /** @type {Array<{ name: string, version: string, license: string }>} */
  const violations = [];
  /** @type {Array<{ name: string, version: string }>} */
  const unresolved = [];
  for (const dependency of directDependencies) {
    for (const version of byName.get(dependency.name) ?? []) {
      const answer = await readLicense(dependency.name, version);
      if (!answer.resolved) {
        unresolved.push({ name: dependency.name, version });
        continue;
      }
      if (!allowed.has(answer.license)) {
        violations.push({ name: dependency.name, version, license: answer.license });
      }
    }
  }
  return { violations, unresolved };
}

/** Read the license Bun actually installed, following the isolated linker layout. */
export function makeNodeModulesLicenseReader(repoRoot) {
  const cache = new Map();
  return async (name, version) => {
    const key = `${name}@${version}`;
    const cached = cache.get(key);
    if (cached) return cached;
    const candidates = [
      path.join(
        repoRoot,
        'node_modules',
        '.bun',
        `${name.replace(/\//g, '+')}@${version}`,
        'node_modules',
        name,
        'package.json',
      ),
      path.join(repoRoot, 'node_modules', name, 'package.json'),
    ];
    for (const candidate of candidates) {
      try {
        const manifest = JSON.parse(await readFile(candidate, 'utf8'));
        if (manifest.name !== name || manifest.version !== version) continue;
        const answer = {
          resolved: true,
          license: typeof manifest.license === 'string' ? manifest.license : 'NO_LICENSE',
        };
        cache.set(key, answer);
        return answer;
      } catch {
        continue;
      }
    }
    const answer = { resolved: false, license: 'UNRESOLVED' };
    cache.set(key, answer);
    return answer;
  };
}

/** @param {{ name: string, version: string }} pkg */
export function osvQuery(pkg) {
  return {
    version: pkg.version,
    package: { name: pkg.name, ecosystem: OSV_ECOSYSTEM },
  };
}

/**
 * OSV's public API has no batch endpoint (`/v1/query` answers one package per
 * request), so this fans out with bounded concurrency.
 *
 * @param {LockedPackage[]} locked
 * @param {{ fetchImpl?: typeof fetch, concurrency?: number }} [options]
 * @returns {Promise<{ advisories: Array<{ id: string, aliases: string[], package: string, version: string, severity: string, summary: string }>, errors: number }>}
 */
export async function queryOsv(locked, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const concurrency = options.concurrency ?? OSV_CONCURRENCY;
  const advisories = [];
  let errors = 0;
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= locked.length) return;
      const pkg = locked[index];
      if (!pkg) return;
      try {
        const response = await fetchImpl(OSV_QUERY_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(osvQuery(pkg)),
        });
        if (!response.ok) {
          errors += 1;
          continue;
        }
        const body = /** @type {{ vulns?: Array<Record<string, unknown>>} } */ (
          await response.json()
        );
        for (const vuln of body.vulns ?? []) {
          advisories.push({
            id: String(vuln.id ?? ''),
            aliases: (Array.isArray(vuln.aliases) ? vuln.aliases : []).map(String),
            package: pkg.name,
            version: pkg.version,
            severity: pickSeverity(vuln),
            summary: String(vuln.summary ?? vuln.details ?? '').split('\n')[0] ?? '',
          });
        }
      } catch {
        errors += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return { advisories, errors };
}

function pickSeverity(vuln) {
  const entries = Array.isArray(vuln.severity) ? vuln.severity : [];
  const scores = entries
    .map((entry) => (typeof entry?.score === 'string' ? entry.score : ''))
    .filter(Boolean);
  const dbi = Array.isArray(vuln.database_specific) ? vuln.database_specific : [];
  for (const item of dbi) {
    const value = item?.severity ?? item?.database_specific?.severity;
    if (typeof value === 'string' && value.length > 0) scores.push(value);
  }
  return scores.length > 0 ? scores.join(',') : 'unrated';
}

/** Advisory identity used for the baseline: `GHSA-x|lodash@4.17.20`. */
export function advisoryKey(advisory) {
  return `${advisory.id}|${advisory.package}@${advisory.version}`;
}

/**
 * @param {Array<{ id: string, package: string, version: string }>} found
 * @param {string[]} baseline keys
 */
export function compareAdvisories(found, baseline) {
  const known = new Set(baseline);
  const seen = new Set();
  const fresh = [];
  for (const advisory of found) {
    const key = advisoryKey(advisory);
    if (known.has(key)) {
      seen.add(key);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(advisory);
  }
  return {
    fresh: fresh.sort((a, b) => advisoryKey(a).localeCompare(advisoryKey(b))),
    resolved: [...known].filter((key) => !found.some((advisory) => advisoryKey(advisory) === key)),
  };
}

/**
 * The runtime dependencies that actually travel to a user: every publishable
 * package's `dependencies` + `optionalDependencies` (workspace packages excluded —
 * those are us, and `@byfriends/sdk` inlines agent-core etc. into its bundle).
 *
 * @param {string} repoRoot
 */
export async function listShippedDependencies(repoRoot) {
  const found = new Map();
  for (const pkg of await listPublishablePackages()) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(pkg.path, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    for (const section of ['dependencies', 'optionalDependencies']) {
      for (const [name, range] of Object.entries(manifest[section] ?? {})) {
        if (name.startsWith('@byfriends/')) continue;
        if (typeof range !== 'string' || range.startsWith('workspace:')) continue;
        found.set(name, { name, range });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const SEVERITY_RANK = ['critical', 'high', 'medium', 'low', 'unrated'];

/**
 * Human-readable report for the CI artifact. Keep it in one place so the job log,
 * the uploaded file and a local run say the same thing.
 *
 * @param {{
 *   locked: LockedPackage[],
 *   advisories: Array<{ id: string, package: string, version: string, severity: string, summary: string }>,
 *   fresh: Array<{ id: string, package: string, version: string, severity: string, summary: string }>,
 *   resolved: string[],
 *   provenance: Array<{ host: string, label: string, count: number, sample: string }>,
 *   licenses: Array<{ name: string, version: string, license: string }>,
 *   unresolvedLicenses: Array<{ name: string, version: string }>,
 *   errors: number,
 * }} input
 */
export function renderMarkdownReport(input) {
  const bySeverity = new Map();
  for (const advisory of input.advisories) {
    for (const rank of SEVERITY_RANK.filter((name) => advisory.severity.includes(name))) {
      bySeverity.set(rank, (bySeverity.get(rank) ?? 0) + 1);
    }
  }
  const lines = [
    '# Dependency audit',
    '',
    `- locked external packages: **${String(input.locked.length)}**`,
    `- OSV requests that failed: **${String(input.errors)}**`,
    `- advisories reported: **${String(input.advisories.length)}** (${[...bySeverity.entries()]
      .map(([severity, count]) => `${severity} ${String(count)}`)
      .join(', ')})`,
    `- **new** since the baseline: **${String(input.fresh.length)}**`,
    `- resolved since the baseline: **${String(input.resolved.length)}**`,
    `- provenance offenders: **${String(input.provenance.length)}**`,
    `- license offenders: **${String(input.licenses.length)}**`,
    `- license lookups unresolved (not blocking, reported): **${String(input.unresolvedLicenses.length)}**`,
    '',
    '## New advisories (blocking)',
    '',
    '| id | package | severity | summary |',
    '| --- | --- | --- | --- |',
    ...input.fresh.map(
      (advisory) =>
        `| ${advisory.id} | ${advisory.package}@${advisory.version} | ${advisory.severity} | ${advisory.summary.slice(0, 120)} |`,
    ),
    '',
    '## Provenance (blocking)',
    '',
    ...input.provenance.map(
      (entry) =>
        `- \`${entry.host}\` — ${entry.label} (${String(entry.count)} entries, e.g. ${entry.sample})`,
    ),
    '',
    '## Licenses of redistributed dependencies (blocking)',
    '',
    ...input.licenses.map((entry) => `- ${entry.name}@${entry.version} → \`${entry.license}\``),
    '',
    '## License lookups that found nothing on disk (informational)',
    '',
    ...input.unresolvedLicenses.map((entry) => `- ${entry.name}@${entry.version}`),
  ];
  return `${lines.join('\n')}\n`;
}

export async function readIcp(repoRoot) {
  const file = path.join(repoRoot, 'scripts', 'lib', 'dependency-icp.json');
  const icp = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(icp.allowedRegistryHosts) || !Array.isArray(icp.licenseAllowlist)) {
    throw new Error(`${file}: expected allowedRegistryHosts[] and licenseAllowlist[]`);
  }
  return icp;
}

export async function readAdvisoryBaseline(repoRoot) {
  const file = path.join(repoRoot, 'scripts', 'lib', 'osv-advisory-baseline.json');
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'));
    return { file, keys: Array.isArray(raw.advisories) ? raw.advisories.map(String) : [] };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return { file, keys: [] };
    }
    throw error;
  }
}

export { OSV_QUERY_URL, OSV_CONCURRENCY };
