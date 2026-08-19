import type { SkillSummary } from '#/types';

/**
 * 用户可经 slash 命令激活的 skill 类型(语义与 TUI `isUserActivatableSkill`
 * 一致:inline 类(prompt/inline/未声明)与 flow;builtin/tool 等仅供模型调用,
 * 不进入用户命令面板)。
 */
export function isUserActivatableSkill(skill: SkillSummary): boolean {
  return (
    skill.type === undefined ||
    skill.type === 'prompt' ||
    skill.type === 'inline' ||
    skill.type === 'flow'
  );
}

/** 过滤出可进 slash 面板的 skills,按名称排序(面板内稳定顺序)。 */
export function userActivatableSkills(skills: readonly SkillSummary[]): SkillSummary[] {
  return skills.filter(isUserActivatableSkill).toSorted((a, b) => a.name.localeCompare(b.name));
}
