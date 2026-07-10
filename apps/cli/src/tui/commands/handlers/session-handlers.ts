// Slash command handler modules.
//
// Each module registers a group of handlers. Handlers receive a
// `SlashCommandHost` — the narrow capability surface they may use.
// Deep ByfTui runtime capabilities (session lifecycle, turn state machine,
// fork rewind chain) are exposed as delegate methods on the host; handlers
// call them as thin one-liners rather than reimplementing the logic.
//
// This follows ADR-0017: extracted modules take a narrow host interface by
// constructor/injection, never a reference to the full ByfTui instance.

import type { SlashCommandHandler, SlashCommandHandlerRegistry } from '../handler-registry';
import type { BuiltinSlashCommandName } from '../registry';

/**
 * Extended host interface for builtin slash commands.
 *
 * `showStatus`/`showError`/`requestRender` are the common base (PR1).
 * The delegate methods below expose ByfTui runtime capabilities that
 * multiple handlers need — each is a thin one-liner forward, keeping the
 * real logic on ByfTui (per ADR-0017 "no pass-through module" rule: these
 * are behavior seams, not data forwarders).
 */
export interface SlashCommandHost {
  // ── Common base (PR1) ──
  showStatus(message: string): void;
  showError(message: string): void;
  requestRender(): void;
  /** Application version string (for /version). */
  readonly version: string;

  // ── Session ──
  /** Returns the active session object, or undefined if none. */
  getSession(): unknown;
  /** Create a new session from the current workspace state. */
  createNewSession(): Promise<void>;
  /** Stop the TUI and exit. */
  stop(): void;

  // ── Dialogs / controllers ──
  /** Show the help panel. */
  showHelp(): void;
  /** Show the session picker. */
  showSessionPicker(): void;
  /** Show the permission picker. */
  showPermissionPicker(): void;
  /** Show the settings selector. */
  showSettingsSelector(): void;
  /** Show the tasks browser. */
  showTasksBrowser(): void;
  /** Show the subagents viewer. */
  showSubagentsViewer(): void;
  /** Show the MCP servers status. */
  showMcpServers(): void;
  /** Show the usage report. */
  showUsage(): void;
  /** Show the status report. */
  showStatusReport(): void;

  // ── Delegates for handlers with real logic on ByfTui ──
  handleEditor(args: string): Promise<void>;
  handleTheme(args: string): Promise<void>;
  handleModel(args: string): void;
  handleTitle(args: string): Promise<void>;
  handleFork(args: string): Promise<void>;
  handleYolo(args: string): Promise<void>;
  handleCompact(args: string): Promise<void>;
  handleGoal(args: string): Promise<void>;
  handleInit(): Promise<void>;
  handleLogin(): Promise<void>;
  handleLogout(args: string): Promise<void>;
  handleConnect(args: string): Promise<void>;
  handleFeedback(): Promise<void>;
  handleBtw(args: string): Promise<void>;
}

/**
 * Register all builtin slash command handlers against a host.
 *
 * Exhaustiveness is enforced via `satisfies Record<BuiltinSlashCommandName, ...>`:
 * the compiler errors if a command is missing or an unknown name appears.
 */
export function registerBuiltinSlashHandlers(
  registry: SlashCommandHandlerRegistry,
  host: SlashCommandHost,
): void {
  const handlers = {
    exit: async () => {
      host.stop();
    },
    help: async () => {
      host.showHelp();
    },
    version: async () => {
      host.showStatus(`Byf Code v${host.version}`);
    },
    new: async () => {
      await host.createNewSession();
      host.requestRender();
    },
    sessions: async () => {
      host.showSessionPicker();
    },
    tasks: async () => {
      if (host.getSession() === undefined) {
        host.showError('No active session.');
        return;
      }
      host.showTasksBrowser();
    },
    agent: async () => {
      if (host.getSession() === undefined) {
        host.showError('No active session.');
        return;
      }
      host.showSubagentsViewer();
    },
    mcp: async () => {
      host.showMcpServers();
    },
    editor: async (args: string) => {
      await host.handleEditor(args);
    },
    theme: async (args: string) => {
      await host.handleTheme(args);
    },
    model: async (args: string) => {
      host.handleModel(args);
    },
    permission: async () => {
      host.showPermissionPicker();
    },
    settings: async () => {
      host.showSettingsSelector();
    },
    usage: async () => {
      host.showUsage();
    },
    status: async () => {
      host.showStatusReport();
    },
    feedback: async () => {
      await host.handleFeedback();
    },
    title: async (args: string) => {
      await host.handleTitle(args);
    },
    yolo: async (args: string) => {
      await host.handleYolo(args);
    },
    btw: async (args: string) => {
      await host.handleBtw(args);
    },
    compact: async (args: string) => {
      await host.handleCompact(args);
    },
    goal: async (args: string) => {
      await host.handleGoal(args);
    },
    init: async () => {
      await host.handleInit();
    },
    fork: async (args: string) => {
      await host.handleFork(args);
    },
    connect: async (args: string) => {
      await host.handleConnect(args);
    },
    login: async () => {
      await host.handleLogin();
    },
    logout: async (args: string) => {
      await host.handleLogout(args);
    },
  } satisfies Record<BuiltinSlashCommandName, SlashCommandHandler>;

  for (const [name, handler] of Object.entries(handlers)) {
    registry.register(name as BuiltinSlashCommandName, handler);
  }
}
