/**
 * `byf vis` 子命令 —— 弃用期 shim（PRD-0035 R-B4 / ADR-0037 D1）。
 *
 * `byf vis` 不再启动独立的 vis-server：它与 `byf web` 共用
 * `@byfriends/web-server` 的 `startWebServer`（唯一 HTTP server 路径，
 * AC-A2）。差异只剩默认端口（3001）与兼容转发 `VIS_AUTH_TOKEN`（R-B3）。
 * banner 前置一行弃用提示，标明已由统一工作台提供服务（AC-A14）。
 */

import { collectLanIps } from '@byfriends/web-server';
import type { StartWebServerOptions, WebServerHandle } from '@byfriends/web-server';
import type { Command } from 'commander';

import { handleWeb } from './web';
import type { WebDeps } from './web';

interface WritableLike {
  write(chunk: string): boolean;
}

/** `byf vis` 的注入契约（保持既有测试接口形状不变）。 */
export interface VisDeps {
  readonly startServer: (opts: StartWebServerOptions) => Promise<WebServerHandle>;
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
 * 运行 `byf vis`（弃用期）。委托 `handleWeb` 启动统一工作台：
 * - 默认端口保持 3001（R-B4 / AC-A14）；
 * - `VIS_AUTH_TOKEN` 兼容读取并转发为 `WEB_AUTH_TOKEN`（R-B3，未显式设置
 *   WEB_AUTH_TOKEN 时）。
 */
export async function handleVis(
  deps: VisDeps,
  sessionId: string | undefined,
  opts: VisOptions,
): Promise<void> {
  if (process.env['WEB_AUTH_TOKEN'] === undefined && process.env['VIS_AUTH_TOKEN'] !== undefined) {
    process.env['WEB_AUTH_TOKEN'] = process.env['VIS_AUTH_TOKEN'];
  }

  deps.stdout.write(
    'byf vis: session visualizer is now served by the unified web workbench (PRD-0035). ' +
      '`byf web` and `byf vis` share the same server.\n',
  );

  const webDeps: WebDeps = {
    startServer: deps.startServer,
    openUrl: deps.openUrl,
    waitForShutdown: deps.waitForShutdown,
    stdout: deps.stdout,
    stderr: deps.stderr,
    exit: deps.exit,
    collectLanIps: collectLanIps,
  };
  await handleWeb(webDeps, sessionId, {
    port: opts.port ?? DEFAULT_VIS_PORT,
    host: opts.host ?? DEFAULT_VIS_HOST,
    open: opts.open,
  });
}

export function registerVisCommand(parent: Command, deps?: Partial<VisDeps>): void {
  parent
    .command('vis')
    .description('Launch the session visualizer in a browser (unified web workbench).')
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

async function defaultStartServer(opts: StartWebServerOptions): Promise<WebServerHandle> {
  const { startWebServer } = await import('@byfriends/web-server');
  return startWebServer(opts);
}

async function defaultOpenUrl(url: string): Promise<void> {
  const open = (await import('open')).default;
  await open(url, { wait: false });
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
