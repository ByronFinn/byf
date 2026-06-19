import process from 'node:process';

import type { HostIdentity } from '@byfriends/sdk';
import { GuiCoreServer } from '@byfriends/gui-core';

/**
 * GUI version: read from BUILD_INFO or package.json at SEA build time.
 */
const GUI_VERSION: string | undefined = undefined; // Set during SEA build via BUILD_INFO

function createIdentity(): HostIdentity {
  return {
    userAgentProduct: 'byf-desktop',
    version: GUI_VERSION ?? '0.0.0',
  };
}

async function main(): Promise<void> {
  // Enforce pipe mode — stdin/stdout are pipes, not TTY
  if (process.stdin.isTTY) {
    process.stderr.write('gui-core: stdin must be a pipe, not a TTY\n');
    process.exit(1);
  }

  // All non-protocol logging must go to stderr
  process.stdout.write = () => false as unknown as boolean; // Block accidental protocol pollution

  const server = new GuiCoreServer();

  // Keep alive until stdin closes or signal received
  process.stdin.on('end', () => {
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    process.exit(0);
  });

  process.on('SIGINT', () => {
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    process.stderr.write(`gui-core: uncaught exception: ${err.message}\n`);
    process.exit(1);
  });

  await server.start();
}

main().catch((err) => {
  process.stderr.write(`gui-core: fatal startup error: ${(err as Error).message}\n`);
  process.exit(1);
});