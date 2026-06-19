import process from 'node:process';

import { GuiCoreServer, StdioTransport } from '@byfriends/gui-core';

async function main(): Promise<void> {
  // Enforce pipe mode — stdin/stdout are pipes, not TTY
  if (process.stdin.isTTY) {
    process.stderr.write('gui-core: stdin must be a pipe, not a TTY\n');
    process.exit(1);
  }

  // stdout carries ONLY JSON-RPC frames. Capture the real write, then replace
  // process.stdout.write with a guard that rejects every other caller — the
  // transport re-injects the captured handle, so only protocol frames survive.
  const realStdoutWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => {
    throw new Error(
      'gui-core: direct process.stdout.write is forbidden — use the JSON-RPC transport or stderr',
    );
  };

  const server = new GuiCoreServer({ transport: new StdioTransport(realStdoutWrite) });

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

  process.on('uncaughtException', (error) => {
    process.stderr.write(`gui-core: uncaught exception: ${error.message}\n`);
    process.exit(1);
  });

  await server.start();
}

main().catch((error) => {
  process.stderr.write(`gui-core: fatal startup error: ${(error as Error).message}\n`);
  process.exit(1);
});
