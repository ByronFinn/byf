import { ByfHarness, ErrorCodes, isByfError } from '@byfriends/sdk';

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
  /**
   * 实际生效的鉴权 token(PRD-0038 AC-1.2):`WEB_AUTH_TOKEN` 配置值,或回环下
   * 本次启动自动生成的 token。调用方(`byf web`)靠它交付启动日志与浏览器 URL。
   */
  readonly authToken: string;
  /**
   * 磁盘 `config.toml` 解析失败(PRD-0038 AC-1.7)。服务在这种状态下仍然启动 ——
   * 否则"损坏后经 web 修复"这条旅程在启动层就断了 —— 但启动日志必须说出来,
   * 所以把这个状态交给调用方拼进横幅。
   */
  readonly configInvalid: boolean;
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

  const {
    app,
    staticEnabled,
    authToken: activeAuthToken,
  } = await createApp({
    manager,
    authToken,
    publicDir: options.publicDir,
    homeDir: resolveByfHome(),
  });

  // PRD-0038 AC-1.7：配置损坏不再阻止启动，代价是降级必须在启动日志里说出来。
  // 判定复用 raw 端点同一条通道（`getConfigDocument` 解析失败即 config.invalid），
  // 不在 web-server 里另立一份 TOML 解析逻辑。
  const configInvalid = await detectInvalidConfig(manager);

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: app.fetch,
    // SSE 事件流在 heartbeat(20s)间隔内无写入,必须覆盖 Bun 默认 10s 的
    // idleTimeout,否则空闲连接会被服务端掐断、丢失广播帧(PRD-0033 AC7
    // 回归发现;契约不变,仅连接保活)。
    idleTimeout: 255,
  });

  const actualPort = server.port ?? port;
  return {
    host,
    port: actualPort,
    staticEnabled,
    authToken: activeAuthToken,
    configInvalid,
    url: `http://${hostForUrl(host)}:${actualPort}`,
    close: () => {
      void server.stop(true);
      void manager.dispose();
    },
  };
}

/**
 * 磁盘 `config.toml` 是否处于解析不了的损坏态（PRD-0038 AC-1.7）。经
 * `getConfigDocument` 探测：它解析失败即抛 `config.invalid`，与 raw 端点同源。
 * 其它错误（IO / 鉴权等）不算损坏态——不能把它报成"配置无效"。
 */
async function detectInvalidConfig(manager: WebSessionManager): Promise<boolean> {
  try {
    await manager.getConfigDocument();
    return false;
  } catch (error) {
    return isByfError(error) && error.code === ErrorCodes.CONFIG_INVALID;
  }
}

/** 格式化启动横幅(CLI 复用同一措辞)。 */
export function formatWebServerStartupBanner(input: {
  readonly authToken?: string;
  readonly host: string;
  readonly port: number;
  readonly staticEnabled?: boolean;
  readonly lanIps?: readonly string[];
  /** 磁盘 config.toml 解析失败（PRD-0038 AC-1.7），横幅必须告知用户处于降级态。 */
  readonly configInvalid?: boolean;
}): string {
  return formatWebStartupBanner({
    authToken: input.authToken,
    host: input.host,
    byfHome: resolveByfHome(),
    port: input.port,
    staticEnabled: input.staticEnabled,
    lanIps: input.lanIps,
    configInvalid: input.configInvalid,
  });
}

/** 收集非回环 IPv4 地址(R-D1 LAN banner)。 */
export { collectLanIps } from './startup-banner';
