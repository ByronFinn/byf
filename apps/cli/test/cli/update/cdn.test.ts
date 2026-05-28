import { describe, expect, it, vi } from 'vitest';

import { fetchLatestVersionFromGitHub } from '#/cli/update/cdn';
import { BYF_RELEASES_LATEST_URL } from '#/constant/app';

function mockFetchOk(tagName: string): typeof fetch {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: tagName }),
  })) as unknown as typeof fetch;
}

function mockFetchStatus(status: number): typeof fetch {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => '',
  })) as unknown as typeof fetch;
}

describe('fetchLatestVersionFromGitHub', () => {
  it('returns the trimmed semver returned by GitHub Releases /latest', async () => {
    const f = mockFetchOk('  0.5.0\n');
    await expect(fetchLatestVersionFromGitHub(f)).resolves.toBe('0.5.0');
    expect(f).toHaveBeenCalledWith(BYF_RELEASES_LATEST_URL);
  });

  it('throws when response is non-2xx', async () => {
    await expect(fetchLatestVersionFromGitHub(mockFetchStatus(404))).rejects.toThrow(/HTTP 404/);
  });

  it('throws when body is not valid semver', async () => {
    await expect(fetchLatestVersionFromGitHub(mockFetchOk('not-a-version'))).rejects.toThrow(
      /invalid semver/,
    );
  });

  it('throws when body is empty', async () => {
    await expect(fetchLatestVersionFromGitHub(mockFetchOk('   '))).rejects.toThrow(
      /invalid semver/,
    );
  });

  it('propagates the underlying fetch error', async () => {
    const f = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    await expect(fetchLatestVersionFromGitHub(f)).rejects.toThrow(/network down/);
  });
});
