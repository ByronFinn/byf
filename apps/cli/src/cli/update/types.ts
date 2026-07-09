import { NPM_PACKAGE_NAME } from '#/constant/app';

export { NPM_PACKAGE_NAME };

/**
 * Where the running CLI was installed from. Drives update command + spawn.
 *
 * - `npm-global` / `pnpm-global` / `yarn-global` / `bun-global`: package-manager
 *   global install of the **new** optionalDep layout (launcher + platform binary).
 * - `npm-global-js`: legacy npm global where the bin still points at the old
 *   Node-interpreted `dist/main.mjs` layout — prompt reinstall, do not assume
 *   Node can keep upgrading in place.
 * - `native`: GitHub Release / `install.sh` compile binary (not under node_modules).
 * - `unsupported`: unknown layout; print a manual command only.
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
