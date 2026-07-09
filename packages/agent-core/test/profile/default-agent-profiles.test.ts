import { describe, expect, it } from 'vitest';

import { DEFAULT_AGENT_PROFILES, loadAgentProfilesFromSources } from '../../src/profile';

const promptContext = {
  osEnv: {
    osKind: 'macOS',
    osArch: 'arm64',
    osVersion: '0',
    shellName: 'bash',
    shellPath: '/bin/bash',
  },
  cwd: '/workspace',
  now: '2026-05-09T00:00:00.000Z',
} as const;

describe('default agent profiles', () => {
  it('loads the bundled default system prompt from embedded sources', () => {
    const prompt = DEFAULT_AGENT_PROFILES['agent']?.systemPrompt(promptContext);

    expect(prompt).toContain('You are BYF');
    expect(prompt).toContain('# Skills');
    expect(prompt).toContain('/workspace');
  });

  it('fails loudly when an embedded system prompt source is missing', () => {
    expect(() =>
      loadAgentProfilesFromSources(['profile/default/agent.yaml'], {
        'profile/default/agent.yaml': 'name: agent\nsystemPromptPath: ./missing.md\n',
      }),
    ).toThrow(/Embedded agent profile source missing: profile\/default\/missing\.md/);
  });

  // PRD-0019: the 4 goal tools must be in the default `agent` profile's
  // enabled-tools list, otherwise the loopTools hasGoal gate never even gets
  // a chance to show them — the profile whitelist filters them out first,
  // and the model has no way to call UpdateGoal(complete), so the driver
  // loops until the iteration cap. This regressed once; the assertion locks
  // the fix down.
  it('enables all 4 goal tools on the default agent profile', () => {
    const tools = DEFAULT_AGENT_PROFILES['agent']?.tools;
    expect(tools).toContain('CreateGoal');
    expect(tools).toContain('GetGoal');
    expect(tools).toContain('SetGoalBudget');
    expect(tools).toContain('UpdateGoal');
  });
});
