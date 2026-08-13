import { NPM_PACKAGE_NAME } from '#/constant/app';

export { NPM_PACKAGE_NAME };

/**
 * 运行中的 CLI 的安装来源。驱动 update 命令与 spawn。
 *
 * - `npm-global` / `pnpm-global` / `yarn-global` / `bun-global`:包管理器
 *   对**新** optionalDep 布局(启动器 + 平台二进制)的全局安装。
 * - `npm-global-js`:遗留 npm 全局,bin 仍指向旧的 Node 解释执行
 *   `dist/main.mjs` 布局——提示重装,不要假定 Node 能原地持续升级。
 * - `native`:GitHub Release / `install.sh` compile 二进制(不在 node_modules 下)。
 * - `unsupported`:未知布局;只打印手动命令。
 */
export type InstallSource =
  | 'npm-global'
  | 'npm-global-js'
  | 'pnpm-global'
  | 'yarn-global'
  | 'bun-global'
  | 'native'
  | 'unsupported';

export interface UpdateTarget {
  readonly version: string;
}

export interface UpdateCache {
  readonly source: 'cdn';
  readonly checkedAt: string | null;
  readonly latest: string | null;
}

export type UpdateDecision = 'none' | 'prompt-install' | 'manual-command';
export type UpdatePreflightResult = 'continue' | 'exit';

export function emptyUpdateCache(): UpdateCache {
  return {
    source: 'cdn',
    checkedAt: null,
    latest: null,
  };
}
