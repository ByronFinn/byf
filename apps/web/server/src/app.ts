import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Hono } from 'hono';

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

export interface CreateAppOptions {
  readonly manager: WebSessionManager;
  /** 鉴权 token;省略时仅 API 无鉴权(回环默认)。 */
  readonly authToken?: string;
  /** 持有构建后 SPA 资产的目录;省略时自动探测。 */
  readonly publicDir?: string;
  /** byf home 目录(工作区注册表 / 会话索引所在);默认 `resolveByfHome()`。 */
  readonly homeDir?: string;
}

export interface CreateAppResult {
  readonly app: Hono;
  readonly staticEnabled: boolean;
}

/** 构建 Hono 应用:`/api/*` 路由 + 鉴权 + SPA 静态回退。 */
export async function createApp(options: CreateAppOptions): Promise<CreateAppResult> {
  const app = new Hono();

  const api = new Hono();
  const authToken = options.authToken;
  if (authToken !== undefined && authToken.length > 0) {
    api.use('*', async (c, next) => {
      if (isAuthorized(c.req.header('authorization'), c.req.query('token'), authToken)) {
        await next();
        return;
      }
      c.header('www-authenticate', 'Bearer realm="byf-web"');
      return c.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, 401);
    });
  }
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

  return { app, staticEnabled: staticSource !== null };
}
