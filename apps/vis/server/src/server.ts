import { serve } from '@hono/node-server';

import { createApp } from './app';
import { BYF_HOME, resolveHost, resolvePort, resolveVisAuthToken } from './config';
import { formatStartupBanner } from './startup-banner';

/** Options for starting a vis HTTP server programmatically. */
export interface StartVisServerOptions {
  /** Bind host. Defaults to `resolveHost()` (loopback). */
  readonly host?: string;
  /** Bind port. Defaults to `resolvePort()` (3001). */
  readonly port?: number;
  /** Auth token. Defaults to `resolveVisAuthToken(host)` (required outside loopback). */
  readonly authToken?: string;
  /**
   * Directory holding the built SPA assets to serve. When omitted, the
   * `public/` directory next to the compiled server bundle is used (if any);
   * in dev mode this resolves to `null` and only the API is served.
   */
  readonly publicDir?: string;
}

/** A handle to a running vis server. */
export interface VisServerHandle {
  /** The host the server is bound to. */
  readonly host: string;
  /** The port the server is bound to. */
  readonly port: number;
  /** Base URL (`http://<host>:<port>`), with IPv6 hosts bracketed. */
  readonly url: string;
  /** Stop the server. Subsequent connections are refused. */
  close(): void;
}

function hostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}

/**
 * Start the vis HTTP server programmatically. Resolves once the server is
 * listening. Used by the CLI `byf vis` subcommand (in-process) and by the
 * standalone `index.ts` entry.
 */
export async function startVisServer(
  options: StartVisServerOptions = {},
): Promise<VisServerHandle> {
  const host = options.host ?? resolveHost();
  const port = options.port ?? resolvePort();
  const authToken = options.authToken ?? resolveVisAuthToken(host);
  const app = await createApp({ authToken, publicDir: options.publicDir });

  return new Promise<VisServerHandle>((resolve, reject) => {
    let settled = false;
    const server = serve({ fetch: app.fetch, hostname: host, port }, () => {
      if (settled) return;
      settled = true;
      const address = server.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : port;
      resolve({
        host,
        port: actualPort,
        url: `http://${hostForUrl(host)}:${actualPort}`,
        close: () => {
          // closeAllConnections drops keep-alive sockets so the event loop
          // empties and the process can exit promptly after close().
          server.closeAllConnections();
          server.close();
        },
      });
    });
    // `serve()` reports bind failures (e.g. EADDRINUSE) as an async 'error'
    // event, not a synchronous throw — without this listener Node would
    // terminate the process with an uncaughtException and the caller's
    // try/catch in handleVis would never see the port-in-use case.
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

/**
 * Resolve the BYF_HOME the server reads session records from. Exposed for the
 * standalone entry's startup banner. CLI consumers rely on the same env var.
 */
export function resolveVisByfHome(): string {
  return BYF_HOME;
}

/**
 * Format the startup banner text. Exposed so the CLI can reuse the exact same
 * wording without depending on startup-banner internals.
 */
export function formatVisStartupBanner(input: {
  readonly authToken?: string;
  readonly host: string;
  readonly port: number;
}): string {
  return formatStartupBanner({
    authToken: input.authToken,
    host: input.host,
    byfCodeHome: BYF_HOME,
    port: input.port,
  });
}
