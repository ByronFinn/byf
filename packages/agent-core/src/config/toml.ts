import { existsSync, readFileSync } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';

import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

import {
  ByfConfigSchema,
  formatConfigValidationError,
  getDefaultConfig,
  type BackgroundConfig,
  type HookDefConfig,
  type ByfConfig,
  type LoopControl,
  type ModelAlias,
  type ByfServiceConfig,
  type OAuthRef,
  type PermissionConfig,
  type ProviderConfig,
  type ServicesConfig,
  type ThinkingConfig,
  validateConfig,
} from '#/config/schema';
import { ErrorCodes, ByfError } from '#/errors';
import { log } from '#/logging/logger';
import { atomicWrite } from '#/utils/fs';

/* ------------------------------------------------------------------ */
/*  Key helpers – reuse generic snake / camel conversion instead of    */
/*  maintaining per-section *_KEY_MAP tables.                         */
/* ------------------------------------------------------------------ */

function snakeToCamel(str: string): string {
  return str.replaceAll(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function camelToSnake(str: string): string {
  return str.replaceAll(/[A-Z]/g, (ch: string) => `_${ch.toLowerCase()}`);
}

/* ------------------------------------------------------------------ */
/*  Read / parse                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_CONFIG_FILE_TEXT = `# ~/.byf/config.toml
# Runtime settings for BYF.
# This file starts empty so built-in defaults can apply.
# Login will populate managed provider and model entries.
`;

/** 缺省 config.toml 的模板文本（ConfigDocument 在文件缺失时的初始内容）。 */
export { DEFAULT_CONFIG_FILE_TEXT };

export async function ensureConfigFile(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(filePath, 'wx', 0o600);
    await handle.writeFile(DEFAULT_CONFIG_FILE_TEXT, 'utf-8');
  } catch (error) {
    if (isFileExistsError(error)) return;
    throw error;
  } finally {
    await handle?.close();
  }
}

/**
 * 装配路径的配置读取（PRD-0038 AC-1.7）。
 *
 * `config.toml` 解析失败时返回内置默认并记一条 warn，**不抛错**：真实装配路径
 * （`ByfCore` 构造 → `ProviderManager`）此前在这里即抛，使"配置损坏后经 web 修复"
 * 这条旅程在 server 启动层就已断裂。降级不等于隐瞒：损坏态由 raw 端点的
 * `invalid: true` 与 web 启动日志对外声明（两者各自复核磁盘文本，见
 * `config/document.ts` 的 `readConfigDocument`），并且任何想用自己的投影覆盖磁盘的
 * 写路径都会被 {@link writeConfigFile} 的销毁防护挡住。
 */
export function readConfigFile(filePath: string): ByfConfig {
  if (!existsSync(filePath)) return getDefaultConfig();
  try {
    return parseConfigString(readFileSync(filePath, 'utf-8'), filePath);
  } catch (error) {
    // 只吞「配置本身无效」（TOML 语法 / schema）；IO 错误照抛——它不是损坏态。
    if (!(error instanceof ByfError) || error.code !== ErrorCodes.CONFIG_INVALID) throw error;
    log.warn(`config: falling back to built-in defaults; ${error.message}`);
    return getDefaultConfig();
  }
}

export function parseConfigString(tomlText: string, filePath = 'config.toml'): ByfConfig {
  if (tomlText.trim().length === 0) {
    return getDefaultConfig();
  }

  let data: Record<string, unknown>;
  try {
    data = parseToml(tomlText) as Record<string, unknown>;
  } catch (error) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Invalid TOML in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      {
        cause: error,
      },
    );
  }

  return parseConfigData(data, filePath);
}

function parseConfigData(data: Record<string, unknown>, filePath: string): ByfConfig {
  const raw = cloneRecord(data);
  const transformed = transformTomlData(data);
  transformed['raw'] = raw;

  try {
    return ByfConfigSchema.parse(transformed);
  } catch (error) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Invalid configuration in ${filePath}: ${formatConfigValidationError(error)}`,
      {
        cause: error,
      },
    );
  }
}

export function transformTomlData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const targetKey = snakeToCamel(key);

    if (targetKey === 'providers' && isPlainObject(value)) {
      result[targetKey] = transformRecord(value, transformProviderData);
    } else if (targetKey === 'models' && isPlainObject(value)) {
      result[targetKey] = transformRecord(value, transformModelData);
    } else if (targetKey === 'thinking' && isPlainObject(value)) {
      result[targetKey] = transformPlainObject(value);
    } else if (targetKey === 'permission' && isPlainObject(value)) {
      result[targetKey] = transformPermissionData(value);
    } else if (targetKey === 'services' && isPlainObject(value)) {
      result[targetKey] = transformRecord(value, transformServiceData, snakeToCamel);
    } else if (targetKey === 'loopControl' && isPlainObject(value)) {
      result[targetKey] = transformLoopControlData(value);
    } else if (targetKey === 'background' && isPlainObject(value)) {
      result[targetKey] = transformPlainObject(value);
    } else if (!isPlainObject(value)) {
      result[targetKey] = value;
    }
  }
  return result;
}

function transformRecord(
  value: Record<string, unknown>,
  transformEntry: (entry: Record<string, unknown>) => Record<string, unknown>,
  transformName: (name: string) => string = (name) => name,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [entryName, entryConfig] of Object.entries(value)) {
    record[transformName(entryName)] = isPlainObject(entryConfig)
      ? transformEntry(entryConfig)
      : entryConfig;
  }
  return record;
}

function transformPlainObject(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    out[snakeToCamel(key)] = value;
  }
  return out;
}

function transformProviderData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const targetKey = snakeToCamel(key);
    if (targetKey === 'oauth') {
      out[targetKey] = isPlainObject(value) ? transformPlainObject(value) : value;
    } else if (targetKey === 'env' || targetKey === 'customHeaders') {
      out[targetKey] = cloneObjectValue(value);
    } else {
      out[targetKey] = value;
    }
  }
  return out;
}

function transformModelData(data: Record<string, unknown>): Record<string, unknown> {
  return transformPlainObject(data);
}

function transformPermissionData(data: Record<string, unknown>): Record<string, unknown> {
  const raw = transformPlainObject(data);
  const out: Record<string, unknown> = {};

  const rules: unknown[] = [];
  appendPermissionRules(rules, raw['rules']);
  appendPermissionRules(rules, raw['deny'], 'deny');
  appendPermissionRules(rules, raw['allow'], 'allow');
  appendPermissionRules(rules, raw['ask'], 'ask');
  if (rules.length > 0) {
    out['rules'] = rules;
  }
  return out;
}

function appendPermissionRules(
  target: unknown[],
  value: unknown,
  decision?: 'allow' | 'deny' | 'ask',
): void {
  if (value === undefined) return;
  const entries = Array.isArray(value) ? value : [value];
  for (const entry of entries) {
    target.push(transformPermissionRule(entry, decision));
  }
}

function transformPermissionRule(value: unknown, decision?: 'allow' | 'deny' | 'ask'): unknown {
  if (!isPlainObject(value)) return value;

  const rule = transformPlainObject(value);
  const tool = rule['tool'];
  const match = rule['match'];
  const pattern = rule['pattern'];
  const out: Record<string, unknown> = {};

  if (decision !== undefined) {
    out['decision'] = decision;
  } else {
    out['decision'] = rule['decision'];
  }
  out['scope'] = rule['scope'];
  out['reason'] = rule['reason'];

  if (typeof tool === 'string') {
    const argPattern = typeof match === 'string' ? match : pattern;
    out['pattern'] = typeof argPattern === 'string' ? `${tool}(${argPattern})` : tool;
  } else {
    out['pattern'] = pattern;
  }

  return out;
}

function transformServiceData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    const targetKey = snakeToCamel(key);
    if (targetKey === 'oauth') {
      out[targetKey] = isPlainObject(value) ? transformPlainObject(value) : value;
    } else if (targetKey === 'customHeaders') {
      out[targetKey] = cloneObjectValue(value);
    } else if (Array.isArray(value)) {
      // Recurse into array items (e.g. [[services.web_search.providers]])
      out[targetKey] = value.map((item) =>
        isPlainObject(item) ? transformRecord(item, identity, snakeToCamel) : item,
      );
    } else if (isPlainObject(value)) {
      // Flat sub-table — apply key conversion to direct children
      out[targetKey] = transformPlainObject(value);
    } else {
      out[targetKey] = value;
    }
  }
  return out;
}

function identity<T>(v: T): T {
  return v;
}

function transformLoopControlData(data: Record<string, unknown>): Record<string, unknown> {
  const out = transformPlainObject(data);
  if (out['maxStepsPerTurn'] === undefined && out['maxStepsPerRun'] !== undefined) {
    out['maxStepsPerTurn'] = out['maxStepsPerRun'];
  }
  delete out['maxStepsPerRun'];
  return out;
}

/* ------------------------------------------------------------------ */
/*  Write / stringify                                                  */
/* ------------------------------------------------------------------ */

/**
 * 结构化写（语义投影）：把 config 重新 stringify 后覆盖磁盘。
 *
 * PRD-0038 AC-1.7 让服务在配置损坏时也能启动，这条路径因此变得可达：磁盘上的
 * `config.toml` 解析不了时 `readConfigFile` 降级为内置默认，照此写回就会把用户的
 * 全部配置（含密钥）换成一份投影——正是 AC-1.4 禁止的数据销毁。所以覆盖前先复核
 * 磁盘原文，解析不了就拒绝，并把用户指向按文本修复的出口。
 */
export async function writeConfigFile(filePath: string, config: ByfConfig): Promise<void> {
  assertDiskConfigParsable(filePath);
  const validated = validateConfig(config);
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  await atomicWrite(filePath, `${stringifyToml(configToTomlData(validated))}\n`);
}

function assertDiskConfigParsable(filePath: string): void {
  if (!existsSync(filePath)) return;
  try {
    parseConfigString(readFileSync(filePath, 'utf-8'), filePath);
  } catch (error) {
    if (error instanceof ByfError && error.code === ErrorCodes.CONFIG_INVALID) {
      throw new ByfError(
        ErrorCodes.CONFIG_INVALID,
        `Refusing to overwrite ${filePath}: the config on disk cannot be parsed, and a structured ` +
          'write would replace your existing settings. Fix the file as text (web raw config editor, ' +
          'or your $EDITOR) first.',
        { cause: error },
      );
    }
    throw error;
  }
}

export function configToTomlData(config: ByfConfig): Record<string, unknown> {
  const out = cloneRecord(config.raw);

  // Strip deprecated fields
  delete out['default_yolo'];
  delete out['defaultYolo'];
  delete out['defaultPermissionMode'];
  delete out['default_thinking'];

  // Top-level scalar fields
  const scalarFields: (keyof ByfConfig)[] = [
    'defaultProvider',
    'defaultModel',
    'yolo',
    'defaultPermissionMode',
    'mergeAllAvailableSkills',
    'extraSkillDirs',
  ];
  for (const key of scalarFields) {
    setDefined(out, camelToSnake(key), config[key]);
  }

  setRecordSection(out, 'providers', config.providers, providerToToml);
  setRecordSection(out, 'models', config.models, modelToToml);
  setSection(out, 'thinking', config.thinking, thinkingToToml);
  setSection(out, 'services', config.services, servicesToToml);
  setSection(out, 'loop_control', config.loopControl, loopControlToToml);
  setSection(out, 'background', config.background, backgroundToToml);
  setSection(out, 'permission', config.permission, permissionToToml);
  setHooks(out, config.hooks);

  return out;
}

function setRecordSection<T>(
  out: Record<string, unknown>,
  snakeKey: string,
  value: Record<string, T> | undefined,
  toToml: (v: T, raw: unknown) => Record<string, unknown>,
): void {
  if (value === undefined) {
    delete out[snakeKey];
    return;
  }

  const rawSub = cloneRecord(out[snakeKey]);
  const converted: Record<string, unknown> = {};
  for (const [entryName, entryConfig] of Object.entries(value)) {
    converted[entryName] = toToml(entryConfig, rawSub[entryName]);
  }

  if (Object.keys(converted).length > 0) {
    out[snakeKey] = converted;
  } else {
    delete out[snakeKey];
  }
}

function setSection<T>(
  out: Record<string, unknown>,
  snakeKey: string,
  value: T | undefined,
  toToml: (v: T, raw: unknown) => Record<string, unknown>,
): void {
  if (value === undefined) {
    delete out[snakeKey];
    return;
  }
  const rawSub = cloneRecord(out[snakeKey]);
  const converted = toToml(value, rawSub);
  if (Object.keys(converted).length > 0) {
    out[snakeKey] = converted;
  } else {
    delete out[snakeKey];
  }
}

function providerToToml(provider: ProviderConfig, rawProvider: unknown): Record<string, unknown> {
  const out = cloneRecord(rawProvider);
  for (const [key, value] of Object.entries(provider)) {
    if (key === 'oauth' && value !== undefined) {
      out[camelToSnake(key)] = oauthToToml(value as OAuthRef);
    } else if ((key === 'env' || key === 'customHeaders') && value !== undefined) {
      out[camelToSnake(key)] = cloneUnknown(value);
    } else {
      setDefined(out, camelToSnake(key), value);
    }
  }
  return out;
}

function modelToToml(model: ModelAlias, rawModel: unknown): Record<string, unknown> {
  const out = cloneRecord(rawModel);
  for (const [key, value] of Object.entries(model)) {
    if (key === 'capabilities' && Array.isArray(value)) {
      out[camelToSnake(key)] = [...value];
    } else {
      setDefined(out, camelToSnake(key), value);
    }
  }
  return out;
}

function thinkingToToml(thinking: ThinkingConfig, rawThinking: unknown): Record<string, unknown> {
  const out = cloneRecord(rawThinking);
  for (const [key, value] of Object.entries(thinking)) {
    setDefined(out, camelToSnake(key), value);
  }
  return out;
}

function permissionToToml(
  permission: PermissionConfig,
  rawPermission: unknown,
): Record<string, unknown> {
  const out = cloneRecord(rawPermission);
  delete out['deny'];
  delete out['allow'];
  delete out['ask'];

  if (permission.rules !== undefined) {
    out['rules'] = permission.rules.map(permissionRuleToToml);
  } else {
    delete out['rules'];
  }
  return out;
}

function permissionRuleToToml(
  rule: NonNullable<PermissionConfig['rules']>[number],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rule)) {
    setDefined(out, camelToSnake(key), value);
  }
  return out;
}

function servicesToToml(services: ServicesConfig, rawServices: unknown): Record<string, unknown> {
  const out = cloneRecord(rawServices);

  // webSearch → [[services.web_search.providers]]
  if (services.webSearch !== undefined && services.webSearch.providers.length > 0) {
    const providersToml = services.webSearch.providers.map((p) => {
      const providerOut: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(p)) {
        setDefined(providerOut, camelToSnake(key), value);
      }
      return providerOut;
    });
    // smol-toml stringify handles arrays-of-tables at nested paths
    // when the parent table header already exists.
    out['web_search'] = out['web_search'] ?? {};
    (out['web_search'] as Record<string, unknown>)['providers'] = providersToml;
  } else {
    delete out['web_search'];
  }

  // fetchUrl → [services.fetch_url]
  if (services.fetchUrl !== undefined) {
    out['fetch_url'] = serviceToToml(services.fetchUrl);
  } else {
    delete out['fetch_url'];
  }

  return out;
}

function serviceToToml(service: ByfServiceConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(service)) {
    if (key === 'oauth' && value !== undefined) {
      out[camelToSnake(key)] = oauthToToml(value as OAuthRef);
    } else if (key === 'customHeaders' && value !== undefined) {
      out[camelToSnake(key)] = cloneUnknown(value);
    } else {
      setDefined(out, camelToSnake(key), value);
    }
  }
  return out;
}

function loopControlToToml(
  loopControl: LoopControl,
  rawLoopControl: unknown,
): Record<string, unknown> {
  const out = cloneRecord(rawLoopControl);
  for (const [key, value] of Object.entries(loopControl)) {
    setDefined(out, camelToSnake(key), value);
  }
  return out;
}

function backgroundToToml(
  background: BackgroundConfig,
  rawBackground: unknown,
): Record<string, unknown> {
  const out = cloneRecord(rawBackground);
  for (const [key, value] of Object.entries(background)) {
    setDefined(out, camelToSnake(key), value);
  }
  return out;
}

function setHooks(out: Record<string, unknown>, hooks: readonly HookDefConfig[] | undefined): void {
  if (hooks === undefined) {
    delete out['hooks'];
    return;
  }
  out['hooks'] = hooks.map(hookToToml);
}

function hookToToml(hook: HookDefConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(hook)) {
    setDefined(out, camelToSnake(key), value);
  }
  return out;
}

function oauthToToml(oauth: OAuthRef): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(oauth)) {
    out[camelToSnake(key)] = value;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!isPlainObject(value)) return {};
  return cloneUnknown(value);
}

function cloneUnknown<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneObjectValue(value: unknown): unknown {
  return isPlainObject(value) ? cloneUnknown(value) : value;
}

function setDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  } else {
    delete target[key];
  }
}

function isFileExistsError(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EEXIST'
  );
}
