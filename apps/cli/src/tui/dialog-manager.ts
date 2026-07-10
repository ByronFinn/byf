import type { McpServerInfo, PermissionMode, SessionStatus, SessionUsage } from '@byfriends/sdk';

import { ChoicePickerComponent, type ChoiceOption } from '#/tui/components/dialogs/choice-picker';
import { EditorSelectorComponent } from '#/tui/components/dialogs/editor-selector';
import { HelpPanelComponent, type HelpPanelCommand } from '#/tui/components/dialogs/help-panel';
import { ModelSelectorComponent } from '#/tui/components/dialogs/model-selector';
import { PermissionSelectorComponent } from '#/tui/components/dialogs/permission-selector';
import { SessionPickerComponent } from '#/tui/components/dialogs/session-picker';
import {
  SettingsSelectorComponent,
  type SettingsSelection,
} from '#/tui/components/dialogs/settings-selector';
import { ThemeSelectorComponent } from '#/tui/components/dialogs/theme-selector';
import { buildMcpStatusReportLines } from '#/tui/components/messages/mcp-status-panel';
import { buildStatusReportLines } from '#/tui/components/messages/status-panel';
import { UsagePanelComponent, buildUsageReportLines } from '#/tui/components/messages/usage-panel';
import type { Theme } from '#/tui/theme';
import type { DialogHost, ThinkingEffortLevel, TUIState } from '#/tui/types';
import { formatErrorMessage } from '#/tui/utils/event-payload';

/**
 * TUI methods the DialogManager delegates to. Keeping these explicit avoids
 * giving the manager a reference back to the full ByfTui instance and keeps
 * the dialog layer a pure function of state + host + callbacks.
 */
/**
 * Result type for usage loading (success or captured error message).
 */
export interface UsageReportResult {
  readonly usage?: SessionUsage;
  readonly error?: string;
}

/**
 * Result type for runtime status loading (success or captured error message).
 */
export interface StatusReportResult {
  readonly status?: SessionStatus;
  readonly error?: string;
}

export interface DialogManagerCallbacks {
  fetchSessions(): Promise<void>;
  resumeSession(sessionId: string): Promise<boolean>;
  applyEditorChoice(value: string): Promise<void>;
  performModelSwitch(alias: string, thinkingEffort: ThinkingEffortLevel): Promise<void>;
  applyPermissionChoice(mode: PermissionMode): Promise<void>;
  applyThemeChoice(theme: Theme): Promise<void>;
  loadUsageReport(): Promise<UsageReportResult>;
  loadStatusReport(): Promise<StatusReportResult>;
  listMcpServers(): Promise<readonly McpServerInfo[]>;
  getSlashCommands(): readonly HelpPanelCommand[];
  showNotice(title: string, detail?: string): void;
  showError(message: string): void;
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
        void this.showUsage();
        return;
    }
  }

  // Loads and renders current usage information.
  async showUsage(): Promise<void> {
    const report = await this.callbacks.loadUsageReport();
    const appState = this.state.appState;
    const lines = buildUsageReportLines({
      colors: this.state.theme.colors,
      sessionUsage: report.usage,
      sessionUsageError: report.error,
      contextUsage: appState.contextUsage,
      contextTokens: appState.contextTokens,
      maxContextTokens: appState.maxContextTokens,
    });
    const panel = new UsagePanelComponent(lines, this.state.theme.colors.primary);
    this.state.transcriptContainer.addChild(panel);
    this.state.ui.requestRender();
  }

  // Loads and renders current runtime status.
  async showStatusReport(): Promise<void> {
    const report = await this.callbacks.loadStatusReport();
    const appState = this.state.appState;
    const lines = buildStatusReportLines({
      colors: this.state.theme.colors,
      version: appState.version,
      model: appState.model,
      workDir: appState.workDir,
      sessionId: appState.sessionId,
      sessionTitle: appState.sessionTitle,
      thinking: appState.thinkingEffort !== 'off',
      permissionMode: appState.permissionMode,
      contextUsage: appState.contextUsage,
      contextTokens: appState.contextTokens,
      maxContextTokens: appState.maxContextTokens,
      availableModels: appState.availableModels,
      status: report.status,
      statusError: report.error,
    });
    const panel = new UsagePanelComponent(lines, this.state.theme.colors.primary, ' Status ');
    this.state.transcriptContainer.addChild(panel);
    this.state.ui.requestRender();
  }

  // Loads and renders current MCP server status.
  async showMcpServers(): Promise<void> {
    let servers: readonly McpServerInfo[];
    try {
      servers = await this.callbacks.listMcpServers();
    } catch (error) {
      this.callbacks.showError(`Failed to load MCP servers: ${formatErrorMessage(error)}`);
      return;
    }

    const lines = buildMcpStatusReportLines({
      colors: this.state.theme.colors,
      servers,
    });
    const title = servers.length > 0 ? ` MCP (${servers.length}) ` : ' MCP ';
    const panel = new UsagePanelComponent(lines, this.state.theme.colors.primary, title);
    this.state.transcriptContainer.addChild(panel);
    this.state.ui.requestRender();
  }

  // Shows the fork rewind picker: lists user messages to branch from.
  // `options` are built by the caller (ByfTui) from transcriptEntries; this
  // method only handles display. `onSelect` receives the chosen value (the
  // 1-based message ordinal as a string), `onCancel` when the user aborts.
  showForkRewindPicker(
    options: readonly ChoiceOption[],
    onSelect: (value: string) => void,
    onCancel: () => void,
  ): void {
    this.host.show(
      new ChoicePickerComponent({
        title: 'Fork from message',
        hint: 'Select a message to branch from — it and everything after is dropped',
        options,
        colors: this.state.theme.colors,
        searchable: false,
        onSelect: (value) => {
          this.host.close();
          onSelect(value);
        },
        onCancel: () => {
          this.host.close();
          onCancel();
        },
      }),
    );
  }
}
