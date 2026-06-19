import { resolve } from 'node:path';
import { binDir, targetTriple, seaBinaryName } from './paths.mjs';

export async function runSignStep({ identity }: { identity: string }): Promise<void> {
  console.log('==> Sign SEA binary');

  const binTarget = resolve(binDir(), targetTriple());
  const binary = resolve(binTarget, seaBinaryName());

  const { run } = await import('./exec.mjs');

  await run('codesign', [
    '--sign', identity,
    '--force',
    '--timestamp',
    '--options', 'runtime',
    binary,
  ]);

  console.log(`Signed binary: ${binary} (identity=${identity})`);
}