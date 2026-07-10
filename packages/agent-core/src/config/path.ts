import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function resolveByfHome(homeDir?: string): string {
  return homeDir ?? process.env['BYF_HOME'] ?? join(homedir(), '.byf');
}

export function resolveConfigPath(input: {
  readonly homeDir?: string;
  readonly configPath?: string;
}): string {
  return input.configPath ?? join(resolveByfHome(input.homeDir), 'config.toml');
}

export function ensureByfHome(homeDir: string): void {
  mkdirSync(homeDir, { recursive: true, mode: 0o700 });
}
