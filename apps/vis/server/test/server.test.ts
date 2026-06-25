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
    // BYF_HOME is a module-level const captured at import time, so it must be
    // set before the server module is imported. Use vi.resetModules + dynamic
    // import to load a fresh module graph bound to this fixture home.
    vi.resetModules();
    process.env['BYF_HOME'] = home;
    const { startVisServer: startFresh } = await import('../src/server');
    try {
      const port = await freePort();
      const handle = await startFresh({ host: '127.0.0.1', port });

      const body = (await fetchJson(`${handle.url}/api/sessions`)) as {
        sessions: Array<{ sessionId: string }>;
      };
      expect(body.sessions.some((s) => s.sessionId === 'session_fixture')).toBe(true);

      handle.close();
    } finally {
      delete process.env['BYF_HOME'];
      vi.resetModules();
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

  it('closes the HTTP server via handle.close()', async () => {
    const port = await freePort();
    const handle = await startVisServer({ host: '127.0.0.1', port });

    // Server is reachable before close.
    const before = (await fetchJson(`${handle.url}/api/sessions`)) as { sessions: unknown[] };
    expect(Array.isArray(before.sessions)).toBe(true);

    handle.close();

    // After close, new connections are refused.
    await expect(fetch(`${handle.url}/api/sessions`)).rejects.toThrow();
  });
});
