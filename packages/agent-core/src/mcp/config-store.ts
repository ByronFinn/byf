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
import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { McpServerConfig } from '#/config/schema';
import { ErrorCodes, ByfError } from '#/errors';
import { atomicWrite } from '#/utils/fs';

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

// ── 写入(upsert / remove / raw write;tmp+rename 原子写)───────────────────

/** 表单不覆盖的高级公共字段:upsert 时从磁盘原值保留(R-M3a)。 */
const ADVANCED_COMMON_FIELDS = [
  'enabledTools',
  'disabledTools',
  'startupTimeoutMs',
  'toolTimeoutMs',
] as const;

/** transport 切换后应丢弃的旧 transport 专属字段(R-M3a)。 */
const TRANSPORT_SWITCH_DROP_FIELDS: Record<string, readonly string[]> = {
  stdio: ['url', 'headers', 'bearerTokenEnvVar'],
  http: ['command', 'args', 'env', 'cwd', 'executor'],
  sse: ['command', 'args', 'env', 'cwd', 'executor'],
};

export interface UpsertMcpServerInput extends ScopedMcpStoreInput {
  readonly name: string;
  /** 表单提交的常用字段;env/headers 值可能是占位符(不动 = 保留原值)。 */
  readonly config: Record<string, unknown>;
}

/**
 * upsert 单个 server:占位符还原(D2)→ 字段级合并(高级字段保留磁盘
 * 原值;transport 切换丢弃旧 transport 专属字段,R-M3a)→ 整文件 schema
 * 校验 → tmp+rename 原子写;返回该 scope 写入后的掩码状态。
 */
export async function upsertMcpServer(input: UpsertMcpServerInput): Promise<McpScopeState> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new ByfError(ErrorCodes.REQUEST_INVALID, 'MCP server name is required');
  }
  const path = mcpScopePath(input);
  const file = await readScopeFile(path);
  if (file.invalid !== undefined) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Cannot upsert into invalid mcp.json (${path}); fix the file via RAW editing first`,
    );
  }

  const existing = file.servers[name];
  const restored = restoreMaskedTree(input.config, existing) as Record<string, unknown>;
  const merged = mergeServerFields(restored, existing);
  const servers = { ...file.servers, [name]: merged };

  await writeScopeFile(path, servers);
  return scopeStateFromDisk(path);
}

export interface RemoveMcpServerInput extends ScopedMcpStoreInput {
  readonly name: string;
}

/**
 * 测试连接用的配置解析:与 upsert 同路径做占位符还原(D2)+ 字段级合并
 * (R-M3a),再做整 schema 校验后返回。不落盘。
 */
export async function resolveServerConfigForProbe(input: {
  readonly cwd: string;
  readonly homeDir?: string;
  readonly scope: McpConfigScope;
  /** 编辑既有条目时传入,使占位符能按磁盘原值还原。 */
  readonly name?: string;
  readonly config: Record<string, unknown>;
}): Promise<McpServerConfig> {
  const path = mcpScopePath(input);
  const file = await readScopeFile(path);
  if (file.invalid !== undefined) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Cannot test connection while mcp.json is invalid (${path}); fix the file via RAW editing first`,
    );
  }
  const existing = input.name !== undefined ? file.servers[input.name] : undefined;
  const restored = restoreMaskedTree(input.config, existing) as Record<string, unknown>;
  const merged = mergeServerFields(restored, existing);
  const parsed = McpJsonFileSchema.parse({ mcpServers: { probe: merged } });
  const probe = parsed.mcpServers['probe'];
  if (probe === undefined) {
    throw new ByfError(ErrorCodes.REQUEST_INVALID, 'MCP server config is empty');
  }
  return probe;
}

export async function removeMcpServer(input: RemoveMcpServerInput): Promise<McpScopeState> {
  const name = input.name.trim();
  const path = mcpScopePath(input);
  const file = await readScopeFile(path);
  if (file.invalid !== undefined) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Cannot remove from invalid mcp.json (${path}); fix the file via RAW editing first`,
    );
  }
  if (!(name in file.servers)) {
    throw new ByfError(
      ErrorCodes.MCP_SERVER_NOT_FOUND,
      `MCP server "${name}" not found in ${path}`,
    );
  }
  const servers = { ...file.servers };
  delete servers[name];

  await writeScopeFile(path, servers);
  return scopeStateFromDisk(path);
}

export interface WriteMcpRawInput extends ScopedMcpStoreInput {
  readonly text: string;
}

/**
 * RAW 兜底写盘:对磁盘上仍是合法 JSON 的原文做占位符还原(D2);schema
 * 校验通过才 tmp+rename 原子写,失败抛 CONFIG_INVALID(不落盘)。空文本
 * 归一为空骨架。返回写入后的 RAW 文档(掩码态)。
 */
export async function writeMcpRaw(input: WriteMcpRawInput): Promise<McpRawDocument> {
  const path = mcpScopePath(input);
  const text = input.text.trim().length === 0 ? '{\n  "mcpServers": {}\n}\n' : input.text;

  // 还原基底只看「磁盘 JSON 是否可解析」——与 readMcpRaw 的掩码条件对齐。
  // 不依赖 schema 校验结果:JSON 合法但 schema 非法的文件同样以掩码文本展示
  // (listMcpConfigs 报 invalid、UI 走 RAW 兜底),若跳过还原会把占位符清空、
  // 密钥原值丢失(ADR-0039 D2)。
  let diskJson: unknown;
  try {
    diskJson = JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    diskJson = undefined;
  }
  // 磁盘原文可解析则按路径还原;不可用(损坏/缺失)时也防御性清空占位符。
  const toWrite = serializeMcpJson(restoreMaskedTree(parseJsonOrThrow(text, path), diskJson));

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(toWrite);
  } catch (error) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const servers = validateServersShape(parsedJson, path);
  await writeScopeFile(path, servers);
  return readMcpRaw(input);
}

function parseJsonOrThrow(text: string, path: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function validateServersShape(parsed: unknown, path: string): Record<string, McpServerConfig> {
  try {
    return McpJsonFileSchema.parse(parsed).mcpServers;
  } catch (error) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Invalid MCP server config in ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function writeScopeFile(path: string, servers: Record<string, unknown>): Promise<void> {
  const validated = validateServersShape({ mcpServers: servers }, path);
  await mkdir(dirname(path), { recursive: true });
  await atomicWrite(path, serializeMcpJson({ mcpServers: validated }));
}

/**
 * 字段级合并(R-M3a):表单 payload 只含常用字段;transport 未变时高级
 * 字段(公共 + transport 专属)从磁盘原值补回,transport 切换时丢弃旧
 * transport 专属字段(公共高级字段仍保留)。
 */
function mergeServerFields(
  payload: Record<string, unknown>,
  existing: McpServerConfig | undefined,
): Record<string, unknown> {
  if (existing === undefined) return payload;
  const merged: Record<string, unknown> = { ...payload };
  for (const field of ADVANCED_COMMON_FIELDS) {
    if (merged[field] === undefined && existing[field] !== undefined) {
      merged[field] = existing[field];
    }
  }
  const nextTransport = typeof merged['transport'] === 'string' ? merged['transport'] : undefined;
  if (nextTransport !== undefined && nextTransport !== existing.transport) {
    for (const field of TRANSPORT_SWITCH_DROP_FIELDS[nextTransport] ?? []) {
      delete merged[field];
    }
  }
  return merged;
}

/** 写入后重读该 scope(与 listMcpConfigs 同掩码规则),供 UI 即时刷新。 */
async function scopeStateFromDisk(path: string): Promise<McpScopeState> {
  const file = await readScopeFile(path);
  const servers = Object.entries(file.servers).map(([name, config]) => ({
    name,
    config: maskServerConfig(config),
  }));
  return {
    path,
    servers,
    ...(file.invalid !== undefined ? { invalid: file.invalid } : {}),
  };
}
