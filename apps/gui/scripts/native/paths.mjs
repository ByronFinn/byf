import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const scriptDir = dirname(__filename);

export function appRoot(): string {
  return resolve(scriptDir, '../..');
}

export function srcDir(): string {
  return resolve(appRoot(), 'src');
}

export function nativeDir(): string {
  return resolve(appRoot(), 'scripts/native');
}

export function intermediatesDir(): string {
  return resolve(appRoot(), 'dist-native/intermediates');
}

export function binDir(): string {
  return resolve(appRoot(), 'dist-native/bin');
}

export function artifactsDir(): string {
  return resolve(appRoot(), 'dist-native/artifacts');
}

export function targetTriple(): string {
  return `${process.platform}-${process.arch}`;
}

export function seaBlobPath(): string {
  return resolve(intermediatesDir(), 'gui-core.blob');
}

export function seaBinaryName(): string {
  return 'gui-core-engine';
}