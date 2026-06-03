/**
 * Byf Code entry point.
 *
 * Parses CLI arguments via Commander.js, validates options, runs the
 * outer update preflight, then delegates to the requested UI runner.
 */

import {
  flushDiagnosticLogs,
  log,
  resolveGlobalLogPath,
  resolveByfHome,
} from '@byfriends/sdk';

import { createProgram } from './cli/commands';
import { PRODUCT_NAME } from '#/constant/app';
import type { CLIOptions } from './cli/options';
import { OptionConflictError, validateOptions } from './cli/options';
import { runPrompt } from './cli/run-prompt';
import { runShell } from './cli/run-shell';
import { formatStartupError } from './cli/startup-error';
import { runUpdatePreflight } from './cli/update/preflight';
import { getVersion } from './cli/version';
import { cleanupStaleNativeCacheForCurrent } from './native/native-assets';
import { installNativeModuleHook } from './native/module-hook';
import { runNativeAssetSmokeIfRequested } from './native/smoke';
import { initProcessName } from './utils/process/proctitle';

export async function handleMainCommand(opts: CLIOptions, version: string): Promise<void> {
  let validated: ReturnType<typeof validateOptions>;
  try {
    validated = validateOptions(opts);
  } catch (error) {
    if (error instanceof OptionConflictError) {
      process.stderr.write(`error: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const preflightResult = await runUpdatePreflight(
    version,
    validated.uiMode === 'print' ? { isTTY: false } : {},
  );
  if (preflightResult === 'exit') {
    process.exit(0);
  }

  if (validated.uiMode === 'print') {
    await runPrompt(validated.options, version);
    return;
  }

  await runShell(validated.options, version);
}

export function main(): void {
  initProcessName();
  installNativeModuleHook();
  if (runNativeAssetSmokeIfRequested()) return;

  // Start the background cleanup of stale native cache. Fire-and-forget; must not block startup or throw.
  queueMicrotask(() => {
    try {
      cleanupStaleNativeCacheForCurrent();
    } catch {
      // ignore: cache GC must never affect process startup
    }
  });

  const version = getVersion();

  const program = createProgram(
    `${PRODUCT_NAME} ${version}`,
    (opts) => {
      void handleMainCommand(opts, version).catch(async (error: unknown) => {
        const operation = opts.prompt !== undefined ? 'run prompt' : 'start shell';
        await logStartupFailure(operation, error);
        process.stderr.write(
          formatStartupError(error, {
            operation,
          }),
        );
        process.stderr.write(`See log: ${resolveGlobalLogPath(resolveByfHome())}\n`);
        process.exit(1);
      });
    },
  );

  program.parse(process.argv);
}

main();

async function logStartupFailure(operation: string, error: unknown): Promise<void> {
  log.error('startup failed', { operation, error });
  try {
    await flushDiagnosticLogs();
  } catch {
    // Best-effort diagnostic flush only.
  }
}
