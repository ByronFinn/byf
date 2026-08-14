import { startWebServer, type WebServerHandle } from '@byfriends/web-server';

import type { SlashCommandHandler } from '../handler-registry';
import type { SlashCommandHost } from './slash-host';

const DEFAULT_WEB_PORT = 4100;
const MAX_PORT_ATTEMPTS = 50;

/** 模块级单例:同一 TUI 进程只跑一个 web-server 实例;退出钩子关闭。 */
let activeHandle: WebServerHandle | undefined;

/** 仅测试用:重置模块级单例。 */
export function __resetWebServerForTest(): void {
  activeHandle = undefined;
}

function isAddressInUse(error: unknown): boolean {
  return (
    error instanceof Error &&
    ((error as NodeJS.ErrnoException).code === 'EADDRINUSE' ||
      /EADDRINUSE|address already in use/i.test(error.message))
  );
}

/** 默认 4100 起步,占用则递增找空闲端口(R-D2)。 */
async function startWebServerOnFreePort(): Promise<WebServerHandle> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
    try {
      return await startWebServer({ host: '127.0.0.1', port: DEFAULT_WEB_PORT + attempt });
    } catch (error) {
      if (!isAddressInUse(error)) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`no free port in ${DEFAULT_WEB_PORT}-${DEFAULT_WEB_PORT + MAX_PORT_ATTEMPTS - 1}`);
}

/**
 * TUI `/web`(PRD-0034 R-D2):同进程后台起 web-server(独立服务入口,服务新/
 * 历史会话;当前 TUI 会话实时镜像为未来演化),打印 URL 并自动打开浏览器;
 * TUI 退出随进程关闭。回环绑定;token 语义沿用 resolveWebAuthToken(回环默认
 * 无 token,设置了 WEB_AUTH_TOKEN 则复用)。
 */
export function createWebHandlers(host: SlashCommandHost): Record<'web', SlashCommandHandler> {
  return {
    web: async () => {
      if (activeHandle !== undefined) {
        host.showStatus(`web server 已在运行: ${activeHandle.url}`);
        return;
      }
      try {
        const handle = await startWebServerOnFreePort();
        activeHandle = handle;
        host.registerShutdownHook(() => {
          handle.close();
          if (activeHandle === handle) activeHandle = undefined;
        });
        host.showStatus(`web server: ${handle.url}(退出 TUI 后关闭)`);
        host.appendTranscriptStatus(`byf web: ${handle.url}`);
        const { default: open } = await import('open');
        void open(handle.url, { wait: false }).catch(() => {
          /* 打开失败不阻塞;URL 已打印 */
        });
      } catch (error) {
        host.showError(
          `web server 启动失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
