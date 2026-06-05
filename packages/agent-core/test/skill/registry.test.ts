import { describe, expect, it } from 'vitest';

import { SkillRegistry } from '../../src/skill';
import type { SkillDefinition, SkillSource } from '../../src/skill';

describe('skill registry prompt rendering', () => {
  it('groups skills by scope under canonical section headings', () => {
    const registry = makeRegistry([
      makeSkill('builtin-a', 'builtin'),
      makeSkill('user-a', 'user'),
      makeSkill('proj-a', 'project'),
      makeSkill('extra-a', 'extra'),
    ]);

    const rendered = registry.getByfSkillsDescription();

    expect(rendered).toContain('### Project');
    expect(rendered).toContain('### User');
    expect(rendered).toContain('### Extra');
    expect(rendered).toContain('### Built-in');

    const projectIdx = rendered.indexOf('### Project');
    const userIdx = rendered.indexOf('### User');
    const extraIdx = rendered.indexOf('### Extra');
    const builtinIdx = rendered.indexOf('### Built-in');
    expect(projectIdx).toBeLessThan(userIdx);
    expect(userIdx).toBeLessThan(extraIdx);
    expect(extraIdx).toBeLessThan(builtinIdx);

    expect(sectionFor(rendered, '### Project')).toContain('proj-a');
    expect(sectionFor(rendered, '### User')).toContain('user-a');
    expect(sectionFor(rendered, '### Extra')).toContain('extra-a');
    expect(sectionFor(rendered, '### Built-in')).toContain('builtin-a');
    expect(sectionFor(rendered, '### Project')).not.toContain('user-a');
    expect(sectionFor(rendered, '### User')).not.toContain('proj-a');
  });

  it('omits scope headings that have no skills', () => {
    const registry = makeRegistry([makeSkill('alpha', 'user')]);

    const rendered = registry.getByfSkillsDescription();

    expect(rendered).toContain('### User');
    expect(rendered).not.toContain('### Project');
    expect(rendered).not.toContain('### Extra');
    expect(rendered).not.toContain('### Built-in');
  });

  it('renders a "No skills" placeholder for an empty registry', () => {
    const registry = new SkillRegistry();

    const rendered = registry.getByfSkillsDescription();

    expect(rendered.trim()).not.toBe('');
    expect(/no skills/i.test(rendered)).toBe(true);
  });

  it('sorts skills alphabetically within a scope', () => {
    const registry = makeRegistry([
      makeSkill('zebra', 'user'),
      makeSkill('alpha', 'user'),
      makeSkill('mango', 'user'),
    ]);

    const rendered = registry.getByfSkillsDescription();

    const a = rendered.indexOf('alpha');
    const m = rendered.indexOf('mango');
    const z = rendered.indexOf('zebra');
    expect(a).toBeGreaterThan(-1);
    expect(a).toBeLessThan(m);
    expect(m).toBeLessThan(z);
  });

  it('end-to-end: a project skill that shadows other scopes renders once under Project', () => {
    const registry = makeRegistry([makeSkill('foo', 'project', 'project version', '/tmp/proj/foo/SKILL.md')]);

    const rendered = registry.getByfSkillsDescription();

    expect(rendered.match(/\n- foo\n/g) ?? []).toHaveLength(1);
    expect(sectionFor(rendered, '### Project')).toContain('foo');
    expect(rendered).toContain('/tmp/proj/foo/SKILL.md');
    expect(rendered).toContain('project version');
  });

  it('renders each skill as name + Path + Description', () => {
    const registry = makeRegistry([
      makeSkill('alpha', 'user', 'Alpha does things', '/tmp/user/alpha/SKILL.md'),
    ]);

    const rendered = registry.getByfSkillsDescription();

    expect(rendered).toContain('- alpha');
    expect(rendered).toContain('  - Path: /tmp/user/alpha/SKILL.md');
    expect(rendered).toContain('  - Description: Alpha does things');
  });
});

describe('getModelSkillListing', () => {
  it('renders only name + one-line description per skill', () => {
    const registry = makeRegistry([
      makeSkill('alpha', 'user', 'Alpha does things.'),
      makeSkill('beta', 'project', 'Beta helps with testing.'),
    ]);

    const listing = registry.getModelSkillListing();

    expect(listing).toContain('DISREGARD any earlier skill listings. Current available skills:');
    expect(listing).toContain('- alpha: Alpha does things.');
    expect(listing).toContain('- beta: Beta helps with testing.');
    expect(listing).not.toContain('Path:');
    expect(listing).not.toContain('When to use:');
  });

  it('truncates descriptions to ~100 characters', () => {
    const longDesc = 'a'.repeat(200);
    const registry = makeRegistry([makeSkill('long', 'user', longDesc)]);

    const listing = registry.getModelSkillListing();
    const line = listing.split('\n').find((l) => l.includes('- long:'));

    expect(line).toBeDefined();
    expect(line!.length).toBeLessThanOrEqual('- long: '.length + 100);
  });

  it('omits disabled-model-invocation and non-prompt skills', () => {
    const registry = makeRegistry([
      makeSkill('visible', 'user', 'Visible skill'),
      { ...makeSkill('hidden', 'user', 'Hidden skill'), metadata: { disableModelInvocation: true } },
      { ...makeSkill('flow', 'user', 'Flow skill'), metadata: { type: 'flow' } },
    ]);

    const listing = registry.getModelSkillListing();

    expect(listing).toContain('- visible: Visible skill');
    expect(listing).not.toContain('hidden');
    expect(listing).not.toContain('flow');
  });

  it('groups skills by scope', () => {
    const registry = makeRegistry([
      makeSkill('builtin-a', 'builtin'),
      makeSkill('user-a', 'user'),
    ]);

    const listing = registry.getModelSkillListing();

    expect(listing).toContain('### User');
    expect(listing).toContain('### Built-in');
    expect(listing.indexOf('### User')).toBeLessThan(listing.indexOf('### Built-in'));
  });

  it('returns empty string when no invocable skills exist', () => {
    const registry = new SkillRegistry();
    expect(registry.getModelSkillListing()).toBe('');
  });
});

function makeRegistry(skills: readonly SkillDefinition[]): SkillRegistry {
  const registry = new SkillRegistry();
  for (const skill of skills) registry.register(skill);
  return registry;
}

function makeSkill(
  name: string,
  source: SkillSource,
  description = 'desc',
  skillPath?: string,
): SkillDefinition {
  const finalPath = skillPath ?? `/tmp/${source}/${name}/SKILL.md`;
  return {
    name,
    description,
    path: finalPath,
    dir: finalPath.replace(/\/SKILL\.md$/, ''),
    content: '',
    metadata: { type: 'prompt' },
    source,
  };
}

function sectionFor(rendered: string, header: string): string {
  const start = rendered.indexOf(header);
  if (start === -1) return '';
  const next = rendered.indexOf('### ', start + header.length);
  return next === -1 ? rendered.slice(start) : rendered.slice(start, next);
}
