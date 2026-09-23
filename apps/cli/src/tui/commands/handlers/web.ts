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
 * TUI 退出随进程关闭。回环绑定;token 由 server 交付(PRD-0038 AC-1.2:回环下
 * 本次启动自动生成,设置了 WEB_AUTH_TOKEN 则复用),自动打开的 URL 带 `?token=`,
 * 否则浏览器拿不到凭证、任何写操作都会 401。
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
        host.showStatus(`web server: ${handle.url}(浏览器已带凭证打开;退出 TUI 后关闭)`);
        // 状态栏与逐字稿印的是**不带 token** 的地址。理由是两条 AC 的合力:
        // - AC-1.2 要求凭证有交付面——已经有:自动打开的那次浏览器 URL 带 `?token=`,
        //   SPA 读一次就存进本机 localStorage 并从地址栏擦掉
        //   (apps/web/client/src/api.ts),所以同一浏览器 profile 之后再打开这个
        //   免 token 地址仍是登录态,复制粘贴的目标用户拿到的地址并不"缺东西"。
        // - 把 token 印进终端是另一条泄漏面:回滚缓冲、tmux 日志、任何录屏都会留下它,
        //   而 LAN 横幅已经在为同一条代价提示轮换(startup-banner.ts)。
        // 换浏览器/换设备时需要显式取 token:`byf web` 的启动日志会打印生效 token。
        host.appendTranscriptStatus(
          `byf web: ${handle.url}\n` +
            '  这里不打印 token:自动打开的浏览器已拿到本次凭证(存在本机,刷新仍在)。' +
            '要在别的浏览器或设备上打开,用 `byf web` 的启动日志取 token(它会印 token=…)。',
        );
        const query = handle.authToken ? `?token=${encodeURIComponent(handle.authToken)}` : '';
        const { default: open } = await import('open');
        void open(`${handle.url}${query}`, { wait: false }).catch(() => {
          // 浏览器没开成,自动交付这条路径就没了:此时免 token 的地址等于不可用,
          // 必须把带 token 的地址交给用户(与 `byf web` 打开失败时的处理一致)。
          host.appendTranscriptStatus(
            '  浏览器自动打开失败,请手工打开(该地址含 token,注意别留在可共享的日志里):' +
              `\n  ${handle.url}${query}`,
          );
        });
      } catch (error) {
        host.showError(
          `web server 启动失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  };
}
