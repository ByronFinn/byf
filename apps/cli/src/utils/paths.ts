/**
 * CLI 自有的数据路径辅助。
 *
 * 这些路径用于日志、输入历史等本地应用数据。配置文件由 Core/SDK 拥有,
 * 刻意不放在本模块之后。
 */

import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  BYF_DATA_DIR_NAME,
  BYF_HOME_ENV,
  BYF_INPUT_HISTORY_DIR_NAME,
  BYF_LOG_DIR_NAME,
  BYF_UPDATE_DIR_NAME,
  BYF_UPDATE_STATE_FILE_NAME,
} from '#/constant/app';

/**
 * 返回 BYF 的根数据目录。
 *
 * 优先级:`BYF_HOME` 环境变量 > `~/.byf`。
 */
export function getDataDir(): string {
  const envDir = process.env[BYF_HOME_ENV];
  if (envDir) {
    return envDir;
  }
  return join(homedir(), BYF_DATA_DIR_NAME);
}

/**
 * 返回诊断日志目录:`<dataDir>/logs/`。
 */
export function getLogDir(): string {
  return join(getDataDir(), BYF_LOG_DIR_NAME);
}

/**
 * 返回更新缓存文件:`<dataDir>/updates/latest.json`。
 */
export function getUpdateStateFile(): string {
  return join(getDataDir(), BYF_UPDATE_DIR_NAME, BYF_UPDATE_STATE_FILE_NAME);
}

/**
 * 返回给定工作目录的用户输入历史文件。
 * 布局:`<share_dir>/user-history/<md5(cwd)>.jsonl`。
 */
export function getInputHistoryFile(workDir: string): string {
  const hash = createHash('md5').update(workDir, 'utf-8').digest('hex');
  return join(getDataDir(), BYF_INPUT_HISTORY_DIR_NAME, `${hash}.jsonl`);
}
