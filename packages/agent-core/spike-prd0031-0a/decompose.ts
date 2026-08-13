// PROTOTYPE / SPIKE — PRD-0031 PR1-0a-spike. THROWAWAY.
//
// Question: can shell-decompose (Approach A) fully parse a benchmark of real
// coding-scenario Bash commands into (op, path?) sequences — i.e. either
// extract concrete resource accesses, correctly widen to "any file", or
// correctly route to force-approval — for >=80% of commands?
//
// This is the GO/NO-GO gate for Approach A. If <80%, re-evaluate (tree-sitter
// or accept limitations + document). The logic here is deliberately pragmatic:
// quote-aware tokenize → split on ;, &&, ||, | → unwrap bash -c / sh -c →
// verb-classify → path-arg extract → indirect-exec detect → sensitive-file flag.
// No WASM, no native deps, no tree-sitter. This mirrors the real ToolAccesses
// shape (kind:'file', operation, path?) and resolvePathAccess op vocabulary.

export type Op = 'read' | 'write' | 'search';

export interface ParsedPath {
  readonly raw: string;
  readonly op: Op;
  readonly sensitive: boolean;
}

export interface ParsedSubcommand {
  readonly verb: string;
  readonly gitSub?: string;
  readonly paths: readonly ParsedPath[];
  readonly indirect: boolean; // eval/source/xargs/env/sudo/exec/command/`.` — force-approval
  readonly category: 'narrow' | 'broad' | 'force-approval' | 'missed';
  readonly note?: string;
}

export interface ParseResult {
  readonly subcommands: readonly ParsedSubcommand[];
  /** fullyParseable = no subcommand is 'missed'. broad/force-approval are OK by design. */
  readonly fullyParseable: boolean;
}

// ---- verb → op tables (pragmatic, real coding usage) ---------------------

const READ_VERBS = new Set([
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
  'df',
  'which',
  'whereis',
  'type',
  'pwd',
  'whoami',
  'uname',
  'echo',
  'true',
  'false',
  'date',
  'env',
  'printenv',
  'cd',
  'popd',
  'pushd',
]);
const WRITE_VERBS = new Set([
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
const SEARCH_VERBS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ack', 'ag', 'find', 'fd', 'glob']);
// interpreters: -c/-e inner code is a KNOWN BYPASS (documented), not reliably parseable
const INTERPRETER_VERBS = new Set([
  'python',
  'python3',
  'node',
  'ruby',
  'perl',
  'lua',
  'php',
  'bun',
]);
// indirect execution verbs → force-approval by design
const INDIRECT_VERBS = new Set(['eval', 'source', 'exec', 'command', 'xargs']);
const INDIRECT_SHELL = new Set(['bash', 'sh', 'zsh', 'dash']); // when not `bash -c`

// git subcommand → op
const GIT_READ = new Set([
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
const GIT_WRITE = new Set([
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

// build/test/package verbs — touch many files unpredictably (node_modules, target/, dist/)
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
const NETWORK_VERBS = new Set(['curl', 'wget', 'ssh', 'scp', 'rsync', 'ping', 'nc', 'telnet']);

// flags that consume the NEXT token as a value (not a path)
const VALUE_FLAGS: Record<string, Set<string>> = {
  git: new Set(['-m', '-C', '--message', '--reuse-message', '-S', '-L', '-X']),
  grep: new Set(['-e', '--regexp', '-A', '-B', '-C', '--color']),
  npm: new Set(['--prefix', '-g']),
  node: new Set(['-e', '--eval', '-r', '--require']),
  python: new Set(['-c', '-m', '-W']),
  cargo: new Set(['--manifest-path']),
  curl: new Set(['-o', '--output', '-H', '-d', '-X', '--data', '-u', '-A']),
};

// ---- sensitive file heuristic (replicates policies/sensitive.ts essence) --

const SENSITIVE_BASENAMES = new Set(['.env', 'id_rsa', 'id_ed25519', 'id_ecdsa', 'credentials']);
const SENSITIVE_DOT_SUFFIX = new Set([
  '.bak',
  '.old',
  '.pem',
  '.key',
  '.tmp',
  '.orig',
  '.swp',
  '.keystore',
  '.jks',
]);
const SENSITIVE_EXEMPT = new Set(['.env.example', '.env.sample', '.env.template']);
const SENSITIVE_BASE_PREFIXES = ['id_rsa', 'id_ed25519', 'id_ecdsa', 'credentials'];

function basename(p: string): string {
  const clean = p.replace(/\/+$/, '');
  const i = clean.lastIndexOf('/');
  return i < 0 ? clean : clean.slice(i + 1);
}

export function isSensitiveFile(rawPath: string): boolean {
  const b = basename(rawPath);
  if (SENSITIVE_EXEMPT.has(b)) return false;
  if (b.endsWith('.pub') && SENSITIVE_BASE_PREFIXES.some((p) => b.startsWith(p))) return false;
  if (SENSITIVE_BASENAMES.has(b)) return true;
  if (b.startsWith('.env.')) return true;
  // rename-shielded: prefix + sep + rest, OR base + sensitive dot suffix
  if (
    SENSITIVE_BASE_PREFIXES.some(
      (p) => b.startsWith(p) && (b[p.length] === '-' || b[p.length] === '_'),
    )
  )
    return true;
  const dotIdx = b.lastIndexOf('.');
  if (dotIdx > 0 && SENSITIVE_DOT_SUFFIX.has(b.slice(dotIdx))) {
    const stem = b.slice(0, dotIdx);
    if (
      SENSITIVE_BASE_PREFIXES.some(
        (p) => stem === p || stem.startsWith(p + '-') || stem.startsWith(p + '_'),
      )
    )
      return true;
  }
  // path-suffix pairs
  if (/(^|\/)\.aws\/credentials$/.test(rawPath) || /(^|\/)\.gcp\/credentials$/.test(rawPath))
    return true;
  return false;
}

// ---- tokenizer (quote-aware) ----------------------------------------------

interface Token {
  text: string;
  quoted: boolean;
}

/** Split a command string into tokens, respecting quotes. Tracks whether each
 *  token was quoted (quoted tokens are literal args, never operators). */
function tokenize(s: string): Token[] {
  const tokens: Token[] = [];
  let cur = '';
  let quoted = false;
  let quote = '';
  let hasToken = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === quote) {
        quoted = false;
      } else if (c === '\\' && i + 1 < s.length) {
        cur += s[++i];
      } else {
        cur += c;
      }
      hasToken = true;
    } else if (c === '"' || c === "'") {
      quoted = true;
      quote = c;
      hasToken = true; // a quoted segment is part of a token (e.g. a"b")
    } else if (c === '\\' && i + 1 < s.length) {
      cur += s[++i];
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

/** Split on top-level operators ;, &&, ||, | (not inside quotes). Returns the
 *  list of subcommand strings (raw, untrimmed-empty filtered). */
function splitOperators(s: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let quoted = false;
  let quote = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      cur += c;
      if (c === quote) quoted = false;
      else if (c === '\\' && i + 1 < s.length) cur += s[++i];
    } else if (c === '"' || c === "'") {
      quoted = true;
      quote = c;
      cur += c;
    } else if (c === '\\' && i + 1 < s.length) {
      cur += c + s[++i];
    } else if (c === ';') {
      parts.push(cur);
      cur = '';
    } else if ((c === '&' || c === '|') && s[i + 1] === c) {
      parts.push(cur);
      cur = '';
      i++; // consume second char
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

// ---- pathiness heuristic ---------------------------------------------------

function looksLikePath(tok: string): boolean {
  if (!tok) return false;
  if (tok.startsWith('-')) return false;
  if (/^https?:\/\//i.test(tok)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(tok)) return false; // other URL scheme
  // path-ish: contains separator, starts with ~ or ., has extension, or is a bare filename
  if (tok.startsWith('~')) return true;
  if (tok.startsWith('./') || tok.startsWith('../') || tok === '.' || tok === '..') return true;
  if (tok.includes('/')) return true;
  if (/^\.[A-Za-z]/.test(tok)) return true; // dotfile like .env
  if (/\.[a-z0-9]+$/i.test(tok)) return true; // has an extension
  return false;
}

function extractRedirectTargets(tokens: Token[]): ParsedPath[] {
  const out: ParsedPath[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].text;
    // > file, >> file, < file, 2> file, 2>&1 (skip the &1 form), &> file
    const m = t.match(/^(?:(\d)?>>|(\d)?>|<|&>|&>>)$/);
    if (m) {
      const op: Op = t.includes('<') && !t.includes('>') ? 'read' : 'write';
      const target = tokens[i + 1]?.text;
      if (target && looksLikePath(target)) {
        out.push({ raw: target, op, sensitive: isSensitiveFile(target) });
      }
    } else if (/(>>|>)$/.test(t) && t.length > 1) {
      // attached form: echo>x or cat foo>bar
      const idx = t.lastIndexOf('>');
      const op: Op = t.includes('>>') ? 'write' : 'write';
      const rest = t.slice(idx).replace(/^>+/, '');
      // token like "file>" handled above; "echo>" splits — skip complex attached cases
      void op;
      void rest;
    }
  }
  return out;
}

// ---- subcommand classification --------------------------------------------

function classifySubcommand(raw: string, cwd: string): ParsedSubcommand {
  void cwd;
  // strip leading env-assignment prefix: VAR=val VAR2=val2 cmd ...
  let work = raw;
  const assignRe = /^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/;
  while (assignRe.test(work)) work = work.replace(assignRe, '');

  const tokens = tokenize(work);
  if (tokens.length === 0) {
    return { verb: '', paths: [], indirect: false, category: 'missed', note: 'empty subcommand' };
  }

  // unwrap `sudo cmd ...` → peek next verb (sudo is a prefix; mark indirect-ish but still parse the inner)
  let idx = 0;
  let sawSudo = false;
  if (tokens[idx].text === 'sudo') {
    sawSudo = true;
    idx++;
  }

  let verb = tokens[idx].text;
  // resolve binary path to basename: /usr/bin/git → git
  const verbBase = basename(verb);

  // bash -c "..." / sh -c "..." → recurse into the quoted script
  if (INDIRECT_SHELL.has(verbBase) && tokens[idx + 1]?.text === '-c') {
    const script = tokens
      .slice(idx + 2)
      .map((t) => t.text)
      .join(' ');
    if (script) {
      const inner = parseCommand(script, cwd);
      return {
        verb: `${verbBase} -c`,
        indirect: false,
        paths: inner.subcommands.flatMap((s) => s.paths),
        category: inner.fullyParseable ? 'narrow' : 'missed',
        note: sawSudo ? 'sudo bash -c → recursed' : 'bash -c → recursed',
      };
    }
    return {
      verb: `${verbBase} -c`,
      paths: [],
      indirect: true,
      category: 'force-approval',
      note: 'empty -c script',
    };
  }

  // indirect execution verbs → force-approval by design
  if (INDIRECT_VERBS.has(verbBase) || (sawSudo && INDIRECT_VERBS.has(verbBase))) {
    return {
      verb: verbBase,
      paths: [],
      indirect: true,
      category: 'force-approval',
      note: 'indirect exec → force approval',
    };
  }
  // `.` and `source` are the same; `.` handled by INDIRECT_VERBS via alias below
  if (verbBase === '.') {
    return {
      verb: '.',
      paths: [],
      indirect: true,
      category: 'force-approval',
      note: 'source/. → force approval',
    };
  }

  // git <subcommand>
  if (verbBase === 'git' && tokens[idx + 1]) {
    return classifyGit(tokens.slice(idx), cwd);
  }

  // interpreter with -c/-e → KNOWN BYPASS, force-approval-ish (documented limitation)
  if (INTERPRETER_VERBS.has(verbBase)) {
    const flagIdx = tokens.findIndex(
      (t, i) => i > idx && (t.text === '-c' || t.text === '-e' || t.text === '--eval'),
    );
    if (flagIdx >= 0) {
      return {
        verb: verbBase,
        paths: [],
        indirect: true,
        category: 'force-approval',
        note: 'interpreter -c/-e inner code — known bypass, force approval',
      };
    }
    // `python script.py` → read/exec the script file
    const paths = extractPathArgs(verbBase, tokens.slice(idx + 1));
    return {
      verb: verbBase,
      paths,
      indirect: false,
      category: paths.length > 0 ? 'narrow' : 'broad',
      note: paths.length > 0 ? undefined : 'no script arg',
    };
  }

  // build/test/package verbs → broad (touch node_modules/target/etc unpredictably)
  if (BUILD_VERBS.has(verbBase)) {
    // but `bun test path/to/test` narrows; detect trailing path args
    const paths = extractPathArgs(verbBase, tokens.slice(idx + 1));
    return {
      verb: verbBase,
      paths,
      indirect: false,
      category: paths.length > 0 ? 'narrow' : 'broad',
      note: paths.length > 0 ? undefined : 'build/test → any-file write (broad)',
    };
  }

  if (NETWORK_VERBS.has(verbBase)) {
    return {
      verb: verbBase,
      paths: [],
      indirect: false,
      category: 'broad',
      note: 'network → no file path (broad/neutral)',
    };
  }

  // redirections add write/read paths regardless of verb
  const redirPaths = extractRedirectTargets(tokens);
  const redirTargets = new Set(redirPaths.map((p) => p.raw));

  // cd takes exactly one path arg (bare dir name allowed); subsequent
  // subcommands resolve relative paths against it
  if (verbBase === 'cd') {
    const target = tokens[idx + 1]?.text;
    if (target) {
      return {
        verb: 'cd',
        paths: [{ raw: target, op: 'search' as Op, sensitive: isSensitiveFile(target) }],
        indirect: false,
        category: 'narrow',
        note: 'cwd change — later relative paths resolve against it',
      };
    }
    return {
      verb: 'cd',
      paths: [],
      indirect: false,
      category: 'broad',
      note: 'bare cd (no target)',
    };
  }

  // classify by verb op
  let op: Op | null = null;
  if (READ_VERBS.has(verbBase)) op = 'read';
  else if (WRITE_VERBS.has(verbBase)) op = 'write';
  else if (SEARCH_VERBS.has(verbBase)) op = 'search';

  if (op) {
    const paths = [
      ...extractPathArgs(verbBase, tokens.slice(idx + 1), redirTargets),
      ...redirPaths,
    ];
    // for echo without redirect → no path
    return {
      verb: verbBase,
      paths,
      indirect: false,
      category: paths.length > 0 ? 'narrow' : 'broad',
      note: paths.length > 0 ? undefined : 'no path args',
    };
  }

  // unknown verb: still extract redirections + guess path args as read (conservative)
  const paths = redirPaths.length > 0 ? redirPaths : [];
  return {
    verb: verbBase,
    paths,
    indirect: false,
    category: 'missed',
    note: `unknown verb '${verbBase}' — ${paths.length > 0 ? 'redirects extracted' : 'no classification'}`,
  };
}

function classifyGit(tokens: Token[], cwd: string): ParsedSubcommand {
  void cwd;
  const verb = 'git';
  const sub = tokens[1]?.text;
  let gitSub: string | undefined = sub;
  // skip leading flags to find the subcommand
  let s = 1;
  while (s < tokens.length && tokens[s].text.startsWith('-')) s++;
  const realSub = tokens[s]?.text;
  gitSub = realSub;

  let op: Op | null = null;
  if (realSub && GIT_READ.has(realSub)) op = 'read';
  else if (realSub && GIT_WRITE.has(realSub)) op = 'write';

  // collect path-ish args after the subcommand (skipping value-flags)
  const valueFlags = VALUE_FLAGS['git'];
  const paths: ParsedPath[] = [];
  for (let i = s + 1; i < tokens.length; i++) {
    const t = tokens[i].text;
    if (valueFlags?.has(t)) {
      i++; // skip value
      continue;
    }
    if (t.startsWith('-')) continue;
    if (op && looksLikePath(t)) {
      paths.push({ raw: t, op, sensitive: isSensitiveFile(t) });
    }
  }

  if (!op) {
    return {
      verb,
      gitSub,
      paths: [],
      indirect: false,
      category: 'broad',
      note: `git ${realSub ?? '?'} → unknown subcommand (broad)`,
    };
  }
  return {
    verb,
    gitSub,
    paths,
    indirect: false,
    category: paths.length > 0 ? 'narrow' : 'narrow',
    note: paths.length > 0 ? undefined : `git ${realSub} (no path args)`,
  };
}

function extractPathArgs(verb: string, tokens: Token[], skip?: Set<string>): ParsedPath[] {
  const valueFlags = VALUE_FLAGS[verb];
  const op: Op = WRITE_VERBS.has(verb) ? 'write' : SEARCH_VERBS.has(verb) ? 'search' : 'read';
  const out: ParsedPath[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].text;
    if (skip?.has(t)) continue;
    if (valueFlags?.has(t)) {
      i++; // next token is a value, not a path
      continue;
    }
    if (t.startsWith('-')) continue;
    // write verbs take bare filenames by definition (file may not exist yet —
    // that's exactly why the "has extension" heuristic fails: `rm x`)
    const isPath = WRITE_VERBS.has(verb) ? t.length > 0 : looksLikePath(t);
    if (isPath) out.push({ raw: t, op, sensitive: isSensitiveFile(t) });
  }
  return out;
}

// ---- top-level parse ------------------------------------------------------

export function parseCommand(command: string, cwd = '/cwd'): ParseResult {
  const pieces = splitOperators(command);
  const subs = pieces.map((p) => classifySubcommand(p, cwd));
  const fullyParseable = subs.every((s) => s.category !== 'missed');
  return { subcommands: subs, fullyParseable };
}
