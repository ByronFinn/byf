/**
 * Marker-based git work-tree detection. Never spawns `git`; failures return
 * null so callers can fall back to their safer path.
 */

import * as posixPath from 'node:path/posix';
import * as win32Path from 'node:path/win32';

import type { Kaos } from '@byfriends/kaos';

import type { PathClass } from '../policies/path-access';

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;
const S_IFREG = 0o100000;

export interface GitWorkTreeMarker {
  readonly dotGitPath: string;
  readonly controlDirPath: string;
}

function pathMod(pathClass: PathClass): typeof posixPath {
  return pathClass === 'win32' ? win32Path : posixPath;
}

export async function findGitWorkTreeMarker(
  kaos: Kaos,
  cwd: string,
): Promise<GitWorkTreeMarker | null> {
  const pathClass = kaos.pathClass();
  const mod = pathMod(pathClass);
  if (cwd.length === 0 || !mod.isAbsolute(cwd)) return null;

  let current = mod.normalize(cwd);
  for (let depth = 0; depth < 256; depth += 1) {
    const dotGitPath = mod.join(current, '.git');
    const hit = await probeGitMarker(kaos, dotGitPath, current, pathClass);
    if (hit !== null) return hit;

    const parent = mod.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

async function probeGitMarker(
  kaos: Kaos,
  dotGitPath: string,
  markerParent: string,
  pathClass: PathClass,
): Promise<GitWorkTreeMarker | null> {
  let stat: Awaited<ReturnType<Kaos['stat']>>;
  try {
    stat = await kaos.stat(dotGitPath);
  } catch {
    return null;
  }

  if (isMode(stat.stMode, S_IFDIR)) return { dotGitPath, controlDirPath: dotGitPath };
  if (!isMode(stat.stMode, S_IFREG)) return null;

  let content: string;
  try {
    content = await kaos.readText(dotGitPath);
  } catch {
    return null;
  }
  const controlDirPath = parseGitDir(content, markerParent, pathClass);
  return controlDirPath === undefined ? null : { dotGitPath, controlDirPath };
}

function isMode(stMode: number, mode: number): boolean {
  return (stMode & S_IFMT) === mode;
}

/** Drop UTF-8 BOM and any leading whitespace (incl. `\r\n`) before content checks. */
function stripLeadingNoise(content: string): string {
  let s = content;
  if (s.codePointAt(0) === 0xfeff) s = s.slice(1);
  return s.trimStart();
}

function parseGitDir(
  content: string,
  markerParent: string,
  pathClass: PathClass,
): string | undefined {
  const line = stripLeadingNoise(content).split(/\r?\n/, 1)[0]?.trim();
  if (line === undefined || !line.startsWith('gitdir:')) return undefined;

  const rawPath = line.slice('gitdir:'.length).trim();
  if (rawPath.length === 0) return undefined;

  const mod = pathMod(pathClass);
  const absolute = mod.isAbsolute(rawPath) ? rawPath : mod.join(markerParent, rawPath);
  return mod.normalize(absolute);
}
