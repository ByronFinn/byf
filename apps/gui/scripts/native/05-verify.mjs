import { resolve } from 'node:path';
import { binDir, targetTriple, seaBinaryName } from './paths.mjs';

export async function runVerifyStep({
  requireGatekeeper,
}) {
  console.log('==> Verify SEA binary');

  const binTarget = resolve(binDir(), targetTriple());
  const binary = resolve(binTarget, seaBinaryName());

  const { run } = await import('./exec.mjs');

  // Verify code signature
  await run('codesign', ['-dv', binary]);

  if (requireGatekeeper) {
    await run('spctl', ['--assess', '--verbose', binary]);
  }

  console.log(`Verify OK: ${binary}`);
}