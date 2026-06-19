import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { appRoot, intermediatesDir } from './paths.mjs';
import { runBundleStep } from './01-bundle.mjs';
import { runSeaBlobStep } from './02-sea-blob.mjs';
import { runInjectStep } from './03-inject.mjs';
import { runSignStep } from './04-sign.mjs';
import { runVerifyStep } from './05-verify.mjs';

const { values } = parseArgs({
  options: {
    profile: { type: 'string', default: 'local' },
  },
});

const profile = values.profile;
if (!['local', 'release'].includes(profile)) {
  console.error(`Unknown profile: ${profile}. Expected 'local' or 'release'.`);
  process.exit(1);
}

function ensureNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 24 || (major === 24 && minor < 15)) {
    console.error(
      `GUI native SEA build requires Node.js >=24.15.0, current ${process.versions.node}.`,
    );
    process.exit(1);
  }
}

ensureNodeVersion();
console.log(`==> GUI native build (profile=${profile})`);

await runBundleStep();
await runSeaBlobStep();
await runInjectStep();

const identity =
  profile === 'release' ? (process.env.APPLE_SIGNING_IDENTITY ?? '-') : '-';
await runSignStep({ identity });

await runVerifyStep({ requireGatekeeper: false });

console.log('==> GUI native build complete');