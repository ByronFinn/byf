/**
 * `byf web` 子命令。
 *
 * CLI 胶水:解析标志、进程内启动 web HTTP 服务器(驱动 live agent)、打开浏览器,
 * 并保持进程存活直到被中断。服务器启动与浏览器打开经 `WebDeps` 委托,使逻辑无需
 * 真实网络或 GUI 即可测试。结构与 `byf vis` 一致。
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { collectLanIps, formatWebServerStartupBanner } from '@byfriends/web-server';
import type { StartWebServerOptions, WebServerHandle } from '@byfriends/web-server';
import type { Command } from 'commander';

interface WritableLike {
  write(chunk: string): boolean;
}

export interface WebDeps {
  readonly startServer: (opts: StartWebServerOptions) => Promise<WebServerHandle>;
  readonly openUrl: (url: string) => Promise<void>;
  readonly waitForShutdown: (onClose: () => void) => Promise<void>;
  readonly stdout: WritableLike;
  readonly stderr: WritableLike;
  readonly exit: (code: number) => never;
  /** 可注入的 LAN IP 收集(R-D1 banner;默认读 os.networkInterfaces)。 */
  readonly collectLanIps?: () => string[];
}

export interface WebOptions {
  readonly port?: number;
  readonly host?: string;
  readonly open: boolean;
}

export const DEFAULT_WEB_PORT = 4100;
export const DEFAULT_WEB_HOST = '127.0.0.1';

/**
 * 运行 `byf web`。启动服务器、打印横幅、可选打开浏览器,并阻塞直到 SIGINT/SIGTERM。
 */
export async function handleWeb(
  deps: WebDeps,
  sessionId: string | undefined,
  opts: WebOptions,
): Promise<void> {
  const host = opts.host ?? DEFAULT_WEB_HOST;
  const port = opts.port ?? DEFAULT_WEB_PORT;

  const publicDir = resolvePublicDir();

  let handle: WebServerHandle;
  try {
    handle = await deps.startServer({ host, port, publicDir });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('WEB_AUTH_TOKEN')) {
      deps.stderr.write(
        `byf web: binding to ${host} requires an auth token. Set WEB_AUTH_TOKEN in your\n` +
          `environment, e.g.  WEB_AUTH_TOKEN=$(openssl rand -hex 16) byf web --host ${host}\n`,
      );
      deps.exit(1);
    }
    if (/EADDRINUSE|address already in use/i.test(message)) {
      deps.stderr.write(
        `byf web: port ${port} is already in use. Try a different one: byf web --port <n>\n`,
      );
      deps.exit(1);
    }
    deps.stderr.write(`byf web: ${message}\n`);
    deps.exit(1);
  }

  const target = sessionId === undefined ? '/' : `/sessions/${sessionId}`;
  const authToken = process.env['WEB_AUTH_TOKEN'];
  // R-D1:banner 列出所有非回环网卡的完整访问 URL(含 token);自动打开浏览器
  // 仍用 localhost(绑定 0.0.0.0 等非回环地址时 handle.url 不可直接打开)。
  const lanIps = (deps.collectLanIps ?? collectLanIps)();
  deps.stdout.write(
    formatWebServerStartupBanner({
      authToken,
      host: handle.host,
      port: handle.port,
      staticEnabled: handle.staticEnabled,
      lanIps,
    }),
  );
  const openUrl = `http://127.0.0.1:${String(handle.port)}${target}`;

  if (opts.open) {
    try {
      await deps.openUrl(openUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.stderr.write(
        `byf web: failed to open browser (${message}); open ${openUrl} manually.\n`,
      );
    }
  }

  await deps.waitForShutdown(() => {
    handle.close();
  });
  deps.exit(0);
}

/**
 * 解析随 `@byfriends/web-server` 发布的 SPA 目录(若存在)。指向包内 `dist/public`;
 * 包无法定位时返回 `undefined`(服务器退化为仅 API)。
 */
function resolvePublicDir(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve('@byfriends/web-server/package.json'));
    return join(root, 'dist', 'public');
  } catch {
    return undefined;
  }
}

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

export function registerWebCommand(parent: Command, deps?: Partial<WebDeps>): void {
  parent
    .command('web')
    .description('Launch the byf web client in a browser (live agent chat).')
    .option('-p, --port <port>', 'Port to listen on.', String(DEFAULT_WEB_PORT))
    .option('-H, --host <host>', 'Host to bind.', DEFAULT_WEB_HOST)
    .option('--no-open', 'Do not open a browser automatically.')
    .argument('[sessionId]', 'Session id to open directly.')
    .action(
      async (
        sessionId: string | undefined,
        options: { port: string; host: string; open?: boolean },
      ) => {
        await handleWeb(createDefaultWebDeps(deps), sessionId, {
          port: Number.parseInt(options.port, 10),
          host: options.host,
          open: options.open !== false,
        });
      },
    );
}

function createDefaultWebDeps(overrides: Partial<WebDeps> = {}): WebDeps {
  return {
    startServer: overrides.startServer ?? defaultStartServer,
    openUrl: overrides.openUrl ?? defaultOpenUrl,
    waitForShutdown: overrides.waitForShutdown ?? waitForSignal,
    collectLanIps: overrides.collectLanIps ?? collectLanIps,
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
