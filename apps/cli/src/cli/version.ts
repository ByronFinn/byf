import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { HostIdentity } from '@byfriends/sdk';

import { CLI_USER_AGENT_PRODUCT } from '#/constant/app';

import { BYF_BUILD_INFO } from './build-info';

const MODULE_DIR = import.meta.dirname;

export function getHostPackageJsonPath(): string {
  let dir = MODULE_DIR;
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, 'package.json');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate package.json near ${MODULE_DIR}`);
}

export function getHostPackageRoot(): string {
  return dirname(getHostPackageJsonPath());
}

export function getVersion(): string {
  if (BYF_BUILD_INFO.version !== undefined) {
    return BYF_BUILD_INFO.version;
  }
  const pkg = JSON.parse(readFileSync(getHostPackageJsonPath(), 'utf-8')) as {
    version: string;
  };
  return pkg.version;
}

export function createHostIdentity(version = getVersion()): HostIdentity {
  return {
    userAgentProduct: CLI_USER_AGENT_PRODUCT,
    version,
  };
}

export function buildByfDefaultHeaders(version = getVersion()): Record<string, string> {
  return {
    'User-Agent': `${CLI_USER_AGENT_PRODUCT}/${version}`,
  };
}

/** @deprecated Use createHostIdentity instead */
export const createByfHostIdentity = createHostIdentity;
