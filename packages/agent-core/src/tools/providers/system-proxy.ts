/**
 * macOS system proxy detection via `scutil --proxy`.
 *
 * Parses the scutil output to extract HTTP, HTTPS, and SOCKS proxy settings.
 * On non-darwin platforms, returns an empty object.
 */

import { execSync } from 'node:child_process';

// ── Types ────────────────────────────────────────────────────────────

export interface ProxySettings {
  httpProxy?: string;
  httpsProxy?: string;
  socksProxy?: string;
}

export interface SystemProxyOptions {
  platform?: string;
  execSync?: (cmd: string) => string;
}

// ── Implementation ───────────────────────────────────────────────────

/**
 * Detect macOS system proxy settings by running `scutil --proxy`.
 *
 * On non-darwin platforms, returns `{}` immediately.
 * If `scutil` fails or produces unparseable output, returns `{}`.
 */
export function detectSystemProxy(options?: SystemProxyOptions): ProxySettings {
  const platform = options?.platform ?? process.platform;
  if (platform !== 'darwin') return {};

  const runCmd = options?.execSync ?? ((cmd: string) => execSync(cmd, { encoding: 'utf-8' }));

  let raw: string;
  try {
    raw = runCmd('scutil --proxy');
  } catch {
    return {};
  }

  return parseScutilProxy(raw);
}

// ── Internal ─────────────────────────────────────────────────────────

interface RawProxyEntry {
  enabled: boolean;
  host: string;
  port: number;
}

function parseScutilProxy(raw: string): ProxySettings {
  const http = extractProxyEntry(raw, 'HTTP');
  const https = extractProxyEntry(raw, 'HTTPS');
  const socks = extractProxyEntry(raw, 'SOCKS');

  return {
    ...(http.enabled ? { httpProxy: `http://${http.host}:${http.port}` } : undefined),
    ...(https.enabled ? { httpsProxy: `http://${https.host}:${https.port}` } : undefined),
    ...(socks.enabled ? { socksProxy: `socks5://${socks.host}:${socks.port}` } : undefined),
  };
}

function extractProxyEntry(raw: string, prefix: string): RawProxyEntry {
  const enableMatch = raw.match(new RegExp(`${prefix}Enable\\s*:\\s*(\\d+)`));
  const hostMatch = raw.match(new RegExp(`${prefix}Proxy\\s*:\\s*(\\S+)`));
  const portMatch = raw.match(new RegExp(`${prefix}Port\\s*:\\s*(\\d+)`));

  const enabled = enableMatch?.[1] === '1';
  const host = hostMatch?.[1] ?? '';
  const port = portMatch?.[1] ? parseInt(portMatch[1], 10) : 0;

  return { enabled, host, port };
}
