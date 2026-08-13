/**
 * bash-command — Bash 命令的静态资源解析层（PRD-0031 0a）。
 *
 * 把 Bash 命令解析成 `(operation, path)` 序列，供两层消费者使用：
 *   1. 权限层（`check-rules.ts`）：逐子命令权限匹配（grill Q1）——按
 *      `; && || |` 分解复合命令，每个子命令作为独立命令参与规则匹配。
 *   2. 工具层（`tools/builtin/shell/bash.ts`）：敏感文件防护（grill Q2）
 *      与 `ToolAccesses` 声明——解析出的路径过 `resolvePathAccess`，
 *      命中 `sensitive.ts` 直接抛 `PATH_SENSITIVE`（与 Read/Write/Edit 一致）；
 *      无法静态收窄的命令保持 `kind:'all'` 全局互斥（现状语义）。
 *
 * 定位：UX 尽力而为、**非安全边界**（ADR-0033）。非语法级解析；复杂 shell
 * （heredoc、进程替换、别名展开）检测后转 `indirect`（强制审批），
 * `python -c`/`node -e` 内层代码为已知绕过面，一并转 `indirect`。
 * 本模块是纯函数：无 IO、无 `this`、无异常（总返回结构，从不 throw）。
 */

export type BashResourceOperation = 'read' | 'write' | 'search';

/**
 * 子命令分类：
 *   - `narrow`    — 动词已分类且提取到具体路径（可静态解析出资源访问）
 *   - `broad`     — 动词已分类但无法收窄到具体路径（build/test/网络/git/脚本），
 *                   执行期可能触碰任意文件
 *   - `no-access` — 不触碰文件（`echo hi`、`pwd`、纯 `cd`）
 *   - `indirect`  — 无法静态解析（eval/source/解释器 -c/-e/未知动词/heredoc），
 *                   按设计转强制审批
 */
export type BashSubcommandKind = 'narrow' | 'broad' | 'no-access' | 'indirect';

export interface BashPathArg {
  /** 命令中书写的原样路径（可为相对路径 / `~` / 无扩展名裸文件名）。 */
  readonly rawPath: string;
  readonly operation: BashResourceOperation;
}

export interface BashSubcommand {
  /** 子命令原文（如 `rm x`）——逐子命令规则匹配的输入。 */
  readonly text: string;
  /** 命令基名（如 `rm`）。分类失败时为 `''`。 */
  readonly verb: string;
  readonly kind: BashSubcommandKind;
  /** `narrow` 子命令提取出的路径参数（含重定向目标）。 */
  readonly paths: readonly BashPathArg[];
  /** `cd <target>` 的目标（供消费者串行累计 cwd）；`cd -` / 裸 `cd` 为 undefined。 */
  readonly cdTarget?: string;
}

export interface BashCommandParse {
  readonly subcommands: readonly BashSubcommand[];
}

// ---- 动词分类表（真实编码场景，spike 基准集实测） -------------------------

/**
 * 参数按定义就是文件的动词（裸 token 即路径，即使没有扩展名/分隔符——
 * `cat id_rsa`、`rm x` 的文件不一定存在或可路径化）。echo/date/pwd 等
 * 无文件操作数的动词不在此列。
 */
const FILE_OPERAND_VERBS = new Set([
  'cat',
  'head',
  'tail',
  'less',
  'more',
  'bat',
  'wc',
  'file',
  'stat',
  'ls',
  'tree',
  'diff',
  'du',
  'rm',
  'rmdir',
  'mv',
  'cp',
  'mkdir',
  'touch',
  'chmod',
  'chown',
  'ln',
  'truncate',
  'tee',
  'install',
  'dd',
  'strip',
]);

/** pattern 在首个位置参数的搜索动词（find/fd 的首个位置参数是路径）。 */
const PATTERN_FIRST_VERBS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ack', 'ag']);

/** 解释器：`-c`/`-e` 内层代码是已知绕过面 → indirect；`python script.py` 的脚本
 *  本身是读取对象，但脚本内容可能触碰任意文件 → broad。 */
const INTERPRETER_VERBS = new Set(['python', 'python3', 'node', 'ruby', 'perl', 'lua', 'php']);

/** 间接执行 → 强制审批。 */
const INDIRECT_VERBS = new Set(['eval', 'source', 'exec', 'command', 'xargs']);

/** 带 `-c` 时剥壳递归；不带 `-c` 时（`sh script.sh`）→ indirect。 */
const SHELL_VERBS = new Set(['bash', 'sh', 'zsh', 'dash']);

/** build/test/包管理器：触碰 node_modules/target/dist 等不可预测路径 → broad。 */
const BUILD_VERBS = new Set([
  'npm',
  'pnpm',
  'yarn',
  'bun',
  'cargo',
  'make',
  'cmake',
  'go',
  'gradle',
  'mvn',
  'pip',
  'uv',
  'poetry',
  'tsc',
  'eslint',
  'prettier',
  'jest',
  'vitest',
  'webpack',
  'vite',
  'rollup',
  'turbo',
  'nx',
  'rake',
]);

/** 网络型：无本地文件效应（除 -o 落盘，见 extractPathArgs 特例）→ broad。 */
const NETWORK_VERBS = new Set(['curl', 'wget', 'ssh', 'scp', 'rsync', 'ping', 'nc', 'telnet']);

/** git 子命令 → 读写分类。git 触碰 `.git` 内部文件，accesses 一律收窄失败（broad）。 */
const GIT_READ_SUBCOMMANDS = new Set([
  'status',
  'log',
  'diff',
  'show',
  'blame',
  'ls-files',
  'branch',
  'remote',
  'rev-parse',
  'describe',
  'stash',
  'config',
]);
const GIT_WRITE_SUBCOMMANDS = new Set([
  'add',
  'commit',
  'push',
  'pull',
  'checkout',
  'switch',
  'merge',
  'rebase',
  'reset',
  'clean',
  'rm',
  'mv',
  'tag',
  'fetch',
  'init',
  'clone',
  'apply',
  'cherry-pick',
  'revert',
]);

/** 消费下一个 token 作为值（不是路径）的 flag。 */
const VALUE_FLAGS: Readonly<Record<string, ReadonlySet<string>>> = {
  git: new Set(['-m', '-C', '--message', '--reuse-message', '-S', '-L', '-X', '--author']),
  grep: new Set(['-e', '--regexp', '-A', '-B', '-C', '--color', '-f', '--file']),
  head: new Set(['-n', '-c']),
  tail: new Set(['-n', '-c']),
  find: new Set(['-name', '-iname', '-type', '-path', '-ipath', '-newer', '-mtime', '-size']),
  curl: new Set([
    '-o',
    '--output',
    '-H',
    '--header',
    '-d',
    '--data',
    '-u',
    '--user',
    '-A',
    '--user-agent',
  ]),
  node: new Set(['-e', '--eval', '-r', '--require']),
  python: new Set(['-c', '-m', '-W']),
  cargo: new Set(['--manifest-path']),
};

const OP_BY_VERB: Readonly<Record<string, BashResourceOperation>> = {
  cat: 'read',
  head: 'read',
  tail: 'read',
  less: 'read',
  more: 'read',
  bat: 'read',
  wc: 'read',
  file: 'read',
  stat: 'read',
  ls: 'read',
  tree: 'read',
  diff: 'read',
  du: 'read',
  which: 'read',
  whereis: 'read',
  type: 'read',
  pwd: 'read',
  whoami: 'read',
  uname: 'read',
  echo: 'read',
  true: 'read',
  false: 'read',
  date: 'read',
  env: 'read',
  printenv: 'read',
  rm: 'write',
  rmdir: 'write',
  mv: 'write',
  cp: 'write',
  mkdir: 'write',
  touch: 'write',
  chmod: 'write',
  chown: 'write',
  ln: 'write',
  truncate: 'write',
  tee: 'write',
  install: 'write',
  dd: 'write',
  strip: 'write',
  grep: 'search',
  egrep: 'search',
  fgrep: 'search',
  rg: 'search',
  ack: 'search',
  ag: 'search',
  find: 'search',
  fd: 'search',
  glob: 'search',
};

const GLOB_CHARS = /[*?[\]{]/;

/** 路径中是否含 glob 通配符（无法静态收窄）。 */
export function hasGlobChars(path: string): boolean {
  return GLOB_CHARS.test(path);
}

// ---- tokenizer（引号感知） -------------------------------------------------

interface Token {
  readonly text: string;
  readonly quoted: boolean;
}

function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let cur = '';
  let quoted = false;
  let quote = '';
  let hasToken = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === quote) {
        quoted = false;
      } else if (c === '\\' && i + 1 < s.length) {
        cur += s[++i]!;
      } else {
        cur += c;
      }
      hasToken = true;
    } else if (c === '"' || c === "'") {
      quoted = true;
      quote = c;
      hasToken = true;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i]!;
      hasToken = true;
    } else if (c === ' ' || c === '\t' || c === '\n') {
      if (hasToken) {
        tokens.push({ text: cur, quoted: false });
        cur = '';
        hasToken = false;
      }
    } else {
      cur += c;
      hasToken = true;
    }
  }
  if (hasToken) tokens.push({ text: cur, quoted: false });
  return tokens;
}

/** 按顶层操作符 `; && || |` 切分（引号内不切）。 */
function splitOperators(s: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quoted = false;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      cur += c;
      if (c === quote) quoted = false;
      else if (c === '\\' && i + 1 < s.length) cur += s[++i]!;
    } else if (c === '"' || c === "'") {
      quoted = true;
      quote = c;
      cur += c;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += c + s[++i]!;
    } else if (c === ';') {
      parts.push(cur);
      cur = '';
    } else if ((c === '&' || c === '|') && s[i + 1] === c) {
      parts.push(cur);
      cur = '';
      i++;
    } else if (c === '|') {
      parts.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function basenameOf(p: string): string {
  const clean = p.replace(/\/+$/, '');
  const i = clean.lastIndexOf('/');
  return i < 0 ? clean : clean.slice(i + 1);
}

/** 路径形启发式：分隔符、`~`、`.` 开头、点文件名、扩展名。 */
function looksLikePath(tok: string): boolean {
  if (!tok) return false;
  if (tok.startsWith('-')) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(tok)) return false; // URL scheme
  if (tok.startsWith('~')) return true;
  if (tok.startsWith('./') || tok.startsWith('../') || tok === '.' || tok === '..') return true;
  if (tok.includes('/')) return true;
  if (/^\.[A-Za-z]/.test(tok)) return true; // dotfile：.env 等
  if (/\.[a-z0-9]+$/i.test(tok)) return true; // 带扩展名
  return false;
}

function extractRedirectTargets(tokens: readonly Token[]): BashPathArg[] {
  const out: BashPathArg[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.text;
    const m = /^(?:\d?>>|\d?>|<|&>|&>>)$/.exec(t);
    if (m !== null) {
      const op: BashResourceOperation = t.includes('<') && !t.includes('>') ? 'read' : 'write';
      const target = tokens[i + 1]?.text;
      if (target !== undefined && looksLikePath(target)) {
        out.push({ rawPath: target, operation: op });
      }
    }
  }
  return out;
}

function extractPathArgs(
  verb: string,
  tokens: readonly Token[],
  skip?: ReadonlySet<string>,
): BashPathArg[] {
  const valueFlags = VALUE_FLAGS[verb];
  const op = OP_BY_VERB[verb] ?? 'read';
  const out: BashPathArg[] = [];
  // cp：源为读、目标为写（mv 全为写）。敏感检查不区分 op，accesses 声明更精确。
  const isCp = verb === 'cp';
  // 搜索动词的首个位置参数是 pattern（`grep "\.env" file` 的 `.env` 不是路径）；
  // 但经 -e/--regexp/-f 提供 pattern 后，位置参数就都是文件。
  let positionalCount = 0;
  let sawPatternFlag = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!.text;
    if (skip?.has(t)) continue;
    if (valueFlags?.has(t)) {
      // -o/--output 的 curl 会把值写盘，作为 write 路径提取
      if (verb === 'curl' && (t === '-o' || t === '--output')) {
        const target = tokens[i + 1]?.text;
        if (target !== undefined) out.push({ rawPath: target, operation: 'write' });
      }
      if (verb === 'grep' && (t === '-e' || t === '--regexp' || t === '-f' || t === '--file')) {
        sawPatternFlag = true;
      }
      i++; // 其余 value flag：下一个 token 是值，不是路径
      continue;
    }
    if (t.startsWith('-')) continue;
    positionalCount++;
    if (PATTERN_FIRST_VERBS.has(verb) && !sawPatternFlag && positionalCount === 1) continue;
    const isPath = FILE_OPERAND_VERBS.has(verb) ? t.length > 0 : looksLikePath(t);
    if (!isPath) continue;
    const opForArg = isCp && out.length === 0 ? 'read' : op;
    out.push({ rawPath: t, operation: opForArg });
  }
  return out;
}

function classifyGit(tokens: readonly Token[]): BashSubcommand {
  // 跳过前导 flag 找子命令
  let s = 1;
  while (s < tokens.length && tokens[s]!.text.startsWith('-')) s++;
  const sub = tokens[s]?.text;
  const write = sub !== undefined && GIT_WRITE_SUBCOMMANDS.has(sub);
  const read = sub !== undefined && GIT_READ_SUBCOMMANDS.has(sub);
  const op: BashResourceOperation | undefined = write ? 'write' : read ? 'read' : undefined;

  const valueFlags = VALUE_FLAGS['git'];
  const paths: BashPathArg[] = [];
  if (op !== undefined) {
    for (let i = s + 1; i < tokens.length; i++) {
      const t = tokens[i]!.text;
      if (valueFlags?.has(t)) {
        i++;
        continue;
      }
      if (t.startsWith('-')) continue;
      if (looksLikePath(t)) paths.push({ rawPath: t, operation: op });
    }
  }
  // git 触碰 .git 内部状态 → 资源访问无法静态收窄 → broad
  return { text: tokens.map((t) => t.text).join(' '), verb: 'git', kind: 'broad', paths };
}

/** 分类单个子命令（原始文本）。`bash -c` 剥壳展开为多个叶节点子命令。 */
function classifySubcommand(raw: string): BashSubcommand | readonly BashSubcommand[] {
  // 剥离前导 env 赋值前缀：VAR=val VAR2=val2 cmd ...
  let work = raw;
  const assignRe = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/;
  while (assignRe.test(work)) work = work.replace(assignRe, '');

  // heredoc / 进程替换：无法静态解析多行体与重定向来源 → indirect
  if (work.includes('<<') || /[<>]\(/.test(work)) {
    return { text: raw, verb: '', kind: 'indirect', paths: [] };
  }

  const tokens = tokenize(work);
  if (tokens.length === 0) {
    return { text: raw, verb: '', kind: 'indirect', paths: [] };
  }

  let idx = 0;
  if (tokens[idx]!.text === 'sudo') idx++;
  if (idx >= tokens.length) {
    return { text: raw, verb: '', kind: 'indirect', paths: [] }; // 裸 sudo，无法分类
  }

  const verbRaw = tokens[idx]!.text;
  const verb = basenameOf(verbRaw);

  // bash -c "..." / sh -c "..." → 剥壳递归到内层脚本，内层子命令展开为叶节点
  // （规则匹配与 accesses 都以叶为准）；内层 broad/indirect 向上传播
  if (SHELL_VERBS.has(verb) && tokens[idx + 1]?.text === '-c') {
    const script = tokens
      .slice(idx + 2)
      .map((t) => t.text)
      .join(' ');
    return parseBashCommand(script).subcommands;
  }

  if (verb === '.') {
    return { text: raw, verb: '.', kind: 'indirect', paths: [] };
  }
  if (INDIRECT_VERBS.has(verb)) {
    return { text: raw, verb, kind: 'indirect', paths: [] };
  }
  // 不带 -c 的 sh/bash/zsh/dash：执行脚本，内容不可静态解析 → indirect
  if (SHELL_VERBS.has(verb)) {
    return { text: raw, verb, kind: 'indirect', paths: [] };
  }

  if (verb === 'git') {
    return classifyGit(tokens);
  }

  // 解释器 -c/-e：内层代码为已知绕过面 → indirect（强制审批）
  if (INTERPRETER_VERBS.has(verb)) {
    const codeFlag = tokens.findIndex(
      (t, i) => i > idx && (t.text === '-c' || t.text === '-e' || t.text === '--eval'),
    );
    if (codeFlag >= 0) {
      return { text: raw, verb, kind: 'indirect', paths: [] };
    }
    // python script.py → 脚本本身是读取对象，但脚本内容可触碰任意文件 → broad
    const paths = extractPathArgs(verb, tokens.slice(idx + 1));
    return {
      text: raw,
      verb,
      kind: paths.length > 0 ? 'broad' : 'no-access',
      paths,
    };
  }

  // env 执行其参数（`env FOO=1 cmd ...` 运行 cmd）——带非赋值参数时无法静态解析
  if (verb === 'env') {
    const rest = tokens.slice(idx + 1);
    const runsCommand = rest.some((t) => !t.text.includes('='));
    if (runsCommand) {
      return { text: raw, verb: 'env', kind: 'indirect', paths: [] };
    }
    return { text: raw, verb: 'env', kind: 'no-access', paths: [] };
  }

  if (BUILD_VERBS.has(verb) || NETWORK_VERBS.has(verb)) {
    // 触碰 node_modules/target 等不可预测路径 → 一律 broad（带文件参数也收窄失败，
    // `bun test test/foo.test.ts` 会加载 src 与配置，不只读该文件）。唯一例外：
    // curl -o file 精确落盘该文件 → narrow。
    const paths = extractPathArgs(verb, tokens.slice(idx + 1));
    if (verb === 'curl' && paths.some((p) => p.operation === 'write')) {
      return {
        text: raw,
        verb,
        kind: 'narrow',
        paths: paths.filter((p) => p.operation === 'write'),
      };
    }
    return {
      text: raw,
      verb,
      kind: 'broad',
      paths,
    };
  }

  // cd：切换 cwd，本身不触碰文件；目标暴露给消费者做串行累计
  if (verb === 'cd') {
    const target = tokens[idx + 1]?.text;
    if (target !== undefined && target !== '-' && !target.startsWith('-')) {
      return { text: raw, verb: 'cd', kind: 'no-access', paths: [], cdTarget: target };
    }
    return { text: raw, verb: 'cd', kind: 'no-access', paths: [] };
  }

  const op = OP_BY_VERB[verb];
  if (op !== undefined) {
    const redirTargets = extractRedirectTargets(tokens);
    const redirSet = new Set(redirTargets.map((p) => p.rawPath));
    const paths = [...extractPathArgs(verb, tokens.slice(idx + 1), redirSet), ...redirTargets];
    return {
      text: raw,
      verb,
      kind: paths.length > 0 ? 'narrow' : 'no-access',
      paths,
    };
  }

  // 未知动词：无法分类 → indirect（强制审批，保守）
  return { text: raw, verb: '', kind: 'indirect', paths: [] };
}

/**
 * 解析 Bash 命令。纯函数、确定性，从不 throw。
 * `bash -c`/`sh -c` 剥壳后内层子命令展开为叶节点（规则匹配与 accesses 都以叶为准）。
 */
export function parseBashCommand(command: string): BashCommandParse {
  const subcommands = splitOperators(command).flatMap(classifySubcommand);
  return { subcommands };
}
