import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { getHostPackageRoot } from '#/cli/version';
import { isNativePackagedBinary } from '#/native/standalone';

import { NPM_PACKAGE_NAME, type InstallSource } from './types';

/**
 * 以打包原生二进制运行时为 true。
 * 主路径:Bun `bun build --compile`(Bun.main 位于 `/$bunfs/` 下)。
 * 若 `node:sea` 报告 isSea(),也识别遗留 Node SEA 二进制。
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
 * 按包根路径段做启发式分类。返回匹配的 `InstallSource`;无启发式匹配时
 * 返回 `null`(调用方应回退到 npm 前缀比较)。
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
 * 二进制 / 路径位于 `@byfriends/cli` 的包管理器 `node_modules` 树
 * (主包或平台 optionalDep 包)下时为 true。
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
 * 遗留 npm-global JS 布局:bin 仍指向 Node 解释执行的 `dist/main.mjs`
 * 入口(optionalDep 打包之前)。
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
 * 当进程是 compile/SEA 二进制时,判定它来自 npm optionalDep 布局
 * (node_modules 树或启动器 env)还是真正的 GitHub Release / install.sh
 * 安装。
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
