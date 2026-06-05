import { describe, expect, it, vi } from 'vitest';

import type { Component, Focusable } from '@earendil-works/pi-tui';

import { ByfTui, type ByfTuiStartupInput, type TUIState } from '#/tui/byf-tui';
import type { DialogHost } from '#/tui/types';

interface DialogHostDriver {
  state: TUIState;
  show(panel: Component & Focusable): void;
  close(): void;
}

function makeStartupInput(): ByfTuiStartupInput {
  return {
    cliOptions: {
      session: undefined,
      continue: false,
      yolo: false,
      model: undefined,
      outputFormat: undefined,
      prompt: undefined,
      skillsDirs: [],
    },
    tuiConfig: {
      theme: 'dark',
      editorCommand: null,
      notifications: { enabled: true, condition: 'unfocused' },
    },
    version: '0.0.0-test',
    workDir: '/tmp/proj-a',
    resolvedTheme: 'dark',
  };
}

function makeHarness() {
  return {
    getConfig: vi.fn(async () => ({
      models: {
        k2: { model: 'byf-v1', maxContextSize: 100 },
      },
    })),
    createSession: vi.fn(async () => ({})),
    resumeSession: vi.fn(async () => ({})),
    listSessions: vi.fn(async () => []),
    close: vi.fn(async () => {}),
    track: vi.fn(),
    setTelemetryContext: vi.fn(),
    auth: {
      status: vi.fn(async () => ({ providers: [] })),
      login: vi.fn(async () => {}),
      logout: vi.fn(),
      getManagedUsage: vi.fn(),
    },
  };
}

function makeDriver(): DialogHostDriver {
  const harness = makeHarness();
  const tui = new ByfTui(harness as never, makeStartupInput());
  vi.spyOn(tui['state'].ui, 'requestRender').mockImplementation(() => {});
  vi.spyOn(tui['state'].terminal, 'setProgress').mockImplementation(() => {});
  return tui as unknown as DialogHostDriver;
}

describe('ByfTui DialogHost', () => {
  it('implements DialogHost interface', () => {
    const driver = makeDriver();
    const host = driver as unknown as DialogHost;
    expect(typeof host.show).toBe('function');
    expect(typeof host.close).toBe('function');
  });

  it('show mounts panel and sets focus', () => {
    const driver = makeDriver();
    const setFocus = vi.spyOn(driver.state.ui, 'setFocus');
    const panel = {} as Component & Focusable;

    driver.show(panel);

    expect(driver.state.editorContainer.children).toContain(panel);
    expect(setFocus).toHaveBeenCalledWith(panel);
  });

  it('close restores editor', () => {
    const driver = makeDriver();
    const setFocus = vi.spyOn(driver.state.ui, 'setFocus');
    const editor = driver.state.editor;
    const panel = {} as Component & Focusable;

    driver.show(panel);
    driver.close();

    expect(driver.state.editorContainer.children).not.toContain(panel);
    expect(driver.state.editorContainer.children).toContain(editor);
    expect(setFocus).toHaveBeenLastCalledWith(editor);
  });
});
