import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const WORKSPACES_FILE = 'workspaces.json';
/** session_index.jsonl 行格式与 agent-core 的 SessionIndexEntry 对齐(仅读 workDir)。 */
const SESSION_INDEX_FILE = 'session_index.jsonl';

/**
 * 注册表数据:`order` = 显式添加顺序;`hidden` = 用户删除过的工作区。
 * 删除 = 加入 hidden(会话数据保留,侧边栏不再展示);重新添加 = 从 hidden
 * 移除并恢复原顺序位置。若无 hidden,`list()` 即 `order`。
 */
interface RegistryData {
  order: string[];
  hidden: string[];
}

/**
 * 工作区注册表:`<byf-home>/workspaces.json`。显式添加的工作区(即使没有
 * 会话)在此登记;会话索引里出现但未登记的 workDir 由路由层补入枚举结果。
 * 写为原子替换,损坏时视为空表。
 */
export class WorkspaceRegistry {
  constructor(readonly homeDir: string) {}

  private get file(): string {
    return join(this.homeDir, WORKSPACES_FILE);
  }

  /** 注册表中的工作区路径(hidden 已排除,顺序即添加顺序)。 */
  async list(): Promise<string[]> {
    const data = await this.read();
    const hidden = new Set(data.hidden);
    return data.order.filter((p) => !hidden.has(p));
  }

  /** 用户删除过的工作区(路由层用于从索引枚举中同样排除)。 */
  async hidden(): Promise<string[]> {
    const data = await this.read();
    return [...data.hidden];
  }

  /** 登记一个工作区(幂等;曾删除的重新登记会恢复原位置)。 */
  async add(workDir: string): Promise<string[]> {
    const data = await this.read();
    const hidden = data.hidden.filter((p) => p !== workDir);
    if (!data.order.includes(workDir)) data.order.push(workDir);
    await this.write({ order: data.order, hidden });
    return data.order.filter((p) => !hidden.includes(p));
  }

  /** 移除一个工作区登记(不删会话;加入 hidden,索引枚举不再把它带回来)。 */
  async remove(workDir: string): Promise<boolean> {
    const data = await this.read();
    if (!data.order.includes(workDir) || data.hidden.includes(workDir)) return false;
    await this.write({ order: data.order, hidden: [...data.hidden, workDir] });
    return true;
  }

  private async read(): Promise<RegistryData> {
    let raw: string;
    try {
      raw = await readFile(this.file, 'utf-8');
    } catch {
      return { order: [], hidden: [] };
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      // 旧格式(纯路径数组)兼容:整体视为 order。
      if (Array.isArray(parsed)) {
        return { order: toPaths(parsed), hidden: [] };
      }
      if (typeof parsed === 'object' && parsed !== null) {
        const obj = parsed as { order?: unknown; hidden?: unknown };
        return {
          order: Array.isArray(obj.order) ? toPaths(obj.order) : [],
          hidden: Array.isArray(obj.hidden) ? toPaths(obj.hidden) : [],
        };
      }
      return { order: [], hidden: [] };
    } catch {
      return { order: [], hidden: [] };
    }
  }

  private async write(data: RegistryData): Promise<void> {
    await mkdir(this.homeDir, { recursive: true, mode: 0o700 });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    await rename(tmp, this.file);
  }
}

function toPaths(raw: unknown[]): string[] {
  return raw.filter((p): p is string => typeof p === 'string' && p.length > 0);
}

/** 会话索引里出现过的全部 workDir(去重,顺序为索引出现顺序)。 */
export async function listIndexedWorkDirs(homeDir: string): Promise<string[]> {
  let raw: string;
  try {
    raw = await readFile(join(homeDir, SESSION_INDEX_FILE), 'utf-8');
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const entry = JSON.parse(trimmed) as { workDir?: unknown };
      const workDir = entry.workDir;
      if (typeof workDir !== 'string' || workDir.length === 0) continue;
      if (seen.has(workDir)) continue;
      seen.add(workDir);
      dirs.push(workDir);
    } catch {
      // 跳过损坏行
    }
  }
  return dirs;
}

/** 经 session_index 反查一个会话的 workDir(找不到返回 undefined)。 */
export async function findSessionWorkDir(
  homeDir: string,
  sessionId: string,
): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await readFile(join(homeDir, SESSION_INDEX_FILE), 'utf-8');
  } catch {
    return undefined;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const entry = JSON.parse(trimmed) as { sessionId?: unknown; workDir?: unknown };
      if (entry.sessionId === sessionId && typeof entry.workDir === 'string') {
        return entry.workDir;
      }
    } catch {
      // 跳过损坏行
    }
  }
  return undefined;
}

/** 工作区显示名:目录 basename;无 basename 时回退为完整路径。 */
export function workspaceTitle(workDir: string): string {
  const base = basename(workDir.replace(/[/\\]+$/, ''));
  return base.length > 0 ? base : workDir;
}
