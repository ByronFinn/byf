import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// apps/vis/server/test/server.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisServerHandle } from '../src/server';
import { startVisServer } from '../src/server';
import { buildSessionFixture } from './fixtures/build';

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, init);
  return res.json();
}

async function tmpPublicDir(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = join(tmpdir(), `vis-public-${process.pid}-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), '<!doctype html><html><body>marker-index</body></html>');
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

async function freePort(): Promise<number> {
  const { createServer } = await import('node:net');
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen({ host: '127.0.0.1', port: 0 }, () => {
      const addr = srv.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        srv.close(() => {
          resolve(port);
        });
      } else {
        reject(new Error('no port'));
      }
    });
  });
}

describe('startVisServer', () => {
  const handles: VisServerHandle[] = [];
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const h of handles) {
      try {
        h.close();
      } catch {
        // ignore
      }
    }
    handles.length = 0;
    for (const c of cleanups) await c();
    cleanups.length = 0;
  });

  it('starts and returns a handle bound to the requested host:port', async () => {
    const port = await freePort();
    const handle = await startVisServer({ host: '127.0.0.1', port });
    handles.push(handle);

    expect(handle.port).toBe(port);
    expect(handle.host).toBe('127.0.0.1');
    expect(handle.url).toBe(`http://127.0.0.1:${port}`);
  });

  it('serves the sessions API on /api/sessions', async () => {
    const { home, cleanup: c } = await buildSessionFixture('sample-main');
    cleanups.push(c);
    // resolveByfHome() is lazy (reads process.env.BYF_HOME at call time), so
    // setting the env var before startVisServer is sufficient.
    const prev = process.env['BYF_HOME'];
    process.env['BYF_HOME'] = home;
    try {
      const port = await freePort();
      const handle = await startVisServer({ host: '127.0.0.1', port });

      const body = (await fetchJson(`${handle.url}/api/sessions`)) as {
        sessions: Array<{ sessionId: string }>;
      };
      expect(body.sessions.some((s) => s.sessionId === 'session_fixture')).toBe(true);

      handle.close();
    } finally {
      if (prev === undefined) {
        delete process.env['BYF_HOME'];
      } else {
        process.env['BYF_HOME'] = prev;
      }
    }
  });

  it('returns 404 for the root when no publicDir is provided (API-only)', async () => {
    const port = await freePort();
    const handle = await startVisServer({ host: '127.0.0.1', port });
    handles.push(handle);

    const res = await fetch(`${handle.url}/`);
    // Without a public dir, the SPA fallback is not registered; a GET / that is
    // not an /api route yields 404.
    expect(res.status).toBe(404);
  });

  it('serves the SPA index from the injected publicDir', async () => {
    const { dir, cleanup: c } = await tmpPublicDir();
    cleanups.push(c);

    const port = await freePort();
    const handle = await startVisServer({ host: '127.0.0.1', port, publicDir: dir });
    handles.push(handle);

    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('marker-index');
  });

  it('reports staticEnabled=true when the SPA bundle is served', async () => {
    const { dir, cleanup: c } = await tmpPublicDir();
    cleanups.push(c);

    const port = await freePort();
    const handle = await startVisServer({ host: '127.0.0.1', port, publicDir: dir });
    handles.push(handle);

    expect(handle.staticEnabled).toBe(true);
  });

  it('serves embedded SPA assets when __BYF_VIS_EMBEDDED_ASSETS__ is set', async () => {
    // Build a tiny on-disk bundle, then read its files into the embedded map as
    // virtual-path strings (simulating the native compile binary's /$bunfs/root
    // layout). The handler reads via Bun.file(vpath), so real files stand in.
    const dir = join(tmpdir(), `vis-embed-${process.pid}-${Date.now()}`);
    await mkdir(join(dir, 'assets'), { recursive: true });
    await writeFile(join(dir, 'index.html'), '<!doctype html><html><body>embedded</body></html>');
    await writeFile(join(dir, 'assets/app-Abc.js'), 'console.log("embedded-js")');
    cleanups.push(() => rm(dir, { recursive: true, force: true }));

    const embedded = new Map<string, string>([
      ['index.html', join(dir, 'index.html')],
      ['assets/app-Abc.js', join(dir, 'assets/app-Abc.js')],
    ]);
    const g = globalThis as Record<string, unknown>;
    const prev = g['__BYF_VIS_EMBEDDED_ASSETS__'];
    g['__BYF_VIS_EMBEDDED_ASSETS__'] = embedded;
    cleanups.push(() => {
      if (prev === undefined) delete g['__BYF_VIS_EMBEDDED_ASSETS__'];
      else g['__BYF_VIS_EMBEDDED_ASSETS__'] = prev;
    });

    const port = await freePort();
    const handle = await startVisServer({ host: '127.0.0.1', port });
    handles.push(handle);

    expect(handle.staticEnabled).toBe(true);

    // Root serves the embedded index.html.
    const indexRes = await fetch(`${handle.url}/`);
    expect(indexRes.status).toBe(200);
    expect(indexRes.headers.get('content-type')).toContain('text/html');
    expect(await indexRes.text()).toContain('embedded');

    // Hashed asset is served with the correct MIME.
    const jsRes = await fetch(`${handle.url}/assets/app-Abc.js`);
    expect(jsRes.status).toBe(200);
    expect(jsRes.headers.get('content-type')).toContain('javascript');
    expect(await jsRes.text()).toContain('embedded-js');

    // Unknown non-api path falls back to index.html (SPA history routing).
    const fallbackRes = await fetch(`${handle.url}/some/deep/route`);
    expect(fallbackRes.status).toBe(200);
    expect(fallbackRes.headers.get('content-type')).toContain('text/html');
    expect(await fallbackRes.text()).toContain('embedded');
  });

  it('warns on stderr and reports staticEnabled=false in API-only mode', async () => {
    const port = await freePort();
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const handle = await startVisServer({ host: '127.0.0.1', port });
      handles.push(handle);

      expect(handle.staticEnabled).toBe(false);
      const warned = spy.mock.calls.some((c) => String(c[0]).includes('API only'));
      expect(warned).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('closes the HTTP server via handle.close()', async () => {
    const port = await freePort();
    const handle = await startVisServer({ host: '127.0.0.1', port });

    // Server is reachable before close.
    const before = (await fetchJson(`${handle.url}/api/sessions`)) as { sessions: unknown[] };
    expect(Array.isArray(before.sessions)).toBe(true);

    handle.close();

    // After close, new connections are refused. Under Bun, a bare fetch to a
    // half-closed port can hang — always bound with AbortSignal.timeout.
    let lastError: unknown;
    for (let i = 0; i < 30; i++) {
      try {
        await fetch(`${handle.url}/api/sessions`, { signal: AbortSignal.timeout(100) });
        await new Promise((r) => setTimeout(r, 50));
      } catch (error) {
        lastError = error;
        break;
      }
    }
    expect(lastError).toBeDefined();
  });
});
