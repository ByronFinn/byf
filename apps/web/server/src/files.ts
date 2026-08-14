/**
 * 作用域白名单文件端点(PRD-0034 R-C2 / ADR-0036 D2)。
 *
 * 只读;realpath 规范化后必须命中白名单前缀:
 * 1. 已注册工作区根(注册表非 hidden ∪ session_index 出现过的 workDir,
 *    与 GET /api/workspaces 同一动态集合);
 * 2. BYF_HOME/sessions 下任意会话目录的 media-originals(媒体原档缓存)。
 *
 * 护栏:相对路径段「..」与 symlink 穿越拒 403;目录 400;文本 ≤2MB(JSON +
 * 语言猜测供 Shiki)、媒体 ≤50MB、视频 HTTP Range(206);ETag(mtime+size)缓存。
 */
import { stat, realpath } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import type { Context } from 'hono';

import { WorkspaceRegistry, listIndexedWorkDirs } from './workspace-registry';

export const TEXT_LIMIT_BYTES = 2 * 1024 * 1024;
export const MEDIA_LIMIT_BYTES = 50 * 1024 * 1024;

/** 文本扩展名 → Shiki 语言 id(未知文本扩展名 → text)。 */
const TEXT_LANGUAGES: Record<string, string> = {
  ts: 'ts',
  mts: 'ts',
  cts: 'ts',
  tsx: 'tsx',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  md: 'md',
  markdown: 'md',
  mdx: 'mdx',
  py: 'python',
  pyi: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  ini: 'ini',
  conf: 'ini',
  xml: 'xml',
  svg: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sql: 'sql',
  lua: 'lua',
  vim: 'vim',
  txt: 'text',
  log: 'text',
  env: 'ini',
  gitignore: 'text',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
};

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  pdf: 'application/pdf',
};

/** 与 GET /api/workspaces 相同的动态白名单集合(不含 hidden 工作区)。 */
export async function collectFileScopeRoots(homeDir: string): Promise<string[]> {
  const registry = new WorkspaceRegistry(homeDir);
  const registered = await registry.list();
  const hidden = new Set(await registry.hidden());
  const indexed = (await listIndexedWorkDirs(homeDir)).filter((dir) => !hidden.has(dir));
  const roots = new Set<string>();
  for (const dir of [...registered, ...indexed]) roots.add(resolve(dir));
  return [...roots];
}

async function isInsideMediaOriginals(resolvedPath: string, homeDir: string): Promise<boolean> {
  const sessionsRoot = await realpath(join(homeDir, 'sessions')).catch(() => undefined);
  if (sessionsRoot === undefined) return false;
  const rel = relative(sessionsRoot, resolvedPath);
  if (rel.startsWith('..') || rel.length === 0) return false;
  return rel.split(sep).includes('media-originals');
}

async function isPathInScope(resolvedPath: string, homeDir: string): Promise<boolean> {
  const roots = await collectFileScopeRoots(homeDir);
  for (const root of roots) {
    const realRoot = await realpath(root).catch(() => undefined);
    if (realRoot === undefined) continue;
    const rel = relative(realRoot, resolvedPath);
    // 位于根之内或即根本身(根是目录,由后续目录检查拒绝;escaped 路径以 .. 开头)。
    if (rel.length >= 0 && !rel.startsWith('..') && !rel.startsWith(sep)) return true;
  }
  return isInsideMediaOriginals(resolvedPath, homeDir);
}

function etagOf(mtimeMs: number, size: number): string {
  return `"${Math.floor(mtimeMs)}-${size}"`;
}

function ifNoneMatchHits(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  return header
    .split(',')
    .map((candidate) => candidate.trim().replace(/^W\//, ''))
    .some((candidate) => candidate === etag || candidate === '*');
}

/** 解析 `bytes=start-end` / `bytes=start-`;非法返回 undefined(忽略 Range)。 */
function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | undefined {
  if (header === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return undefined;
  const rawStart = match[1] ?? '';
  const rawEnd = match[2] ?? '';
  if (rawStart.length === 0) return undefined; // suffix 形式不支持,忽略
  const start = Number.parseInt(rawStart, 10);
  if (!Number.isSafeInteger(start) || start < 0 || start >= size) return undefined;
  const end = rawEnd.length === 0 ? size - 1 : Math.min(Number.parseInt(rawEnd, 10), size - 1);
  if (end < start) return undefined;
  return { start, end };
}

function extKey(path: string): string {
  const base = path.split(sep).pop() ?? path;
  const dot = base.lastIndexOf('.');
  if (dot <= 0) return base.toLowerCase(); // 无扩展名 → 用文件名(Dockerfile/Makefile)
  return base.slice(dot + 1).toLowerCase();
}

/**
 * GET /api/files 处理器。检查顺序:参数 → 作用域(403,不泄漏白名单外文件
 * 是否存在)→ 存在性(404)→ 目录(400)→ 类型限额(413)→ ETag(304)→ 内容。
 */
export async function serveScopedFile(
  c: Context,
  homeDir: string,
  rawPath: string,
): Promise<Response> {
  if (rawPath.length === 0) {
    return c.json({ error: 'path query is required', code: 'BAD_REQUEST' }, 400);
  }

  // realpath 解析 symlink;文件不存在时退回「父目录 realpath + basename」,
  // 保证与白名单根的规范化一致(如 macOS 的 /var 与 /private/var)。
  const resolved = await realpath(rawPath).catch(async () => {
    const parent = await realpath(dirname(rawPath)).catch(() => resolve(dirname(rawPath)));
    return join(parent, basename(rawPath));
  });
  if (!(await isPathInScope(resolved, homeDir))) {
    return c.json({ error: 'path is outside the allowed scope', code: 'FORBIDDEN' }, 403);
  }

  let info;
  try {
    info = await stat(resolved);
  } catch {
    return c.json({ error: 'file not found', code: 'NOT_FOUND' }, 404);
  }
  if (info.isDirectory()) {
    return c.json({ error: 'path is a directory', code: 'BAD_REQUEST' }, 400);
  }

  const ext = extKey(resolved);
  const isText = ext in TEXT_LANGUAGES;
  const contentType = MEDIA_TYPES[ext] ?? 'application/octet-stream';
  const limit = isText ? TEXT_LIMIT_BYTES : MEDIA_LIMIT_BYTES;
  if (info.size > limit) {
    return c.json(
      { error: `file exceeds the ${limit} byte limit`, code: 'PAYLOAD_TOO_LARGE' },
      413,
    );
  }

  const etag = etagOf(info.mtimeMs, info.size);
  if (ifNoneMatchHits(c.req.header('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers: { etag } });
  }

  if (isText) {
    const file = Bun.file(resolved);
    const content = await file.text();
    return c.json(
      {
        path: resolved,
        kind: 'text',
        language: TEXT_LANGUAGES[ext] ?? 'text',
        content,
      },
      200,
      { etag },
    );
  }

  const headers = new Headers({
    'content-type': contentType,
    'accept-ranges': 'bytes',
    etag,
  });
  const range = contentType.startsWith('video/')
    ? parseRange(c.req.header('range'), info.size)
    : undefined;
  if (range !== undefined) {
    const blob = Bun.file(resolved).slice(range.start, range.end + 1);
    headers.set('content-range', `bytes ${range.start}-${range.end}/${info.size}`);
    return new Response(blob, { status: 206, headers });
  }
  return new Response(Bun.file(resolved), { status: 200, headers });
}
