/**
 * 工作区级 skill 管理(PRD-0036)。
 *
 * 列表:按 skill root 分别 discover(与运行时 `resolveSkillRoots` +
 * `discoverSkills` 同一扫描语义),按 全局(user)/ 本地(project)/ 额外
 * (extra)/ 内置(builtin)分组返回;同名 first-wins,被遮蔽定义标注
 * `shadowed`。builtin/extra 与 `.agents/skills`(跨工具共享目录)只读——
 * byf 只写 `.byf/skills`。
 */
import path from 'node:path';

import { discoverSkills, findProjectRoot, resolveSkillRoots } from './scanner';
import type { SkillDefinition, SkillSource } from './types';
import { normalizeSkillName } from './types';

export type SkillGroupScope = SkillSource;

export interface WorkspaceSkillEntry {
  readonly name: string;
  readonly description: string;
  /** SKILL.md(bundle)或 root 顶层单文件(<name>.md)的绝对路径。 */
  readonly path: string;
  readonly dir: string;
  readonly source: SkillSource;
  /** 同名 first-wins 的败者:该定义不会在会话中生效(被更靠前的 root 遮蔽)。 */
  readonly shadowed?: boolean;
  /** 所在 root 是否可写(仅 user/project 的 `.byf/skills`;`.agents` 只读)。 */
  readonly writable: boolean;
}

export interface WorkspaceSkillRoot {
  readonly path: string;
  readonly source: SkillSource;
  readonly writable: boolean;
}

export interface WorkspaceSkillGroup {
  readonly scope: SkillGroupScope;
  readonly roots: readonly WorkspaceSkillRoot[];
  readonly skills: readonly WorkspaceSkillEntry[];
}

export interface WorkspaceSkillListing {
  readonly userHomeDir: string;
  /** skill 的本地根 = 最近 `.git` 祖先(可能与 MCP 的本地根不同,R-N4)。 */
  readonly projectRoot: string;
  readonly groups: readonly WorkspaceSkillGroup[];
}

export interface ListWorkspaceSkillsInput {
  readonly workDir: string;
  readonly userHomeDir: string;
  readonly extraDirs?: readonly string[];
  readonly mergeAllAvailableSkills?: boolean;
  readonly builtinDir?: string;
}

/** root 是否为 byf 自有可写目录(`<base>/.byf/skills`);`.agents` 等只读。 */
function isWritableRoot(rootPath: string): boolean {
  const segments = rootPath.split(path.sep).filter((s) => s.length > 0);
  return (
    segments.length >= 2 &&
    segments.at(-1) === 'skills' &&
    segments.at(-2) === '.byf'
  );
}

/**
 * 工作区级 skill 枚举:逐 root discover 后按 normalizeSkillName 合并,
 * 跨 root 同名 first-wins(与运行时加载语义一致——root 顺序即遮蔽顺序:
 * project 先于 user,`.byf` 先于 `.agents`)。
 */
export async function listWorkspaceSkills(
  input: ListWorkspaceSkillsInput,
): Promise<WorkspaceSkillListing> {
  const roots = await resolveSkillRoots({
    paths: { userHomeDir: input.userHomeDir, workDir: input.workDir },
    extraDirs: input.extraDirs,
    mergeAllAvailableSkills: input.mergeAllAvailableSkills,
    ...(input.builtinDir !== undefined ? { builtinDir: input.builtinDir } : {}),
  });
  const projectRoot = await findProjectRoot(input.workDir);

  interface MutableGroup {
    roots: WorkspaceSkillRoot[];
    skills: WorkspaceSkillEntry[];
  }
  const groups = new Map<SkillGroupScope, MutableGroup>();
  const ensureGroup = (scope: SkillGroupScope): MutableGroup => {
    const existing = groups.get(scope);
    if (existing !== undefined) return existing;
    const created: MutableGroup = { roots: [], skills: [] };
    groups.set(scope, created);
    return created;
  };

  const seen = new Set<string>();
  for (const root of roots) {
    const group = ensureGroup(root.source);
    const writable = isWritableRoot(root.path);
    group.roots.push({ path: root.path, source: root.source, writable });
    const discovered = await discoverSkills({
      roots: [root],
    });
    for (const skill of discovered) {
      const key = normalizeSkillName(skill.name);
      const shadowed = seen.has(key);
      seen.add(key);
      group.skills.push(toEntry(skill, writable, shadowed));
    }
  }

  return {
    userHomeDir: input.userHomeDir,
    projectRoot,
    groups: [...groups.entries()].map(([scope, group]) => ({
      scope,
      roots: group.roots,
      skills: group.skills,
    })),
  };
}

function toEntry(
  skill: SkillDefinition,
  writable: boolean,
  shadowed: boolean,
): WorkspaceSkillEntry {
  return {
    name: skill.name,
    description: skill.description,
    path: skill.path,
    dir: skill.dir,
    source: skill.source,
    writable,
    ...(shadowed ? { shadowed: true } : {}),
  };
}
