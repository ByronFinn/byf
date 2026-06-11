/**
 * Covers: ProxiedFetch — proxy fallback wrapper for fetch.
 *
 * Tests the core proxy fallback mechanism: env var detection, retryable
 * error classification, NO_PROXY matching, timeout, and the full
 * direct→proxy fallback flow.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createProxiedFetch,
  getProxyForUrl,
  isNoProxyHost,
  isRetryableError,
} from '../../../src/tools/providers/proxied-fetch';
import type { ProxySettings } from '../../../src/tools/providers/system-proxy';

// ── Helpers ──────────────────────────────────────────────────────────

type EnvLookup = (key: string) => string | undefined;

function envFromRecord(record: Record<string, string>): EnvLookup {
  return (key: string) => record[key];
}

function okResponse(body = 'ok', status = 200): Response {
  return new Response(body, { status });
}

function errorResponse(status: number): Response {
  return new Response('error', { status });
}

function networkError(code: string): TypeError {
  const err = new TypeError(`fetch failed: ${code}`);
  (err as unknown as { cause: { code: string } }).cause = { code };
  return err;
}

// ── getProxyForUrl ────────────────────────────────────────────────────

describe('getProxyForUrl', () => {
  it('returns undefined when no proxy env vars are set', () => {
    const env = envFromRecord({});
    expect(getProxyForUrl('https://example.com', env)).toBeUndefined();
  });

  it('uses HTTPS_PROXY for HTTPS requests', () => {
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://proxy:8080');
  });

  it('uses HTTP_PROXY for HTTP requests', () => {
    const env = envFromRecord({ HTTP_PROXY: 'http://proxy:8080' });
    expect(getProxyForUrl('http://example.com', env)).toBe('http://proxy:8080');
  });

  it('prefers HTTPS_PROXY over HTTP_PROXY for HTTPS requests', () => {
    const env = envFromRecord({
      HTTPS_PROXY: 'http://secure-proxy:8080',
      HTTP_PROXY: 'http://insecure-proxy:8080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://secure-proxy:8080');
  });

  it('uses HTTP_PROXY for HTTP requests even when HTTPS_PROXY is set', () => {
    const env = envFromRecord({
      HTTPS_PROXY: 'http://secure-proxy:8080',
      HTTP_PROXY: 'http://insecure-proxy:8080',
    });
    expect(getProxyForUrl('http://example.com', env)).toBe('http://insecure-proxy:8080');
  });

  it('falls back to ALL_PROXY when protocol-specific proxy is not set (HTTPS)', () => {
    const env = envFromRecord({ ALL_PROXY: 'http://all-proxy:8080' });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://all-proxy:8080');
  });

  it('falls back to ALL_PROXY when protocol-specific proxy is not set (HTTP)', () => {
    const env = envFromRecord({ ALL_PROXY: 'http://all-proxy:8080' });
    expect(getProxyForUrl('http://example.com', env)).toBe('http://all-proxy:8080');
  });

  it('prefers protocol-specific proxy over ALL_PROXY', () => {
    const env = envFromRecord({
      HTTPS_PROXY: 'http://specific:8080',
      ALL_PROXY: 'http://fallback:8080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://specific:8080');
  });

  it('for HTTPS: falls back to ALL_PROXY when HTTPS_PROXY is absent', () => {
    const env = envFromRecord({
      HTTP_PROXY: 'http://http-only:8080',
      ALL_PROXY: 'http://all:8080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://all:8080');
  });

  it('respects lowercase variants', () => {
    const env = envFromRecord({ https_proxy: 'http://lower:8080' });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://lower:8080');
  });

  it('prefers uppercase over lowercase', () => {
    const env = envFromRecord({
      HTTPS_PROXY: 'http://upper:8080',
      https_proxy: 'http://lower:8080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://upper:8080');
  });

  // ── SOCKS5 proxy support (#118) ───────────────────────────────────

  it('uses SOCKS_PROXY for HTTPS requests when no HTTPS_PROXY, ALL_PROXY, or HTTP_PROXY', () => {
    const env = envFromRecord({ SOCKS_PROXY: 'socks5://proxy:1080' });
    expect(getProxyForUrl('https://example.com', env)).toBe('socks5://proxy:1080');
  });

  it('uses SOCKS_PROXY for HTTP requests when no HTTP_PROXY or ALL_PROXY', () => {
    const env = envFromRecord({ SOCKS_PROXY: 'socks5://proxy:1080' });
    expect(getProxyForUrl('http://example.com', env)).toBe('socks5://proxy:1080');
  });

  it('respects lowercase socks_proxy variant', () => {
    const env = envFromRecord({ socks_proxy: 'socks5://lower:1080' });
    expect(getProxyForUrl('https://example.com', env)).toBe('socks5://lower:1080');
  });

  it('prefers SOCKS_PROXY uppercase over lowercase', () => {
    const env = envFromRecord({
      SOCKS_PROXY: 'socks5://upper:1080',
      socks_proxy: 'socks5://lower:1080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('socks5://upper:1080');
  });

  it('prefers ALL_PROXY over SOCKS_PROXY for HTTPS', () => {
    const env = envFromRecord({
      ALL_PROXY: 'socks5://all:1080',
      SOCKS_PROXY: 'socks5://socks:1080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('socks5://all:1080');
  });

  it('prefers ALL_PROXY over SOCKS_PROXY for HTTP', () => {
    const env = envFromRecord({
      ALL_PROXY: 'socks5://all:1080',
      SOCKS_PROXY: 'socks5://socks:1080',
    });
    expect(getProxyForUrl('http://example.com', env)).toBe('socks5://all:1080');
  });

  // ── Updated priority chain (#118) ──────────────────────────────────

  it('for HTTPS: HTTPS_PROXY → ALL_PROXY → HTTP_PROXY (all set)', () => {
    const env = envFromRecord({
      HTTPS_PROXY: 'http://secure:8080',
      ALL_PROXY: 'socks5://all:1080',
      HTTP_PROXY: 'http://insecure:8080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://secure:8080');
  });

  it('for HTTPS: ALL_PROXY wins over HTTP_PROXY when HTTPS_PROXY is absent', () => {
    const env = envFromRecord({
      ALL_PROXY: 'socks5://all:1080',
      HTTP_PROXY: 'http://insecure:8080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('socks5://all:1080');
  });

  it('for HTTPS: SOCKS_PROXY wins over HTTP_PROXY when HTTPS_PROXY and ALL_PROXY absent', () => {
    const env = envFromRecord({
      SOCKS_PROXY: 'socks5://socks:1080',
      HTTP_PROXY: 'http://insecure:8080',
    });
    expect(getProxyForUrl('https://example.com', env)).toBe('socks5://socks:1080');
  });

  it('for HTTPS: falls back to HTTP_PROXY when only HTTP_PROXY is set', () => {
    const env = envFromRecord({ HTTP_PROXY: 'http://insecure:8080' });
    expect(getProxyForUrl('https://example.com', env)).toBe('http://insecure:8080');
  });

  it('for HTTP: HTTP_PROXY → ALL_PROXY (both set, HTTP_PROXY wins)', () => {
    const env = envFromRecord({
      HTTP_PROXY: 'http://insecure:8080',
      ALL_PROXY: 'socks5://all:1080',
    });
    expect(getProxyForUrl('http://example.com', env)).toBe('http://insecure:8080');
  });

  it('for HTTP: falls back to ALL_PROXY when HTTP_PROXY is absent', () => {
    const env = envFromRecord({ ALL_PROXY: 'socks5://all:1080' });
    expect(getProxyForUrl('http://example.com', env)).toBe('socks5://all:1080');
  });

  it('for HTTP: falls back to SOCKS_PROXY when HTTP_PROXY and ALL_PROXY absent', () => {
    const env = envFromRecord({ SOCKS_PROXY: 'socks5://socks:1080' });
    expect(getProxyForUrl('http://example.com', env)).toBe('socks5://socks:1080');
  });

  it('returns undefined when no proxy env vars are set at all', () => {
    const env = envFromRecord({});
    expect(getProxyForUrl('https://example.com', env)).toBeUndefined();
    expect(getProxyForUrl('http://example.com', env)).toBeUndefined();
  });

  // ── System proxy fallback ──────────────────────────────────────────

  it('env var takes priority over system proxy (HTTPS)', () => {
    const env = envFromRecord({ HTTPS_PROXY: 'http://env-proxy:8080' });
    const sys: ProxySettings = { httpsProxy: 'http://sys-proxy:8080' };
    expect(getProxyForUrl('https://example.com', env, sys)).toBe('http://env-proxy:8080');
  });

  it('falls back to system proxy when env var is not set (HTTPS)', () => {
    const env = envFromRecord({});
    const sys: ProxySettings = { httpsProxy: 'http://sys-proxy:8080' };
    expect(getProxyForUrl('https://example.com', env, sys)).toBe('http://sys-proxy:8080');
  });

  it('env var takes priority over system proxy (HTTP)', () => {
    const env = envFromRecord({ HTTP_PROXY: 'http://env-proxy:8080' });
    const sys: ProxySettings = { httpProxy: 'http://sys-proxy:8080' };
    expect(getProxyForUrl('http://example.com', env, sys)).toBe('http://env-proxy:8080');
  });

  it('falls back to system proxy when env var is not set (HTTP)', () => {
    const env = envFromRecord({});
    const sys: ProxySettings = { httpProxy: 'http://sys-proxy:8080' };
    expect(getProxyForUrl('http://example.com', env, sys)).toBe('http://sys-proxy:8080');
  });

  it('for HTTPS: falls back to system HTTPS proxy, then system HTTP proxy', () => {
    const env = envFromRecord({});
    const sys: ProxySettings = { httpsProxy: 'http://sys-https:8080', httpProxy: 'http://sys-http:8080' };
    expect(getProxyForUrl('https://example.com', env, sys)).toBe('http://sys-https:8080');
  });

  it('for HTTPS: falls back to system HTTP proxy when system HTTPS proxy absent', () => {
    const env = envFromRecord({});
    const sys: ProxySettings = { httpProxy: 'http://sys-http:8080' };
    expect(getProxyForUrl('https://example.com', env, sys)).toBe('http://sys-http:8080');
  });

  it('for HTTP: falls back to system HTTP proxy only (not HTTPS)', () => {
    const env = envFromRecord({});
    const sys: ProxySettings = { httpsProxy: 'http://sys-https:8080' };
    expect(getProxyForUrl('http://example.com', env, sys)).toBeUndefined();
  });

  it('returns undefined when neither env nor system proxy is configured', () => {
    const env = envFromRecord({});
    const sys: ProxySettings = {};
    expect(getProxyForUrl('https://example.com', env, sys)).toBeUndefined();
  });

  it('for HTTPS: env ALL_PROXY takes priority over system HTTP proxy', () => {
    const env = envFromRecord({ ALL_PROXY: 'http://all-env:8080' });
    const sys: ProxySettings = { httpProxy: 'http://sys-http:8080' };
    expect(getProxyForUrl('https://example.com', env, sys)).toBe('http://all-env:8080');
  });

  it('for HTTPS: system HTTPS proxy takes priority over env ALL_PROXY', () => {
    const env = envFromRecord({ ALL_PROXY: 'http://all-env:8080' });
    const sys: ProxySettings = { httpsProxy: 'http://sys-https:8080' };
    expect(getProxyForUrl('https://example.com', env, sys)).toBe('http://sys-https:8080');
  });

  it('for HTTPS: system proxy is used when only env ALL_PROXY is absent', () => {
    const env = envFromRecord({});
    const sys: ProxySettings = { httpsProxy: 'http://sys-https:8080' };
    expect(getProxyForUrl('https://example.com', env, sys)).toBe('http://sys-https:8080');
  });
});

// ── isRetryableError ──────────────────────────────────────────────────

describe('isRetryableError', () => {
  it('classifies ECONNREFUSED as retryable', () => {
    expect(isRetryableError(networkError('ECONNREFUSED'))).toBe(true);
  });

  it('classifies ECONNRESET as retryable', () => {
    expect(isRetryableError(networkError('ECONNRESET'))).toBe(true);
  });

  it('classifies ENOTFOUND (DNS failure) as retryable', () => {
    expect(isRetryableError(networkError('ENOTFOUND'))).toBe(true);
  });

  it('classifies ETIMEDOUT as retryable', () => {
    expect(isRetryableError(networkError('ETIMEDOUT'))).toBe(true);
  });

  it('classifies an AbortError as retryable', () => {
    const err = new DOMException('The operation was aborted', 'AbortError');
    expect(isRetryableError(err)).toBe(true);
  });

  it('classifies HTTP 403 as retryable', () => {
    expect(isRetryableError(errorResponse(403))).toBe(true);
  });

  it('classifies HTTP 429 as retryable', () => {
    expect(isRetryableError(errorResponse(429))).toBe(true);
  });

  it('classifies HTTP 502 as retryable', () => {
    expect(isRetryableError(errorResponse(502))).toBe(true);
  });

  it('classifies HTTP 503 as retryable', () => {
    expect(isRetryableError(errorResponse(503))).toBe(true);
  });

  it('classifies HTTP 504 as retryable', () => {
    expect(isRetryableError(errorResponse(504))).toBe(true);
  });

  it('does NOT classify HTTP 400 as retryable', () => {
    expect(isRetryableError(errorResponse(400))).toBe(false);
  });

  it('does NOT classify HTTP 401 as retryable', () => {
    expect(isRetryableError(errorResponse(401))).toBe(false);
  });

  it('does NOT classify HTTP 404 as retryable', () => {
    expect(isRetryableError(errorResponse(404))).toBe(false);
  });

  it('does NOT classify HTTP 405 as retryable', () => {
    expect(isRetryableError(errorResponse(405))).toBe(false);
  });

  it('does NOT classify HTTP 200 as retryable', () => {
    expect(isRetryableError(okResponse())).toBe(false);
  });

  it('does NOT classify a generic Error as retryable', () => {
    expect(isRetryableError(new Error('something'))).toBe(false);
  });
});

// ── isNoProxyHost ────────────────────────────────────────────────────

describe('isNoProxyHost', () => {
  it('returns false when NO_PROXY is not set', () => {
    expect(isNoProxyHost('example.com', undefined)).toBe(false);
  });

  it('returns false when NO_PROXY is empty', () => {
    expect(isNoProxyHost('example.com', '')).toBe(false);
  });

  it('matches exact hostname', () => {
    expect(isNoProxyHost('localhost', 'localhost')).toBe(true);
  });

  it('does not match partial hostname', () => {
    expect(isNoProxyHost('notlocalhost', 'localhost')).toBe(false);
  });

  it('matches domain suffix with leading dot', () => {
    expect(isNoProxyHost('sub.example.com', '.example.com')).toBe(true);
  });

  it('matches bare domain as suffix when entry has no leading dot', () => {
    // "example.com" should match "example.com" and "sub.example.com"
    expect(isNoProxyHost('sub.example.com', 'example.com')).toBe(true);
  });

  it('matches exact domain without leading dot', () => {
    expect(isNoProxyHost('example.com', 'example.com')).toBe(true);
  });

  it('matches IP address', () => {
    expect(isNoProxyHost('127.0.0.1', '127.0.0.1')).toBe(true);
  });

  it('does not match different IP', () => {
    expect(isNoProxyHost('10.0.0.1', '127.0.0.1')).toBe(false);
  });

  it('matches wildcard *', () => {
    expect(isNoProxyHost('anything.com', '*')).toBe(true);
  });

  it('handles comma-separated entries', () => {
    expect(isNoProxyHost('localhost', 'localhost,127.0.0.1,.internal')).toBe(true);
    expect(isNoProxyHost('127.0.0.1', 'localhost,127.0.0.1,.internal')).toBe(true);
    expect(isNoProxyHost('api.internal', 'localhost,127.0.0.1,.internal')).toBe(true);
    expect(isNoProxyHost('example.com', 'localhost,127.0.0.1,.internal')).toBe(false);
  });

  it('trims whitespace in entries', () => {
    expect(isNoProxyHost('localhost', 'localhost , 127.0.0.1 ')).toBe(true);
  });

  it('skips empty entries', () => {
    expect(isNoProxyHost('example.com', ',,,')).toBe(false);
  });
});

// ── createProxiedFetch — integration ─────────────────────────────────

describe('createProxiedFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a successful response without proxy when direct fetch succeeds', async () => {
    const innerFetch = vi.fn<typeof fetch>().mockResolvedValue(okResponse('hello'));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(await res.text()).toBe('hello');
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });

  it('retries through proxy when direct fetch fails with retryable error and proxy is configured', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'))
      .mockResolvedValueOnce(okResponse('via-proxy'));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(await res.text()).toBe('via-proxy');
    expect(innerFetch).toHaveBeenCalledTimes(2);
    // Second call should include a dispatcher
    const secondCallInit = innerFetch.mock.calls[1]?.[1];
    expect(secondCallInit?.dispatcher).toBeDefined();
  });

  it('propagates original error when direct fetch fails and no proxy is configured', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'));
    const env = envFromRecord({});
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    await expect(proxied('https://example.com')).rejects.toThrow('ECONNREFUSED');
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });

  it('propagates original error when direct fetch fails with non-retryable error', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(404));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(res.status).toBe(404);
    // Should not have retried — only one fetch call
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });

  it('propagates proxy error when proxy retry also fails', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'))
      .mockRejectedValueOnce(networkError('ECONNRESET'));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    await expect(proxied('https://example.com')).rejects.toThrow('ECONNRESET');
    expect(innerFetch).toHaveBeenCalledTimes(2);
  });

  it('skips proxy when host matches NO_PROXY', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'));
    const env = envFromRecord({
      HTTPS_PROXY: 'http://proxy:8080',
      NO_PROXY: 'example.com',
    });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    await expect(proxied('https://example.com')).rejects.toThrow('ECONNREFUSED');
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });

  it('passes through request init options', async () => {
    const innerFetch = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    const env = envFromRecord({});
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const controller = new AbortController();
    await proxied('https://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
      signal: controller.signal,
    });

    const init = innerFetch.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
  });

  it('retries HTTP 403 through proxy', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(403))
      .mockResolvedValueOnce(okResponse('unblocked'));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('unblocked');
    expect(innerFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry HTTP 401 through proxy', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(401));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(res.status).toBe(401);
    expect(innerFetch).toHaveBeenCalledTimes(1);
  });

  it('retries HTTP 502 through proxy', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(502))
      .mockResolvedValueOnce(okResponse('recovered'));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(res.status).toBe(200);
    expect(innerFetch).toHaveBeenCalledTimes(2);
  });

  it('retries HTTP 503 through proxy', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(okResponse('recovered'));
    const env = envFromRecord({ HTTPS_PROXY: 'http://proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(res.status).toBe(200);
    expect(innerFetch).toHaveBeenCalledTimes(2);
  });

  it('uses HTTP_PROXY for http:// URLs', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'))
      .mockResolvedValueOnce(okResponse('via-http-proxy'));
    const env = envFromRecord({
      HTTP_PROXY: 'http://http-proxy:8080',
      HTTPS_PROXY: 'http://https-proxy:8080',
    });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('http://example.com');
    expect(await res.text()).toBe('via-http-proxy');
    // Verify the proxy URL used for the second call
    const secondInit = innerFetch.mock.calls[1]?.[1];
    expect(secondInit?.dispatcher).toBeDefined();
  });

  it('does not modify behavior when no proxy is configured and request succeeds', async () => {
    const innerFetch = vi.fn<typeof fetch>().mockResolvedValue(okResponse('direct'));
    const env = envFromRecord({});
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(await res.text()).toBe('direct');
    expect(innerFetch).toHaveBeenCalledTimes(1);
    // No dispatcher should be set when no proxy is used
    const init = innerFetch.mock.calls[0]?.[1];
    expect(init?.dispatcher).toBeUndefined();
  });

  // ── SOCKS5 proxy integration (#118) ────────────────────────────────

  it('retries through SOCKS5 proxy from SOCKS_PROXY env var', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'))
      .mockResolvedValueOnce(okResponse('via-socks'));
    const env = envFromRecord({ SOCKS_PROXY: 'socks5://proxy:1080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(await res.text()).toBe('via-socks');
    expect(innerFetch).toHaveBeenCalledTimes(2);
    // Second call should include a dispatcher (ProxyAgent handles socks5://)
    const secondCallInit = innerFetch.mock.calls[1]?.[1];
    expect(secondCallInit?.dispatcher).toBeDefined();
  });

  it('retries through SOCKS5 proxy from ALL_PROXY env var', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'))
      .mockResolvedValueOnce(okResponse('via-all-proxy-socks'));
    const env = envFromRecord({ ALL_PROXY: 'socks5://proxy:1080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(await res.text()).toBe('via-all-proxy-socks');
    expect(innerFetch).toHaveBeenCalledTimes(2);
    const secondCallInit = innerFetch.mock.calls[1]?.[1];
    expect(secondCallInit?.dispatcher).toBeDefined();
  });

  it('for HTTPS: falls back to HTTP_PROXY when HTTPS_PROXY and ALL_PROXY are absent', async () => {
    const innerFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(networkError('ECONNREFUSED'))
      .mockResolvedValueOnce(okResponse('via-http-fallback'));
    const env = envFromRecord({ HTTP_PROXY: 'http://http-proxy:8080' });
    const proxied = createProxiedFetch({ envLookup: env, innerFetch });

    const res = await proxied('https://example.com');
    expect(await res.text()).toBe('via-http-fallback');
    expect(innerFetch).toHaveBeenCalledTimes(2);
    const secondCallInit = innerFetch.mock.calls[1]?.[1];
    expect(secondCallInit?.dispatcher).toBeDefined();
  });
});
