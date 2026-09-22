import { resolveHost, resolvePort, resolveWebAuthToken } from './config';
import { formatWebServerStartupBanner, startWebServer } from './server';

async function main(): Promise<void> {
  const host = resolveHost();
  const port = resolvePort();
  // 显式解析一次:非回环绑定缺 `WEB_AUTH_TOKEN` 要在构造 harness 之前就失败,
  // 而不是等到 `startWebServer` 内部才发现。回环下它返回 undefined——token 由
  // server 本次启动生成,所以下面印的是 handle.authToken 而不是这个值。
  const authToken = resolveWebAuthToken(host);
  const handle = await startWebServer({ host, port, authToken });
  process.stdout.write(
    formatWebServerStartupBanner({
      // AC-1.2:横幅是凭证交付面之一。印"生效"的 token(回环自动生成的那个也算),
      // 否则回环下日志既说不出 auth 状态又给不出任何可用的 URL。
      authToken: handle.authToken,
      host,
      port: handle.port,
      staticEnabled: handle.staticEnabled,
      configInvalid: handle.configInvalid,
    }),
  );
}

try {
  await main();
} catch (error: unknown) {
  process.stderr.write(
    `[web-server] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
}
