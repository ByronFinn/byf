/**
 * @byfriends/vis-server —— 弃用 shim（PRD-0035 R-B5 / ADR-0037 D1）。
 *
 * 自 0.5.0 起本包不再承载独立实现：全部能力（Inspector 读取、SPA 托管、
 * 鉴权）已由 `@byfriends/web-server` 的统一工作台取代。本 shim 仅为兼容
 * 已发布消费者（`byf vis` 弃用期）而 re-export web-server 的实现：
 * - `startVisServer` = `startWebServer`（方法兼容；返回类型即 WebServerHandle）；
 * - 默认端口语义由调用方（CLI）保持 3001，本包不再声明端口默认值。
 *
 * 注意：历史 `StartVisServerOptions.publicDir` 等语义与 web-server 一致
 * （host/port/authToken/publicDir/harness）；`VIS_AUTH_TOKEN` 兼容读取由
 * CLI 层转发（R-B3），本包不再读取该环境变量。
 *
 * @deprecated 统一工作台（PRD-0035）取代本包；一个 minor 版本后从
 * workspace 删除。新代码请直接使用 `@byfriends/web-server`。
 */

import { collectLanIps, formatWebServerStartupBanner, startWebServer } from '@byfriends/web-server';
import type { StartWebServerOptions, WebServerHandle } from '@byfriends/web-server';

/** @deprecated 统一工作台取代 vis-server——等价于 web-server 的启动选项。 */
export type StartVisServerOptions = StartWebServerOptions;

/** @deprecated 统一工作台取代 vis-server——等价于 web-server 的句柄。 */
export type VisServerHandle = WebServerHandle;

/** @deprecated 由 `startWebServer`（@byfriends/web-server）取代。 */
export const startVisServer = startWebServer;

export { collectLanIps, formatWebServerStartupBanner };
