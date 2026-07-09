import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { getHostPackageRoot } from '#/cli/version';
import { isNativePackagedBinary } from '#/native/standalone';

import { NPM_PACKAGE_NAME, type InstallSource } from './types';

/**
 * True when running as a packaged native binary.
 * Primary: Bun `bun build --compile` (Bun.main under `/$bunfs/`).
 * Also recognizes legacy Node SEA binaries if `node:sea` reports isSea().
 */
export function detectNativeInstall(): boolean {
  return isNativePackagedBinary();
}

// Path heuristic markers (compared in lowercase; both forward and backward slashes accepted).
const PNPM_PATH_SEGMENT = 'pnpm/global/';
const YARN_PATH_SEGMENTS = ['.config/yarn/global/', '/.yarn/global/'];
const BUN_PATH_SEGMENT = '.bun/install/global/';
const NODE_MODULES_CLI_SEGMENT = 'node_modules/@byfriends/cli';

function normalizeForHeuristic(filePath: string): string {
  return filePath.replaceAll('\\', '/').toLowerCase();
}

/**
 * Heuristic classification by package root path segments. Returns the
 * matching `InstallSource` or `null` if no heuristic matches (caller should
 * fall through to npm-prefix comparison).
 */
export function classifyByPathHeuristic(packageRoot: string): InstallSource | null {
  const normalized = normalizeForHeuristic(packageRoot);
  if (normalized.includes(PNPM_PATH_SEGMENT)) return 'pnpm-global';
  for (const seg of YARN_PATH_SEGMENTS) {
    if (normalized.includes(seg)) return 'yarn-global';
  }
  if (normalized.includes(BUN_PATH_SEGMENT)) return 'bun-global';
  return null;
}

/**
 * True when the binary/path lives under a package-manager `node_modules` tree
 * for `@byfriends/cli` (main package or platform optionalDep package).
 */
export function isUnderCliNodeModules(filePath: string): boolean {
  return normalizeForHeuristic(filePath).includes(NODE_MODULES_CLI_SEGMENT);
}

function binFieldLooksLikeLegacyJs(bin: string | Record<string, string> | undefined): boolean {
  if (bin === undefined) return false;
  if (typeof bin === 'string') {
    return bin.includes('dist/main') || bin.endsWith('main.mjs');
  }
  const entries = Object.values(bin);
  return entries.some(
    (value) =>
      typeof value === 'string' && (value.includes('dist/main') || value.endsWith('main.mjs')),
  );
}

/**
 * Legacy npm-global JS layout: bin still points at the Node-interpreted
 * `dist/main.mjs` entry (pre-optionalDep packaging).
 */
export function isLegacyJsGlobalLayout(packageRoot: string): boolean {
  const mainEntry = join(packageRoot, 'dist', 'main.mjs');
  const launcher = join(packageRoot, 'bin', 'byf.cjs');
  // Strong signal: old tarball ships dist/main.mjs as bin and has no launcher.
  if (existsSync(mainEntry) && !existsSync(launcher)) return true;

  try {
    const pkgPath = join(packageRoot, 'package.json');
    if (!existsSync(pkgPath)) return false;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
      bin?: string | Record<string, string>;
    };
    return binFieldLooksLikeLegacyJs(pkg.bin);
  } catch {
    return false;
  }
}

export interface DetectInstallSourceDeps {
  readonly getPackageRoot: () => string;
  readonly getGlobalPrefix: () => Promise<string>;
  readonly detectNative: () => boolean;
  readonly getExecPath: () => string;
  readonly getInstallLayoutEnv: () => string | undefined;
  readonly platform: NodeJS.Platform;
}

function npmCommand(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

function execFileText(command: string, args: readonly string[]): Promise<string> {
  return new Promise((resolveOutput, reject) => {
    execFile(command, [...args], { encoding: 'utf-8' }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolveOutput(stdout);
    });
  });
}

function normalizePathForComparison(filePath: string, platform: NodeJS.Platform): string | null {
  const trimmed = filePath.trim();
  if (trimmed.length === 0) return null;
  try {
    return normalizeResolvedPath(realpathSync(trimmed), platform);
  } catch {
    return normalizeResolvedPath(resolve(trimmed), platform);
  }
}

function normalizeResolvedPath(filePath: string, platform: NodeJS.Platform): string {
  const resolvedPath = resolve(filePath);
  return platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath;
}

function candidateGlobalPackageDirs(
  globalPrefix: string,
  platform: NodeJS.Platform,
): readonly string[] {
  if (platform === 'win32') {
    return [join(globalPrefix, 'node_modules', NPM_PACKAGE_NAME)];
  }
  return [
    join(globalPrefix, 'lib', 'node_modules', NPM_PACKAGE_NAME),
    join(globalPrefix, 'node_modules', NPM_PACKAGE_NAME),
  ];
}

export function classifyInstallSource(
  packageRoot: string,
  globalPrefix: string,
  platform: NodeJS.Platform = process.platform,
): InstallSource {
  const normalizedPackageRoot = normalizePathForComparison(packageRoot, platform);
  if (normalizedPackageRoot === null) return 'unsupported';

  for (const candidate of candidateGlobalPackageDirs(globalPrefix, platform)) {
    if (normalizePathForComparison(candidate, platform) === normalizedPackageRoot) {
      return isLegacyJsGlobalLayout(packageRoot) ? 'npm-global-js' : 'npm-global';
    }
  }
  return 'unsupported';
}

/**
 * When the process is a compile/SEA binary, decide whether it was launched
 * from an npm optionalDep layout (node_modules tree or launcher env) vs a
 * true GitHub Release / install.sh install.
 */
export function classifyNativeInstallSource(
  execPath: string,
  installLayoutEnv: string | undefined,
  pathHeuristicRoot: string,
): InstallSource {
  if (installLayoutEnv === 'npm-optional') {
    const heuristic = classifyByPathHeuristic(pathHeuristicRoot);
    if (heuristic !== null) return heuristic;
    // Launcher always sets this for package-manager installs of the new layout.
    return 'npm-global';
  }

  if (isUnderCliNodeModules(execPath) || isUnderCliNodeModules(pathHeuristicRoot)) {
    const heuristic =
      classifyByPathHeuristic(execPath) ?? classifyByPathHeuristic(pathHeuristicRoot);
    if (heuristic !== null) return heuristic;
    return 'npm-global';
  }

  return 'native';
}

export async function detectInstallSource(
  deps: Partial<DetectInstallSourceDeps> = {},
): Promise<InstallSource> {
  const platform = deps.platform ?? process.platform;
  const resolved: DetectInstallSourceDeps = {
    getPackageRoot: deps.getPackageRoot ?? getHostPackageRoot,
    getGlobalPrefix:
      deps.getGlobalPrefix ??
      (() => execFileText(npmCommand(platform), ['prefix', '-g']).then((text) => text.trim())),
    detectNative: deps.detectNative ?? detectNativeInstall,
    getExecPath: deps.getExecPath ?? (() => process.execPath),
    getInstallLayoutEnv:
      deps.getInstallLayoutEnv ?? (() => process.env['BYF_INSTALL_LAYOUT'] ?? undefined),
    platform,
  };

  if (resolved.detectNative()) {
    // Prefer package-root path for heuristics when available; fall back to execPath.
    let pathHeuristicRoot = resolved.getExecPath();
    try {
      pathHeuristicRoot = resolved.getPackageRoot();
    } catch {
      // native binary may not have a package.json nearby
    }
    return classifyNativeInstallSource(
      resolved.getExecPath(),
      resolved.getInstallLayoutEnv(),
      pathHeuristicRoot,
    );
  }

  let packageRoot: string;
  try {
    packageRoot = resolved.getPackageRoot();
  } catch {
    return 'unsupported';
  }

  const heuristic = classifyByPathHeuristic(packageRoot);
  if (heuristic !== null) {
    // Package-manager global but still running interpreted JS: if the package
    // is the old dist/main.mjs layout, surface reinstall guidance.
    if (isLegacyJsGlobalLayout(packageRoot)) return 'npm-global-js';
    return heuristic;
  }

  try {
    const globalPrefix = await resolved.getGlobalPrefix();
    return classifyInstallSource(packageRoot, globalPrefix, resolved.platform);
  } catch {
    return 'unsupported';
  }
}
