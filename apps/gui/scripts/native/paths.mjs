import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const scriptDir = dirname(__filename);

export function appRoot() {
  return resolve(scriptDir, '../..');
}

export function srcDir() {
  return resolve(appRoot(), 'src');
}

export function nativeDir() {
  return resolve(appRoot(), 'scripts/native');
}

export function intermediatesDir() {
  return resolve(appRoot(), 'dist-native/intermediates');
}

export function binDir() {
  return resolve(appRoot(), 'dist-native/bin');
}

export function artifactsDir() {
  return resolve(appRoot(), 'dist-native/artifacts');
}

export function targetTriple() {
  return `${process.platform}-${process.arch}`;
}

export function seaBlobPath() {
  return resolve(intermediatesDir(), 'gui-core.blob');
}

export function seaBinaryName() {
  return 'gui-core-engine';
}
