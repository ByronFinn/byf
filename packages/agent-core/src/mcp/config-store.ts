/**
 * mcp.json 按 scope 读写服务(PRD-0036 / ADR-0039)。
 *
 * - 读取:分别读 user(`~/.byf/mcp.json`)/ project(`<cwd>/.byf/mcp.json`)
 *   两个文件,返回结构化条目 + scope 归属 + 损坏 invalid 状态;同名时
 *   project 条目覆盖 user(与 config-loader 的浅合并语义一致),user 条目
 *   带 `overridden` 标记,两份定义都保留。
 * - 掩码(ADR-0039 D1/D4):`env`/`headers` 的字符串值在所有出线中替换为
 *   `__MCP_MASKED_n__` 占位符;合法文件的 RAW 文本是 parse → mask →
 *   规范化 serialize 的产物。损坏文件无法掩码,RAW 显示磁盘原文(D3 例外)。
 */
import { readFile } from 'node:fs/promises';

import type { McpServerConfig } from '#/config/schema';
import { ErrorCodes, ByfError } from '#/errors';

import { McpJsonFileSchema, resolveMcpJsonPaths } from './config-loader';

export type McpConfigScope = 'user' | 'project';

/** 占位符形如 `__MCP_MASKED_3__`;还原按 JSON 路径匹配,序号仅用于展示稳定。 */
const MCP_MASKED_PLACEHOLDER_RE = /^__MCP_MASKED_\d+__$/;

export interface McpServerEntry {
  readonly name: string;
  /** env/headers 值已掩码(ADR-0039 D1:明文永不跨线)。 */
  readonly config: McpServerConfig;
  /** 仅 user scope:project 存在同名 server 时为 true(本地覆盖全局)。 */
  readonly overridden?: boolean;
}

export interface McpScopeState {
  readonly path: string;
  readonly servers: readonly McpServerEntry[];
  /** JSON/schema 解析失败时的错误态;servers 为空,UI 该组切 RAW 兜底。 */
  readonly invalid?: { readonly message: string };
}

export interface McpConfigListing {
  readonly user: McpScopeState;
  readonly project: McpScopeState;
}

export interface McpRawDocument {
  readonly path: string;
  /**
   * 合法文件:parse → mask → 规范化 serialize(2 空格缩进);
   * 损坏文件:磁盘原文(D3 例外——用户需要看到待修内容);
   * 文件缺失/空文件:空字符串。
   */
  readonly text: string;
  readonly invalid?: { readonly message: string };
}

export interface McpStoreInput {
  readonly cwd: string;
  /** BYF_HOME(受 env 影响);缺省与 config-loader 同规则。 */
  readonly homeDir?: string;
}

export interface ScopedMcpStoreInput extends McpStoreInput {
  readonly scope: McpConfigScope;
}

export function assertMcpConfigScope(scope: string): asserts scope is McpConfigScope {
  if (scope !== 'user' && scope !== 'project') {
    throw new ByfError(ErrorCodes.REQUEST_INVALID, `Invalid MCP config scope: ${scope}`);
  }
}

export function mcpScopePath(input: ScopedMcpStoreInput): string {
  const paths = resolveMcpJsonPaths({ cwd: input.cwd, homeDir: input.homeDir });
  return input.scope === 'user' ? paths.user : paths.project;
}

interface ScopeFile {
  readonly exists: boolean;
  readonly servers: Record<string, McpServerConfig>;
  readonly invalid?: { readonly message: string };
}

/** 读单个 scope 文件:缺失/空文件 → 空 servers;解析/校验失败 → invalid。 */
async function readScopeFile(path: string): Promise<ScopeFile> {
  let text: string;
  try {
    text = await readFile(path, 'utf-8');
  } catch {
    return { exists: false, servers: {} };
  }
  if (text.trim().length === 0) return { exists: true, servers: {} };

  try {
    const parsed = McpJsonFileSchema.parse(JSON.parse(text));
    return { exists: true, servers: parsed.mcpServers };
  } catch (error) {
    return {
      exists: true,
      servers: {},
      invalid: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * 列出两个 scope 的 server 配置(env/headers 值已掩码),user 条目在
 * project 存在同名时带 `overridden` 标记(R-M4)。
 */
export async function listMcpConfigs(input: McpStoreInput): Promise<McpConfigListing> {
  const paths = resolveMcpJsonPaths({ cwd: input.cwd, homeDir: input.homeDir });
  const [user, project] = await Promise.all([
    readScopeFile(paths.user),
    readScopeFile(paths.project),
  ]);
  const projectNames = new Set(Object.keys(project.servers));
  const userEntries = Object.entries(user.servers).map(([name, config]) => ({
    name,
    config: maskServerConfig(config),
    ...(projectNames.has(name) ? { overridden: true } : {}),
  }));
  const projectEntries = Object.entries(project.servers).map(([name, config]) => ({
    name,
    config: maskServerConfig(config),
  }));
  return {
    user: scopeState(paths.user, user, userEntries),
    project: scopeState(paths.project, project, projectEntries),
  };
}

function scopeState(
  path: string,
  file: ScopeFile,
  servers: readonly McpServerEntry[],
): McpScopeState {
  return {
    path,
    servers,
    ...(file.invalid !== undefined ? { invalid: file.invalid } : {}),
  };
}

/** 读某 scope 的 RAW 文本(合法 → 掩码 + 规范化;损坏 → 磁盘原文)。 */
export async function readMcpRaw(input: ScopedMcpStoreInput): Promise<McpRawDocument> {
  const path = mcpScopePath(input);
  let text: string;
  try {
    text = await readFile(path, 'utf-8');
  } catch {
    return { path, text: '' };
  }
  if (text.trim().length === 0) return { path, text: '' };

  try {
    JSON.parse(text);
  } catch (error) {
    // 损坏文件:无法树级掩码,返回磁盘原文(ADR-0039 D3)。
    return {
      path,
      text,
      invalid: { message: error instanceof Error ? error.message : String(error) },
    };
  }
  try {
    // 合法 JSON:parse → mask → 规范化 serialize。
    return { path, text: maskMcpJsonText(text) };
  } catch (error) {
    return {
      path,
      text,
      invalid: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

// ── 掩码 / 还原(ADR-0039 D1/D2/D4)────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 序列化 mcp.json 的规范格式(掩码 RAW 与写入共用,格式归一可接受)。 */
export function serializeMcpJson(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** 整个 mcp.json 文本的树级掩码;要求输入是合法 JSON。 */
export function maskMcpJsonText(text: string): string {
  const seq = { next: 0 };
  return serializeMcpJson(maskTree(JSON.parse(text), seq));
}

/** 单个 server 配置的深拷贝掩码(结构化列表/表单回显用)。 */
export function maskServerConfig(config: McpServerConfig): McpServerConfig {
  return maskTree(config, { next: 0 }) as McpServerConfig;
}

function maskTree(value: unknown, seq: { next: number }): unknown {
  if (Array.isArray(value)) return value.map((item) => maskTree(item, seq));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if ((key === 'env' || key === 'headers') && isPlainObject(child)) {
      const masked: Record<string, unknown> = {};
      for (const [entryKey, entryValue] of Object.entries(child)) {
        seq.next += 1;
        masked[entryKey] =
          typeof entryValue === 'string' ? `__MCP_MASKED_${seq.next}__` : entryValue;
      }
      out[key] = masked;
    } else {
      out[key] = maskTree(child, seq);
    }
  }
  return out;
}

/**
 * 把掩码树中的占位符还原为磁盘原值:按 JSON 路径匹配(masked 与 disk 同
 * 路径的值);磁盘无对应值时还原为空串——占位符字符串永不落盘(D2)。
 */
export function restoreMaskedTree(masked: unknown, disk: unknown): unknown {
  if (typeof masked === 'string') {
    if (!MCP_MASKED_PLACEHOLDER_RE.test(masked)) return masked;
    return typeof disk === 'string' ? disk : '';
  }
  if (Array.isArray(masked)) {
    const diskItems = Array.isArray(disk) ? disk : [];
    return masked.map((item, index) => restoreMaskedTree(item, diskItems[index]));
  }
  if (isPlainObject(masked)) {
    const diskRecord = isPlainObject(disk) ? disk : {};
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(masked)) {
      out[key] = restoreMaskedTree(child, diskRecord[key]);
    }
    return out;
  }
  return masked;
}

/** 供测试与调用方识别占位符形态。 */
export function isMcpMaskedPlaceholder(value: string): boolean {
  return MCP_MASKED_PLACEHOLDER_RE.test(value);
}
