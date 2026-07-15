/**
 * `byf vis` sub-command.
 *
 * CLI glue: parse flags, start the vis HTTP server in-process, open a browser,
 * and keep the process alive until interrupted. Server start and browser open
 * are delegated through `VisDeps` so the logic is testable without a real
 * network or GUI.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { formatVisStartupBanner } from '@byfriends/vis-server';
import type { StartVisServerOptions, VisServerHandle } from '@byfriends/vis-server';
import type { Command } from 'commander';

interface WritableLike {
  write(chunk: string): boolean;
}

export interface VisDeps {
  readonly startServer: (opts: StartVisServerOptions) => Promise<VisServerHandle>;
  readonly openUrl: (url: string) => Promise<void>;
  readonly waitForShutdown: (onClose: () => void) => Promise<void>;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly exit: (code: number) => never;
}

export interface VisOptions {
  readonly port?: number;
  readonly host?: string;
  readonly open: boolean;
}

export const DEFAULT_VIS_PORT = 3001;
export const DEFAULT_VIS_HOST = '127.0.0.1';

/**
 * Run `byf vis`. Starts the server, prints a banner, optionally opens a
 * browser, and blocks until SIGINT/SIGTERM.
 */
export async function handleVis(
  deps: VisDeps,
  sessionId: string | undefined,
  opts: VisOptions,
): Promise<void> {
  const host = opts.host ?? DEFAULT_VIS_HOST;
  const port = opts.port ?? DEFAULT_VIS_PORT;

  const publicDir = resolvePublicDir();

  let handle: VisServerHandle;
  try {
    handle = await deps.startServer({ host, port, publicDir });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('VIS_AUTH_TOKEN')) {
      deps.stderr.write(
        `byf vis: binding to ${host} requires an auth token. Set VIS_AUTH_TOKEN in your\n` +
          `environment, e.g.  VIS_AUTH_TOKEN=$(openssl rand -hex 16) byf vis --host ${host}\n`,
      );
      deps.exit(1);
    }
    if (/EADDRINUSE|address already in use/i.test(message)) {
      deps.stderr.write(
        `byf vis: port ${port} is already in use. Try a different one: byf vis --port <n>\n`,
      );
      deps.exit(1);
    }
    deps.stderr.write(`byf vis: ${message}\n`);
    deps.exit(1);
  }

  // Build the deep link and banner.
  const target = sessionId === undefined ? '/' : `/sessions/${sessionId}`;
  const url = `${handle.url}${target}`;
  const authToken = process.env['VIS_AUTH_TOKEN'];
  deps.stdout.write(
    formatVisStartupBanner({
      authToken,
      host: handle.host,
      port: handle.port,
      staticEnabled: handle.staticEnabled,
    }),
  );

  // Open the browser unless suppressed.
  if (opts.open) {
    try {
      await deps.openUrl(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.stderr.write(`byf vis: failed to open browser (${message}); open ${url} manually.\n`);
    }
  }

  // Block until interrupted.
  await deps.waitForShutdown(() => {
    handle.close();
  });
  deps.exit(0);
}

/**
 * Resolve the bundled SPA directory, if any. Points at the `dist/public`
 * shipped inside the published `@byfriends/vis-server` package; returns
 * `undefined` when the package cannot be located.
 */
function resolvePublicDir(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve('@byfriends/vis-server/package.json'));
    return join(root, 'dist', 'public');
  } catch {
    return undefined;
  }
}

/** Block until SIGINT/SIGTERM, invoking `onClose` once first. */
function waitForSignal(onClose: () => void): Promise<void> {
  return new Promise<void>((resolve) => {
    let closed = false;
    const shutdown = (): void => {
      if (closed) return;
      closed = true;
      try {
        onClose();
      } catch {
        // ignore
      }
      resolve();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

export function registerVisCommand(parent: Command, deps?: Partial<VisDeps>): void {
  parent
    .command('vis')
    .description('Launch the session visualizer in a browser.')
    .option('-p, --port <port>', 'Port to listen on.', String(DEFAULT_VIS_PORT))
    .option('-H, --host <host>', 'Host to bind.', DEFAULT_VIS_HOST)
    .option('--no-open', 'Do not open a browser automatically.')
    .argument('[sessionId]', 'Session id to open directly.')
    .action(
      async (
        sessionId: string | undefined,
        options: { port: string; host: string; open?: boolean },
      ) => {
        await handleVis(createDefaultVisDeps(deps), sessionId, {
          port: Number.parseInt(options.port, 10),
          host: options.host,
          open: options.open !== false,
        });
      },
    );
}

function createDefaultVisDeps(overrides: Partial<VisDeps> = {}): VisDeps {
  return {
    startServer: overrides.startServer ?? defaultStartServer,
    openUrl: overrides.openUrl ?? defaultOpenUrl,
    waitForShutdown: overrides.waitForShutdown ?? waitForSignal,
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr,
    exit: overrides.exit ?? ((code: number) => process.exit(code)),
  };
}

async function defaultStartServer(opts: StartVisServerOptions): Promise<VisServerHandle> {
  const { startVisServer } = await import('@byfriends/vis-server');
  return startVisServer(opts);
}

async function defaultOpenUrl(url: string): Promise<void> {
  const open = (await import('open')).default;
  await open(url, { wait: false });
}
