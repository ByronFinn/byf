import { describe, expect, test } from 'bun:test';

import { isUserActivatableSkill, userActivatableSkills } from '../src/lib/skills';
import type { SkillSummary } from '../src/types';

function skill(name: string, type?: string): SkillSummary {
  return { name, description: `desc-${name}`, path: `/skills/${name}`, source: 'builtin', type };
}

describe('isUserActivatableSkill', () => {
  test('inline 类(未声明 / prompt / inline / flow)可经 slash 激活', () => {
    expect(isUserActivatableSkill(skill('a'))).toBe(true);
    expect(isUserActivatableSkill(skill('b', 'prompt'))).toBe(true);
    expect(isUserActivatableSkill(skill('c', 'inline'))).toBe(true);
    expect(isUserActivatableSkill(skill('d', 'flow'))).toBe(true);
  });

  test('builtin / tool 等类型仅供模型调用,不进入用户命令面板', () => {
    expect(isUserActivatableSkill(skill('e', 'builtin'))).toBe(false);
    expect(isUserActivatableSkill(skill('f', 'tool'))).toBe(false);
  });
});

describe('userActivatableSkills', () => {
  test('只保留可激活项并按名称排序(面板内稳定顺序)', () => {
    const input = [skill('zeta'), skill('alpha', 'flow'), skill('skip', 'builtin')];
    expect(userActivatableSkills(input).map((s) => s.name)).toEqual(['alpha', 'zeta']);
  });
});
