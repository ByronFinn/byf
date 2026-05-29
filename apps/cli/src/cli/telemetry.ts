import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

import { initializeTelemetry } from '@byfriends/telemetry';
import { resolveByfHome, type ByfConfig, type ByfHarness } from '@byfriends/sdk';

import { CLI_USER_AGENT_PRODUCT } from '#/constant/app';

export interface CliTelemetryBootstrap {
  readonly homeDir: string;
  readonly deviceId: string;
  readonly firstLaunch: boolean;
}

export interface InitializeCliTelemetryOptions {
  readonly harness: ByfHarness;
  readonly bootstrap: CliTelemetryBootstrap;
  readonly config: Pick<ByfConfig, 'defaultModel' | 'telemetry'>;
  readonly version: string;
  readonly uiMode: string;
  readonly model?: string;
}

export function createCliTelemetryBootstrap(): CliTelemetryBootstrap {
  let firstLaunch = false;
  const homeDir = resolveByfHome();
  const deviceId = getOrCreateDeviceId(homeDir, () => {
    firstLaunch = true;
  });
  return { homeDir, deviceId, firstLaunch };
}

export function initializeCliTelemetry(options: InitializeCliTelemetryOptions): void {
  initializeTelemetry({
    homeDir: options.harness.homeDir,
    deviceId: options.bootstrap.deviceId,
    enabled: options.config.telemetry !== false,
    appName: CLI_USER_AGENT_PRODUCT,
    version: options.version,
    uiMode: options.uiMode,
    model: options.model ?? options.config.defaultModel,
  });
  if (options.bootstrap.firstLaunch) {
    options.harness.track('first_launch');
  }
}

function getOrCreateDeviceId(homeDir: string, onFirstLaunch: () => void): string {
  const filePath = join(homeDir, 'device_id');
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, 'utf-8').trim();
    if (existing) return existing;
  }
  const id = randomUUID();
  mkdirSync(homeDir, { recursive: true });
  writeFileSync(filePath, id, { encoding: 'utf-8', mode: 0o600 });
  onFirstLaunch();
  return id;
}
