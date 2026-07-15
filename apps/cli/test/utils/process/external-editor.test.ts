import { mock as bunMock } from 'bun:test';
/* eslint-disable import/first -- vi.mock setup must run before the imports it stubs out. */
import { EventEmitter } from 'node:events';
import { writeFile } from 'node:fs/promises';

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  rmCalls: vi.fn(),
}));

// Capture real fs before installing the mock (Bun's mock.module rewrites later imports).
const realFs = await import('node:fs/promises');
const realRm = realFs.rm.bind(realFs);

vi.mock('node:child_process', () => ({
  spawn: mocks.spawn,
}));

vi.mock('node:fs/promises', () => ({
  ...realFs,
  rm: (...args: Parameters<typeof realRm>) => {
    mocks.rmCalls(...args);
    return realRm(...args);
  },
}));

const { editInExternalEditor, resolveEditorCommand } =
  await import('#/utils/process/external-editor');

/** Extract the temp file path from `spawn('/bin/sh', ['-c', 'editor path'])`. */
function tempPathFromSpawn(cmd: string, args: string[]): string {
  const shellCmd = args[0] === '-c' ? (args[1] ?? '') : cmd;
  const match = shellCmd.match(/'([^']+)'$/);
  if (!match) throw new Error(`Could not parse temp path from: ${shellCmd}`);
  return match[1];
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('external-editor helpers', () => {
  it('prefers configured editor, then VISUAL, then EDITOR', () => {
    vi.stubEnv('VISUAL', 'nvim');
    vi.stubEnv('EDITOR', 'vim');

    expect(resolveEditorCommand('code --wait')).toBe('code --wait');
    expect(resolveEditorCommand(null)).toBe('nvim');
    vi.stubEnv('VISUAL', '');
    expect(resolveEditorCommand()).toBe('vim');
  });

  it('returns the edited contents on success and cleans up the temp directory', async () => {
    mocks.spawn.mockImplementation((cmd: string, args: string[] = []) => {
      const child = new EventEmitter();
      void writeFile(tempPathFromSpawn(cmd, args), 'edited text', 'utf8').then(() => {
        child.emit('exit', 0);
      });
      return child as never;
    });

    await expect(editInExternalEditor('seed', 'code --wait')).resolves.toBe('edited text');
    expect(mocks.rmCalls).toHaveBeenCalled();
  });

  it('returns undefined when the editor exits non-zero', async () => {
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 1));
      return child as never;
    });

    await expect(editInExternalEditor('seed', 'false')).resolves.toBeUndefined();
  });
});

// Bun keeps mock.module across files; restore so later suites see real modules (#215).
afterAll(() => {
  bunMock.restore();
});
