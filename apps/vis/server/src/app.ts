import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { Hono } from 'hono';

import { contextRoute } from './routes/context';
import { sessionDetailRoute } from './routes/session-detail';
import { sessionsRoute } from './routes/sessions';
import { subagentsRoute } from './routes/subagents';
import { wireRoute } from './routes/wire';

/** Resolve the SPA bundle directory next to the compiled server.mjs, if it
 * exists. Returns `null` in dev mode where the web bundle lives elsewhere. */
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
 * The `@byfriends/cli` native compile binary embeds the SPA assets via
 * `bun build --compile` (see apps/cli/scripts/compile/build.mjs). Each entry is
 * a `Map<relativePath, embeddedVirtualPath>`; values are `/$bunfs/root/...`
 * strings that `Bun.file()` can read directly. In source/JS-bundle layouts this
 * global is absent and this returns `null`.
 */
function resolveEmbeddedAssets(): Map<string, string> | null {
  const raw = (globalThis as Record<string, unknown>)['__BYF_VIS_EMBEDDED_ASSETS__'];
  if (!(raw instanceof Map)) return null;
  return raw;
}

/** Where the SPA bundle is served from — disk (source/bundle) or embedded
 * (native compile binary). `null` means API-only (no SPA bundle available). */
type StaticSource =
  | { readonly kind: 'disk'; readonly publicDir: string }
  | { readonly kind: 'embedded'; readonly assets: Map<string, string> };

/** Pick the static source, preferring an explicit `publicDir`, then embedded
 * assets (native binary), then the on-disk bundle next to the server module. */
async function resolveStaticSource(publicDir: string | undefined): Promise<StaticSource | null> {
  if (publicDir !== undefined) {
    try {
      const s = await stat(publicDir);
      if (s.isDirectory()) return { kind: 'disk', publicDir };
    } catch {
      // fall through to other sources
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

export interface CreateAppOptions {
  readonly authToken?: string;
  /**
   * Directory holding the built SPA assets. When provided, this directory is
   * used directly; otherwise the `public/` directory next to the compiled
   * server bundle is auto-detected (returns `null` in dev mode where the web
   * bundle lives elsewhere, e.g. behind the Vite dev server).
   */
  readonly publicDir?: string;
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

/** Result of building the Hono app; `staticEnabled` is false in API-only mode. */
export interface CreateAppResult {
  readonly app: Hono;
  /** Whether the SPA bundle is being served. False means API-only. */
  readonly staticEnabled: boolean;
}

/** Build a Hono app mounting /api/* routes, plus SPA static fallback. */
export async function createApp(options: CreateAppOptions = {}): Promise<CreateAppResult> {
  const app = new Hono();

  // /api/* handlers.
  const api = new Hono();
  const authToken = options.authToken;
  if (authToken !== undefined && authToken.length > 0) {
    api.use('*', async (c, next) => {
      const token = bearerToken(c.req.header('authorization'));
      if (token !== null && tokenMatches(token, authToken)) {
        await next();
        return;
      }
      c.header('www-authenticate', 'Bearer realm="byf-vis"');
      return c.json({ error: 'unauthorized', code: 'UNAUTHORIZED' }, 401);
    });
  }
  api.route('/sessions', sessionsRoute());
  api.route('/sessions', sessionDetailRoute());
  api.route('/sessions', wireRoute());
  api.route('/sessions', subagentsRoute());
  // Mount contextRoute last because it currently uses a catch-all stub
  // (Phase C scope) that would otherwise shadow more specific routes
  // registered below it.
  api.route('/sessions', contextRoute());

  app.route('/api', api);

  // Static + SPA fallback. Serves from disk (source/bundle) or embedded assets
  // (native compile binary); when neither is available the server is API-only.
  const staticSource = await resolveStaticSource(options.publicDir);
  if (staticSource === null) {
    process.stderr.write(
      '[vis-server] SPA bundle not found; serving API only (/api/*). ' +
        'Rebuild with `bun run build:vis` or set the publicDir explicitly.\n',
    );
  } else if (staticSource.kind === 'embedded') {
    const assets = staticSource.assets;
    app.get('*', (c) => {
      const url = new URL(c.req.url);
      const rawPath = decodeURIComponent(url.pathname);
      if (rawPath.startsWith('/api')) {
        return c.json({ error: `api route not found: ${rawPath}`, code: 'NOT_FOUND' }, 404);
      }
      // Direct asset lookup by relative path (root → index.html).
      const rel = rawPath === '/' || rawPath === '' ? 'index.html' : rawPath.replace(/^\//, '');
      const direct = assets.get(rel);
      if (direct !== undefined) {
        return new Response(Bun.file(direct), { headers: { 'content-type': mimeFor(rel) } });
      }
      // SPA fallback — index.html for any unknown GET so client-side React
      // Router can resolve the route.
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
        // Should have been routed above; 404 here.
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
          return new Response(body, {
            headers: { 'content-type': mimeFor(resolved) },
          });
        }
      } catch {
        // fall through to SPA fallback
      }
      // SPA fallback — index.html for any unknown GET so client-side
      // React Router can resolve the route.
      try {
        const indexHtml = await readFile(join(publicDir, 'index.html'));
        const body = new Uint8Array(indexHtml.buffer, indexHtml.byteOffset, indexHtml.byteLength);
        return new Response(body, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      } catch {
        return c.text('not found', 404);
      }
    });
  }

  return { app, staticEnabled: staticSource !== null };
}
