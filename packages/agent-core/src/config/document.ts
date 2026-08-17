/**
 * ConfigDocument：`config.toml` 的 raw 文本 + revision + 校验/原子写的唯一
 * 服务面（PRD-0035 R-A3/A4、ADR-0038）。
 *
 * 原则：raw 全保真写是 canonical（原样写回文本：注释/空行/未识别键全保真），
 * 结构化 `setConfig` 是语义投影（merge + stringify，不承诺保留注释）。
 * 并发检测用 revision 乐观锁（sha256 磁盘原文），不提供 force 覆盖。
 * 密钥值经无损掩码交互：占位符保留=保留磁盘原值，删除行=删除 key，新值=更新。
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { ByfConfig } from '#/config/schema';
import { DEFAULT_CONFIG_FILE_TEXT, parseConfigString } from '#/config/toml';
import { ByfError, ErrorCodes } from '#/errors';
import { atomicWrite } from '#/utils/fs';

/** 掩码占位符：raw 编辑器中密钥值的替代文本（ADR-0038 D4）。 */
export const MASKED_SECRET_PLACEHOLDER = '__BYF_KEEP_SECRET__';

export interface ConfigDiagnostic {
  message: string;
  path?: string;
  line?: number;
  column?: number;
}

export interface ConfigValidationResult {
  valid: boolean;
  diagnostics: ConfigDiagnostic[];
}

export interface ConfigDocument {
  path: string;
  /** 磁盘原文（未掩码）。`raw` HTTP 层在响应前自行 mask。 */
  text: string;
  /** sha256(磁盘原文)；文件缺失为 null。 */
  revision: string | null;
  /** 解析出的配置（含 raw 结构）；文件缺失时为默认配置。 */
  parsed: ByfConfig;
}

/** sha256 hex 摘要（revision 定义，ADR-0038 D2）。 */
export function configRevisionForText(text: string): string {
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

async function readDiskText(path: string): Promise<{ text: string; revision: string | null }> {
  try {
    const text = await readFile(path, 'utf-8');
    return { text, revision: configRevisionForText(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { text: '', revision: null };
    }
    throw error;
  }
}

export async function readConfigDocument(path: string): Promise<ConfigDocument> {
  const { text, revision } = await readDiskText(path);
  if (revision === null) {
    return {
      path,
      text: DEFAULT_CONFIG_FILE_TEXT,
      revision: null,
      parsed: parseConfigString(DEFAULT_CONFIG_FILE_TEXT, path),
    };
  }
  return { path, text, revision, parsed: parseConfigString(text, path) };
}

/**
 * 校验 TOML 文本（语法 + schema）。返回结构化诊断；不抛错。
 * TOML 语法错误尽力带 line/column（smol-toml 的 ParseError），schema 错误带
 * 字段 path（行号不可得——文件级 schema 校验无映射到行的基础设施）。
 */
export function validateConfigText(text: string, filePath = 'config.toml'): ConfigValidationResult {
  try {
    parseConfigString(text, filePath);
    return { valid: true, diagnostics: [] };
  } catch (error) {
    if (error instanceof ByfError && error.code === ErrorCodes.CONFIG_INVALID) {
      const diagnostics: ConfigDiagnostic[] = fromParseError(error, filePath);
      return { valid: false, diagnostics };
    }
    return { valid: false, diagnostics: [{ message: String(error) }] };
  }
}

function fromParseError(error: ByfError, filePath: string): ConfigDiagnostic[] {
  const cause = error.cause as { line?: number; column?: number } | undefined;
  const message =
    typeof error.message === 'string' && error.message.includes(`${filePath}:`)
      ? error.message
      : `Invalid configuration in ${filePath}: ${error.message}`;
  return [
    {
      message,
      line: typeof cause?.line === 'number' ? cause.line : undefined,
      column: typeof cause?.column === 'number' ? cause.column : undefined,
    },
  ];
}

/** Raw 写：校验 expectedRevision → 校验文本 → 原样原子写回（ADR-0038 D1/D2）。
 *  文件缺失时 revision 为 null，`expectedRevision: null` 视为创建。 */
export async function writeConfigDocument(
  path: string,
  text: string,
  expectedRevision: string | null,
): Promise<{ revision: string }> {
  const { revision } = await readDiskText(path);
  if (expectedRevision !== revision) {
    throw new ByfError(
      ErrorCodes.CONFIG_REVISION_CONFLICT,
      `Config revision mismatch: expected ${expectedRevision ?? 'null'}, disk has ${revision ?? 'null'}`,
    );
  }
  // 校验后再落盘：invalid 不落盘（即使 expectedRevision 匹配）。
  parseConfigString(text, path);
  await atomicWrite(path, text);
  return { revision: configRevisionForText(text) };
}

// ── 密钥无损掩码（ADR-0038 D4）──────────────────────────────────────────────

/** 标量密钥键名：api_key / apiKey（snake 与 camel 等价，R-E6）。 */
const SCALAR_KEY_RE = /^(\s*api[_]?[Kk]ey\s*=\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/;
/** 数组密钥键名：api_keys / apiKeys（如 [[services.web_search.providers]] 的 keys）。 */
const ARRAY_KEY_RE = /^(\s*api[_]?[Kk]eys\s*=\s*)(\[.*\])/;
/** 占位符：`__BYF_KEEP_SECRET__` 或带序号的 `__BYF_KEEP_SECRET_<n>__`。 */
const MASKED_PLACEHOLDER_RE = /^(\s*api[_]?[Kk]ey\s*=\s*)"__BYF_KEEP_SECRET__(?:_(\d+))?"/;

/** 把文本中所有 api_key/apiKeys 的字符串值替换为占位符。
 *  - 标量值（api_key/apiKey）：占位符带出现序号（`__BYF_KEEP_SECRET_<n>__`），
 *    restore 按序号回填——用户删除中间某行不会错配（修复多 key 错位）；
 *  - 数组值（api_keys/apiKeys，单行近似）：每个字符串元素替换为占位符；
 *  - 行尾注释保留（只替换值部分，` # comment` 原样保留）。
 *  锚定行首避免命中注释/多行字符串里的同名文本；不支持多行 string/数组值。 */
export function maskConfigSecrets(text: string): string {
  const out: string[] = [];
  let seq = 0;
  for (const line of text.split(/\r?\n/)) {
    const scalar = SCALAR_KEY_RE.exec(line);
    if (scalar !== null) {
      seq += 1;
      out.push(`${scalar[1]}"${MASKED_SECRET_PLACEHOLDER}_${seq}"${line.slice(scalar[0].length)}`);
      continue;
    }
    const array = ARRAY_KEY_RE.exec(line);
    if (array !== null) {
      const values = array[2]!.replaceAll(/^\[|\]$/g, '');
      const maskedValues = values.replaceAll(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, () => {
        seq += 1;
        return `"${MASKED_SECRET_PLACEHOLDER}_${seq}"`;
      });
      out.push(`${array[1]}[${maskedValues}]${line.slice(array[0].length)}`);
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

/** 恢复掩码：占位符按序号回填磁盘原值。
 *  - 带序号占位符：取磁盘第 n 个标量值（删除中间行不错配）；
 *  - 数组行（含占位符）：整行回填磁盘同键名的数组行（锚定键名+出现序；
 *    用户对数组内非密钥元素的修改在此简化中不保留）；
 *  - 无对应原值的占位符：跳过该行 = 删除该 key；
 *  - 用户写入的新值（非占位符）：原样保留。 */
export function restoreMaskedSecrets(maskedText: string, diskText: string): string {
  const diskScalars = collectScalarValues(diskText);
  const diskArrays = collectArrayLines(diskText);
  const out: string[] = [];
  let scalarIdx = 0;
  let arrayIdx = 0;
  for (const line of maskedText.split(/\r?\n/)) {
    const masked = MASKED_PLACEHOLDER_RE.exec(line);
    if (masked !== null) {
      const n = masked[2] === undefined ? scalarIdx + 1 : Number(masked[2]);
      if (n >= 1 && n <= diskScalars.length) {
        const diskLine = diskScalars[n - 1]!;
        out.push(`${masked[1]}${diskLine.value}${line.slice(masked[0].length)}`);
      }
      // 无对应原值：跳过该行 = 删除该 key。
      scalarIdx = Math.max(scalarIdx, n);
      continue;
    }
    if (SCALAR_KEY_RE.test(line)) {
      scalarIdx += 1; // 用户新值占一位，保持与磁盘顺序对齐
    }
    const array = ARRAY_KEY_RE.exec(line);
    if (array !== null) {
      if (line.includes(MASKED_SECRET_PLACEHOLDER)) {
        const disk = diskArrays[arrayIdx];
        if (disk !== undefined) out.push(disk.line);
        // 无对应磁盘数组行：跳过 = 删除该 key 数组。
      } else {
        out.push(line);
      }
      arrayIdx += 1;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function collectScalarValues(text: string): Array<{ line: string; value: string }> {
  const values: Array<{ line: string; value: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = SCALAR_KEY_RE.exec(line);
    if (match !== null) {
      values.push({ line, value: match[2]! });
    }
  }
  return values;
}

function collectArrayLines(text: string): Array<{ line: string }> {
  const values: Array<{ line: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = ARRAY_KEY_RE.exec(line);
    if (match !== null) values.push({ line });
  }
  return values;
}
