import type { Session } from '@byfriends/sdk';
import { vi } from 'vitest';

import type { SlashCommandHost } from '#/tui/commands/handlers';

/**
 * Builds a fully-stubbed `SlashCommandHost` for handler unit tests.
 *
 * Every field defaults to a no-op `vi.fn()`; pass `overrides` to replace
 * the ones a given test cares about. `dialogManager` is stubbed with the
 * full set of methods handlers may call.
 */
export function createMockHost(overrides: Partial<SlashCommandHost> = {}): SlashCommandHost {
  const dialogManager = {
    showHelpPanel: vi.fn(),
    showSessionPicker: vi.fn(async () => {}),
    showPermissionPicker: vi.fn(),
    showSettingsSelector: vi.fn(),
    showEditorPicker: vi.fn(),
    showThemePicker: vi.fn(),
    showModelPicker: vi.fn(),
    showForkRewindPicker: vi.fn(),
    showUsage: vi.fn(async () => {}),
    showStatusReport: vi.fn(async () => {}),
    showMcpServers: vi.fn(async () => {}),
  };

  return {
    showStatus: vi.fn(),
    showError: vi.fn(),
    showNotice: vi.fn(),
    requestRender: vi.fn(),
    getVersion: () => '9.9.9-test',
    getSession: () => undefined,
    createNewSession: vi.fn(async () => {}),
    stop: vi.fn(),
    dialogManager: dialogManager as unknown as SlashCommandHost['dialogManager'],
    dialogHost: { show: vi.fn(), close: vi.fn() },
    getThemeColors: () =>
      ({
        success: '#0f0',
        error: '#f00',
        primary: '#00f',
      }) as ReturnType<SlashCommandHost['getThemeColors']>,
    getAppState: () => ({
      availableModels: {},
      sessionTitle: null,
      sessionId: 'sess-1',
      yolo: false,
      model: '',
      permissionMode: 'manual',
      maxContextTokens: 0,
    }),
    setAppState: vi.fn(),
    showTasksBrowser: vi.fn(),
    showSubagentsViewer: vi.fn(),
    showBtw: vi.fn(async () => {}),
    applyEditorChoice: vi.fn(async () => {}),
    applyThemeChoice: vi.fn(async () => {}),
    cancelCurrentStream: vi.fn(),
    appendTranscriptStatus: vi.fn(),
    sendNormalUserInput: vi.fn(),
    getConfig: vi.fn(async () => ({})),
    setConfig: vi.fn(async () => undefined),
    removeProvider: vi.fn(async () => undefined),
    refreshConfigAfterLogin: vi.fn(async () => {}),
    showLoginProgressSpinner: vi.fn(() => ({ stop: vi.fn() })),
    track: vi.fn(),
    getBuiltInCatalogJson: () => undefined,
    setCancelInFlight: vi.fn(),
    clearCancelInFlight: vi.fn(),
    renameSession: vi.fn(async () => {}),
    getUserMessageContents: () => [],
    performForkRewind: vi.fn(async () => {}),
    runInitCommand: vi.fn(async () => {}),
    ...overrides,
  };
}

/**
 * Minimal fake `Session` — handlers only call a handful of methods
 * (`setPermission`, `compact`, `id`), so the rest can stay as `vi.fn()`.
 */
export function createMockSession(id = 'sess-1'): Session {
  return {
    id,
    setPermission: vi.fn(async () => {}),
    compact: vi.fn(async () => {}),
  } as unknown as Session;
}
