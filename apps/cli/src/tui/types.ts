import type { Component, Container, Focusable, ProcessTerminal, TUI } from '@earendil-works/pi-tui';
import type {
  BackgroundTaskInfo,
  ModelAlias,
  PermissionMode,
  ProviderConfig,
  PromptPart,
  ToolInputDisplay,
} from '@byfriends/sdk';

import type { NotificationsConfig } from './config';
import type { AssistantMessageComponent } from './components/messages/assistant-message';
import type { CompactionComponent } from './components/dialogs/compaction';
import type { CustomEditor } from './components/editor/custom-editor';
import type { AgentGroupComponent } from './components/messages/agent-group';
import type { ReadGroupComponent } from './components/messages/read-group';
import type { ThinkingComponent } from './components/messages/thinking';
import type { ToolCallComponent } from './components/messages/tool-call';
import type { MoonLoader, SpinnerStyle } from './components/chrome/moon-loader';
import type { TodoPanelComponent } from './components/chrome/todo-panel';
import type { FooterComponent } from './components/chrome/footer';
import type { SessionRow } from './components/dialogs/session-picker';
import type { ByfTuiThemeBundle } from './theme/bundle';
import type { TerminalState } from './utils/terminal-state';
import type { PendingApproval, PendingQuestion } from './reverse-rpc/types';
import type { Theme } from './theme';

export interface DialogHost {
  show(panel: Component & Focusable): void;
  close(): void;
}

export interface FullscreenHost {
  showFullscreen(panel: Component & Focusable): readonly Component[];
  closeFullscreen(savedChildren: readonly Component[]): void;
  focus(component: Component & Focusable): void;
  requestRender(full?: boolean): void;
}

export type ThinkingEffortLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const THINKING_EFFORT_LEVELS = new Set<string>(['off', 'low', 'medium', 'high', 'xhigh', 'max']);

export function parseThinkingEffort(value: string | undefined): ThinkingEffortLevel {
  if (value && THINKING_EFFORT_LEVELS.has(value)) return value as ThinkingEffortLevel;
  if (value === 'on') return 'high';
  return 'off';
}

export interface AppState {
  model: string;
  workDir: string;
  shellWorkDir?: string;
  sessionId: string;
  yolo: boolean;
  permissionMode: PermissionMode;
  planMode: boolean;
  thinkingEffort: ThinkingEffortLevel;
  contextUsage: number;
  contextTokens: number;
  maxContextTokens: number;
  isStreaming: boolean;
  isCompacting: boolean;
  isReplaying: boolean;
  streamingPhase: 'idle' | 'waiting' | 'thinking' | 'composing';
  streamingStartTime: number;
  theme: Theme;
  version: string;
  editorCommand: string | null;
  notifications: NotificationsConfig;
  availableModels: Record<string, ModelAlias>;
  availableProviders: Record<string, ProviderConfig>;
  sessionTitle: string | null;
}

export interface ToolCallBlockData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  description?: string;
  display?: ToolInputDisplay;
  streamingArguments?: string;
  streamingStartedAtMs?: number;
  result?: ToolResultBlockData;
  subagent?: SubagentReplayBlockData;
  step?: number;
  turnId?: string;
  /** Set when the step ended (e.g. max_tokens) before the tool call's
   *  arguments finished streaming. Renderer flips the header verb to
   *  "Truncated" and stops showing the in-progress argument preview. */
  truncated?: boolean;
}

export interface ToolResultBlockData {
  tool_call_id: string;
  output: string;
  is_error?: boolean;
  synthetic?: boolean;
  blockedReason?: 'rejected' | 'cancelled';
}

export interface SubagentReplayToolCallData {
  id: string;
  name: string;
  args: Record<string, unknown>;
  description?: string;
  result?: ToolResultBlockData;
}

export interface SubagentReplayBlockData {
  id: string;
  name?: string;
  text?: string;
  toolCalls?: readonly SubagentReplayToolCallData[];
}

export interface BackgroundAgentMetadata {
  readonly agentId: string;
  readonly parentToolCallId: string;
  readonly agentName?: string;
  readonly description?: string;
}

export type BackgroundAgentStatusPhase = 'started' | 'completed' | 'failed';

export interface BackgroundAgentStatusData {
  readonly phase: BackgroundAgentStatusPhase;
  readonly headline: string;
  readonly detail?: string;
}

export interface CompactionTranscriptData {
  readonly tokensBefore?: number;
  readonly tokensAfter?: number;
  readonly instruction?: string;
}

export type TranscriptEntryKind =
  | 'welcome'
  | 'user'
  | 'assistant'
  | 'tool_call'
  | 'shell_exec'
  | 'thinking'
  | 'status'
  | 'skill_activation';

export interface TranscriptEntry {
  id: string;
  kind: TranscriptEntryKind;
  turnId?: string;
  renderMode: 'markdown' | 'plain' | 'notice';
  content: string;
  color?: string;
  detail?: string;
  toolCallData?: ToolCallBlockData;
  backgroundAgentStatus?: BackgroundAgentStatusData;
  compactionData?: CompactionTranscriptData;
  imageAttachmentIds?: readonly number[];
  skillActivationId?: string;
  skillName?: string;
  skillArgs?: string;
}

export type LivePaneMode =
  | 'idle'
  | 'waiting'
  | 'thinking'
  | 'tool'
  | 'session';

export interface LivePaneState {
  mode: LivePaneMode;
  pendingApproval: PendingApproval | null;
  pendingQuestion: PendingQuestion | null;
}

export interface QueuedMessage {
  readonly text: string;
  readonly agentId?: string;
  readonly parts?: readonly PromptPart[];
  readonly imageAttachmentIds?: readonly number[];
}

export const INITIAL_LIVE_PANE: LivePaneState = {
  mode: 'idle',
  pendingApproval: null,
  pendingQuestion: null,
};

export type TUIStartupState = 'pending' | 'ready' | 'picker';

export interface TUIState {
  ui: TUI;
  terminal: ProcessTerminal;
  transcriptContainer: Container;
  activityContainer: Container;
  todoPanelContainer: Container;
  todoPanel: TodoPanelComponent;
  queueContainer: Container;
  editorContainer: Container;
  footer: FooterComponent;
  editor: CustomEditor;
  theme: ByfTuiThemeBundle;
  appState: AppState;
  startupState: TUIStartupState;
  startupNotice: string | undefined;
  livePane: LivePaneState;
  transcriptEntries: TranscriptEntry[];
  terminalState: TerminalState;
  activitySpinner: MoonLoader | undefined;
  activitySpinnerStyle: SpinnerStyle | undefined;
  activeThinkingComponent: ThinkingComponent | undefined;
  streamingComponent: AssistantMessageComponent | undefined;
  streamingTranscriptEntry: TranscriptEntry | undefined;
  activeCompactionBlock: CompactionComponent | undefined;
  toolOutputExpanded: boolean;
  planExpanded: boolean;
  lastActivityMode: string | undefined;
  lastHistoryContent: string | undefined;
  pendingToolComponents: Map<string, ToolCallComponent>;
  pendingAgentGroup: {
    readonly turnId: string | undefined;
    readonly step: number;
    solo?: ToolCallComponent;
    group?: AgentGroupComponent;
  } | null;
  pendingReadGroup: {
    readonly turnId: string | undefined;
    readonly step: number;
    solo?: ToolCallComponent;
    group?: ReadGroupComponent;
  } | null;
  backgroundAgents: Set<string>;
  backgroundAgentMetadata: Map<string, BackgroundAgentMetadata>;
  backgroundTasks: Map<string, BackgroundTaskInfo>;
  backgroundTaskTranscriptedTerminal: Set<string>;
  renderedSkillActivationIds: Set<string>;
  renderedMcpServerStatusKeys: Map<string, string>;
  mcpServerStatusSpinners: Map<string, MoonLoader>;
  subagentParentToolCallIds: Map<string, string>;
  subagentNames: Map<string, string>;
  sessions: SessionRow[];
  loadingSessions: boolean;
  showingSessionPicker: boolean;
  showingHelpPanel: boolean;
  externalEditorRunning: boolean;
  currentTurnId: string | undefined;
  currentStep: number;
  assistantDraft: string;
  assistantStreamActive: boolean;
  thinkingDraft: string;
  activeToolCalls: Map<string, ToolCallBlockData>;
  streamingToolCallArguments: Map<
    string,
    { name?: string; argumentsText: string; startedAtMs: number }
  >;
  queuedMessages: QueuedMessage[];
}
