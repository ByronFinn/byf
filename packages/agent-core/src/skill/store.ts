/**
 * 工作区级 skill 管理(PRD-0036)。
 *
 * - 列表(#314):按 skill root 分别 discover(与运行时
 *   `resolveSkillRoots` + `discoverSkills` 同一扫描语义),按 全局(user)/
 *   本地(project)/ 额外(extra)/ 内置(builtin)分组返回;同名 first-wins,
 *   被遮蔽定义标注 `shadowed`。builtin/extra 与 `.agents/skills`(跨工具
 *   共享目录)只读——byf 只写 `.byf/skills`。
 * - 创建/删除(#315):模板生成 SKILL.md bundle;删除限定 user/project 的
 *   `.byf/skills`,realpath 前缀校验防路径穿越(R-C5)。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ErrorCodes, ByfError } from '#/errors';

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
  return segments.length >= 2 && segments.at(-1) === 'skills' && segments.at(-2) === '.byf';
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

// ── 创建 / 删除(#315)──────────────────────────────────────────────────────

export interface CreateSkillInput {
  readonly workDir: string;
  readonly userHomeDir: string;
  readonly scope: 'user' | 'project';
  readonly name: string;
  readonly description: string;
}

export interface CreateSkillResult {
  readonly skill: WorkspaceSkillEntry;
  /** 跨 scope 同名:允许创建,返回遮蔽方向提示(R-S2)。 */
  readonly warning?: string;
}

/** 安全的 skill 目录名:字母数字开头,仅含 [A-Za-z0-9._-],禁路径分隔/`..`。 */
const SKILL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** scope → 该 scope 的 byf 自有 skills 根(`<home>|<projectRoot>/.byf/skills`)。 */
async function scopeSkillRoot(input: {
  workDir: string;
  userHomeDir: string;
  scope: 'user' | 'project';
}): Promise<string> {
  if (input.scope === 'user') return path.join(input.userHomeDir, '.byf', 'skills');
  return path.join(await findProjectRoot(input.workDir), '.byf', 'skills');
}

/**
 * 以模板创建 SKILL.md bundle(R-S2)。同 scope 同名(normalizeSkillName,含
 * root 顶层单文件 `<name>.md` 形态)报 SKILL_ALREADY_EXISTS;跨 scope 同名
 * 允许并返回遮蔽警告。
 */
export async function createSkill(input: CreateSkillInput): Promise<CreateSkillResult> {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new ByfError(ErrorCodes.SKILL_NAME_EMPTY, 'Skill name is required');
  }
  if (!SKILL_NAME_RE.test(name) || name === '.' || name === '..') {
    throw new ByfError(
      ErrorCodes.REQUEST_INVALID,
      `Invalid skill name "${name}": must start with a letter/digit and contain only letters, digits, ".", "-", "_"`,
    );
  }
  const description = input.description.trim();
  if (description.length === 0) {
    throw new ByfError(ErrorCodes.REQUEST_INVALID, 'Skill description is required');
  }

  const root = await scopeSkillRoot(input);
  const skillDir = path.join(root, name);
  const key = normalizeSkillName(name);

  // 同 scope 同名:bundle 目录或顶层单文件任一存在即冲突。
  const bundleMd = path.join(skillDir, 'SKILL.md');
  const flatMd = path.join(root, `${name}.md`);
  for (const candidate of [bundleMd, flatMd]) {
    let exists = false;
    try {
      await fs.access(candidate);
      exists = true;
    } catch {
      exists = false;
    }
    if (exists) {
      throw new ByfError(
        ErrorCodes.SKILL_ALREADY_EXISTS,
        `Skill "${name}" already exists in ${root}`,
      );
    }
  }

  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(bundleMd, renderSkillTemplate(name, description), 'utf-8');

  // 跨 scope 同名提示:project 新建遮蔽 user;user 新建被 project 遮蔽。
  const otherScope = input.scope === 'user' ? 'project' : 'user';
  const otherRoot = await scopeSkillRoot({ ...input, scope: otherScope });
  let warning: string | undefined;
  try {
    const other = await discoverSkills({ roots: [{ path: otherRoot, source: otherScope }] });
    if (other.some((skill) => normalizeSkillName(skill.name) === key)) {
      warning =
        input.scope === 'project'
          ? `已存在全局同名 skill「${name}」,本地新建的 skill 将在会话中遮蔽它`
          : `已存在本地同名 skill「${name}」,新建的全局 skill 将被其遮蔽`;
    }
  } catch {
    // 对侧根不可读(如目录不存在)→ 无冲突信息,不阻塞创建。
  }

  return {
    skill: {
      name,
      description,
      path: bundleMd,
      dir: skillDir,
      source: input.scope,
      writable: true,
    },
    ...(warning !== undefined ? { warning } : {}),
  };
}

function renderSkillTemplate(name: string, description: string): string {
  return `---
name: ${name}
description: ${description}
---

# ${name}

${description}

## When to use

- TODO: 描述何时应使用该 skill。

## Steps

1. TODO: 具体步骤。
`;
}

export interface RemoveSkillInput {
  readonly workDir: string;
  readonly userHomeDir: string;
  /**
   * 待删 skill 的 SKILL.md(bundle)或顶层单文件路径(来自列表条目)。
   * bundle → 删除所在目录;单文件 → 删除文件本身。
   */
  readonly skillPath: string;
}

/**
 * 删除 skill(R-S3/R-C5):realpath 规范化后必须严格落在允许根(user /
 * project 的 `.byf/skills`)之内——builtin/extra/`.agents` 一律拒绝,防路径
 * 穿越。支持目录 bundle 与 root 顶层单文件两种形态。
 */
export async function removeSkill(input: RemoveSkillInput): Promise<void> {
  const allowedRoots = [
    await scopeSkillRoot({ ...input, scope: 'user' }),
    await scopeSkillRoot({ ...input, scope: 'project' }),
  ];
  const resolvedRoots = await Promise.all(
    allowedRoots.map((root) => fs.realpath(root).catch(() => null)),
  );

  const isBundle = path.basename(input.skillPath) === 'SKILL.md';
  const target = isBundle ? path.dirname(input.skillPath) : input.skillPath;
  let resolvedTarget: string;
  try {
    resolvedTarget = await fs.realpath(target);
  } catch {
    throw new ByfError(ErrorCodes.SKILL_NOT_FOUND, `Skill path not found: ${input.skillPath}`);
  }

  const insideAllowed = resolvedRoots.some(
    (root) => root !== null && isStrictlyInside(resolvedTarget, root),
  );
  if (!insideAllowed) {
    throw new ByfError(
      ErrorCodes.REQUEST_INVALID,
      `Refusing to delete skill outside .byf/skills roots: ${input.skillPath}`,
    );
  }
  // 形态校验:bundle 目录须含 SKILL.md;单文件须为 .md。
  if (isBundle) {
    await fs.access(path.join(resolvedTarget, 'SKILL.md'));
  } else if (!resolvedTarget.endsWith('.md')) {
    throw new ByfError(ErrorCodes.REQUEST_INVALID, `Not a skill file: ${input.skillPath}`);
  }

  await fs.rm(resolvedTarget, { recursive: true, force: true });
}

/** child 是否严格位于 parent 内(排除 parent 本身),均已 realpath 规范化。 */
function isStrictlyInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}
