import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { UnauthorizedError } from '@modelcontextprotocol/sdk/client/auth.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ErrorCodes, ByfError } from '../../src/errors';
import { HttpMcpClient, isTerminalTransportError } from '../../src/mcp/client-http';
import { buildMcpHttpHeaders } from '../../src/mcp/client-shared';
import { createProxiedFetch } from '../../src/tools/providers/proxied-fetch';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

function expectConfigInvalid(fn: () => unknown): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ByfError);
    expect((error as ByfError).code).toBe(ErrorCodes.CONFIG_INVALID);
    return;
  }
  throw new Error('expected function to throw');
}

describe('buildMcpHttpHeaders', () => {
  it('returns undefined when no headers and no bearer are configured', () => {
    expect(buildMcpHttpHeaders({}, () => undefined)).toBeUndefined();
  });

  it('passes through configured static headers', () => {
    expect(buildMcpHttpHeaders({ headers: { 'X-Tenant': 'byf' } }, () => undefined)).toEqual({
      'X-Tenant': 'byf',
    });
  });

  it('injects Authorization Bearer when env lookup yields a token', () => {
    expect(
      buildMcpHttpHeaders({ bearerTokenEnvVar: 'TOK' }, (name) =>
        name === 'TOK' ? 'secret' : undefined,
      ),
    ).toEqual({ Authorization: 'Bearer secret' });
  });

  it('throws ByfError(config.invalid) when a configured bearer token env var is empty or missing', () => {
    expectConfigInvalid(() =>
      buildMcpHttpHeaders({ bearerTokenEnvVar: 'MISSING' }, () => undefined),
    );
    expect(() => buildMcpHttpHeaders({ bearerTokenEnvVar: 'MISSING' }, () => undefined)).toThrow(
      /"MISSING" is not set or is empty/,
    );
    expectConfigInvalid(() => buildMcpHttpHeaders({ bearerTokenEnvVar: 'EMPTY' }, () => ''));
    expect(() => buildMcpHttpHeaders({ bearerTokenEnvVar: 'EMPTY' }, () => '')).toThrow(
      /"EMPTY" is not set or is empty/,
    );
  });

  it('merges bearer over the same Authorization key from static headers', () => {
    expect(
      buildMcpHttpHeaders(
        {
          headers: { Authorization: 'Bearer stale', 'X-Trace': '1' },
          bearerTokenEnvVar: 'TOK',
        },
        () => 'fresh',
      ),
    ).toEqual({ Authorization: 'Bearer fresh', 'X-Trace': '1' });
  });

  it('flags errors the SDK uses to signal a dead HTTP transport as terminal', () => {
    const unauthorized = new UnauthorizedError('Unauthorized');
    expect(isTerminalTransportError(unauthorized)).toBe(true);
    expect(isTerminalTransportError(new Error('Maximum reconnection attempts (3) exceeded.'))).toBe(
      true,
    );
  });

  it('does not flag transient SDK errors as terminal', () => {
    expect(isTerminalTransportError(new Error('SSE stream disconnected: ECONNRESET'))).toBe(false);
    expect(isTerminalTransportError(new Error('fetch failed'))).toBe(false);
    expect(isTerminalTransportError(new Error('Connection closed'))).toBe(false);
  });

  it('strips case-variant authorization headers before injecting the bearer', () => {
    expect(
      buildMcpHttpHeaders(
        {
          headers: { authorization: 'Bearer stale', AUTHORIZATION: 'Bearer older', 'X-Trace': '1' },
          bearerTokenEnvVar: 'TOK',
        },
        () => 'fresh',
      ),
    ).toEqual({ Authorization: 'Bearer fresh', 'X-Trace': '1' });
  });
});

async function startInProcessHttpMcpServer(opts?: {
  authToken?: string;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const mcpServer = new McpServer({ name: 'mock-http', version: '0.0.1' });
  mcpServer.registerTool(
    'echo',
    { description: 'Echoes text', inputSchema: { text: z.string() } },
    ({ text }) => ({ content: [{ type: 'text', text }] }),
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });
  await mcpServer.connect(transport);

  const httpServer: Server = createServer((req, res) => {
    if (opts?.authToken !== undefined) {
      const auth = req.headers['authorization'];
      if (auth !== `Bearer ${opts.authToken}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
    }
    void transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', resolve);
  });
  const port = (httpServer.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    async close() {
      if (!httpServer.listening) return;
      await new Promise<void>((resolve, reject) => {
        // Bun's node:http close callback can hang if keep-alive sockets remain.
        // Drop them first (Node 18.2+ / Bun), then close with a wall-clock fallback.
        httpServer.closeAllConnections?.();
        const timer = setTimeout(() => resolve(), 200);
        httpServer.close((err) => {
          clearTimeout(timer);
          // Idempotent close: second call / race after fallback may report not running.
          if (err && (err as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') {
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}

describe('HttpMcpClient', () => {
  it('connects, lists tools, and round-trips a call over real HTTP', async () => {
    const server = await startInProcessHttpMcpServer();
    cleanups.push(server.close);

    const client = new HttpMcpClient({ transport: 'http', url: server.url });
    try {
      await client.connect();
      const tools = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['echo']);

      const result = await client.callTool('echo', { text: 'hello http' });
      expect(result.isError).toBe(false);
      expect(result.content).toEqual([{ type: 'text', text: 'hello http' }]);
    } finally {
      await client.close();
    }
  }, 15000);

  it('flips to unexpected-close when the SDK signals a terminal transport error', async () => {
    const server = await startInProcessHttpMcpServer();
    cleanups.push(server.close);

    const client = new HttpMcpClient({ transport: 'http', url: server.url });
    const closes: Array<{ error?: string }> = [];
    client.onUnexpectedClose((reason) => {
      closes.push({ error: reason.error?.message });
    });
    try {
      await client.connect();
      // The SDK normally calls `Client.onerror` from its own retry loop
      // (e.g. "Maximum reconnection attempts (3) exceeded.") — there is no
      // matching `onclose` for HTTP. Simulate that path directly to exercise
      // the terminal-error branch without rigging an SSE reconnect storm.
      const internal = (
        client as unknown as {
          client: { onerror?: (error: Error) => void };
        }
      ).client;
      internal.onerror?.(new Error('Maximum reconnection attempts (3) exceeded.'));
      // Listener may fire in a later microtask; give it a chance.
      await new Promise((r) => setTimeout(r, 25));
      expect(closes).toHaveLength(1);
      expect(closes[0]?.error).toContain('Maximum reconnection attempts');
    } finally {
      await client.close();
    }
  }, 15000);

  it('ignores transient SDK errors that the transport recovers from', async () => {
    const server = await startInProcessHttpMcpServer();
    cleanups.push(server.close);

    const client = new HttpMcpClient({ transport: 'http', url: server.url });
    const closes: number[] = [];
    client.onUnexpectedClose(() => closes.push(Date.now()));
    try {
      await client.connect();
      const internal = (
        client as unknown as {
          client: { onerror?: (error: Error) => void };
        }
      ).client;
      // SSE flap that the SDK will retry on its own — should NOT flip the
      // entry to failed; otherwise a brief network blip would tear down every
      // HTTP MCP connection.
      internal.onerror?.(new Error('SSE stream disconnected: ECONNRESET'));
      internal.onerror?.(new Error('fetch failed'));
      await new Promise((r) => setTimeout(r, 25));
      expect(closes).toEqual([]);
    } finally {
      await client.close();
    }
  }, 15000);

  it('forwards bearer token from envLookup', async () => {
    const server = await startInProcessHttpMcpServer({ authToken: 'good-token' });
    cleanups.push(server.close);

    const client = new HttpMcpClient(
      {
        transport: 'http',
        url: server.url,
        bearerTokenEnvVar: 'EXAMPLE_TOKEN',
      },
      { envLookup: (name) => (name === 'EXAMPLE_TOKEN' ? 'good-token' : undefined) },
    );
    try {
      await client.connect();
      const tools = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['echo']);
    } finally {
      await client.close();
    }
  }, 15000);
});

describe('HttpMcpClient with proxy fallback', () => {
  it('succeeds directly when ProxiedFetch wraps a working fetch (no proxy env)', async () => {
    const server = await startInProcessHttpMcpServer();
    cleanups.push(server.close);

    const proxiedFetch = createProxiedFetch({ envLookup: () => undefined });
    const client = new HttpMcpClient(
      { transport: 'http', url: server.url },
      { fetch: proxiedFetch },
    );
    try {
      await client.connect();
      const tools = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['echo']);

      const result = await client.callTool('echo', { text: 'hello proxied' });
      expect(result.isError).toBe(false);
      expect(result.content).toEqual([{ type: 'text', text: 'hello proxied' }]);
    } finally {
      await client.close();
    }
  }, 15000);

  it('succeeds directly when proxy env is set but direct connection works', async () => {
    const server = await startInProcessHttpMcpServer();
    cleanups.push(server.close);

    const env: Record<string, string> = { HTTP_PROXY: 'http://proxy:8080' };
    const proxiedFetch = createProxiedFetch({
      envLookup: (key) => env[key],
    });
    const client = new HttpMcpClient(
      { transport: 'http', url: server.url },
      { fetch: proxiedFetch },
    );
    try {
      await client.connect();
      const result = await client.callTool('echo', { text: 'direct-works' });
      expect(result.isError).toBe(false);
      expect(result.content).toEqual([{ type: 'text', text: 'direct-works' }]);
    } finally {
      await client.close();
    }
  }, 15000);

  it('retries through proxy when direct fetch fails with a retryable error', async () => {
    const server = await startInProcessHttpMcpServer();
    cleanups.push(server.close);

    let fetchCallCount = 0;
    const originalFetch = globalThis.fetch.bind(globalThis);
    // Mock that fails on first call (ECONNREFUSED), then delegates to real
    // fetch on subsequent calls — simulating "direct fails, proxy retry works".
    const mockFetch: typeof fetch = async (input, init) => {
      fetchCallCount++;
      if (fetchCallCount === 1) {
        const err = new TypeError('fetch failed');
        (err as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
        throw err;
      }
      // Strip the ProxyAgent dispatcher so the real fetch hits the
      // in-process server directly instead of trying to connect through a
      // real proxy.
      const { dispatcher: _d, ...restInit } = (init ?? {}) as Record<string, unknown>;
      return originalFetch(input, restInit as RequestInit);
    };

    const env: Record<string, string> = { HTTP_PROXY: 'http://proxy:8080' };
    const proxiedFetch = createProxiedFetch({
      envLookup: (key) => env[key],
      innerFetch: mockFetch,
    });

    const client = new HttpMcpClient(
      { transport: 'http', url: server.url },
      { fetch: proxiedFetch },
    );
    try {
      await client.connect();
      const tools = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      // The first fetch call must have been the failed direct attempt;
      // subsequent calls went through the proxy retry path.
      expect(fetchCallCount).toBeGreaterThanOrEqual(2);
    } finally {
      await client.close();
    }
  }, 15000);

  it('does not retry non-retryable errors (HTTP 404)', async () => {
    let fetchCallCount = 0;
    const mockFetch: typeof fetch = async () => {
      fetchCallCount++;
      return new Response('not found', { status: 404 });
    };

    const env: Record<string, string> = { HTTP_PROXY: 'http://proxy:8080' };
    const proxiedFetch = createProxiedFetch({
      envLookup: (key) => env[key],
      innerFetch: mockFetch,
    });

    const client = new HttpMcpClient(
      { transport: 'http', url: 'http://127.0.0.1:1/mcp' },
      { fetch: proxiedFetch },
    );
    try {
      await client.connect();
      expect.unreachable('Expected connect to fail with a non-retryable error');
    } catch {
      // Must NOT have retried — only one fetch call.
      expect(fetchCallCount).toBe(1);
    } finally {
      await client.close();
    }
  }, 15000);

  it('does not retry when no proxy is configured and connection fails', async () => {
    let fetchCallCount = 0;
    const mockFetch: typeof fetch = async () => {
      fetchCallCount++;
      const err = new TypeError('fetch failed');
      (err as unknown as { cause: { code: string } }).cause = { code: 'ECONNREFUSED' };
      throw err;
    };

    const proxiedFetch = createProxiedFetch({
      envLookup: () => undefined,
      innerFetch: mockFetch,
    });

    const client = new HttpMcpClient(
      { transport: 'http', url: 'http://127.0.0.1:1/mcp' },
      { fetch: proxiedFetch },
    );
    try {
      await client.connect();
      expect.unreachable('Expected connect to fail');
    } catch {
      // No proxy configured, so ProxiedFetch must NOT retry.
      expect(fetchCallCount).toBe(1);
    } finally {
      await client.close();
    }
  }, 15000);
});
