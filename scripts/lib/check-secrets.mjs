/**
 * AC-5.1 (PRD-0038 R5) — credential shapes in the repository fail the build.
 *
 * CI had no secret scanning at all; `.github/workflows/ci.yml` now runs this file
 * through `bun scripts/ci-gates.mjs secrets`. A third-party scanner (gitleaks) was
 * considered as an extra layer and deliberately **not** wired: it cannot be executed
 * on a contributor machine without installing a binary, and this repository's rule is
 * that a gate which cannot be reproduced locally is not a gate. So the blocking
 * decision lives here, in Bun, with zero new dependencies, and it self-tests. If a
 * second layer is ever added it must not be the thing the team relies on.
 *
 * Design notes:
 *   - Only *credential shapes* are matched (fixed-prefix tokens, PEM headers,
 *     JWTs, high-entropy assignments). A code-word like `apiKey` alone is never a
 *     finding, otherwise the rule set drowns in noise the moment someone renames a
 *     variable.
 *   - Noise is handled by an explicit allowlist (`SECRET_ALLOWLIST`) of **exact
 *     file + rule id + written reason**. There is no "turn the check off" switch, no
 *     directory-wide exemption, and a stale entry (one whose file no longer matches)
 *     is itself a failure, so an allowlist can never accumulate as cover for the
 *     next leak.
 *   - The scanner never prints the matched secret — only file, line, rule and a
 *     redacted preview — because CI logs are readable by more people than the repo.
 */

/** @typedef {{ id: string, pattern: RegExp, severity: 'high' | 'medium' }} SecretRule */

import { readFile } from 'node:fs/promises';

/**
 * High-entropy characters only count when the value is long enough and actually
 * mixed; `aaaaaaaaaaaaaaaaaaaa` and `12345678901234567890` are not secrets.
 */
function shannonEntropy(text) {
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

const PLACEHOLDER_VALUE =
  /^(?:your[_-]?)?(?:api[_-]?key|token|secret|password|key|placeholder|example|changeme|dummy|fake|test|redacted|masked|none|null|undefined|empty)$/i;

/**
 * A credential-looking *value* (as opposed to a human-readable stub).
 *
 * `tok-loop-delivery`, `capability-probe` and `stale-refresh-token` are the kind of
 * string this repository — and every test suite — uses as a stand-in. Real API keys
 * are opaque: at least 20 characters drawn from a base64/hex-ish alphabet. Fixed
 * prefixes (`sk-`, `ghp_`, `AKIA`, …) are matched by their own rules above and do
 * not have to clear this bar, so tightening the generic net does not weaken the
 * specific ones.
 */
const OPAQUE_VALUE = /^[A-Za-z0-9+/=_:.\-]{20,}$/;
const MIN_ENTROPY = 3.6;

export const SECRET_RULES = Object.freeze([
  {
    id: 'pem-private-key',
    severity: 'high',
    // `-----BEGIN OPENSSH PRIVATE KEY-----` and friends.
    pattern: /-----BEGIN (?:[A-Z ]+)?PRIVATE KEY-----/,
  },
  { id: 'aws-access-key-id', severity: 'high', pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/ },
  {
    id: 'github-token',
    severity: 'high',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  },
  { id: 'gitlab-token', severity: 'high', pattern: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'slack-token', severity: 'high', pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/ },
  { id: 'google-api-key', severity: 'high', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { id: 'stripe-key', severity: 'high', pattern: /\b[spk]rk_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { id: 'npm-token', severity: 'high', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'openai-style-key', severity: 'high', pattern: /\bsk-(?:proj-|sv-)?[A-Za-z0-9_-]{24,}\b/ },
  {
    id: 'jwt',
    severity: 'medium',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{16,}\b/,
  },
  {
    id: 'url-basic-auth',
    severity: 'high',
    pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]{8,}@/i,
  },
  {
    id: 'generic-secret-assignment',
    severity: 'medium',
    pattern:
      /\b(?:api[_-]?key|apikey|access[_-]?key|secret[_-]?key|client[_-]?secret|auth[_-]?token|access[_-]?token|refresh[_-]?token|password|passwd)\b["']?\s*(?:[:=]\s*|,\s*)["'][^"'\s]{16,}["']/i,
  },
]);

/** Rules whose value half must look like an opaque credential before it counts. */
const ENTROPY_GATED_RULES = new Set(['generic-secret-assignment', 'url-basic-auth']);

/** The value in `key: 'value'` / `key = "value"` — what a human would call the secret. */
function quotedValue(line, matchStart) {
  const tail = line.slice(matchStart);
  const quoted = /["']([^"']{6,})["']/.exec(tail);
  if (quoted?.[1]) return quoted[1];
  const bare = /^\s*[:=]\s*([^\s,;'"]{6,})/.exec(tail.slice(tail.search(/[:=]/)));
  return bare?.[1] ?? '';
}

function candidateValue(line, matchStart, matched) {
  const quoted = quotedValue(line, matchStart);
  if (quoted.length > 0) return quoted;
  // url-basic-auth: the password between the first `:` after the scheme and the `@`.
  const password = /:\/\/[^/@\s:]+:([^@/\s]+)@/.exec(line.slice(matchStart));
  return password?.[1] ?? matched;
}

function isOpaqueCredential(value) {
  if (value.length < 20) return false;
  if (PLACEHOLDER_VALUE.test(value)) return false;
  if (!OPAQUE_VALUE.test(value)) return false;
  return shannonEntropy(value) >= MIN_ENTROPY;
}

/**
 * @param {string} text file contents
 * @param {string} [fileLabel] only used for messages
 * @returns {Array<{ file: string, line: number, rule: string, severity: string, preview: string }>}
 */
export function scanText(text, fileLabel = '<text>') {
  const findings = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    for (const rule of SECRET_RULES) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(line);
      if (!match) continue;
      if (
        ENTROPY_GATED_RULES.has(rule.id) &&
        !isOpaqueCredential(candidateValue(line, match.index, match[0]))
      ) {
        continue;
      }
      findings.push({
        file: fileLabel,
        line: index + 1,
        rule: rule.id,
        severity: rule.severity,
        preview: redact(line.trim()),
      });
    }
  }
  return findings;
}

/** Keep the shape of the line for triage without shipping the credential to logs. */
export function redact(line) {
  return line.replace(/(["'])(?!\s)[^"']{8,}\1/g, (quote) => `${quote[0]}…redacted…${quote[0]}`);
}

/**
 * The allowlist. Every entry is `exact file path` + `rule id` + a reason that says
 * what the value actually is. No globs, no directories.
 *
 * Two entries, both verified by reading the file:
 *   - `packages/agent-core/src/config/document.ts` documents the masking format in
 *     a JSDoc fenced example (`api_key = "__BYF_KEEP_SECRET__<key-path>"`). The
 *     placeholder is a key *path*, not a value — and it is the format the web
 *     settings editor round-trips. The file is owned by another workstream, so the
 *     gate records the exception instead of editing the prose.
 *
 * @type {ReadonlyArray<{ file: string, rule: string, reason: string }>}
 */
export const SECRET_ALLOWLIST = Object.freeze([
  Object.freeze({
    file: 'packages/agent-core/src/config/document.ts',
    rule: 'generic-secret-assignment',
    reason:
      'JSDoc example of the secret-masking placeholder format (`__BYF_KEEP_SECRET__<key-path>`) — ' +
      'a key path, not a credential value',
  }),
]);

export function validateAllowlist(entries) {
  const problems = [];
  const seen = new Set();
  for (const entry of entries) {
    if (typeof entry.file !== 'string' || entry.file.length === 0) {
      problems.push('allowlist entry is missing an exact `file`');
      continue;
    }
    if (entry.file.includes('*') || entry.file.includes('?') || entry.file.endsWith('/')) {
      problems.push(`allowlist entry "${entry.file}" is a pattern or directory`);
      continue;
    }
    if (!entry.rule) problems.push(`allowlist entry for "${entry.file}" has no rule id`);
    if (!entry.reason) problems.push(`allowlist entry for "${entry.file}" has no reason`);
    const key = `${entry.file}#${entry.rule}`;
    if (seen.has(key)) problems.push(`duplicate allowlist entry for ${key}`);
    seen.add(key);
  }
  return problems;
}

const SKIP_SUFFIXES = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.node',
  '.wasm',
  '.zip',
  '.gz',
  '.tgz',
  '.mp4',
  '.pdf',
  '.byf',
]);

export function shouldScan(relativePath) {
  const lower = relativePath.toLowerCase();
  if ([...SKIP_SUFFIXES].some((suffix) => lower.endsWith(suffix))) return false;
  if (lower.endsWith('bun.lock')) return false;
  if (lower.includes('node_modules/')) return false;
  // This file is the rule set itself: its patterns contain credential shapes.
  return !lower.endsWith('scripts/lib/check-secrets.mjs');
}

/**
 * Scan every tracked file in the repository.
 *
 * Tracked-only is deliberate: that is exactly what an attacker or a tired
 * contributor gets into `main`. `git ls-files -z` also keeps the walk off untracked
 * build output, which is full of minified vendor code that no rule set survives.
 *
 * @param {string} repoRoot
 * @param {(args: string[]) => string} runGit
 */
export async function collectFindingsForTrackedFiles(repoRoot, runGit) {
  const tracked = runGit(['ls-files', '-z']).split('\0').filter(Boolean);
  const findings = [];
  for (const file of tracked) {
    if (!shouldScan(file)) continue;
    let text;
    try {
      text = await readFile(`${repoRoot}/${file}`, 'utf8');
    } catch {
      continue; // deleted from the index mid-run, or a broken symlink
    }
    if (text.includes('\u0000')) continue; // binary that survived the suffix filter
    findings.push(...scanText(text, file));
  }
  return findings;
}

/** Findings are printed without the secret itself — CI logs are not a vault. */
export function formatFindings(findings) {
  return findings
    .map(
      (finding) =>
        `  ${finding.file}:${String(finding.line)}  [${finding.rule}/${finding.severity}]  ${finding.preview.slice(0, 140)}`,
    )
    .join('\n');
}
/**
 * @param {Array<{ file: string, rule: string }>} findings
 * @param {ReadonlyArray<{ file: string, rule: string }>} allowlist
 */
export function applyAllowlist(findings, allowlist) {
  const allowed = (finding) =>
    allowlist.some((entry) => entry.file === finding.file && entry.rule === finding.rule);
  const remaining = findings.filter((finding) => !allowed(finding));
  const usedKeys = new Set(
    findings.filter(allowed).map((finding) => `${finding.file}#${finding.rule}`),
  );
  return {
    remaining,
    allowed: findings.filter(allowed),
    // An allowlist entry that matches nothing is a rot signal: it would silently
    // swallow the next credential committed to that file.
    stale: allowlist
      .map((entry) => `${entry.file}#${entry.rule}`)
      .filter((key) => !usedKeys.has(key)),
  };
}
