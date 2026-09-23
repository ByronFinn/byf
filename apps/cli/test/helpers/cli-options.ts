import type { CLIOptions } from '#/cli/options';

/**
 * Shared complete `CLIOptions` fixture. Keep in sync with the required fields
 * of `CLIOptions` in `src/cli/options.ts`; tests that need variants spread
 * `overrides` instead of re-declaring the whole shape.
 */
export function makeCliOptions(overrides: Partial<CLIOptions> = {}): CLIOptions {
  return {
    session: undefined,
    continue: false,
    yolo: false,
    denyUnapproved: false,
    model: undefined,
    outputFormat: undefined,
    prompt: undefined,
    skillsDirs: [],
    addDirs: [],
    ...overrides,
  };
}
