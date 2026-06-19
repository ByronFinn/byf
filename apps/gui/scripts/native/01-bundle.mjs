import { resolve } from 'node:path';
import { nativeDir, intermediatesDir, srcDir, artifactsDir } from './paths.mjs';
import { run } from './exec.mjs';

export async function runBundleStep(): Promise<void> {
  console.log('==> Bundle gui-core engine');

  const bundleEntry = resolve(srcDir(), 'main.ts');
  const outDir = intermediatesDir();

  // Bundle with tsdown, bundling @byfriends/gui-core and dependencies into a single file
  await run('npx', [
    'tsdown',
    '--entry', bundleEntry,
    '--format', 'cjs',
    '--outDir', outDir,
    '--outFile', 'main.cjs',
    '--clean',
    '--external', '', // bundle everything
  ]);

  console.log(`Bundle output: ${resolve(outDir, 'main.cjs')}`);
}