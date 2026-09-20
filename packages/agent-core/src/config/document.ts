/**
 * ConfigDocument：`config.toml` 的 raw 文本 + revision + 校验/原子写的唯一
 * 服务面（PRD-0035 R-A3/A4、ADR-0038）。
 *
 * 原则：raw 全保真写是 canonical（原样写回文本：注释/空行/未识别键全保真），
 * 结构化 `setConfig` 是语义投影（merge + stringify，不承诺保留注释）。
 * 并发检测用 revision 乐观锁（sha256 磁盘原文），不提供 force 覆盖。
 * 密钥值经无损掩码交互：占位符保留=保留磁盘原值，删除行=删除 key，新值=更新。
 * 占位符按**键路径**标注身份（`__BYF_KEEP_SECRET__providers.a.api_key`），归属与行序
 * 无关（PRD-0038 AC-1.5），且表头写法与点号键写法归一化为同一身份（PRD-0038 AC-1.8）。
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { ByfConfig } from '#/config/schema';
import { DEFAULT_CONFIG_FILE_TEXT, parseConfigString } from '#/config/toml';
import { ByfError, ErrorCodes } from '#/errors';
import { atomicWrite } from '#/utils/fs';

/** 掩码占位符前缀：raw 编辑器中密钥值的替代文本（ADR-0038 D4）。
 *  完整形态是 `__BYF_KEEP_SECRET__<键路径>`（PRD-0038 AC-1.5）。 */
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

// ── 密钥无损掩码（ADR-0038 D4、PRD-0038 AC-1.5 / AC-1.8）─────────────────────
//
// 威胁模型：raw 读取端点的响应文本是「过线文本」。每一条**生效的**密钥赋值都必须
// 归一化成一个键路径身份并被掩码；归一化不出身份的形态必须拒绝外发并给出可诊断
// 错误 —— 绝不静默放行明文（AC-1.8）。

/** 标量密钥键名（canonical `api_key`）：api_key / apiKey / apikey，R-E6 等价。 */
const SECRET_SCALAR_SEGMENT_RE = /^api_?[Kk]ey$/;
/** 数组密钥键名（canonical `api_keys`）：api_keys / apiKeys / apikeys。 */
const SECRET_ARRAY_SEGMENT_RE = /^api_?[Kk]eys$/;
/** TOML 键的一段（bare 或 quoted）。 */
const KEY_SEGMENT = String.raw`[A-Za-z0-9_-]+|"[^"]*"|'[^']*'`;
/**
 * 一行的 `键路径 = 值` 形态。键路径允许点号续写，因此 `providers.x.api_key = "…"`
 * （顶层点号键）与 `[providers] / x.api_key = "…"`（表头内点号键）归一化到与
 * `[providers.x] / api_key = "…"` 同一个身份。
 */
const ASSIGNMENT_RE = new RegExp(
  String.raw`^[ \t]*((?:${KEY_SEGMENT})(?:[ \t]*\.[ \t]*(?:${KEY_SEGMENT}))*)[ \t]*=[ \t]*(.*)$`,
);
/** 表头：`[a.b]` 与 `[[a.b]]`（array-of-tables 需要出现次序补入路径）。 */
const TABLE_HEADER_RE = /^[ \t]*(\[\[?)([^\]]+?)[ \t]*(?:\]\]?)[ \t]*(?:#.*)?$/;
/** 带标注的占位符值 token：`"__BYF_KEEP_SECRET__<键路径>"`，路径可为空（未标注）。 */
const MASKED_VALUE_RE = new RegExp(`^(['"])${MASKED_SECRET_PLACEHOLDER}([^'"]*)\\1$`);
/** 数组行内的字符串元素 token。 */
const ARRAY_ELEMENT_RE = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
/** 单行引号字符串值（可带行尾注释）。 */
const ONE_LINE_STRING_RE = new RegExp(
  String.raw`^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')([ \t]*(?:\#.*)?)$`,
);
/** 单行数组值（可带行尾注释）。 */
const ONE_LINE_ARRAY_RE = /^(\[[^\r\n]*\])([ \t]*(?:#.*)?)$/;
/** 多行字符串起点：值延伸到后续行，按行无法归一化。 */
const MULTILINE_STRING_OPEN_RE = /^(?:"""|''')/;
/**
 * 生效但**不在**行首键路径位置上的密钥赋值：内联表
 * （`providers = { deepseek = { api_key = "…" } }`）、跨行数组的起始行等。
 * 掩码器给不出可还原的键路径身份 → 拒绝外发（AC-1.8）。
 */
const EMBEDDED_SECRET_ASSIGNMENT_RE = /(?:^|[^A-Za-z0-9_])api_?[Kk]eys?[ \t]*=[ \t]*(?:"|'|\[)/;

/**
 * 剥掉一行的行尾注释（引号内的 `#` 不是注释起点）。整行注释因此成为空串：
 * 注释掉的示例行既不是生效密钥赋值，也不该误触发拒绝门。
 */
function stripTrailingComment(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quote !== '') {
      if (quote === '"' && ch === '\\') i += 1;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') return line.slice(0, i);
  }
  return line;
}

/** 键路径分段：按点号切，quoted 段内部的点号不切。 */
function splitKeyPath(raw: string): string[] {
  const segments: string[] = [];
  let current = '';
  let quote = '';
  for (const ch of raw) {
    if (quote !== '') {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '.') {
      segments.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  segments.push(current.trim());
  return segments;
}

/**
 * 密钥值的可处理形态。`span` = 值不是可拆解的字符串/数组（未闭合引号、未加引号的
 * 字面量、schema 不接受的类型等），整段按一个密钥处理：掩码掉明文、还原时原样写回，
 * 因此损坏态的修复路径仍然可达（AC-1.7）。
 */
type SecretValueKind = 'scalar' | 'array' | 'span';

/**
 * 一行生效密钥赋值的解析结果。掩码、磁盘取值、还原三条路径共用同一次推导，
 * 且恒有 `原行 === head + value + tail`，所以往返不会改动值以外的内容。
 */
interface SecretAssignment {
  /** 行首到值之前（含 `=` 与其后空白）的字面量。 */
  head: string;
  /** 归一化后的完整键路径（不含数组下标），如 `providers.deepseek.api_key`。 */
  path: string;
  kind: SecretValueKind;
  /** 值原文：scalar/array 为完整 token（含引号/方括号），span 为修剪后的整段。 */
  value: string;
  /** 值之后的原文（行尾注释；span 形态是值的尾随空白）。 */
  tail: string;
  line: number;
}

/** 键路径中的引号/控制符会破坏占位符的字符串边界，统一折叠为 `~`
 *  （掩码与磁盘收集走同一清洗，因此查找仍然精确到同一个键路径）。 */
function encodeSecretPath(path: string): string {
  return path.replaceAll(/["'\\\r\n\t]/g, '~');
}

/**
 * 解析一行是否是生效的密钥赋值。`null` = 不是；`'multiline'` = 是，但值延伸到后续行
 * （跨行数组 / 多行字符串）→ 调用方必须拒绝而不是放行明文。
 */
function parseSecretAssignment(
  line: string,
  tablePath: string,
  lineNumber: number,
): SecretAssignment | 'multiline' | null {
  const match = ASSIGNMENT_RE.exec(line);
  if (match === null) return null;
  const segments = splitKeyPath(match[1]!);
  const last = segments.at(-1) ?? '';
  const canonical = SECRET_ARRAY_SEGMENT_RE.test(last)
    ? 'api_keys'
    : SECRET_SCALAR_SEGMENT_RE.test(last)
      ? 'api_key'
      : undefined;
  if (canonical === undefined) return null;

  const rawValue = match[2]!;
  if (rawValue.trim().length === 0) return null; // `api_key =` 没有值可掩码

  const path = [
    ...(tablePath === '' ? [] : tablePath.split('.')),
    ...segments.slice(0, -1),
    canonical,
  ].join('.');
  const head = line.slice(0, line.length - rawValue.length);

  const scalar = ONE_LINE_STRING_RE.exec(rawValue);
  if (scalar !== null) {
    return { head, path, kind: 'scalar', value: scalar[1]!, tail: scalar[2]!, line: lineNumber };
  }
  const array = ONE_LINE_ARRAY_RE.exec(rawValue);
  if (array !== null) {
    return { head, path, kind: 'array', value: array[1]!, tail: array[2]!, line: lineNumber };
  }
  if (MULTILINE_STRING_OPEN_RE.test(rawValue) || rawValue.startsWith('[')) return 'multiline';
  const trimmed = rawValue.trimEnd();
  return {
    head,
    path,
    kind: 'span',
    value: trimmed,
    tail: rawValue.slice(trimmed.length),
    line: lineNumber,
  };
}

interface SecretWalkResult {
  text: string;
  /** 被解析器认领的密钥行号（还原用它判定占位符是否落在认领之外的位置）。 */
  consumed: number[];
  /** 生效但无法归一化身份的密钥行号 → 必须拒绝外发（AC-1.8）。 */
  unanchorable: number[];
}

/**
 * 逐行遍历文本，维护当前表路径，把生效密钥行交给 `onSecret`。
 *
 * 路径形态：`providers.deepseek.api_key`、`services.web_search.providers[0].api_keys[1]`
 * （array-of-tables 按出现序号补 `[n]`，命名表按 `[a.b]` 头名）。掩码与还原共用同一次
 * 路径推导，因此占位符的身份是「这个密钥属于哪个键路径」，与它排在第几行无关（AC-1.5），
 * 也与它写成表头还是点号键无关（AC-1.8）。
 *
 * 按行匹配仍是既有的能力边界：跨行的 string / 数组值不被支持。区别在于这类形态不再
 * 被静默跳过，而是经 `unanchorable` 报给调用方拒绝外发。
 */
function walkSecretLines(
  text: string,
  onSecret: (assignment: SecretAssignment) => string,
): SecretWalkResult {
  const occurrences = new Map<string, number>();
  const consumed: number[] = [];
  const unanchorable: number[] = [];
  let tablePath = '';
  let lineNumber = 0;
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    lineNumber += 1;
    const header = TABLE_HEADER_RE.exec(line);
    if (header !== null) {
      const name = header[2]!;
      if (header[1] === '[[') {
        const index = occurrences.get(name) ?? 0;
        occurrences.set(name, index + 1);
        tablePath = `${name}[${index}]`;
      } else {
        tablePath = name;
      }
      out.push(line);
      continue;
    }
    const assignment = parseSecretAssignment(line, tablePath, lineNumber);
    if (assignment === 'multiline') {
      consumed.push(lineNumber);
      unanchorable.push(lineNumber);
      out.push(line);
      continue;
    }
    if (assignment === null) {
      // 未被认领、但形状上是密钥赋值（内联表里的 `api_key = "…"`）→ 拒绝外发。
      // 先剥掉行尾注释，避免把注释里的示例误判成生效值。
      if (EMBEDDED_SECRET_ASSIGNMENT_RE.test(stripTrailingComment(line))) {
        unanchorable.push(lineNumber);
      }
      out.push(line);
      continue;
    }
    consumed.push(lineNumber);
    out.push(onSecret(assignment));
  }
  return { text: out.join('\n'), consumed, unanchorable };
}

/** 无法归一化为键路径身份的密钥形态：拒绝外发，给出行号与出路（AC-1.8）。 */
function unanchorableSecretError(lines: number[]): never {
  throw new ByfError(
    ErrorCodes.CONFIG_INVALID,
    `Refusing to serve config.toml: secret assignment(s) on line(s) ${lines.join(', ')} are not in a ` +
      'single-line form this editor can anchor (inline table, multi-line array, or multi-line string). ' +
      'Rewrite each key as one-line `api_key = "…"` / `api_keys = ["…"]`, or edit the file outside ' +
      'the web editor.',
    { details: { lines, reason: 'secret_not_maskable' } },
  );
}

/** 带键路径标注的占位符值 token。 */
function maskedPlaceholder(path: string): string {
  return `"${MASKED_SECRET_PLACEHOLDER}${encodeSecretPath(path)}"`;
}

/** 数组值逐元素标注下标，元素数与标量序号互不污染。 */
function maskedArrayValue(path: string, arrayValue: string): string {
  let index = -1;
  return arrayValue.replaceAll(ARRAY_ELEMENT_RE, () => {
    index += 1;
    return maskedPlaceholder(`${path}[${index}]`);
  });
}

/**
 * 把文本中所有 api_key / apiKeys 的值替换为**按键路径标注**的占位符：
 *
 * ```toml
 * api_key = "__BYF_KEEP_SECRET__providers.deepseek.api_key"
 * providers.x.api_key = "__BYF_KEEP_SECRET__providers.x.api_key"
 * api_keys = ["__BYF_KEEP_SECRET__services.web_search.providers[0].api_keys[0]", …]
 * ```
 *
 * - 标注即身份：还原时按标注的键路径取磁盘同路径密钥，行序/块序/表头 vs 点号键的
 *   写法变化都不影响归属；
 * - 锚不上身份的形态（内联表、跨行数组/字符串）→ 抛可诊断错误，绝不明文过线；
 * - 行尾注释保留（只替换值部分）；锚定行首避免命中注释里的同名文本。
 */
export function maskConfigSecrets(text: string): string {
  const { text: masked, unanchorable } = walkSecretLines(text, (assignment) =>
    assignment.kind === 'array'
      ? `${assignment.head}${maskedArrayValue(assignment.path, assignment.value)}${assignment.tail}`
      : `${assignment.head}${maskedPlaceholder(assignment.path)}${assignment.tail}`,
  );
  if (unanchorable.length > 0) unanchorableSecretError(unanchorable);
  return masked;
}

/** 磁盘原文中可被占位符引用的密钥（值 token 含原有引号）。 */
interface DiskSecrets {
  values: Map<string, string>;
  /** 同一路径出现多次（磁盘本身畸形）→ 归属不唯一，拒绝解析而不是猜。 */
  ambiguous: Set<string>;
}

function collectDiskSecrets(diskText: string): DiskSecrets {
  const values = new Map<string, string>();
  const ambiguous = new Set<string>();
  const put = (key: string, value: string): void => {
    if (values.has(key)) {
      ambiguous.add(key);
      return;
    }
    values.set(key, value);
  };
  walkSecretLines(diskText, (assignment) => {
    if (assignment.kind === 'array') {
      let index = -1;
      for (const token of assignment.value.match(ARRAY_ELEMENT_RE) ?? []) {
        index += 1;
        put(encodeSecretPath(`${assignment.path}[${index}]`), token);
      }
      return '';
    }
    // scalar 与 span 都是一个值 token（span 保留磁盘原样，损坏值也能原样还原）。
    put(encodeSecretPath(assignment.path), assignment.value);
    return '';
  });
  return { values, ambiguous };
}

function unresolvableSecret(keyPath: string, line: number): never {
  throw new ByfError(
    ErrorCodes.CONFIG_INVALID,
    `Cannot restore masked secret at line ${line}: no key path "${keyPath}" in the config on disk. ` +
      'The placeholder was moved to, or copied as, a new key path — delete the placeholder and type an ' +
      'explicit key value to confirm this change.',
    { details: { keyPath, line } },
  );
}

/**
 * 恢复掩码：占位符按**标注的键路径**回填磁盘原值（AC-1.5）。身份以占位符里写着的
 * 键路径为准——它随文本一起被搬移，所以重排整块、改表名（provider 改名）、表头写法
 * 与点号写法互换（AC-1.8）都不会错配。
 *
 * - 标注路径在磁盘上无对应密钥（粘贴到新键路径且原块已不存在、占位符形态已过期）→
 *   抛可诊断错误，绝不静默把别人的密钥值复制过去，也绝不静默丢键；
 * - 同一磁盘密钥被两个占位符引用（复制掩码块但保留了原块）→ 同样抛错，
 *   这是「静默把 a 的密钥发给 d」这条缺陷的拦截点；
 * - 未标注的裸 `__BYF_KEEP_SECRET__`：按它当前所在的键路径解析（手写文本的兜底，
 *   不是行序兜底）；
 * - 占位符行被删除 = 删除该 key（该磁盘密钥无人引用）；
 * - 用户写入的新值（非占位符）：原样保留，因此「新增 provider 带字面密钥」合法；
 * - 占位符落在编辑器识别不了的位置（跨行数组值、游离文本）→ 抛错，
 *   占位符字符串永不落盘。
 */
export function restoreMaskedSecrets(maskedText: string, diskText: string): string {
  const disk = collectDiskSecrets(diskText);
  const claims = new Set<string>();

  const resolve = (label: string, contextPath: string, line: number): string => {
    const keyPath = label === '' ? encodeSecretPath(contextPath) : label;
    if (claims.has(keyPath)) {
      throw new ByfError(
        ErrorCodes.CONFIG_INVALID,
        `Secret "${keyPath}" is referenced by more than one placeholder. ` +
          'Copying a masked block keeps the same key path: type an explicit key value for the new entry.',
        { details: { keyPath, line } },
      );
    }
    claims.add(keyPath);
    if (disk.ambiguous.has(keyPath)) {
      throw new ByfError(
        ErrorCodes.CONFIG_INVALID,
        `Secret "${keyPath}" is not unique in the config on disk; refusing to guess which value to keep.`,
        { details: { keyPath, line } },
      );
    }
    const value = disk.values.get(keyPath);
    if (value !== undefined) return value;
    return unresolvableSecret(keyPath, line);
  };

  const { text: restored, consumed } = walkSecretLines(maskedText, (assignment) => {
    if (assignment.kind === 'array') {
      let index = -1;
      const body = assignment.value.replaceAll(ARRAY_ELEMENT_RE, (token) => {
        index += 1;
        const masked = MASKED_VALUE_RE.exec(token);
        if (masked === null) return token;
        return resolve(masked[2]!, `${assignment.path}[${index}]`, assignment.line);
      });
      return `${assignment.head}${body}${assignment.tail}`;
    }
    const masked = MASKED_VALUE_RE.exec(assignment.value);
    // 用户显式新值原样保留（`head + value + tail` 恒等于原行）。
    if (masked === null) return `${assignment.head}${assignment.value}${assignment.tail}`;
    return `${assignment.head}${resolve(masked[2]!, assignment.path, assignment.line)}${assignment.tail}`;
  });

  // 占位符字符串永不落盘：出现在 walker 认领之外的位置（跨行数组、游离文本）时必须
  // 拒绝，而不是把占位符字面量写进 config.toml。注释行不动（与掩码同一侧）。
  const placeholderLines = (text: string, skip: Set<number>): number[] =>
    text
      .split(/\r?\n/)
      .map((line, idx) => ({ line, lineNumber: idx + 1 }))
      .filter(
        ({ line, lineNumber }) =>
          !skip.has(lineNumber) &&
          !/^[ \t]*#/.test(line) &&
          line.includes(MASKED_SECRET_PLACEHOLDER),
      )
      .map(({ lineNumber }) => lineNumber);

  const stranded = placeholderLines(maskedText, new Set(consumed));
  if (stranded.length > 0) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Secret placeholder on line(s) ${stranded.join(', ')} is not an api_key/api_keys value this ` +
        'editor can restore (multi-line value, or stray text). Replace it with an explicit key value.',
      { details: { lines: stranded } },
    );
  }
  // 兜底不变式：还原结果里绝不残留占位符字面量（注释行除外）。
  const residue = placeholderLines(restored, new Set());
  if (residue.length > 0) {
    throw new ByfError(
      ErrorCodes.CONFIG_INVALID,
      `Secret placeholder survived restoration on line(s) ${residue.join(', ')}; refusing to write ` +
        'it to config.toml. Replace it with an explicit key value.',
      { details: { lines: residue } },
    );
  }
  return restored;
}
