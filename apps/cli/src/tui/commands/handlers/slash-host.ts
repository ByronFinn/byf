// Narrow capability surface for slash command modules (PRD-0021 H1-a).
//
// Handlers never hold a ByfTui reference. The host exposes:
// - shared UI/session primitives used by ≥2 handlers
// - dialogManager / dialogHost accessors
// - controller entry points not yet extracted to DialogManager
// - a few root-coupled seams (init turn machine, fork rewrite, theme/editor
//   persistence) as single capability methods — not one handle* per command.
//
// Per-command control flow lives in commands/handlers/<group>.ts.

import type {
  ByfConfig,
  ByfConfigPatch,
  ModelAlias,
  PermissionMode,
  Session,
} from '@byfriends/sdk';

import type { DialogManager } from '#/tui/dialog-manager';
import type { SpinnerHandle } from '#/tui/flows/login-flow';
import type { Theme } from '#/tui/theme';
import type { ColorPalette } from '#/tui/theme/colors';
import type { DialogHost } from '#/tui/types';

/** App-state fields slash handlers read/write. */
export interface SlashHostAppState {
  readonly availableModels: Readonly<Record<string, ModelAlias>>;
  readonly sessionTitle: string | null;
  readonly sessionId: string;
  readonly yolo: boolean;
  readonly model: string;
  readonly permissionMode: PermissionMode;
  readonly maxContextTokens: number;
}

export interface SlashCommandHost {
  // ── Common base (multi-handler) ──
  showStatus(message: string, color?: string): void;
  showError(message: string): void;
  showNotice(title: string, detail?: string): void;
  requestRender(): void;
  getVersion(): string;

  // ── Session lifecycle ──
  getSession(): Session | undefined;
  createNewSession(): Promise<void>;
  stop(): void;

  // ── Accessors ──
  readonly dialogManager: DialogManager;
  /** DialogHost for LoginFlow / ConnectFlow / dialog-prompts. */
  readonly dialogHost: DialogHost;
  getThemeColors(): ColorPalette;
  getAppState(): SlashHostAppState;
  setAppState(
    patch: Partial<
      Pick<SlashHostAppState, 'yolo' | 'permissionMode' | 'model' | 'maxContextTokens'>
    >,
  ): void;

  // Controllers / panels not on DialogManager
  showTasksBrowser(): void;
  showSubagentsViewer(): void;
  showMcpServers(): void;
  showUsage(): void;
  showStatusReport(): void;
  showBtw(args: string): Promise<void>;

  // ── Root-owned application seams (not pass-through command handlers) ──
  applyEditorChoice(value: string): Promise<void>;
  applyThemeChoice(theme: Theme): Promise<void>;

  cancelCurrentStream(): void;
  appendTranscriptStatus(message: string): void;
  sendNormalUserInput(text: string): void;

  getConfig(): Promise<ByfConfig>;
  setConfig(config: ByfConfigPatch): Promise<unknown>;
  removeProvider(providerId: string): Promise<unknown>;
  refreshConfigAfterLogin(): Promise<void>;
  showLoginProgressSpinner(label: string): SpinnerHandle;
  track(event: string, properties?: Record<string, string | number | boolean | null>): void;
  getBuiltInCatalogJson(): string | undefined;
  setCancelInFlight(cancel: (() => void) | undefined): void;
  clearCancelInFlight(cancel: () => void): void;

  renameSession(input: { id: string; title: string }): Promise<void>;

  /** User-message bodies from the transcript, in display order (for /fork). */
  getUserMessageContents(): readonly string[];
  performForkRewind(session: Session, upToMessage: number | undefined): Promise<void>;

  /** Root-coupled init turn machine — stays on ByfTui. */
  runInitCommand(): Promise<void>;
}
