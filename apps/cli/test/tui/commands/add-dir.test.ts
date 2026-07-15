/**
 * `/add-dir` slash command (PRD-0023 #239).
 *
 * Drives the real `createAddDirHandlers` with a stubbed SlashCommandHost —
 * list, session-only add, remember (persist), and validation errors.
 */

import { describe, expect, it, vi } from 'vitest';

import { createAddDirHandlers } from '#/tui/commands/handlers/add-dir';

import { createMockHost } from './helpers';

describe('/add-dir command (PRD-0023 #239)', () => {
  it('list (and empty args) prints workspace + additional roots', async () => {
    const getWorkspaceRoots = vi.fn(async () => ({
      workspaceDir: '/proj',
      additionalDirs: ['/extra/a', '/extra/b'],
    }));
    const host = createMockHost({
      getSession: () =>
        ({
          id: 'sess-1',
          getWorkspaceRoots,
        }) as never,
    });
    const handlers = createAddDirHandlers(host);

    await handlers['add-dir']('list');
    expect(getWorkspaceRoots).toHaveBeenCalledOnce();
    expect(host.showStatus).toHaveBeenCalledWith(expect.stringContaining('Workspace: /proj'));
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringMatching(/\/extra\/a[\s\S]*\/extra\/b/),
    );

    await handlers['add-dir']('');
    expect(getWorkspaceRoots).toHaveBeenCalledTimes(2);
  });

  it('list with no session shows an error', async () => {
    const host = createMockHost({ getSession: () => undefined });
    const handlers = createAddDirHandlers(host);
    await handlers['add-dir']('list');
    expect(host.showError).toHaveBeenCalledWith('No active session.');
  });

  it('path arg opens a choice picker (session / remember / cancel)', async () => {
    const host = createMockHost({
      getSession: () => ({ id: 'sess-1' }) as never,
    });
    const handlers = createAddDirHandlers(host);
    await handlers['add-dir']('/tmp/extra');

    expect(host.dialogHost.show).toHaveBeenCalledOnce();
    const opts = pickerOpts(host);
    expect(opts.options.map((o) => o.value)).toEqual(['session', 'remember', 'cancel']);
  });

  it('session choice calls addWorkspaceDir without persist', async () => {
    const addWorkspaceDir = vi.fn(async () => ({ configPath: undefined }));
    const host = createMockHost({
      getSession: () =>
        ({
          id: 'sess-1',
          addWorkspaceDir,
        }) as never,
    });
    const handlers = createAddDirHandlers(host);
    await handlers['add-dir']('/data/shared');

    pickerOpts(host).onSelect('session');
    // onSelect is fire-and-forget async; flush microtasks
    await Promise.resolve();
    await Promise.resolve();

    expect(addWorkspaceDir).toHaveBeenCalledWith('/data/shared', { persist: false });
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringMatching(/Added workspace directory[\s\S]*session only/i),
      'success',
    );
  });

  it('remember choice calls addWorkspaceDir with persist: true', async () => {
    const addWorkspaceDir = vi.fn(async () => ({
      configPath: '/proj/.byf/local.toml',
    }));
    const host = createMockHost({
      getSession: () =>
        ({
          id: 'sess-1',
          addWorkspaceDir,
        }) as never,
    });
    const handlers = createAddDirHandlers(host);
    await handlers['add-dir']('/data/remembered');

    pickerOpts(host).onSelect('remember');
    await Promise.resolve();
    await Promise.resolve();

    expect(addWorkspaceDir).toHaveBeenCalledWith('/data/remembered', { persist: true });
    expect(host.showStatus).toHaveBeenCalledWith(
      expect.stringMatching(/Saved to:[\s\S]*local\.toml/i),
      'success',
    );
  });

  it('surfaces addWorkspaceDir validation errors', async () => {
    const addWorkspaceDir = vi.fn(async () => {
      throw new Error('Not a directory: /tmp/file.txt');
    });
    const host = createMockHost({
      getSession: () =>
        ({
          id: 'sess-1',
          addWorkspaceDir,
        }) as never,
    });
    const handlers = createAddDirHandlers(host);
    await handlers['add-dir']('/tmp/file.txt');
    pickerOpts(host).onSelect('session');
    await Promise.resolve();
    await Promise.resolve();

    expect(host.showError).toHaveBeenCalledWith('Not a directory: /tmp/file.txt');
  });
});

/** ChoicePicker keeps options on a private `opts` field — dig them out for unit tests. */
function pickerOpts(host: ReturnType<typeof createMockHost>): {
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onSelect: (value: string) => void;
} {
  const shown = vi.mocked(host.dialogHost.show).mock.calls[0]![0] as {
    opts: {
      options: readonly { value: string; label: string }[];
      onSelect: (value: string) => void;
    };
  };
  return shown.opts;
}
