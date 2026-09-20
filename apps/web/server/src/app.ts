import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Hono } from 'hono';
import type { Context } from 'hono';

import { resolveByfHome } from './config';
import { createApiRouter } from './routes';
import { SessionNotFoundError, type WebSessionManager } from './session-manager';

/** SPA bundle 目录解析(旁置 bundle / 开发态返回 null)。镜像 apps/vis/server。 */
async function resolvePublicDir(): Promise<string | null> {
  try {
    const here = import.meta.dirname;
    const candidate = resolve(here, 'public');
    const s = await stat(candidate);
    if (s.isDirectory()) return candidate;
  } catch {
    // not present
  }
  return null;
}

/**
 * `@byfriends/cli` 原生编译二进制经 `bun build --compile` 内嵌 SPA 资产
 * (见 apps/cli/scripts/compile/build.mjs)。每条是 `Map<relativePath, virtualPath>`,
 * 值是 `Bun.file()` 可直接读的 `/$bunfs/...` 路径。源码/JS bundle 布局下此全局
 * 不存在,返回 `null`。
 */
function resolveEmbeddedAssets(): Map<string, string> | null {
  const raw = (globalThis as Record<string, unknown>)['__BYF_WEB_EMBEDDED_ASSETS__'];
  if (!(raw instanceof Map)) return null;
  return raw;
}

type StaticSource =
  | { readonly kind: 'disk'; readonly publicDir: string }
  | { readonly kind: 'embedded'; readonly assets: Map<string, string> };

async function resolveStaticSource(publicDir: string | undefined): Promise<StaticSource | null> {
  if (publicDir !== undefined) {
    try {
      const s = await stat(publicDir);
      if (s.isDirectory()) return { kind: 'disk', publicDir };
    } catch {
      // fall through
    }
  }
  const embedded = resolveEmbeddedAssets();
  if (embedded !== null && embedded.size > 0) return { kind: 'embedded', assets: embedded };
  const disk = await resolvePublicDir();
  if (disk !== null) return { kind: 'disk', publicDir: disk };
  return null;
}

const STATIC_EXT_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

function mimeFor(path: string): string {
  const i = path.lastIndexOf('.');
  if (i < 0) return 'application/octet-stream';
  const ext = path.slice(i).toLowerCase();
  return STATIC_EXT_MIME[ext] ?? 'application/octet-stream';
}

function bearerToken(value: string | undefined): string | null {
  if (value === undefined) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() ?? null;
}

function tokenMatches(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

/** EventSource 无法设置 Authorization 头,故 token 同时接受 Bearer 头与 `?token=` 查询。 */
function isAuthorized(
  authorization: string | undefined,
  queryToken: string | undefined,
  expected: string,
): boolean {
  const bearer = bearerToken(authorization);
  if (bearer !== null && tokenMatches(bearer, expected)) return true;
  if (queryToken !== undefined && queryToken.length > 0 && tokenMatches(queryToken, expected))
    return true;
  return false;
}

/** 回环自动 token 的生成(每次启动一个;经启动日志与 CLI 打开的 URL 交付)。 */
function generateAuthToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * 生效 token:显式配置值(LAN 模式必填)优先,否则本次启动生成回环 token。
 * `explicit` 决定只读请求是否免 token——免 token 只属于回环自动 token。
 */
function resolveAuthToken(configured: string | undefined): {
  token: string;
  explicit: boolean;
} {
  if (configured !== undefined && configured.length > 0) {
    return { token: configured, explicit: true };
  }
  return { token: generateAuthToken(), explicit: false };
}

/**
 * 非浏览器调用者(本机 CLI / 脚本 / 自动化)表明"这是 byf 客户端在有意调用"的标记头。
 * 浏览器同源请求由 Origin 门放行,不需要它。
 */
export const BYF_REQUESTED_WITH_HEADER = 'x-byf-requested-with';

/** 只读方法(SPA 首屏与 SSE 事件流走 GET)。 */
function isReadOnlyMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD';
}

/** Content-Type 门只作用于"带 body 的写":无 body 的 DELETE/POST 不该被它误杀。 */
function hasRequestBody(request: Request): boolean {
  return request.body !== null;
}

function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.split(';', 1)[0]!.trim().toLowerCase() === 'application/json';
}

/** Origin 与请求自身同源(比较 host;缺端口按协议默认补全)。 */
function isSameOrigin(origin: string, requestUrl: string): boolean {
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

/**
 * PRD-0038 AC-1.1 的跨站简单请求门(写请求专用)。返回 `null` 表示放行。
 *
 * 顺序固定为 Content-Type → Origin/标记头 → token:
 * - 先 Content-Type:阻断"无预检的表单式简单请求"(text/plain / urlencoded / 缺失),
 *   这类请求连不上真实客户端,没必要再看后面的门。
 * - 再 Origin/标记头:显式跨源 Origin 一律拒绝(即使带标记头——标记头不是跨源豁免);
 *   无 Origin 的非浏览器调用者必须自带标记头(Q1 条件 2)。
 * - 最后 token:只有"形态合法的写"才值得一次凭证挑战(401 + `www-authenticate`),
 *   也让 #11 的 5 种失败凭证落在同一个响应体上。
 * 三层都是纯判定,任何一层拒绝都直接结构化 4xx,不进入路由,因此"无 token 且无标记头"
 * 这类组合同时命中两层时也只是被前一层拒绝,不会抛错成 500。
 */
function writeGateRejection(c: Context): Response | null {
  if (hasRequestBody(c.req.raw) && !isJsonContentType(c.req.header('content-type'))) {
    return c.json(
      {
        error: 'write requests require Content-Type: application/json',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      },
      415,
    );
  }
  const origin = c.req.header('origin');
  if (origin !== undefined && !isSameOrigin(origin, c.req.url)) {
    return c.json({ error: 'cross-origin request rejected', code: 'FORBIDDEN' }, 403);
  }
  const marker = c.req.header(BYF_REQUESTED_WITH_HEADER);
  if (origin === undefined && (marker === undefined || marker.length === 0)) {
    return c.json(
      {
        error: `missing ${BYF_REQUESTED_WITH_HEADER} marker header (required for non-browser callers)`,
        code: 'FORBIDDEN',
      },
      403,
    );
  }
  return null;
}

export interface CreateAppOptions {
  readonly manager: WebSessionManager;
  /**
   * 鉴权 token。省略时(回环默认)由本次启动随机生成一个,并经 {@link
   * CreateAppResult.authToken} 交付给启动日志与 CLI。
   */
  readonly authToken?: string;
  /** 持有构建后 SPA 资产的目录;省略时自动探测。 */
  readonly publicDir?: string;
  /** byf home 目录(工作区注册表 / 会话索引所在);默认 `resolveByfHome()`。 */
  readonly homeDir?: string;
}

export interface CreateAppResult {
  readonly app: Hono;
  readonly staticEnabled: boolean;
  /** 实际生效的 token:显式配置值,或本次启动自动生成的回环 token。 */
  readonly authToken: string;
}

/** 构建 Hono 应用:`/api/*` 路由 + 安全门 + SPA 静态回退。 */
export async function createApp(options: CreateAppOptions): Promise<CreateAppResult> {
  const app = new Hono();

  const api = new Hono();
  const { token: authToken, explicit } = resolveAuthToken(options.authToken);
  api.use('*', async (c, next) => {
    const readOnly = isReadOnlyMethod(c.req.method);
    if (!readOnly) {
      const rejection = writeGateRejection(c);
      if (rejection !== null) return rejection;
    }
    // 只读免 token 只属于"未显式配置 token 的回环自动 token"(免 token 是为了不破坏
    // SPA 首屏);显式配置 token(LAN 模式)时一律要求凭证。
    if (!(readOnly && !explicit)) {
      if (isAuthorized(c.req.header('authorization'), c.req.query('token'), authToken)) {
        await next();
        return;
      }
      c.header('www-authenticate', 'Bearer realm="byf-web"');
      return c.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, 401);
    }
    await next();
  });
  api.route('/', createApiRouter(options.manager, options.homeDir ?? resolveByfHome()));
  app.route('/api', api);

  app.onError((err, c) => {
    // SessionNotFoundError 或携带 session.not_found 错误码的 ByfError(经 RPC
    // 序列化后丢失类身份,如 PATCH /sessions/:id 与 fork 对不存在会话)→ 404。
    const code = (err as { code?: unknown }).code;
    if (err instanceof SessionNotFoundError || code === 'session.not_found') {
      const message = err instanceof Error ? err.message : 'session not found';
      return c.json({ error: message, code: 'NOT_FOUND' }, 404);
    }
    const message = err instanceof Error ? err.message : 'internal error';
    return c.json({ error: message, code: 'INTERNAL' }, 500);
  });

  const staticSource = await resolveStaticSource(options.publicDir);
  if (staticSource === null) {
    if (options.publicDir !== undefined) {
      // 调用方显式要求内置 SPA 但路径不可用:配置错误,值得一条 stderr 诊断。
      process.stderr.write(
        `[web-server] publicDir not found or not a directory: ${options.publicDir}; ` +
          'serving API only (/api/*).\n',
      );
    } else {
      // 未显式指定:api-only 是设计上的 fallback(dev 由 vite 提供前端;CLI /
      // 独立部署需先构建)。用 stdout 说明而非 stderr 警告,避免被误读为启动失败。
      process.stdout.write(
        '[web-server] serving API only (/api/*): SPA bundle not found. ' +
          'Dev frontend: `bun run --cwd apps/web/client dev` (vite). ' +
          'Self-contained: run `bun run build:web` first.\n',
      );
    }
  } else if (staticSource.kind === 'embedded') {
    const assets = staticSource.assets;
    app.get('*', (c) => {
      const url = new URL(c.req.url);
      const rawPath = decodeURIComponent(url.pathname);
      if (rawPath.startsWith('/api')) {
        return c.json({ error: `api route not found: ${rawPath}`, code: 'NOT_FOUND' }, 404);
      }
      const rel = rawPath === '/' || rawPath === '' ? 'index.html' : rawPath.replace(/^\//, '');
      const direct = assets.get(rel);
      if (direct !== undefined) {
        return new Response(Bun.file(direct), { headers: { 'content-type': mimeFor(rel) } });
      }
      const indexVpath = assets.get('index.html');
      if (indexVpath === undefined) return c.text('not found', 404);
      return new Response(Bun.file(indexVpath), {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
  } else {
    const publicDir = staticSource.publicDir;
    app.get('*', async (c) => {
      const url = new URL(c.req.url);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.startsWith('/api')) {
        return c.json({ error: `api route not found: ${pathname}`, code: 'NOT_FOUND' }, 404);
      }
      if (pathname === '/' || pathname === '') pathname = '/index.html';
      const resolved = resolve(publicDir, `.${pathname}`);
      if (!resolved.startsWith(publicDir)) {
        return c.text('forbidden', 403);
      }
      try {
        const s = await stat(resolved);
        if (s.isFile()) {
          const buf = await readFile(resolved);
          const body = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
          return new Response(body, { headers: { 'content-type': mimeFor(resolved) } });
        }
      } catch {
        // fall through to SPA fallback
      }
      try {
        const indexHtml = await readFile(join(publicDir, 'index.html'));
        const body = new Uint8Array(indexHtml.buffer, indexHtml.byteOffset, indexHtml.byteLength);
        return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      } catch {
        return c.text('not found', 404);
      }
    });
  }

  return { app, staticEnabled: staticSource !== null, authToken };
}
