import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { SseError } from '@modelcontextprotocol/sdk/client/sse.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { buildMcpHttpHeaders } from '../../src/mcp/client-shared';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) {
    await cleanup();
  }
});

function sseError204(message: string): SseError {
  // The SDK SseError expects an ErrorEvent (from eventsource) as third arg.
  // Since eventsource may not be a direct dependency, cast from {} to bypass
  // the compile-time type check. The event field is never read in tests.
  return new SseError(204, message, {} as unknown as Event);
}

async function startInProcessSseMcpServer(opts?: {
  authToken?: string;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const mcpServer = new McpServer({ name: 'mock-sse', version: '0.0.1' });
  mcpServer.registerTool(
    'echo',
    { description: 'Echoes text', inputSchema: { text: z.string() } },
    ({ text }) => ({ content: [{ type: 'text', text }] }),
  );

  // Track active SSE transports by sessionId for the lifetime of the httpServer.
  const sessions = new Map<string, SSEServerTransport>();

  const httpServer: Server = createServer((req, res) => {
    (async () => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

      // GET — SSE stream establishment (long-lived)
      if (req.method === 'GET') {
        if (opts?.authToken !== undefined) {
          const auth = req.headers['authorization'];
          if (auth !== `Bearer ${opts.authToken}`) {
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'unauthorized' }));
            return;
          }
        }
        const transport = new SSEServerTransport('/mcp', res);
        sessions.set(transport.sessionId, transport);
        await mcpServer.connect(transport);
        // The response stays open as the SSE event stream. The transport's
        // `onclose` will fire when the client disconnects.
        await new Promise<void>((resolve) => {
          req.on('close', () => {
            sessions.delete(transport.sessionId);
            resolve();
          });
        });
        return;
      }

      // POST — client-to-server messages (tool calls, tool list, etc.)
      if (req.method === 'POST') {
        const sessionId = url.searchParams.get('sessionId');
        if (sessionId === null) {
          res.writeHead(400).end('Missing sessionId');
          return;
        }
        const transport = sessions.get(sessionId);
        if (transport === undefined) {
          res.writeHead(404).end('Session not found');
          return;
        }
        await transport.handlePostMessage(req, res);
        return;
      }

      res.writeHead(405).end();
    })().catch((error) => {
      console.error('HTTP server handler error:', error);
    });
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
        httpServer.closeAllConnections?.();
        const timer = setTimeout(() => resolve(), 200);
        httpServer.close((err) => {
          clearTimeout(timer);
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

// ---- Cycle 2 tests (buildMcpHttpHeaders + isTerminalSseError) ----

describe('buildMcpHttpHeaders with SSE config', () => {
  it('accepts a config with just headers and bearerTokenEnvVar (no transport literal)', () => {
    const result = buildMcpHttpHeaders(
      { headers: { 'X-Custom': 'val' }, bearerTokenEnvVar: 'TOK' },
      (name) => (name === 'TOK' ? 'secret' : undefined),
    );
    expect(result).toEqual({ 'X-Custom': 'val', Authorization: 'Bearer secret' });
  });

  it('returns undefined when no headers and no bearerTokenEnvVar are configured', () => {
    expect(buildMcpHttpHeaders({}, () => undefined)).toBeUndefined();
  });
});

describe('isTerminalSseError', () => {
  it('detects SseError with code 204 as terminal', async () => {
    const { isTerminalSseError } = await import('../../src/mcp/client-sse');
    const error = sseError204('Server closed connection');
    expect(isTerminalSseError(error)).toBe(true);
  });

  it('detects unauthorized errors via message sniff', async () => {
    const { isTerminalSseError } = await import('../../src/mcp/client-sse');
    expect(isTerminalSseError(new Error('Unauthorized'))).toBe(true);
    expect(isTerminalSseError(new Error('unauthorized: invalid token'))).toBe(true);
    expect(isTerminalSseError(new Error('UNAUTHORIZED'))).toBe(true);
  });

  it('returns false for regular generic errors', async () => {
    const { isTerminalSseError } = await import('../../src/mcp/client-sse');
    expect(isTerminalSseError(new Error('SSE stream disconnected'))).toBe(false);
    expect(isTerminalSseError(new Error('fetch failed'))).toBe(false);
    expect(isTerminalSseError(new Error('Connection refused'))).toBe(false);
  });

  it('returns false for non-SseError errors with code 204 that are not SseError instances', async () => {
    const { isTerminalSseError } = await import('../../src/mcp/client-sse');
    const fake = new Error('Some other error');
    (fake as { code?: number }).code = 204;
    // Non-SseError with code 204 should NOT be treated as terminal
    expect(isTerminalSseError(fake)).toBe(false);
  });
});

// ---- Cycle 3 tests: SseMcpClient connect/listTools/callTool ----

describe('SseMcpClient', () => {
  it('connects, lists tools, and round-trips a call over real HTTP SSE', async () => {
    const server = await startInProcessSseMcpServer();
    cleanups.push(server.close);

    const { SseMcpClient } = await import('../../src/mcp/client-sse');
    const client = new SseMcpClient({ transport: 'sse', url: server.url });
    try {
      await client.connect();
      const tools = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(['echo']);

      const result = await client.callTool('echo', { text: 'hello sse' });
      expect(result.isError).toBe(false);
      expect(result.content).toEqual([{ type: 'text', text: 'hello sse' }]);
    } finally {
      await client.close();
    }
  }, 15000);

  it('forwards bearer token from envLookup', async () => {
    const server = await startInProcessSseMcpServer({ authToken: 'good-token' });
    cleanups.push(server.close);

    const { SseMcpClient } = await import('../../src/mcp/client-sse');
    const client = new SseMcpClient(
      { transport: 'sse', url: server.url, bearerTokenEnvVar: 'EXAMPLE_TOKEN' },
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

  // ---- Cycle 4 tests: unexpected-close behavior ----

  it('fires unexpected-close when SseError(code 204) arrives post-connect', async () => {
    const server = await startInProcessSseMcpServer();
    cleanups.push(server.close);

    const { SseMcpClient } = await import('../../src/mcp/client-sse');
    const client = new SseMcpClient({ transport: 'sse', url: server.url });
    const closes: Array<{ error?: string }> = [];
    client.onUnexpectedClose((reason) => {
      closes.push({ error: reason.error?.message });
    });
    try {
      await client.connect();
      // Simulate the SDK calling Client.onerror with an SseError(204) — the
      // path the SSE transport uses to signal a terminal server-forced close.
      const internal = (
        client as unknown as {
          client: { onerror?: (error: Error) => void };
        }
      ).client;
      internal.onerror?.(sseError204('Server closed'));
      await new Promise((r) => setTimeout(r, 25));
      expect(closes).toHaveLength(1);
      expect(closes[0]?.error).toContain('Server closed');
    } finally {
      await client.close();
    }
  }, 15000);

  it('ignores transient transport errors that eventsource recovers from', async () => {
    const server = await startInProcessSseMcpServer();
    cleanups.push(server.close);

    const { SseMcpClient } = await import('../../src/mcp/client-sse');
    const client = new SseMcpClient({ transport: 'sse', url: server.url });
    const closes: number[] = [];
    client.onUnexpectedClose(() => closes.push(Date.now()));
    try {
      await client.connect();
      const internal = (
        client as unknown as {
          client: { onerror?: (error: Error) => void };
        }
      ).client;
      // Normal SSE connection flaps that eventsource auto-recovers from — these
      // must NOT trigger unexpected-close.
      internal.onerror?.(new Error('SSE stream disconnected: ECONNRESET'));
      internal.onerror?.(new Error('EventSource error'));
      await new Promise((r) => setTimeout(r, 25));
      expect(closes).toEqual([]);
    } finally {
      await client.close();
    }
  }, 15000);

  it('replays a buffered terminal error when listener is installed after error', async () => {
    const server = await startInProcessSseMcpServer();
    cleanups.push(server.close);

    const { SseMcpClient } = await import('../../src/mcp/client-sse');
    const client = new SseMcpClient({ transport: 'sse', url: server.url });
    try {
      await client.connect();
      // Fire an SseError(204) BEFORE installing the listener.
      const internal = (
        client as unknown as {
          client: { onerror?: (error: Error) => void };
        }
      ).client;
      internal.onerror?.(sseError204('Server closed'));

      // Install the listener *after* the error — should replay the buffered close.
      const closes: Array<{ error?: string }> = [];
      client.onUnexpectedClose((reason) => {
        closes.push({ error: reason.error?.message });
      });
      await new Promise((r) => setTimeout(r, 25));
      expect(closes).toHaveLength(1);
      expect(closes[0]?.error).toContain('Server closed');
    } finally {
      await client.close();
    }
  }, 15000);
});
