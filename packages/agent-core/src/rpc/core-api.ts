import type { ContentPart } from '@byfriends/kosong';

import type { AgentConfigData } from '#/agent/config';
import type { AgentContextData } from '#/agent/context';
import type { CronTaskSnapshot } from '#/agent/cron';
import type { GoalBudgetLimits, GoalSnapshot } from '#/agent/goal';
import type { PermissionData, PermissionMode } from '#/agent/permission';
import type { ToolInfo } from '#/agent/tool';
import type { ByfConfig, ByfConfigPatch } from '#/config';
import type { ConfigValidationResult } from '#/config/document';
import type {
  McpConfigListing,
  McpConfigScope,
  McpRawDocument,
  McpScopeState,
} from '#/mcp/config-store';
import type { ResumeSessionResult } from '#/rpc/resumed';
import type { SessionMeta } from '#/session';
import type {
  AgentTreeResponse,
  ContextProjection,
  InspectorSessionSummary,
  SessionDetail,
  WireResponse,
} from '#/session/inspector';
import type { WorkspaceSkillListing } from '#/skill/store';
import type { BackgroundTaskInfo } from '#/tools/builtin';

import type { UsageStatus } from './events';
import type { WithAgentId, WithSessionId } from './types';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export type Unsubscribe = () => void;

export type { ByfConfig, ByfConfigPatch };

export type TextPromptPart = Extract<ContentPart, { type: 'text' }>;
export type PromptPart = Extract<ContentPart, { type: 'text' | 'image_url' | 'video_url' }>;

export type PromptInput = readonly PromptPart[];

export type EmptyPayload = {};
export type SessionMetadataPatch = Partial<Omit<SessionMeta, 'agents'>>;

export interface CreateSessionPayload {
  readonly id?: string;
  readonly workDir: string;
  readonly additionalDirs?: readonly string[];
  readonly model?: string;
  readonly thinking?: string;
  readonly permission?: PermissionMode;
  readonly metadata?: JsonObject;
}

export interface CloseSessionPayload {
  readonly sessionId: string;
}

export interface AddWorkspaceDirPayload {
  readonly sessionId: string;
  readonly dir: string;
  readonly persist?: boolean;
}

export interface AddWorkspaceDirResult {
  readonly workspaceDir: string;
  readonly additionalDirs: readonly string[];
  readonly configPath?: string;
}

export interface ResumeSessionPayload {
  readonly sessionId: string;
}

export interface ForkSessionPayload {
  readonly sessionId: string;
  readonly id?: string;
  readonly title?: string;
  readonly metadata?: JsonObject;
  readonly upToMessage?: number;
}

export interface ExportSessionPayload {
  readonly sessionId: string;
  readonly outputPath?: string;
  /**
   * 为 true 时,活跃的全局诊断日志(`$BYF_HOME/logs/byf.log`)会被复制进
   * zip 的 `logs/global/byf.log`。默认关闭,避免打包并发会话 / 其他项目
   * 的事件。
   */
  readonly includeGlobalLog?: boolean;
  /** 记录到导出 manifest 的宿主版本。 */
  readonly version: string;
}

export interface ExportSessionManifest {
  readonly sessionId: string;
  readonly exportedAt: string;
  readonly byfCodeVersion: string;
  readonly wireProtocolVersion: string;
  readonly os: string;
  readonly nodejsVersion: string;
  readonly sessionFirstActivity?: string;
  readonly sessionLastActivity?: string;
  readonly title?: string;
  readonly workspaceDir?: string;
  /** 会话诊断日志存在时的 zip 相对路径。 */
  readonly sessionLogPath?: string;
  /** 打包的全局诊断日志的 zip 相对路径(仅当 --include-global-log 时)。 */
  readonly globalLogPath?: string;
}

export interface ExportSessionResult {
  readonly zipPath: string;
  readonly entries: readonly string[];
  readonly sessionDir: string;
  readonly manifest: ExportSessionManifest;
}

export interface ListSessionsPayload {
  readonly workDir: string;
}

export interface CoreInfo {
  readonly version: string;
}

export interface SessionSummary {
  readonly id: string;
  readonly title?: string;
  readonly lastPrompt?: string;
  readonly workDir: string;
  readonly sessionDir: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly metadata?: JsonObject;
}

export interface PromptPayload {
  readonly input: readonly ContentPart[];
}
export interface SteerPayload {
  readonly input: readonly ContentPart[];
}
export interface AskSidePayload {
  readonly query: string;
  readonly queryId: string;
}
export interface CancelPayload {
  readonly turnId?: number;
}
export interface CancelSideQueryPayload {
  readonly queryId: string;
}
export interface SetThinkingPayload {
  readonly level: string;
}
export interface SetPermissionPayload {
  readonly mode: PermissionMode;
}
export interface CreateGoalPayload {
  readonly objective: string;
  readonly replace?: boolean;
  readonly budget?: GoalBudgetLimits;
}
export type GetGoalResult = GoalSnapshot | null;
export type PauseGoalResult = GoalSnapshot | null;
export type ResumeGoalResult = GoalSnapshot | null;
export type CancelGoalResult = GoalSnapshot | null;
export interface SetModelPayload {
  readonly model: string;
}
export interface SetModelResult {
  readonly model: string;
  readonly providerName?: string;
}
export interface BeginCompactionPayload {
  readonly instruction?: string;
}
export interface RegisterToolPayload {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
}
export interface UnregisterToolPayload {
  readonly name: string;
}
export interface SetActiveToolsPayload {
  readonly names: readonly string[];
}
export interface StopBackgroundPayload {
  readonly taskId: string;
  /** 随任务记录持久化的自由格式人类可读原因。 */
  readonly reason?: string;
}
export interface GetBackgroundOutputPayload {
  readonly taskId: string;
  readonly tail?: number;
}
export interface GetBackgroundOutputPathPayload {
  readonly taskId: string;
}
export interface GetBackgroundPayload {
  /**
   * 省略时返回所有任务(含 terminal/lost)。传 `true` 过滤为仅活跃任务——
   * 对面向模型的表面有用。UI/TUI 消费者应保持 undefined。
   */
  readonly activeOnly?: boolean;
  /** 限制返回的任务数。省略时返回全部匹配任务。 */
  readonly limit?: number;
}
export interface SkillSummary {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly source: 'builtin' | 'user' | 'extra' | 'project';
  readonly type?: string;
  readonly disableModelInvocation?: boolean;
}

export interface ActivateSkillPayload {
  readonly name: string;
  readonly args?: string;
}

export interface McpServerInfo {
  readonly name: string;
  readonly transport: 'stdio' | 'http' | 'sse';
  readonly status: 'pending' | 'connected' | 'failed' | 'disabled' | 'needs-auth';
  readonly toolCount: number;
  readonly error?: string;
}

export interface McpStartupMetrics {
  readonly durationMs: number;
}

export interface ReconnectMcpServerPayload {
  readonly name: string;
}

export interface RenameSessionPayload {
  readonly title: string;
}

export interface UpdateSessionMetadataPayload {
  readonly metadata: SessionMetadataPatch;
}

export type SetByfConfigPayload = ByfConfigPatch;

export interface RemoveByfModelPayload {
  readonly modelId: string;
}

export interface RemoveByfProviderPayload {
  readonly providerId: string;
}

/** 按模型别名解析合并能力(别名标签 ∪ provider 注册表),供 UI 预填能力编辑器。 */
export interface ResolveModelCapabilitiesPayload {
  readonly model: string;
}

/** 合并后的能力布尔面,可 JSON 序列化跨 RPC。 */
export interface ResolvedModelCapabilities {
  readonly image_in: boolean;
  readonly video_in: boolean;
  readonly audio_in: boolean;
  readonly tool_use: boolean;
  readonly thinking: boolean;
  readonly thinking_effort: boolean;
  readonly thinking_xhigh: boolean;
  readonly thinking_max: boolean;
}

export interface ShellExecPayload {
  readonly sessionId: string;
  readonly command: string;
  readonly cwd?: string;
  readonly timeout?: number;
}

export interface ShellExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

export interface GetCronTasksResult {
  readonly tasks: readonly CronTaskSnapshot[];
}

/** 宿主路径 cron 删除(PRD-0024 / ADR-0030)。不是工具权限表面。 */
export interface DeleteCronTaskPayload {
  readonly id: string;
}

export interface DeleteCronTaskResult {
  readonly deleted: boolean;
}

// ── Inspector / ConfigDocument / WorkspaceRegistry payloads（PRD-0035）─────

export interface ReadAgentWirePayload {
  readonly sessionId: string;
  readonly agentId: string;
}

export interface ReadContextProjectionPayload {
  readonly sessionId: string;
  readonly agentId: string;
}

export interface DeleteSessionPayload {
  readonly sessionId: string;
}

export interface ConfigDocumentResult {
  readonly path: string;
  /** 磁盘原文（未掩码——HTTP 层在响应前自行 mask）。 */
  readonly text: string;
  /** sha256(磁盘原文)；文件缺失为 null。 */
  readonly revision: string | null;
  /** 解析出的配置（含 raw 结构）；文件缺失时为默认配置。 */
  readonly parsed: ByfConfig;
}

export interface ValidateConfigTextPayload {
  readonly text: string;
}

export interface WriteConfigTextPayload {
  readonly text: string;
  readonly expectedRevision: string | null;
}

export interface ConfigWriteResult {
  readonly revision: string;
}

export interface AddWorkspacePayload {
  readonly workDir: string;
}

export interface RemoveWorkspacePayload {
  readonly workDir: string;
}

// ── MCP config store / workspace skills(PRD-0036 / ADR-0039)───────────────

export type {
  McpConfigListing,
  McpConfigScope,
  McpRawDocument,
  McpScopeState,
  McpServerEntry,
} from '#/mcp/config-store';

export type {
  SkillGroupScope,
  WorkspaceSkillEntry,
  WorkspaceSkillGroup,
  WorkspaceSkillListing,
  WorkspaceSkillRoot,
} from '#/skill/store';

export interface ListWorkspaceSkillsPayload {
  readonly workDir: string;
}

export interface ListMcpServerConfigsPayload {
  readonly workDir: string;
}

export interface ReadMcpRawPayload {
  readonly workDir: string;
  readonly scope: McpConfigScope;
}

export interface UpsertMcpServerConfigPayload {
  readonly workDir: string;
  readonly scope: McpConfigScope;
  readonly name: string;
  /** 常用字段;env/headers 值可为占位符(不动 = 保留磁盘原值)。 */
  readonly config: Record<string, unknown>;
}

export interface RemoveMcpServerConfigPayload {
  readonly workDir: string;
  readonly scope: McpConfigScope;
  readonly name: string;
}

export interface WriteMcpRawPayload {
  readonly workDir: string;
  readonly scope: McpConfigScope;
  readonly text: string;
}

export interface AgentAPI {
  prompt: (payload: PromptPayload) => void;
  steer: (payload: SteerPayload) => void;
  askSide: (payload: AskSidePayload) => void;
  cancelSideQuery: (payload: CancelSideQueryPayload) => void;
  cancel: (payload: CancelPayload) => void;
  setThinking: (payload: SetThinkingPayload) => void;
  setPermission: (payload: SetPermissionPayload) => void;
  createGoal: (payload: CreateGoalPayload) => GetGoalResult;
  getGoal: (payload: EmptyPayload) => GetGoalResult;
  pauseGoal: (payload: EmptyPayload) => PauseGoalResult;
  resumeGoal: (payload: EmptyPayload) => ResumeGoalResult;
  cancelGoal: (payload: EmptyPayload) => CancelGoalResult;
  getCronTasks: (payload: EmptyPayload) => GetCronTasksResult;
  deleteCronTask: (payload: DeleteCronTaskPayload) => DeleteCronTaskResult;
  setModel: (payload: SetModelPayload) => SetModelResult;
  getModel: (payload: EmptyPayload) => string;
  beginCompaction: (payload: BeginCompactionPayload) => void;
  cancelCompaction: (payload: EmptyPayload) => void;
  registerTool: (payload: RegisterToolPayload) => void;
  unregisterTool: (payload: UnregisterToolPayload) => void;
  setActiveTools: (payload: SetActiveToolsPayload) => void;
  stopBackground: (payload: StopBackgroundPayload) => void;
  clearContext: (payload: EmptyPayload) => void;
  activateSkill: (payload: ActivateSkillPayload) => void;
  getBackgroundOutput: (payload: GetBackgroundOutputPayload) => string;
  getBackgroundOutputPath: (payload: GetBackgroundOutputPathPayload) => string | undefined;
  getContext: (payload: EmptyPayload) => AgentContextData;
  getConfig: (payload: EmptyPayload) => AgentConfigData;
  getPermission: (payload: EmptyPayload) => PermissionData;
  getUsage: (payload: EmptyPayload) => UsageStatus;
  getTools: (payload: EmptyPayload) => readonly ToolInfo[];
  getBackground: (payload: GetBackgroundPayload) => readonly BackgroundTaskInfo[];
}

type AgentAPIWithId = WithAgentId<AgentAPI>;

export interface SessionAPI extends AgentAPIWithId {
  renameSession: (payload: RenameSessionPayload) => void;
  updateSessionMetadata: (payload: UpdateSessionMetadataPayload) => void;
  getSessionMetadata: (payload: EmptyPayload) => SessionMeta;
  listSkills: (payload: EmptyPayload) => readonly SkillSummary[];
  listMcpServers: (payload: EmptyPayload) => readonly McpServerInfo[];
  getMcpStartupMetrics: (payload: EmptyPayload) => McpStartupMetrics;
  reconnectMcpServer: (payload: ReconnectMcpServerPayload) => void;
  generateAgentsMd: (payload: EmptyPayload) => void;
  shellExec: (payload: Omit<ShellExecPayload, 'sessionId'>) => Promise<ShellExecResult>;
}

type SessionAPIWithId = WithSessionId<SessionAPI>;

export interface CoreAPI extends SessionAPIWithId {
  getCoreInfo: (payload: EmptyPayload) => CoreInfo;
  getByfConfig: (payload: EmptyPayload) => ByfConfig;
  setByfConfig: (payload: SetByfConfigPayload) => ByfConfig;
  removeByfProvider: (payload: RemoveByfProviderPayload) => ByfConfig;
  removeByfModel: (payload: RemoveByfModelPayload) => ByfConfig;
  resolveModelCapabilities: (payload: ResolveModelCapabilitiesPayload) => ResolvedModelCapabilities;
  createSession: (payload: CreateSessionPayload) => SessionSummary;
  closeSession: (payload: CloseSessionPayload) => void;
  waitForBackgroundTasksOnPrint: (payload: CloseSessionPayload) => void;
  addWorkspaceDir: (payload: AddWorkspaceDirPayload) => AddWorkspaceDirResult;
  getWorkspaceRoots: (payload: CloseSessionPayload) => AddWorkspaceDirResult;
  resumeSession: (payload: ResumeSessionPayload) => ResumeSessionResult;
  forkSession: (payload: ForkSessionPayload) => ResumeSessionResult;
  listSessions: (payload: ListSessionsPayload) => readonly SessionSummary[];
  exportSession: (payload: ExportSessionPayload) => ExportSessionResult;
  // ── Inspector / ConfigDocument / WorkspaceRegistry（PRD-0035 Wave A）──
  listInspectableSessions: (payload: EmptyPayload) => readonly InspectorSessionSummary[];
  readSessionInspection: (payload: { readonly sessionId: string }) => SessionDetail | null;
  readAgentWire: (payload: ReadAgentWirePayload) => WireResponse;
  readContextProjection: (payload: ReadContextProjectionPayload) => ContextProjection;
  readAgentTree: (payload: { readonly sessionId: string }) => AgentTreeResponse;
  deleteSession: (payload: DeleteSessionPayload) => void;
  getConfigDocument: (payload: EmptyPayload) => ConfigDocumentResult;
  validateConfigText: (payload: ValidateConfigTextPayload) => ConfigValidationResult;
  writeConfigText: (payload: WriteConfigTextPayload) => ConfigWriteResult;
  listWorkspaces: (payload: EmptyPayload) => string[];
  hiddenWorkspaces: (payload: EmptyPayload) => string[];
  addWorkspace: (payload: AddWorkspacePayload) => string[];
  removeWorkspace: (payload: RemoveWorkspacePayload) => boolean;
  // ── MCP config store(PRD-0036 / ADR-0039;workDir 需为已注册工作区,由
  //    web-server 端点层校验,core 信任调用方)──
  listMcpServerConfigs: (payload: ListMcpServerConfigsPayload) => McpConfigListing;
  readMcpConfigRaw: (payload: ReadMcpRawPayload) => McpRawDocument;
  upsertMcpServerConfig: (payload: UpsertMcpServerConfigPayload) => McpScopeState;
  removeMcpServerConfig: (payload: RemoveMcpServerConfigPayload) => McpScopeState;
  writeMcpConfigRaw: (payload: WriteMcpRawPayload) => McpRawDocument;
  listWorkspaceSkills: (payload: ListWorkspaceSkillsPayload) => WorkspaceSkillListing;
}
