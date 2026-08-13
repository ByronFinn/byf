// 斜杠命令模块的窄能力表面(PRD-0021 H1-a)。
//
// 处理器绝不持有 ByfTui 引用。宿主暴露:
// - 至少 2 个处理器共享的 UI / 会话原语
// - dialogManager / dialogHost 访问器
// - 尚未抽取到 DialogManager 的控制器入口
// - 少数根耦合接缝(init turn 机、fork 重写、主题 / 编辑器持久化)——
//   以单一能力方法呈现,而非每命令一个 handle*。
//
// 每命令的控制流位于 commands/handlers/<group>.ts。

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

/** 斜杠处理器读写的应用状态字段。 */
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
