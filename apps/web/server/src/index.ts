import { resolveHost, resolvePort, resolveWebAuthToken } from './config';
import { formatWebServerStartupBanner, startWebServer } from './server';

async function main(): Promise<void> {
  const host = resolveHost();
  const port = resolvePort();
  const authToken = resolveWebAuthToken(host);
  const handle = await startWebServer({ host, port, authToken });
  process.stdout.write(
    formatWebServerStartupBanner({
      authToken,
      host,
      port: handle.port,
      staticEnabled: handle.staticEnabled,
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
