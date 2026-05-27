import { describe, expect, it } from 'vitest';

import {
  createInstallPromptChoices,
  getDefaultInstallPromptSelection,
  moveInstallPromptSelection,
} from '#/cli/update/prompt';

describe('install prompt helpers', () => {
  it('defaults the selection to "Install update now"', () => {
    const choices = createInstallPromptChoices({ version: '0.0.2-beta.1' });

    expect(getDefaultInstallPromptSelection(choices)).toBe(0);
    expect(choices[0]).toEqual({
      value: 'install',
      label: 'Install update now (0.0.2-beta.1)',
    });
    expect(choices[1]).toEqual({
      value: 'skip',
      label: 'Continue with current version',
    });
  });

  it('moves selection with arrow directions and clamps at the edges', () => {
    expect(moveInstallPromptSelection(1, 'up', 2)).toBe(0);
    expect(moveInstallPromptSelection(0, 'up', 2)).toBe(0);
    expect(moveInstallPromptSelection(0, 'down', 2)).toBe(1);
    expect(moveInstallPromptSelection(1, 'down', 2)).toBe(1);
  });
});
