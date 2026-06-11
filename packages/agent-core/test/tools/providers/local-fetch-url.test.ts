/**
 * Covers: LocalFetchURLProvider content-kind reporting.
 *
 * Verifies the provider tells callers whether the returned content is a
 * verbatim passthrough of the response body or the main text extracted
 * from an HTML page.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createProxiedFetch } from '../../../src/tools/providers/proxied-fetch';
import { LocalFetchURLProvider } from '../../../src/tools/providers/local-fetch-url';

function htmlResponse(body: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

function networkError(code: string): TypeError {
  const err = new TypeError(`fetch failed: ${code}`);
  (err as unknown as { cause: { code: string } }).cause = { code };
  return err;
}

describe('LocalFetchURLProvider content kind', () => {
  it('reports text/plain bodies as a verbatim passthrough', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('plain body', 'text/plain; charset=utf-8'));
    const provider = new LocalFetchURLProvider({ fetchImpl });

    const result = await provider.fetch('https://example.com/file.txt');

    expect(result).toEqual({ content: 'plain body', kind: 'passthrough' });
  });

  it('reports text/markdown bodies as a verbatim passthrough', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse('# Title\n\nbody', 'text/markdown'));
    const provider = new LocalFetchURLProvider({ fetchImpl });

    const result = await provider.fetch('https://example.com/readme.md');

    expect(result).toEqual({ content: '# Title\n\nbody', kind: 'passthrough' });
  });

  it('reports HTML bodies as extracted main content', async () => {
    const html =
      '<html><head><title>Doc</title></head><body><article>' +
      '<p>The quick brown fox jumps over the lazy dog. '.repeat(20) +
      '</p></article></body></html>';
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse(html, 'text/html; charset=utf-8'));
    const provider = new LocalFetchURLProvider({ fetchImpl });

    const result = await provider.fetch('https://example.com/page');

    expect(result.kind).toBe('extracted');
    expect(result.content).toContain('quick brown fox');
  });
});

describe('LocalFetchURLProvider with proxy fallback', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns content without proxy when direct fetch succeeds', async () => {
    const innerFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('direct content', { status: 200, headers: { 'content-type': 'text/plain' } }),
    );
    const env = { HTTPS_PROXY: 'http://proxy:8080' };
    const proxiedFetch = createProxiedFetch({
      envLookup: (key) => env[key],
      innerFetch,
    });
    const provider = new LocalFetchURLProvider({ fetchImpl: proxiedFetch });

    const result = await provider.fetch('https://example.com/file.txt');
    expect(result.content).toBe('direct content');
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });

  it('retries through proxy when direct fetch fails with retryable error', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'))
      .mockResolvedValueOnce(
        new Response('proxy content', { status: 200, headers: { 'content-type': 'text/plain' } }),
      );
    const env = { HTTPS_PROXY: 'http://proxy:8080' };
    const proxiedFetch = createProxiedFetch({
      envLookup: (key) => env[key],
      innerFetch,
    });
    const provider = new LocalFetchURLProvider({ fetchImpl: proxiedFetch });

    const result = await provider.fetch('https://example.com/file.txt');
    expect(result.content).toBe('proxy content');
    expect(innerFetch).toHaveBeenCalledTimes(2);
  });

  it('propagates error when direct fails and no proxy configured', async () => {
    const innerFetch = vi.fn<typeof fetch>().mockRejectedValue(networkError('ECONNREFUSED'));
    const env: Record<string, string> = {};
    const proxiedFetch = createProxiedFetch({
      envLookup: (key) => env[key],
      innerFetch,
    });
    const provider = new LocalFetchURLProvider({ fetchImpl: proxiedFetch });

    await expect(provider.fetch('https://example.com/file.txt')).rejects.toThrow('ECONNREFUSED');
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry on non-retryable HTTP error (404)', async () => {
    const innerFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('not found', { status: 404 }));
    const env = { HTTPS_PROXY: 'http://proxy:8080' };
    const proxiedFetch = createProxiedFetch({
      envLookup: (key) => env[key],
      innerFetch,
    });
    const provider = new LocalFetchURLProvider({ fetchImpl: proxiedFetch });

    // LocalFetchURLProvider throws HttpFetchError on non-2xx — no proxy retry
    await expect(provider.fetch('https://example.com/missing')).rejects.toThrow('HTTP 404');
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });
});
