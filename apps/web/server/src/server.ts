import { ByfHarness } from '@byfriends/sdk';

import { createApp } from './app';
import { resolveByfHome, resolveHost, resolvePort, resolveWebAuthToken } from './config';
import { WebSessionManager, type HarnessLike } from './session-manager';
import { formatWebStartupBanner } from './startup-banner';

/** 以编程方式启动 web-server 的选项。 */
export interface StartWebServerOptions {
  /** 绑定主机。默认 `resolveHost()`(回环)。 */
  readonly host?: string;
  /** 绑定端口。默认 `resolvePort()`(4100)。 */
  readonly port?: number;
  /** 鉴权 token。默认 `resolveWebAuthToken(host)`(回环外必填)。 */
  readonly authToken?: string;
  /** 持有构建后 SPA 资产的目录;省略时自动探测。 */
  readonly publicDir?: string;
  /** 注入 harness(测试用);默认构造真实 ByfHarness。 */
  readonly harness?: HarnessLike;
}

/** 运行中 web-server 的句柄。 */
export interface WebServerHandle {
  readonly host: string;
  readonly port: number;
  readonly staticEnabled: boolean;
  readonly url: string;
  close(): void;
}

function hostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}

/**
 * 以编程方式启动 web HTTP 服务器。服务器开始监听后 resolve。CLI `byf web`
 * 子命令(进程内)与独立 `index.ts` 入口使用。
 *
 * 经 `Bun.serve` 绑定(库运行时契约仅 Bun)。
 */
export async function startWebServer(
  options: StartWebServerOptions = {},
): Promise<WebServerHandle> {
  const host = options.host ?? resolveHost();
  const port = options.port ?? resolvePort();
  const authToken = options.authToken ?? resolveWebAuthToken(host);
  const harness = options.harness ?? new ByfHarness({ homeDir: resolveByfHome() });
  const manager = new WebSessionManager(harness);

  const { app, staticEnabled } = await createApp({
    manager,
    authToken,
    publicDir: options.publicDir,
  });

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: app.fetch,
  });

  const actualPort = server.port ?? port;
  return {
    host,
    port: actualPort,
    staticEnabled,
    url: `http://${hostForUrl(host)}:${actualPort}`,
    close: () => {
      void server.stop(true);
      void manager.dispose();
    },
  };
}

/** 格式化启动横幅(CLI 复用同一措辞)。 */
export function formatWebServerStartupBanner(input: {
  readonly authToken?: string;
  readonly host: string;
  readonly port: number;
  readonly staticEnabled?: boolean;
}): string {
  return formatWebStartupBanner({
    authToken: input.authToken,
    host: input.host,
    byfHome: resolveByfHome(),
    port: input.port,
    staticEnabled: input.staticEnabled,
  });
}
