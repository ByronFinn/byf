import { execSync } from 'node:child_process';

import { ByfHarness, log } from '@byfriends/sdk';

import { CLI_UI_MODE } from '#/constant/app';
import type { TuiConfig } from '#/tui/config';
import { loadTuiConfig, TuiConfigParseError } from '#/tui/config';
import { CHROME_GUTTER } from '#/tui/constant/rendering';
import { ByfTui } from '#/tui/index';
import { detectTerminalTheme } from '#/tui/theme/detect';

import type { CLIOptions } from './options';
import { createByfHostIdentity } from './version';

export async function runShell(
  opts: CLIOptions,
  version: string,
): Promise<void> {
  let tuiConfig: TuiConfig;
  let configWarning: string | undefined;
  try {
    tuiConfig = await loadTuiConfig();
  } catch (error) {
    if (!(error instanceof TuiConfigParseError)) throw error;
    tuiConfig = error.fallback;
    configWarning = error.message;
  }

  // Resolve `theme = "auto"` against the live terminal once, before pi-tui
  // grabs stdin. Explicit `dark` / `light` skip detection.
  const resolvedTheme = tuiConfig.theme === 'auto' ? await detectTerminalTheme() : tuiConfig.theme;

  const workDir = process.cwd();
  const harness = new ByfHarness({
    identity: createByfHostIdentity(version),
  });
  log.info('byf starting', {
    version,
    uiMode: CLI_UI_MODE,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    workDir,
  });
  await harness.ensureConfigFile();
  const tui = new ByfTui(harness, {
    cliOptions: opts,
    tuiConfig,
    version,
    workDir,
    startupNotice: configWarning,
    resolvedTheme,
  });

  tui.onExit = async (exitCode = 0) => {
    const sessionId = tui.getCurrentSessionId();
    const hasContent = tui.hasSessionContent();
    await harness.close();
    const gutter = ' '.repeat(CHROME_GUTTER);
    process.stdout.write(`${gutter}Bye!\n`);
    if (sessionId !== '' && hasContent) {
      process.stderr.write(`\n${gutter}To resume this session: byf -r ${sessionId}\n`);
    }
    process.exit(exitCode);
  };
  try {
    execSync('stty -ixon', { stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  try {
    await tui.start();
  } catch (error) {
    await harness.close();
    throw error;
  }
}
