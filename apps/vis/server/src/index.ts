/**
 * `@byfriends/vis-server` 独立入口 —— 弃用 shim（PRD-0035 R-B5）。
 * 与 web-server 的独立入口同构：启动统一工作台。请迁移到
 * `@byfriends/web-server`。
 *
 * @deprecated 统一工作台（PRD-0035）取代本包；一个 minor 版本后删除。
 */

import { formatWebServerStartupBanner, startWebServer } from '@byfriends/web-server';
import type { StartWebServerOptions } from '@byfriends/web-server';

async function main(): Promise<void> {
  const options: StartWebServerOptions = {};
  const handle = await startWebServer(options);
  process.stdout.write(
    formatWebServerStartupBanner({
      authToken: undefined,
      host: handle.host,
      port: handle.port,
      staticEnabled: handle.staticEnabled,
      lanIps: [],
    }),
  );
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `[vis-server] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
}
