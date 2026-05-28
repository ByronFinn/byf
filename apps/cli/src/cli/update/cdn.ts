import { valid } from 'semver';

import { BYF_RELEASES_LATEST_URL } from '#/constant/app';

/**
 * Fetch the latest published BYF version from the GitHub Releases /latest API.
 *
 * **Throws** on any failure (network error, non-2xx, missing tag_name, invalid
 * semver). Callers must catch — `refreshUpdateCache` deliberately lets the
 * error propagate so the existing cache stays intact instead of being
 * overwritten with a null `latest` on a transient blip.
 *
 * `fetchImpl` is injectable for tests; defaults to the global `fetch`.
 */
export async function fetchLatestVersionFromGitHub(
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const response = await fetchImpl(BYF_RELEASES_LATEST_URL);
  if (!response.ok) {
    throw new Error(`GitHub Releases /latest returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as { tag_name?: unknown };
  const latest = typeof data.tag_name === 'string' ? data.tag_name.trim() : '';
  const normalized = valid(latest);
  if (normalized === null) {
    throw new Error(`GitHub Releases returned invalid semver: ${JSON.stringify(latest)}`);
  }

  return normalized;
}
