import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { intermediatesDir, seaBlobPath } from './paths.mjs';
import { run } from './exec.mjs';

export async function runSeaBlobStep() {
  console.log('==> Create SEA blob');

  const cwd = intermediatesDir();
  const mainCjs = resolve(cwd, 'main.cjs');
  const blob = resolve(cwd, 'gui-core.blob');
  const seaConfig = resolve(cwd, 'sea-config.json');

  const seaConfigContent = {
    main: mainCjs,
    output: blob,
    disableExperimentalSEAWarning: true,
  };

  writeFileSync(seaConfig, JSON.stringify(seaConfigContent, null, 2));

  await run(process.execPath, [
    '--experimental-sea-config',
    seaConfig,
  ]);

  console.log(`SEA blob: ${blob}`);
}