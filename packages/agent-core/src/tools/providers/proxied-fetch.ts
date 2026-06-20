/**
 * ProxiedFetch — a `typeof fetch` wrapper with automatic proxy fallback.
 *
 * Flow:
 *   1. Attempt the request with a 60-second timeout (via AbortController,
 *      respecting any external AbortSignal).
 *   2. If the request succeeds, return the response.
 *   3. If the request fails with a retryable error and a proxy is detected,
 *      retry through the proxy (also 60-second timeout).
 *   4. If the request fails with a non-retryable error, or no proxy is
 *      configured, propagate the original error / response.
 *   5. If the proxy retry also fails, propagate the proxy error in the same
 *      format as a normal fetch error — no special wrapping.
 *
 * Proxy detection reads environment variables only (macOS `scutil --proxy`
 * is added in a separate slice). Env vars take priority over system proxy.
 */

import { ProxyAgent } from 'undici';

import type { ProxySettings } from '#/tools/providers/system-proxy';

// ── Constants ────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 60_000;

const RETRYABLE_HTTP_STATUSES = new Set([403, 429, 502, 503, 504]);

const RETRYABLE_NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
]);

// ── Env var keys (checked in priority order) ─────────────────────────

const HTTPS_PROXY_KEYS = ['HTTPS_PROXY', 'https_proxy'] as const;
const HTTP_PROXY_KEYS = ['HTTP_PROXY', 'http_proxy'] as const;
const ALL_PROXY_KEYS = ['ALL_PROXY', 'all_proxy'] as const;
const SOCKS_PROXY_KEYS = ['SOCKS_PROXY', 'socks_proxy'] as const;
const NO_PROXY_KEYS = ['NO_PROXY', 'no_proxy'] as const;

// ── Helpers (exported for testing) ───────────────────────────────────

export type EnvLookup = (key: string) => string | undefined;

/**
 * Determine the proxy URL for a given request URL based on environment
 * variables and optional system proxy settings.
 *
 * Env vars always take priority over system proxy.
 *
 * Priority for HTTPS requests:
 *   HTTPS_PROXY → system HTTPS → ALL_PROXY → SOCKS_PROXY → system SOCKS → HTTP_PROXY → system HTTP
 * Priority for HTTP requests:
 *   HTTP_PROXY → system HTTP → ALL_PROXY → SOCKS_PROXY → system SOCKS
 */
export function getProxyForUrl(
  requestUrl: string,
  envLookup: EnvLookup,
  systemProxy?: ProxySettings,
): string | undefined {
  const parsed = new URL(requestUrl);
  const isHttps = parsed.protocol === 'https:';

  if (isHttps) {
    return (
      firstDefined(HTTPS_PROXY_KEYS, envLookup) ??
      systemProxy?.httpsProxy ??
      firstDefined(ALL_PROXY_KEYS, envLookup) ??
      firstDefined(SOCKS_PROXY_KEYS, envLookup) ??
      systemProxy?.socksProxy ??
      firstDefined(HTTP_PROXY_KEYS, envLookup) ??
      systemProxy?.httpProxy
    );
  }
  return (
    firstDefined(HTTP_PROXY_KEYS, envLookup) ??
    systemProxy?.httpProxy ??
    firstDefined(ALL_PROXY_KEYS, envLookup) ??
    firstDefined(SOCKS_PROXY_KEYS, envLookup) ??
    systemProxy?.socksProxy
  );
}

/**
 * Classify an error or response as retryable (should trigger proxy fallback).
 *
 * Retryable: network-level errors (DNS failure, ECONNREFUSED, ECONNRESET,
 * timeout, abort) and HTTP 403, 429, 502, 503, 504.
 * Non-retryable: HTTP 4xx (except 403/429) and everything else.
 */
export function isRetryableError(error: unknown): boolean {
  // Network-level errors with a cause.code
  if (error instanceof TypeError && error.cause && typeof error.cause === 'object') {
    const code = (error.cause as { code?: string }).code;
    if (typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code)) {
      return true;
    }
  }

  // AbortError (timeout or external abort)
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  // HTTP response objects — check status code
  if (error instanceof Response) {
    return RETRYABLE_HTTP_STATUSES.has(error.status);
  }

  return false;
}

/**
 * Check whether a hostname matches the NO_PROXY list.
 *
 * Entries can be:
 * - `*` → match everything
 * - `.example.com` → domain suffix (matches `sub.example.com` and `example.com`)
 * - `example.com` → exact match + suffix match (matches `sub.example.com`)
 * - `127.0.0.1` → exact IP/hostname match
 */
export function isNoProxyHost(hostname: string, noProxyValue: string | undefined): boolean {
  if (noProxyValue === undefined || noProxyValue.length === 0) return false;

  const entries = noProxyValue.split(',').map((e) => e.trim()).filter((e) => e.length > 0);
  const host = hostname.toLowerCase();

  for (const entry of entries) {
    if (entry === '*') return true;

    if (entry.startsWith('.')) {
      // Domain suffix: `.example.com` matches `sub.example.com`
      if (host.endsWith(entry) || host === entry.slice(1)) return true;
    } else if (host === entry || host.endsWith('.' + entry)) {
      // Exact match or domain suffix
      return true;
    }
  }

  return false;
}

// ── createProxiedFetch ───────────────────────────────────────────────

export interface ProxiedFetchDeps {
  /** Read an environment variable by name. */
  envLookup: EnvLookup;
  /** The underlying fetch to wrap. Defaults to `globalThis.fetch`. */
  innerFetch?: typeof fetch;
  /** Injectable system proxy detector (called per-request). */
  systemProxy?: () => ProxySettings;
}

/**
 * Create a `fetch`-compatible function that adds proxy fallback behaviour.
 *
 * - Successful requests are returned as-is.
 * - Retryable failures (network errors, HTTP 403/429/5xx) trigger a single
 *   retry through the proxy detected from environment variables.
 * - If no proxy is configured, or the error is non-retryable, the original
 *   error/response is propagated unchanged.
 */
export function createProxiedFetch(deps: ProxiedFetchDeps): typeof fetch {
  const envLookup = deps.envLookup;
  const innerFetch = deps.innerFetch ?? globalThis.fetch.bind(globalThis);

  const proxiedFetch: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const noProxy = firstDefined(NO_PROXY_KEYS, envLookup);
    const hostname = new URL(url).hostname;

    // Check proxy availability up-front.
    const sysProxy = deps.systemProxy?.();
    const proxyUrl = getProxyForUrl(url, envLookup, sysProxy);
    const noProxyMatch = noProxy !== undefined && isNoProxyHost(hostname, noProxy);

    // Create a merged AbortController with 60s timeout.
    const controller = new AbortController();
    const timeoutId = setTimeout(() =>{  controller.abort(); }, REQUEST_TIMEOUT_MS);

    // Forward external signal abort.
    if (init?.signal) {
      if (init.signal.aborted) {
        clearTimeout(timeoutId);
        controller.abort();
      } else {
        init.signal.addEventListener('abort', () =>{  controller.abort(); }, { once: true });
      }
    }

    const mergedInit: RequestInit = { ...init, signal: controller.signal };

    try {
      const response = await innerFetch(input, mergedInit);
      clearTimeout(timeoutId);

      // If the response is retryable and proxy is available, retry.
      if (!response.ok && isRetryableError(response) && proxyUrl && !noProxyMatch) {
        return await retryViaProxy(input, init, proxyUrl, innerFetch);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // If the error is retryable and proxy is available, retry.
      if (isRetryableError(error) && proxyUrl && !noProxyMatch) {
        return  retryViaProxy(input, init, proxyUrl, innerFetch);
      }

      throw error;
    }
  };

  return proxiedFetch;
}

// ── Internal helpers ─────────────────────────────────────────────────

async function retryViaProxy(
  input: string | URL | Request,
  init: RequestInit | undefined,
  proxyUrl: string,
  innerFetch: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() =>{  controller.abort(); }, REQUEST_TIMEOUT_MS);

  if (init?.signal) {
    if (init.signal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      init.signal.addEventListener('abort', () =>{  controller.abort(); }, { once: true });
    }
  }

  // Use undici ProxyAgent as dispatcher for the proxy connection.
  const dispatcher = new ProxyAgent(proxyUrl);

  const retryInit: RequestInit = {
    ...init,
    signal: controller.signal,
    dispatcher: dispatcher as unknown,
  } as RequestInit;

  try {
    const response = await innerFetch(input, retryInit);
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function firstDefined(keys: readonly string[], lookup: EnvLookup): string | undefined {
  for (const key of keys) {
    const value = lookup(key);
    if (value !== undefined && value.length > 0) return value;
  }
  return undefined;
}
