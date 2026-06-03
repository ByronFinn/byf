import type {
  ExportSessionManifest,
  ResumeSessionResult,
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
  readonly identity?: HostIdentity | undefined;
  readonly homeDir?: string | undefined;
  readonly configPath?: string | undefined;
  readonly autoLoadConfig?: boolean | undefined;
  readonly uiMode?: string;
  readonly skillDirs?: readonly string[];
}

export interface CreateSessionOptions {
  readonly id?: string | undefined;
  readonly workDir: string;
  readonly model?: string | undefined;
  readonly thinking?: string | undefined;
  readonly permission?: PermissionMode | undefined;
  readonly planMode?: boolean;
  readonly metadata?: JsonObject | undefined;
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
  readonly forkId?: string | undefined;
  readonly title?: string | undefined;
  readonly metadata?: JsonObject;
}

export interface ExportSessionInput {
  readonly id: string;
  readonly outputPath?: string | undefined;
  readonly includeGlobalLog?: boolean | undefined;
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
  readonly reload?: boolean | undefined;
}

export interface CompactOptions {
  readonly instruction?: string | undefined;
}

export interface PlanInfo {
  readonly id: string;
  readonly exists: boolean;
  readonly content: string;
  readonly path: string;
}

export type SessionPlan = PlanInfo | null;

export interface TokenUsage {
  readonly inputOther: number;
  readonly output: number;
  readonly inputCacheRead: number;
  readonly inputCacheCreation: number;
}

export interface SessionUsage {
  readonly byModel?: Record<string, TokenUsage> | undefined;
  readonly currentTurn?: TokenUsage | undefined;
  readonly total?: TokenUsage | undefined;
}

export interface SessionStatus {
  readonly model?: string;
  readonly thinkingLevel: string;
  readonly permission: PermissionMode;
  readonly planMode: boolean;
  readonly contextTokens: number;
  readonly maxContextTokens: number;
  readonly contextUsage: number;
  readonly usage?: SessionUsage;
}

export interface SessionSummary {
  readonly id: string;
  readonly title?: string | undefined;
  readonly lastPrompt?: string;
  readonly workDir: string;
  readonly sessionDir: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly archived?: boolean | undefined;
  readonly metadata?: JsonObject | undefined;
}

export type ResumedSessionState = Pick<ResumeSessionResult, 'sessionMetadata' | 'agents' | 'warning'>;

export interface ResumedSessionSummary extends SessionSummary, ResumedSessionState {}
