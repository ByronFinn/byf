/**
 * 供 explore subagent 使用的 Git 仓库上下文。
 *
 * `collectGitContext` 生成一个 `<git-context>` 块,前置到全新 explore subagent
 * 的提示词中,使其在搜索前能在仓库中定位自己。每条 git 命令都单独防护——
 * 单次失败不会中止整个收集——远程 URL 会被清洗,内部基础设施不会暴露给模型。
 */

import type { Readable } from 'node:stream';

import type { Kaos } from '@byfriends/kaos';

const GIT_TIMEOUT_MS = 5_000;
const MAX_DIRTY_FILES = 20;
const MAX_COMMIT_LINE_LENGTH = 200;

// Well-known public hosts whose remote URLs are safe to surface. Self-hosted
// or unrecognized hosts are excluded to avoid leaking internal infrastructure.
const ALLOWED_HOSTS = [
  'github.com',
  'gitlab.com',
  'gitee.com',
  'bitbucket.org',
  'codeberg.org',
  'git.sr.ht',
] as const;

/**
 * 为 explore agent 收集 git 上下文。
 *
 * 返回格式化后的 `<git-context>` 块;目录不是 git 仓库或未收集到有用信息时
 * 返回空字符串。
 */
export async function collectGitContext(kaos: Kaos, cwd: string): Promise<string> {
  // Quick check: is this a git repo?
  if ((await runGit(kaos, cwd, ['rev-parse', '--is-inside-work-tree'])) === null) {
    return '';
  }

  const [remoteUrl, branch, dirtyRaw, logRaw] = await Promise.all([
    runGit(kaos, cwd, ['remote', 'get-url', 'origin']),
    runGit(kaos, cwd, ['branch', '--show-current']),
    runGit(kaos, cwd, ['status', '--porcelain']),
    runGit(kaos, cwd, ['log', '-3', '--format=%h %s']),
  ]);

  const sections: string[] = [`Working directory: ${cwd}`];

  if (remoteUrl) {
    const safeUrl = sanitizeRemoteUrl(remoteUrl);
    if (safeUrl) {
      sections.push(`Remote: ${safeUrl}`);
      // Derive the project slug only from an allowed remote — deriving it from
      // a rejected host would leak an internal owner/repo into the prompt.
      const project = parseProjectName(safeUrl);
      if (project) sections.push(`Project: ${project}`);
    }
  }

  if (branch) sections.push(`Branch: ${branch}`);

  if (dirtyRaw !== null) {
    const dirtyLines = dirtyRaw.split('\n').filter((line) => line.trim().length > 0);
    if (dirtyLines.length > 0) {
      const total = dirtyLines.length;
      const shown = dirtyLines.slice(0, MAX_DIRTY_FILES);
      let body = shown.map((line) => `  ${line}`).join('\n');
      if (total > MAX_DIRTY_FILES) {
        body += `\n  ... and ${String(total - MAX_DIRTY_FILES)} more`;
      }
      sections.push(`Dirty files (${String(total)}):\n${body}`);
    }
  }

  if (logRaw) {
    const logLines = logRaw.split('\n').filter((line) => line.trim().length > 0);
    if (logLines.length > 0) {
      const body = logLines.map((line) => `  ${line.slice(0, MAX_COMMIT_LINE_LENGTH)}`).join('\n');
      sections.push(`Recent commits:\n${body}`);
    }
  }

  if (sections.length <= 1) {
    // Only the working directory line — nothing useful collected.
    return '';
  }

  return `<git-context>\n${sections.join('\n')}\n</git-context>`;
}

/**
 * 若远程 URL 指向知名公共主机则返回之,并从 HTTPS URL 中剥离凭据。
 * 无法识别的主机返回 `null`。
 */
export function sanitizeRemoteUrl(remoteUrl: string): string | null {
  // SSH format: git@host:owner/repo.git — no credentials possible.
  for (const host of ALLOWED_HOSTS) {
    if (remoteUrl.startsWith(`git@${host}:`)) return remoteUrl;
  }

  // HTTPS format: parse the hostname exactly and drop any userinfo.
  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return null;
  }
  if ((ALLOWED_HOSTS as readonly string[]).includes(parsed.hostname)) {
    const port = parsed.port ? `:${parsed.port}` : '';
    return `https://${parsed.hostname}${port}${parsed.pathname}`;
  }

  return null;
}

/**
 * 从 git 远程 URL 提取项目路径——`owner/repo`,嵌套命名空间(如 GitLab 子组)
 * 则为完整的 `group/subgroup/repo`。支持 scp 风格 SSH(`git@host:path`)
 * 与 URL 形式(`https://`、`ssh://`)。
 */
export function parseProjectName(remoteUrl: string): string | null {
  // scp-like SSH (`git@host:owner/.../repo.git`) is not a valid URL — match it
  // directly; everything else goes through URL parsing. The whole path is kept
  // so nested namespaces survive.
  const scp = /^[^/]+@[^/:]+:(.+)$/.exec(remoteUrl);
  const rawPath = scp?.[1] ?? tryUrlPath(remoteUrl);
  if (rawPath === null) return null;
  const project = rawPath
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  return project.length > 0 ? project : null;
}

function tryUrlPath(remoteUrl: string): string | null {
  try {
    return new URL(remoteUrl).pathname;
  } catch {
    return null;
  }
}

/**
 * Run a single `git -C <cwd> <args>` command and return its trimmed stdout,
 * or `null` on any failure (spawn error, non-zero exit, or timeout). The
 * `git -C` form runs in the target directory regardless of the Kaos backend.
 */
async function runGit(kaos: Kaos, cwd: string, args: readonly string[]): Promise<string | null> {
  let proc;
  try {
    proc = await kaos.exec('git', '-C', cwd, ...args);
  } catch {
    return null;
  }

  try {
    proc.stdin.end();
  } catch {
    /* stdin already closed */
  }

  const work = Promise.all([collectStream(proc.stdout), proc.wait()]);
  // Attach a rejection handler up front: if `work` rejects during the
  // timeout-handling window (before the catch block re-awaits it), Node must
  // not flag it as an unhandled rejection.
  work.catch(() => {});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`git ${args.join(' ')} timed out`));
      }, GIT_TIMEOUT_MS);
    });
    const [stdout, exitCode] = await Promise.race([work, timeout]);
    if (exitCode !== 0) return null;
    return stdout.trim();
  } catch {
    try {
      await proc.kill('SIGKILL');
    } catch {
      /* process already gone */
    }
    // Let the stdout drain settle so the process resources are released,
    // even though the timed-out output is discarded.
    await work.catch(() => {});
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function collectStream(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf-8');
}
