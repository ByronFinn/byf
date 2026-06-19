import { copyFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { intermediatesDir, binDir, targetTriple, seaBlobPath, seaBinaryName } from './paths.mjs';
import { run } from './exec.mjs';

export async function runInjectStep() {
  console.log('==> Inject SEA blob');

  const binTarget = resolve(binDir(), targetTriple());
  const output = resolve(binTarget, seaBinaryName());
  const blob = resolve(intermediatesDir(), 'gui-core.blob');

  // Ensure bin target directory exists
  mkdirSync(binTarget, { recursive: true });

  // Copy the Node.js binary as the base for our SEA binary
  copyFileSync(process.execPath, output);
  console.log(`Copied Node binary to ${output}`);

  // Remove existing signature (if any)
  try {
    await run('codesign', ['--remove-signature', output]);
  } catch {
    // If not signed, that's fine
  }

  // Inject the SEA blob
  const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
  await run('npx', [
    'postject',
    output,
    sentinelFuse,
    blob,
    '--macho-segment-name', 'NODE_SEA',
  ]);

  console.log(`SEA binary output: ${output}`);
}