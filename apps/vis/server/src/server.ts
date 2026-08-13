import { createApp } from './app';
import { resolveByfHome, resolveHost, resolvePort, resolveVisAuthToken } from './config';
import { formatStartupBanner } from './startup-banner';

/** 以编程方式启动 vis HTTP 服务器的选项。 */
export interface StartVisServerOptions {
  /** 绑定主机。默认为 `resolveHost()`(回环)。 */
  readonly host?: string;
  /** 绑定端口。默认为 `resolvePort()`(3001)。 */
  readonly port?: number;
  /** 认证 token。默认为 `resolveVisAuthToken(host)`(回环外必填)。 */
  readonly authToken?: string;
  /**
   * 持有要提供的构建后 SPA 资产的目录。省略时,使用编译后的服务器
   * bundle 旁的 `public/` 目录(若有);开发模式解析为 `null`,
   * 只提供 API。
   */
  readonly publicDir?: string;
}

/** 运行中 vis 服务器的句柄。 */
export interface VisServerHandle {
  /** 服务器绑定的主机。 */
  readonly host: string;
  /** 服务器绑定的端口。 */
  readonly port: number;
  /** 是否正在提供 SPA bundle。false 表示仅 API。 */
  readonly staticEnabled: boolean;
  /** Base URL(`http://<host>:<port>`),IPv6 主机带方括号。 */
  readonly url: string;
  /** 停止服务器。后续连接被拒绝。 */
  close(): void;
}

function hostForUrl(host: string): string {
  if (host.includes(':') && !host.startsWith('[')) return `[${host}]`;
  return host;
}

/**
 * 以编程方式启动 vis HTTP 服务器。服务器开始监听后 resolve。
 * CLI `byf vis` 子命令(进程内)与独立 `index.ts` 入口使用。
 *
 * 经 `Bun.serve` 绑定(库运行时契约仅 Bun)。`EADDRINUSE` 等绑定失败
 * 同步抛出,使调用方可捕获。
 */
export async function startVisServer(
  options: StartVisServerOptions = {},
): Promise<VisServerHandle> {
  const host = options.host ?? resolveHost();
  const port = options.port ?? resolvePort();
  const authToken = options.authToken ?? resolveVisAuthToken(host);
  const { app, staticEnabled } = await createApp({ authToken, publicDir: options.publicDir });

  // Bun.serve binds before returning. Port-in-use and other listen failures
  // throw (with `code: 'EADDRINUSE'` when applicable) rather than emitting an
  // async 'error' event as Node's http.Server did via @hono/node-server.
  const server = Bun.serve({
    hostname: host,
    port,
    fetch: app.fetch,
  });

  // Bun.serve().port is typed optional; after a successful bind it is always set.
  const actualPort = server.port ?? port;
  return {
    host,
    port: actualPort,
    staticEnabled,
    url: `http://${hostForUrl(host)}:${actualPort}`,
    close: () => {
      // stop(true) drops keep-alive / in-flight sockets so the event loop can
      // empty and the process can exit promptly after close().
      void server.stop(true);
    },
  };
}

/**
 * 解析服务器读取会话记录所用的 BYF_HOME。暴露给独立入口的启动横幅。
 * CLI 消费者依赖同一环境变量。
 */
export function resolveVisByfHome(): string {
  return resolveByfHome();
}

/**
 * 格式化启动横幅文本。暴露使 CLI 无需依赖启动横幅内部实现即可复用
 * 完全相同的措辞。
 */
export function formatVisStartupBanner(input: {
  readonly authToken?: string;
  readonly host: string;
  readonly port: number;
  readonly staticEnabled?: boolean;
}): string {
  return formatStartupBanner({
    authToken: input.authToken,
    host: input.host,
    byfCodeHome: resolveByfHome(),
    port: input.port,
    staticEnabled: input.staticEnabled,
  });
}
