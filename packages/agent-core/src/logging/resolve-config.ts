import { resolveGlobalLogPath } from './logger';
import type { LogLevel, LoggingConfig } from './types';

export const DEFAULT_LOG_LEVEL: LogLevel = 'info';
export const DEFAULT_GLOBAL_MAX_BYTES = 6 * 1024 * 1024; // 6 MB
export const DEFAULT_GLOBAL_FILES = 5; // 6 MB x 5 = 30 MB
export const DEFAULT_SESSION_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_SESSION_FILES = 3; // 5 MB x 3 = 15 MB

export interface ResolveLoggingInput {
  readonly homeDir: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * 由环境变量 + 默认值构建运行时 `LoggingConfig`。
 *
 * v1 刻意不读取 `config.toml [logging]`——schema 仍在变动,读取它会增加
 * 启动期失败面。需要覆盖默认值的用户设置环境变量:
 *
 *   BYF_LOG_LEVEL=debug
 *   BYF_LOG_GLOBAL_MAX_BYTES=... BYF_LOG_GLOBAL_FILES=...
 *   BYF_LOG_SESSION_MAX_BYTES=... BYF_LOG_SESSION_FILES=...
 */
export function resolveLoggingConfig(input: ResolveLoggingInput): LoggingConfig {
  const env = input.env ?? process.env;
  return {
    level: parseLevel(env['BYF_LOG_LEVEL']) ?? DEFAULT_LOG_LEVEL,
    globalLogPath: resolveGlobalLogPath(input.homeDir),
    globalMaxBytes: parsePositiveInt(env['BYF_LOG_GLOBAL_MAX_BYTES']) ?? DEFAULT_GLOBAL_MAX_BYTES,
    globalFiles: parsePositiveInt(env['BYF_LOG_GLOBAL_FILES']) ?? DEFAULT_GLOBAL_FILES,
    sessionMaxBytes:
      parsePositiveInt(env['BYF_LOG_SESSION_MAX_BYTES']) ?? DEFAULT_SESSION_MAX_BYTES,
    sessionFiles: parsePositiveInt(env['BYF_LOG_SESSION_FILES']) ?? DEFAULT_SESSION_FILES,
  };
}

function parseLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) return undefined;
  const v = value.toLowerCase().trim();
  if (v === 'off' || v === 'error' || v === 'warn' || v === 'info' || v === 'debug') return v;
  return undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}
