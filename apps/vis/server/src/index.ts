import { resolveHost, resolvePort, resolveVisAuthToken } from './config';
import { formatVisStartupBanner, startVisServer } from './server';

async function main(): Promise<void> {
  const host = resolveHost();
  const port = resolvePort();
  const authToken = resolveVisAuthToken(host);
  const handle = await startVisServer({ host, port, authToken });
  // Startup banner.
  process.stdout.write(
    formatVisStartupBanner({
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
    `[vis-server] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exit(1);
}
