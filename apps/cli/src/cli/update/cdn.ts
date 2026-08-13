import { valid } from 'semver';

import { BYF_RELEASES_LATEST_URL } from '#/constant/app';

/**
 * 从 GitHub Releases /latest API 获取最新发布的 BYF 版本。
 *
 * 任何失败(网络错误、非 2xx、缺少 tag_name、无效 semver)都会**抛出**。
 * 调用方必须捕获——`refreshUpdateCache` 刻意让错误传播,使既有缓存保持
 * 完整,而非在瞬时抖动时被 null `latest` 覆盖。
 *
 * `fetchImpl` 可注入供测试;默认为全局 `fetch`。
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
