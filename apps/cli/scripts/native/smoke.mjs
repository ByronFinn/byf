import { execFile, spawn } from 'node:child_process';
import { access, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
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

/**
 * The directory `scripts/compile/build.mjs` embeds into the binary. Same path
 * expression on purpose: if the two ever disagree, this smoke is comparing the
 * artifact against a different tree than the one that produced it.
 */
const webServerPublicDir = resolve(appRoot, '../../apps/web/server/dist/public');

/** Smallest credible production SPA chunk; a stub or an error page is far below. */
const MIN_SPA_CHUNK_BYTES = 20_000;

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

/** Ask the OS for a free loopback port instead of guessing one and racing CI. */
function getFreePort() {
  return new Promise((promiseResolve, promiseReject) => {
    const srv = createServer();
    srv.once('error', promiseReject);
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      srv.close(() => {
        promiseResolve(port);
      });
    });
  });
}

/**
 * Prove the shipped binary carries the workbench UI, over real HTTP.
 *
 * `--version` / `--help` cannot see this: the binary boots fine either way, and
 * for every release through @byfriends/cli@0.6.1 the SPA asset directory was
 * empty at compile time, so the published binaries served an API-only `byf web`
 * from a green pipeline. This is the check that would have caught it, so it is a
 * hard failure with no skip path — a missing artifact or a missing SPA is a red
 * smoke, never a "skipped".
 *
 * Same shape as scripts/perf/bytecode-ab.mjs's spaAssetsServe(): fetch `/`,
 * read the hashed chunk index.html references, fetch that, and compare against
 * the on-disk build when it is the same asset name.
 */
async function assertEmbeddedSpaServesOverHttp() {
  await mkdir(smokeHome, { recursive: true });
  const port = await getFreePort();
  const child = spawn(executablePath, ['web', '--port', String(port), '--no-open'], {
    cwd: appRoot,
    env: { ...process.env, BYF_CODE_HOME: smokeHome, BYF_HOME: smokeHome },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', (chunkText) => {
    stdout = `${stdout}${String(chunkText)}`.slice(-8000);
  });
  child.stderr?.on('data', (chunkText) => {
    stderr = `${stderr}${String(chunkText)}`.slice(-8000);
  });
  let earlyExit = null;
  child.once('exit', (code, signal) => {
    earlyExit = { code, signal };
  });

  try {
    let index = null;
    let indexStatus = 0;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (earlyExit !== null) {
        throw new SmokeCommandError(
          `\`byf web\` exited before serving anything (code=${String(earlyExit.code)} ` +
            `signal=${String(earlyExit.signal)}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        );
      }
      await new Promise((sleepResolve) => {
        setTimeout(sleepResolve, 500);
      });
      try {
        const res = await fetch(`http://127.0.0.1:${String(port)}/`, {
          signal: AbortSignal.timeout(3000),
        });
        indexStatus = res.status;
        if (res.status === 200) {
          index = await res.text();
          break;
        }
        index = null;
      } catch {
        /* not listening yet */
      }
    }
    if (index === null) {
      throw new SmokeCommandError(
        `\`byf web\` never returned 200 on http://127.0.0.1:${String(port)}/ within 30s ` +
          `(last status ${String(indexStatus)}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
      );
    }

    // index.html is the SPA shell; the hashed chunk it names is the proof the
    // asset graph travelled with the binary instead of being read off this disk.
    const chunk = /["'](?:\.\/|\/)?(assets\/[\w.-]+\.js)["']/.exec(index)?.[1] ?? null;
    if (chunk === null) {
      throw new SmokeCommandError(
        `served index.html references no hashed \`assets/*.js\` chunk — the embedded SPA looks ` +
          `incomplete.\nServed body (first 500 chars):\n${index.slice(0, 500)}`,
      );
    }
    const chunkRes = await fetch(`http://127.0.0.1:${String(port)}/${chunk}`, {
      signal: AbortSignal.timeout(15_000),
    });
    const bytes = await chunkRes.arrayBuffer();
    if (chunkRes.status !== 200) {
      throw new SmokeCommandError(
        `embedded SPA chunk /${chunk} came back ${String(chunkRes.status)}, not 200`,
      );
    }
    if (bytes.byteLength < MIN_SPA_CHUNK_BYTES) {
      throw new SmokeCommandError(
        `embedded SPA chunk /${chunk} is ${String(bytes.byteLength)} B, below the ` +
          `${String(MIN_SPA_CHUNK_BYTES)} B floor for a real workbench bundle`,
      );
    }

    // Cross-check the bytes against the build that was embedded, when it is still
    // the same hashed asset. A different hash means the SPA was rebuilt after the
    // binary, which is not a defect — so it is reported, not asserted.
    try {
      const disk = await stat(join(webServerPublicDir, chunk));
      if (disk.size !== bytes.byteLength) {
        throw new SmokeCommandError(
          `served /${chunk} is ${String(bytes.byteLength)} B but ${join(webServerPublicDir, chunk)} ` +
            `is ${String(disk.size)} B — the binary does not embed the SPA that was built`,
        );
      }
      console.log(
        `==> SPA served over HTTP: /${chunk} ${String(bytes.byteLength)} B (matches the on-disk build)`,
      );
    } catch (error) {
      if (error instanceof SmokeCommandError) throw error;
      console.log(
        `==> SPA served over HTTP: /${chunk} ${String(bytes.byteLength)} B ` +
          `(no matching on-disk build to compare against at ${webServerPublicDir})`,
      );
    }
  } finally {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    // Never leave a server behind on a shared runner, but do not block the smoke
    // on a process that already died.
    if (earlyExit === null) {
      await Promise.race([
        new Promise((exitResolve) => {
          child.once('exit', exitResolve);
        }),
        new Promise((sleepResolve) => {
          setTimeout(sleepResolve, 5000);
        }),
      ]);
    }
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

// The checks above only prove the binary starts. A binary that starts and serves
// no workbench UI is exactly what shipped through @byfriends/cli@0.6.1, so this
// one has to run too — and it has no skip branch.
try {
  await assertEmbeddedSpaServesOverHttp();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log(`Native smoke passed: ${executablePath}`);
