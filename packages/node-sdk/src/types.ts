import type {
  ExportSessionManifest,
  InputTokenBreakdown,
  ResumeSessionResult,
  RuntimeConfig,
} from '@byfriends/agent-core';
import type { ContentPart } from '@byfriends/kosong';

export interface HostIdentity {
  readonly userAgentProduct: string;
  readonly version: string;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type Unsubscribe = () => void;

export type {
  AgentReplayRecord,
  BackgroundConfig,
  BackgroundTaskInfo,
  BackgroundTaskKind,
  BackgroundTaskStatus,
  ContextMessage,
  ExportSessionManifest,
  ByfConfig,
  ByfConfigPatch,
  CronTaskSnapshot,
  GoalBudgetLimits,
  GoalBudgetReport,
  GoalChange,
  GoalSnapshot,
  GoalStatus,
  GoalUsage,
  InputTokenBreakdown,
  LoopControl,
  McpServerInfo,
  McpStartupMetrics,
  ModelAlias,
  ByfServiceConfig,
  OAuthRef,
  PromptOrigin,
  ProviderConfig,
  ProviderType,
  ResumedAgentState,
  ServicesConfig,
  ShellExecPayload,
  ShellExecResult,
  SkillSummary,
  ThinkingConfig,
  ToolInfo,
} from '@byfriends/agent-core';

export type { ContentPart, Role, ToolCall } from '@byfriends/kosong';

export type PermissionMode = 'yolo' | 'manual' | 'auto';

export type TextPromptPart = Extract<ContentPart, { type: 'text' }>;
export type PromptPart = Extract<ContentPart, { type: 'text' | 'image_url' | 'video_url' }>;

export type PromptInput = readonly PromptPart[];

export interface ByfHarnessOptions {
  readonly identity?: HostIdentity;
  readonly homeDir?: string;
  readonly configPath?: string;
  readonly runtime?: RuntimeConfig;
  readonly autoLoadConfig?: boolean;
  readonly uiMode?: string;
  readonly skillDirs?: readonly string[];
}

export interface CreateSessionOptions {
  readonly id?: string;
  readonly workDir: string;
  readonly additionalDirs?: readonly string[];
  readonly model?: string;
  readonly thinking?: string;
  readonly permission?: PermissionMode;
  readonly metadata?: JsonObject;
}

export interface RenameSessionInput {
  readonly id: string;
  readonly title: string;
}

export interface ResumeSessionInput {
  readonly id: string;
}

export interface ForkSessionInput {
  readonly id: string;
  readonly forkId?: string;
  readonly title?: string;
  readonly metadata?: JsonObject;
  readonly upToMessage?: number;
}

export interface ExportSessionInput {
  readonly id: string;
  readonly outputPath?: string;
  readonly includeGlobalLog?: boolean;
  readonly version: string;
}

export interface ExportSessionResult {
  readonly zipPath: string;
  readonly entries: readonly string[];
  readonly sessionDir: string;
  readonly manifest: ExportSessionManifest;
}

export interface ListSessionsOptions {
  readonly workDir: string;
}

export interface GetConfigOptions {
  readonly reload?: boolean;
}

export interface CompactOptions {
  readonly instruction?: string;
}

export interface TokenUsage {
  readonly inputOther: number;
  readonly output: number;
  readonly inputCacheRead: number;
  readonly inputCacheCreation: number;
}

export interface SessionUsage {
  readonly byModel?: Record<string, TokenUsage>;
  readonly currentTurn?: TokenUsage;
  readonly total?: TokenUsage;
  /** Cache hit rate across all recorded usage (0–1), undefined when no data. */
  readonly cacheHitRate?: number;
  readonly inputBreakdown?: InputTokenBreakdown;
}

export interface SessionStatus {
  readonly model?: string;
  readonly thinkingLevel: string;
  readonly permission: PermissionMode;
  readonly contextTokens: number;
  readonly maxContextTokens: number;
  readonly contextUsage: number;
  readonly usage?: SessionUsage;
}

export interface SessionSummary {
  readonly id: string;
  readonly title?: string;
  readonly lastPrompt?: string;
  readonly workDir: string;
  readonly sessionDir: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived?: boolean;
  readonly metadata?: JsonObject;
}

export type ResumedSessionState = Pick<
  ResumeSessionResult,
  'sessionMetadata' | 'agents' | 'warning'
>;

export interface ResumedSessionSummary extends SessionSummary, ResumedSessionState {}
