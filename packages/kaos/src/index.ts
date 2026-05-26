import { getCurrentKaos } from './current';
import type { KaosProcess } from './process';
import type { StatResult } from './types';

export type { StatResult } from './types';
export type { KaosProcess } from './process';
export type { Kaos } from './kaos';
export type { KaosToken } from './current';
export { KaosError, KaosValueError, KaosFileExistsError } from './errors';
export { KaosPath } from './path';
export { LocalKaos, localKaos } from './local';
export { setCurrentKaos, resetCurrentKaos, runWithKaos } from './current';
export { getCurrentKaos };

// Module-level convenience functions for the current Kaos instance.

export function readText(
  path: string,
  options?: { encoding?: BufferEncoding; errors?: 'strict' | 'replace' | 'ignore' },
): Promise<string> {
  return getCurrentKaos().readText(path, options);
}

export function writeText(
  path: string,
  data: string,
  options?: { mode?: 'w' | 'a'; encoding?: BufferEncoding },
): Promise<number> {
  return getCurrentKaos().writeText(path, data, options);
}

export function readLines(
  path: string,
  options?: { encoding?: BufferEncoding; errors?: 'strict' | 'replace' | 'ignore' },
): AsyncGenerator<string> {
  return getCurrentKaos().readLines(path, options);
}

export function exec(...args: string[]): Promise<KaosProcess> {
  return getCurrentKaos().exec(...args);
}

export function readBytes(path: string, n?: number): Promise<Buffer> {
  return getCurrentKaos().readBytes(path, n);
}

export function writeBytes(path: string, data: Buffer): Promise<number> {
  return getCurrentKaos().writeBytes(path, data);
}

export function stat(path: string, options?: { followSymlinks?: boolean }): Promise<StatResult> {
  return getCurrentKaos().stat(path, options);
}

export function mkdir(
  path: string,
  options?: { parents?: boolean; existOk?: boolean },
): Promise<void> {
  return getCurrentKaos().mkdir(path, options);
}

export function iterdir(path: string): AsyncGenerator<string> {
  return getCurrentKaos().iterdir(path);
}

export function glob(
  path: string,
  pattern: string,
  options?: { caseSensitive?: boolean },
): AsyncGenerator<string> {
  return getCurrentKaos().glob(path, pattern, options);
}

export function chdir(path: string): Promise<void> {
  return getCurrentKaos().chdir(path);
}

export function getcwd(): string {
  return getCurrentKaos().getcwd();
}

export function gethome(): string {
  return getCurrentKaos().gethome();
}

export function normpath(path: string): string {
  return getCurrentKaos().normpath(path);
}

export function pathClass(): 'posix' | 'win32' {
  return getCurrentKaos().pathClass();
}

export function execWithEnv(args: string[], env?: Record<string, string>): Promise<KaosProcess> {
  return getCurrentKaos().execWithEnv(args, env);
}
