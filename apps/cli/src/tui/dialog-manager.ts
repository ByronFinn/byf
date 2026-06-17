import type { PermissionMode } from '@byfriends/sdk';

import { EditorSelectorComponent } from '#/tui/components/dialogs/editor-selector';
import { HelpPanelComponent, type HelpPanelCommand } from '#/tui/components/dialogs/help-panel';
import { ModelSelectorComponent, type ModelSelection } from '#/tui/components/dialogs/model-selector';
import { PermissionSelectorComponent } from '#/tui/components/dialogs/permission-selector';
import { SessionPickerComponent, type SessionRow } from '#/tui/components/dialogs/session-picker';
import {
  SettingsSelectorComponent,
  type SettingsSelection,
} from '#/tui/components/dialogs/settings-selector';
import { ThemeSelectorComponent } from '#/tui/components/dialogs/theme-selector';
import type { Theme } from '#/tui/theme';
import type { AppState, DialogHost, ThinkingEffortLevel, TUIState } from '#/tui/types';

/**
 * TUI methods the DialogManager delegates to. Keeping these explicit avoids
 * giving the manager a reference back to the full ByfTui instance and keeps
 * the dialog layer a pure function of state + host + callbacks.
 */
export interface DialogManagerCallbacks {
  fetchSessions(): Promise<void>;
  resumeSession(sessionId: string): Promise<boolean>;
  applyEditorChoice(value: string): Promise<void>;
  performModelSwitch(alias: string, thinkingEffort: ThinkingEffortLevel): Promise<void>;
  applyPermissionChoice(mode: PermissionMode): Promise<void>;
  applyThemeChoice(theme: Theme): Promise<void>;
  showUsage(): Promise<void>;
  getSlashCommands(): readonly HelpPanelCommand[];
  showNotice(title: string, detail?: string): void;
  stop(): Promise<void>;
}

/**
 * Owns the editor-replacement dialogs and selectors that were previously
 * private methods on ByfTui. This shrinks the TUI god object while leaving
 * stateful editor/streaming/approval logic where it belongs.
 */
export class DialogManager {
  constructor(
    private readonly state: TUIState,
    private readonly host: DialogHost,
    private readonly callbacks: DialogManagerCallbacks,
  ) {}

  // Shows the help panel with the current slash command list.
  showHelpPanel(): void {
    this.state.showingHelpPanel = true;
    this.host.show(
      new HelpPanelComponent({
        commands: this.callbacks.getSlashCommands(),
        colors: this.state.theme.colors,
        onClose: () => {
          this.hideHelpPanel();
        },
      }),
    );
  }

  // Hides the help panel and returns focus to the editor.
  hideHelpPanel(): void {
    this.state.showingHelpPanel = false;
    this.host.close();
  }

  // Loads sessions and shows the session picker.
  async showSessionPicker(): Promise<void> {
    await this.callbacks.fetchSessions();
    this.mountSessionPicker(() => {
      this.hideSessionPicker();
    });
  }

  // Shows the startup session picker and exits when it is cancelled.
  async bootstrapFromPicker(): Promise<void> {
    await this.callbacks.fetchSessions();
    this.mountSessionPicker(() => {
      this.hideSessionPicker();
      void this.callbacks.stop();
    });
  }

  // Hides the session picker and restores the editor.
  hideSessionPicker(): void {
    this.state.showingSessionPicker = false;
    this.host.close();
  }

  // Mounts a session picker with shared selection behavior.
  private mountSessionPicker(onCancel: () => void): void {
    this.state.showingSessionPicker = true;
    this.host.show(
      new SessionPickerComponent({
        sessions: this.state.sessions,
        loading: this.state.loadingSessions,
        currentSessionId: this.state.appState.sessionId,
        colors: this.state.theme.colors,
        onSelect: (sessionId: string) => {
          void this.callbacks.resumeSession(sessionId).then((switched) => {
            if (switched) {
              this.hideSessionPicker();
            }
          });
        },
        onCancel,
      }),
    );
  }

  // Shows the editor command selector.
  showEditorPicker(): void {
    const currentValue = this.state.appState.editorCommand ?? '';
    this.host.show(
      new EditorSelectorComponent({
        currentValue,
        colors: this.state.theme.colors,
        onSelect: (value) => {
          this.host.close();
          void this.callbacks.applyEditorChoice(value);
        },
        onCancel: () => {
          this.host.close();
        },
      }),
    );
  }

  // Shows the model selector when models are available.
  showModelPicker(selectedValue: string = this.state.appState.model): void {
    const entries = Object.entries(this.state.appState.availableModels);
    if (entries.length === 0) {
      this.callbacks.showNotice(
        'No models configured',
        'Run /login or /connect to add a provider.',
      );
      return;
    }
    this.host.show(
      new ModelSelectorComponent({
        models: this.state.appState.availableModels,
        currentValue: this.state.appState.model,
        selectedValue,
        currentThinkingEffort: this.state.appState.thinkingEffort,
        colors: this.state.theme.colors,
        searchable: true,
        onSelect: ({ alias, thinkingEffort }) => {
          this.host.close();
          void this.callbacks.performModelSwitch(alias, thinkingEffort);
        },
        onCancel: () => {
          this.host.close();
        },
      }),
    );
  }

  // Shows the theme selector.
  showThemePicker(): void {
    this.host.show(
      new ThemeSelectorComponent({
        currentValue: this.state.appState.theme,
        colors: this.state.theme.colors,
        onSelect: (value) => {
          this.host.close();
          void this.callbacks.applyThemeChoice(value);
        },
        onCancel: () => {
          this.host.close();
        },
      }),
    );
  }

  // Shows the permission mode selector.
  showPermissionPicker(): void {
    this.host.show(
      new PermissionSelectorComponent({
        currentValue: this.state.appState.permissionMode,
        colors: this.state.theme.colors,
        onSelect: (value) => {
          this.host.close();
          void this.callbacks.applyPermissionChoice(value);
        },
        onCancel: () => {
          this.host.close();
        },
      }),
    );
  }

  // Shows the settings selector entry point.
  showSettingsSelector(): void {
    this.host.show(
      new SettingsSelectorComponent({
        colors: this.state.theme.colors,
        onSelect: (value) => {
          this.handleSettingsSelection(value);
        },
        onCancel: () => {
          this.host.close();
        },
      }),
    );
  }

  // Routes a settings selection to the matching selector or panel.
  private handleSettingsSelection(value: SettingsSelection): void {
    this.host.close();
    switch (value) {
      case 'model':
        this.showModelPicker();
        return;
      case 'permission':
        this.showPermissionPicker();
        return;
      case 'theme':
        this.showThemePicker();
        return;
      case 'editor':
        this.showEditorPicker();
        return;
      case 'usage':
        void this.callbacks.showUsage();
        return;
    }
  }
}
