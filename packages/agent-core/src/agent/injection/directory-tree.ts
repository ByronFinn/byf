import * as posixPath from 'node:path/posix';
import * as win32Path from 'node:path/win32';

import type { Kaos } from '@byfriends/kaos';

import type { Agent } from '..';
import {
  LIST_DIR_CHILD_WIDTH,
  LIST_DIR_ROOT_WIDTH,
} from '../../tools/support/list-directory';
import { DynamicInjector } from './injector';

const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.vite',
  'target',
  '.turbo',
  'coverage',
  '.cache',
  '.DS_Store',
  '.idea',
  '.vscode',
  'venv',
  '.venv',
]);

const HIDDEN_DIR_WHITELIST = new Set([
  '.github',
  '.byf',
  '.agents',
  '.changeset',
  '.husky',
]);

interface Entry {
  readonly name: string;
  readonly isDir: boolean;
}

export class DirectoryTreeInjector extends DynamicInjector {
  protected override readonly injectionVariant = 'directory_tree';

  private lastTree: string | undefined;
  private hasInjected = false;
  private capturedTimestamp: string | undefined;

  protected override async getInjection(): Promise<string | undefined> {
    const kaos = this.agent.runtime.kaos;
    const workDir = this.agent.config.cwd || kaos.getcwd();
    const tree = await buildTree(kaos, workDir);

    if (this.hasInjected && tree === this.lastTree) {
      return undefined;
    }

    this.lastTree = tree;
    this.hasInjected = true;
    if (this.capturedTimestamp === undefined) {
      this.capturedTimestamp = new Date().toISOString();
    }
    return `Current working directory structure (${workDir}):\n${tree}\n\nThe current date and time in ISO format is \`${this.capturedTimestamp}\`. This is only a reference for you when searching the web or checking file modification time, etc. If you need the exact time, use Bash tool with proper command.`;
  }
}

async function buildTree(kaos: Kaos, workDir: string): Promise<string> {
  const lines: string[] = [];
  const pathClass = kaos.pathClass();
  const { entries, total, readable } = await collectEntries(
    kaos,
    workDir,
    LIST_DIR_ROOT_WIDTH,
    pathClass,
  );
  if (!readable) return '[not readable]';
  const remaining = total - entries.length;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry === undefined) continue;
    const { name, isDir } = entry;
    const isLast = i === entries.length - 1 && remaining === 0;
    const connector = isLast ? '└── ' : '├── ';

    if (isDir) {
      lines.push(`${connector}${name}/`);
      const childPrefix = isLast ? '    ' : '│   ';
      const childDir = joinPath(workDir, name, pathClass);
      const child = await collectEntries(kaos, childDir, LIST_DIR_CHILD_WIDTH, pathClass);
      if (!child.readable) {
        lines.push(`${childPrefix}└── [not readable]`);
        continue;
      }
      const childRemaining = child.total - child.entries.length;
      for (let j = 0; j < child.entries.length; j++) {
        const ce = child.entries[j];
        if (ce === undefined) continue;
        const cIsLast = j === child.entries.length - 1 && childRemaining === 0;
        const cConnector = cIsLast ? '└── ' : '├── ';
        const suffix = ce.isDir ? '/' : '';
        lines.push(`${childPrefix}${cConnector}${ce.name}${suffix}`);
      }
      if (childRemaining > 0) {
        lines.push(`${childPrefix}└── ... and ${String(childRemaining)} more`);
      }
    } else {
      lines.push(`${connector}${name}`);
    }
  }

  if (remaining > 0) {
    lines.push(`└── ... and ${String(remaining)} more entries`);
  }

  return lines.length > 0 ? lines.join('\n') : '(empty directory)';
}

async function collectEntries(
  kaos: Kaos,
  dirPath: string,
  maxWidth: number,
  pathClass: 'posix' | 'win32',
): Promise<{ entries: Entry[]; total: number; readable: boolean }> {
  const all: Entry[] = [];
  try {
    for await (const fullPath of kaos.iterdir(dirPath)) {
      const name = basename(fullPath, pathClass);
      if (shouldExclude(name)) continue;
      let isDir = false;
      try {
        const st = await kaos.stat(fullPath);
        isDir = (st.stMode & 0o170000) === 0o040000;
      } catch {
        // Unreadable entries keep isDir=false; still list the name.
      }
      all.push({ name, isDir });
    }
  } catch {
    return { entries: [], total: 0, readable: false };
  }
  all.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { entries: all.slice(0, maxWidth), total: all.length, readable: true };
}

function shouldExclude(name: string): boolean {
  if (EXCLUDED_DIRS.has(name)) return true;
  if (name.startsWith('.') && !HIDDEN_DIR_WHITELIST.has(name)) return true;
  return false;
}

function pathMod(pathClass: 'posix' | 'win32'): typeof posixPath {
  return pathClass === 'win32' ? win32Path : posixPath;
}

function basename(p: string, pathClass: 'posix' | 'win32'): string {
  return pathMod(pathClass).basename(p);
}

function joinPath(parent: string, child: string, pathClass: 'posix' | 'win32'): string {
  return pathMod(pathClass).join(parent, child);
}
