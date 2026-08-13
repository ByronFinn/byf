import { homedir } from 'node:os';
import { join } from 'node:path';

/** web-server 默认端口（与 vis 3001 区分）。 */
export const DEFAULT_WEB_PORT = 4100;
/** web-server 默认主机（回环）。 */
export const DEFAULT_WEB_HOST = '127.0.0.1';

/** 解析 BYF_HOME(env > ~/.byf)。 */
export function resolveByfHome(): string {
  const envHome = process.env['BYF_HOME'];
  if (envHome !== undefined && envHome.length > 0) {
    return envHome;
  }
  return join(homedir(), '.byf');
}

/** web-server 的 HTTP 端口（`PORT` > 默认 4100）。 */
export function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw !== undefined && raw.length > 0) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && n < 65536) {
      return n;
    }
  }
  return DEFAULT_WEB_PORT;
}

/** web-server 的 HTTP 主机（`WEB_HOST`/`HOST` > 默认回环）。 */
export function resolveHost(): string {
  const raw = process.env['WEB_HOST'] ?? process.env['HOST'];
  const host = raw?.trim();
  return host !== undefined && host.length > 0 ? host : DEFAULT_WEB_HOST;
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase().replaceAll('[', '').replaceAll(']', '');
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '0:0:0:0:0:0:0:1' ||
    normalized.startsWith('127.')
  );
}

/**
 * 解析 web-server 鉴权 token。回环可选；非回环必填（抛错）。
 * 读取 `WEB_AUTH_TOKEN`（兼容旧名 `BYF_WEB_AUTH_TOKEN`）。
 */
export function resolveWebAuthToken(host: string = resolveHost()): string | undefined {
  const raw = process.env['WEB_AUTH_TOKEN'] ?? process.env['BYF_WEB_AUTH_TOKEN'];
  const token = raw?.trim();
  if (token !== undefined && token.length > 0) return token;
  if (!isLoopbackHost(host)) {
    throw new Error(
      `WEB_AUTH_TOKEN is required when binding web-server outside loopback (host=${host})`,
    );
  }
  return undefined;
}
