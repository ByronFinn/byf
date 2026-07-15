import { execFile } from 'node:child_process';
import { access, readFile, rename, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';

import { resolveTargetDeps } from './native-deps.mjs';
import { appRoot, nativeBinPath, nativeSmokeHome, targetTriple } from './paths.mjs';

const execFileAsync = promisify(execFile);
const target = targetTriple();
const executablePath = nativeBinPath(target);
const smokeHome = nativeSmokeHome();
const packageJson = JSON.parse(await readFile(resolve(appRoot, 'package.json'), 'utf-8'));
const expectedVersion = packageJson.version;

const CLIPBOARD_NODE_BASENAME = Object.freeze({
  'darwin-arm64': 'clipboard.darwin-arm64.node',
  'linux-x64': 'clipboard.linux-x64-gnu.node',
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function ensureExecutableExists() {
  try {
    await stat(executablePath);
  } catch {
    fail(
      `Native executable not found at ${executablePath}. Run build:native:release (or build:native:compile) first.`,
    );
  }
}

/**
 * Resolve host install path of the platform clipboard `.node`.
 * Used only to temporarily hide it so smoke cannot false-pass via disk lookup.
 */
function resolveHostClipboardNodePath() {
  const deps = resolveTargetDeps(target);
  const hostName = deps.find((dep) => dep.id === 'clipboard-host')?.resolvedName;
  const clipboardPackage = deps.find((dep) => dep.id === 'clipboard-target')?.resolvedName;
  const nodeBasename = CLIPBOARD_NODE_BASENAME[target];
  if (hostName === undefined || clipboardPackage === undefined || nodeBasename === undefined) {
    return null;
  }

  const requireFromApp = createRequire(join(appRoot, 'package.json'));
  let hostRoot;
  try {
    hostRoot = dirname(requireFromApp.resolve(`${hostName}/package.json`));
  } catch {
    return null;
  }

  const requireFromHost = createRequire(join(hostRoot, 'package.json'));
  let packageRoot;
  try {
    packageRoot = dirname(requireFromHost.resolve(`${clipboardPackage}/package.json`));
  } catch {
    return null;
  }

  return join(packageRoot, nodeBasename);
}

/**
 * Run `fn` with the host clipboard `.node` renamed away.
 * Throws on failure (never process.exit) so `finally` always restores the file.
 */
async function withHiddenHostClipboardNode(fn) {
  const hostNodePath = resolveHostClipboardNodePath();
  if (hostNodePath === null) {
    console.warn('==> smoke: could not resolve host clipboard .node; skipping hide check');
    return fn();
  }

  try {
    await access(hostNodePath);
  } catch {
    return fn();
  }

  const hiddenPath = `${hostNodePath}.byf-smoke-hidden`;
  await rename(hostNodePath, hiddenPath);
  try {
    return await fn();
  } finally {
    await rename(hiddenPath, hostNodePath);
  }
}

/**
 * Fail if the binary still embeds a host-absolute path to the clipboard .node.
 * That is the exact failure mode of dynamic `require(absPath)` (CI path in binary).
 */
async function assertNoHostAbsoluteClipboardPath() {
  const hostNodePath = resolveHostClipboardNodePath();
  if (hostNodePath === null) return;

  const bytes = await readFile(executablePath);
  if (bytes.includes(Buffer.from(hostNodePath))) {
    fail(
      `Native binary embeds host absolute clipboard path (will break off-machine):\n  ${hostNodePath}\n` +
        `Compile entry must embed via import … with { type: "file" } (or CJS require("./x.node")), not host abs path.`,
    );
  }
}

class SmokeCommandError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SmokeCommandError';
  }
}

async function runByf(args) {
  try {
    const { stdout, stderr } = await execFileAsync(executablePath, args, {
      cwd: appRoot,
      maxBuffer: 1024 * 1024 * 16,
    });
    return `${stdout}${stderr}`;
  } catch (error) {
    const detail = [error.stdout?.trim(), error.stderr?.trim(), error.message]
      .filter(Boolean)
      .join('\n');
    throw new SmokeCommandError(
      `Native smoke failed: ${executablePath} ${args.join(' ')}\n${detail}`,
    );
  }
}

async function runByfWithEnv(args, env) {
  try {
    const { stdout, stderr } = await execFileAsync(executablePath, args, {
      cwd: appRoot,
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024 * 16,
    });
    return `${stdout}${stderr}`;
  } catch (error) {
    const detail = [error.stdout?.trim(), error.stderr?.trim(), error.message]
      .filter(Boolean)
      .join('\n');
    throw new SmokeCommandError(
      `Native smoke failed: ${executablePath} ${args.join(' ')}\n${detail}`,
    );
  }
}

function assertIncludes(output, expected, command) {
  if (!output.includes(expected)) {
    throw new SmokeCommandError(
      `Native smoke output for "${command}" did not include "${expected}".\n${output}`,
    );
  }
}

await ensureExecutableExists();
await assertNoHostAbsoluteClipboardPath();

// Hide host .node so require cannot fall back to the build machine path.
// This is the regression guard for off-machine "Cannot find module /Users/runner/..." failures.
try {
  await withHiddenHostClipboardNode(async () => {
    const versionOutput = await runByf(['--version']);
    assertIncludes(versionOutput, expectedVersion, '--version');

    const helpOutput = await runByf(['--help']);
    assertIncludes(helpOutput, 'Usage: byf', '--help');

    const exportHelpOutput = await runByf(['export', '--help']);
    assertIncludes(exportHelpOutput, 'Usage: byf export', 'export --help');

    const nativeAssetOutput = await runByfWithEnv(['--version'], {
      BYF_CODE_HOME: smokeHome,
      BYF_CODE_NATIVE_ASSET_SMOKE: '1',
    });
    assertIncludes(nativeAssetOutput, `Native asset smoke passed: ${target}`, 'native asset smoke');
  });
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log(`Native smoke passed: ${executablePath}`);
