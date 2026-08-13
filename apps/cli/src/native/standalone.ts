/**
 * 检测打包的原生二进制(Bun compile + 遗留 Node SEA)。
 *
 * Bun 1.3.x 不暴露 `Bun.isStandaloneExecutable`(更新文档 / 研究笔记中
 * 有说明)。编译后的可执行文件在虚拟 `/$bunfs/` 文件系统下报告
 * `Bun.main`——那是 1.3.14 的可靠信号。
 */

import { createRequire } from 'node:module';

export interface BunStandaloneGlobal {
  readonly isStandaloneExecutable?: boolean;
  readonly main?: string;
}

interface NodeSeaModule {
  isSea(): boolean;
}

const nodeRequire = createRequire(import.meta.url);
let cachedSea: NodeSeaModule | null | undefined;

function loadSeaModule(): NodeSeaModule | null {
  if (cachedSea !== undefined) return cachedSea;
  try {
    cachedSea = nodeRequire('node:sea') as NodeSeaModule;
  } catch {
    cachedSea = null;
  }
  return cachedSea;
}

/**
 * 从 Bun 状形态做纯 Bun-compile 检测。
 * 导出供单元测试——`globalThis.Bun` 在 Bun 下不可配置。
 */
export function detectBunStandalone(bun: BunStandaloneGlobal | null | undefined): boolean {
  if (bun === undefined || bun === null) return false;
  if (bun.isStandaloneExecutable === true) return true;
  const main = typeof bun.main === 'string' ? bun.main : '';
  // Bun 1.3.x:入口位于虚拟 standalone 文件系统下。
  return main.startsWith('/$bunfs/') || main.includes('/$bunfs/');
}

/** 本进程是 Bun `bun build --compile` standalone 可执行文件时为 true。 */
export function isBunStandaloneExecutable(): boolean {
  try {
    return detectBunStandalone((globalThis as { Bun?: BunStandaloneGlobal }).Bun);
  } catch {
    return false;
  }
}

/**
 * 以打包原生二进制(Bun compile 或 Node SEA)运行时为 true。
 * 安装来源 / update 路径优先使用此判断。
 */
export function isNativePackagedBinary(): boolean {
  if (isBunStandaloneExecutable()) return true;
  const sea = loadSeaModule();
  if (sea === null) return false;
  try {
    return sea.isSea();
  } catch {
    return false;
  }
}
