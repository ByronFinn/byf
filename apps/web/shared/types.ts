/**
 * web-shared — 浏览器 Web 客户端与 web-server 之间的线路 DTO。
 *
 * 仅类型再导出（`import type` / `export type`）：编译期擦除，agent 运行时代码不会
 * 进入浏览器 bundle。运行时值（ByfHarness、Session 等）只存在于 web-server。
 *
 * 全部经 `@byfriends/sdk` 取类型——SDK 经 API Extractor 把公开面打成单一 bundled
 * `.d.ts`,消费方以项目引用引用 SDK 时,不会拉入 agent-core 源码(含 `.md` raw import)。
 */

import type {
  AgentInfo,
  AgentNode,
  AgentReplayRecord,
  AgentRecord,
  AgentTreeResponse,
  BackgroundTaskInfo,
  ConfigSnapshot,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalScope,
  ConfigValidationResult,
  ContentPart,
  ContextMessage,
  ContextProjection,
  Event,
  InspectorSessionSummary,
  LoopRecordedEvent,
  McpConfigListing,
  McpConfigScope,
  McpRawDocument,
  McpScopeState,
  McpServerConfig,
  McpServerEntry,
  Message,
  PermissionMode,
  ProjectedMessage,
  SessionHealth,
  TokenUsage,
  ToolCall,
  UsageTotals,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionItem,
  QuestionOption,
  QuestionRequest,
  QuestionResponse,
  QuestionResult,
  ResumedSessionSummary,
  SessionDetail,
  SessionStatus,
  SessionSummary,
  SkillSummary,
  ToolInputDisplay,
  WireEntry,
  WireResponse,
} from '@byfriends/sdk';

// 公开再导出:消费方(web-client / web-server)从 web-shared 取线路类型。
export type {
  AgentInfo,
  AgentNode,
  AgentReplayRecord,
  AgentRecord,
  AgentTreeResponse,
  BackgroundTaskInfo,
  ConfigSnapshot,
  ContentPart,
  ContextMessage,
  ContextProjection,
  Event,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalDecision,
  ApprovalScope,
  ConfigValidationResult,
  InspectorSessionSummary,
  LoopRecordedEvent,
  McpConfigListing,
  McpConfigScope,
  McpRawDocument,
  McpScopeState,
  McpServerConfig,
  McpServerEntry,
  Message,
  ProjectedMessage,
  SessionHealth,
  TokenUsage,
  ToolCall,
  ToolInputDisplay,
  UsageTotals,
  QuestionRequest,
  QuestionItem,
  QuestionOption,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionResponse,
  QuestionResult,
  PermissionMode,
  ResumedSessionSummary,
  SessionDetail,
  SessionStatus,
  SessionSummary,
  SkillSummary,
  WireEntry,
  WireResponse,
};

// ---- Server → client：SSE 帧 -------------------------------------------------
// SSE `event:` 字段 = `frame.type`；`data:` 字段 = JSON.stringify(frame)。

/** 首帧:连接建立,确认订阅的会话。 */
export interface SysConnectedFrame {
  readonly type: 'sys.connected';
  readonly sessionId: string;
}
/** 心跳:保活,防止代理掐断空闲连接。 */
export interface SysHeartbeatFrame {
  readonly type: 'sys.heartbeat';
}
/** 服务端错误(如 prompt 触发的非预期异常),UI 内联提示。 */
export interface SysErrorFrame {
  readonly type: 'sys.error';
  readonly message: string;
}
/** 透传 agent 原始事件信封(含 agentId/sessionId 路由字段)。 */
export interface AgentEventFrame {
  readonly type: 'agent.event';
  readonly event: Event;
}
/** 反向 RPC:agent 请求工具审批。浏览器回传决议到 POST /approvals/:requestId。 */
export interface ApprovalRequestedFrame {
  readonly type: 'approval.requested';
  readonly requestId: string;
  readonly request: ApprovalRequest;
}
/** 审批已裁决(决议已回传给 agent)。UI 据此关闭卡片。 */
export interface ApprovalSettledFrame {
  readonly type: 'approval.settled';
  readonly requestId: string;
  readonly decision: ApprovalDecision;
}
/** 反向 RPC:agent 请求用户作答。浏览器回传答案到 POST /questions/:requestId。 */
export interface QuestionRequestedFrame {
  readonly type: 'question.requested';
  readonly requestId: string;
  readonly request: QuestionRequest;
}
/** 作答已回传。UI 据此关闭卡片。 */
export interface QuestionSettledFrame {
  readonly type: 'question.settled';
  readonly requestId: string;
}

export type ServerFrame =
  | SysConnectedFrame
  | SysHeartbeatFrame
  | SysErrorFrame
  | AgentEventFrame
  | ApprovalRequestedFrame
  | ApprovalSettledFrame
  | QuestionRequestedFrame
  | QuestionSettledFrame;

// ---- Client → server：请求体 -------------------------------------------------

export interface CreateSessionBody {
  readonly workDir: string;
  readonly model?: string;
  readonly thinking?: string;
  readonly permission?: PermissionMode;
}

export interface ListSessionsQuery {
  readonly workDir: string;
}

/** 统一会话元数据端点(PRD-0034 R-A1):一次可改多项。 */
export interface UpdateSessionMetaBody {
  readonly title?: string;
  readonly pinned?: boolean;
  readonly archived?: boolean;
}

export interface ForkSessionBody {
  readonly upToMessage?: number;
}

/**
 * prompt 图片附件(data-URL,base64 载荷)。服务端经与 TUI 粘贴相同的
 * `compressImageForModel` + `ImageLimits` 管道压缩后展开为 `image_url` part,
 * 浏览器不做压缩(预算与实现只在服务端保留一份)。
 */
export interface PromptImageBody {
  readonly dataUrl: string;
}

export interface PromptBody {
  readonly input: string;
  /** 粘贴的图片附件;文本与图片可同时存在,亦可仅图片。 */
  readonly images?: readonly PromptImageBody[];
}

export interface SteerBody {
  readonly input: string;
  /** 与 PromptBody.images 同构(steer 也允许带图)。 */
  readonly images?: readonly PromptImageBody[];
}

export interface SetPermissionBody {
  readonly mode: PermissionMode;
}

export interface UpdateSessionModelBody {
  readonly model: string;
}

/** 会话内推理强度档位(与 agent-core thinkingLevel / CLI 语义一致)。 */
export type ThinkingEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
/** 全局思考模式:auto = 模型自动决定;on = 强制开启 + effort;off = 强制关闭。 */
export type ThinkingMode = 'auto' | 'on' | 'off';

export interface UpdateSessionThinkingBody {
  readonly level: ThinkingEffort | 'off';
}

export interface ActivateSkillBody {
  readonly name: string;
  readonly args?: string;
}

/** 目录浏览条目(@ 引用文件/文件夹用)。 */
export interface FsEntry {
  readonly name: string;
  /** 相对 root 的路径(选择后插入 `@path` 文本)。 */
  readonly path: string;
  readonly isDir: boolean;
}

export interface FsListResponse {
  readonly entries: readonly FsEntry[];
}

export interface UpdateConfigBody {
  readonly defaultModel?: string;
  readonly defaultPermissionMode?: PermissionMode;
  readonly defaultThinking?: boolean;
  readonly thinking?: {
    readonly mode?: ThinkingMode;
    readonly effort?: ThinkingEffort;
  };
}

export interface ApprovalDecisionBody {
  readonly decision: ApprovalDecision;
  readonly scope?: ApprovalScope;
  readonly feedback?: string;
  readonly selectedLabel?: string;
}

export interface QuestionAnswerBody {
  readonly answers: QuestionAnswers;
}

// ---- 响应 --------------------------------------------------------------------

export interface ListSessionsResponse {
  readonly sessions: readonly SessionSummary[];
}

// ---- 工作区(对齐 deepseek harness 侧边栏:workDir 即工作区) -----------------

/** 一个工作区:目录路径 + 显示名(basename)+ 该目录下的会话。 */
export interface WorkspaceView {
  readonly workDir: string;
  readonly title: string;
  readonly sessions: readonly SessionSummary[];
}

export interface WorkspaceListResponse {
  readonly workspaces: readonly WorkspaceView[];
}

export interface CreateWorkspaceBody {
  readonly path: string;
}

export interface WorkspaceResponse {
  readonly workspace: WorkspaceView;
}

/** 原生目录选择结果:取消时为 null。 */
export interface PickDirectoryResponse {
  readonly path: string | null;
}

export interface CreateSessionResponse {
  readonly session: SessionSummary;
}

export interface ForkSessionResponse {
  readonly session: SessionSummary;
}

/** 新增 provider(PRD-0034 R-D3):一次提交建全(id + 至少一个模型别名)。 */
export interface ProviderCreateBody {
  readonly id: string;
  readonly type:
    | 'anthropic'
    | 'openai-completions'
    | 'google-genai'
    | 'openai_responses'
    | 'vertexai';
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly customHeaders?: Record<string, string>;
  readonly extraBody?: Record<string, unknown>;
  readonly models: readonly ModelUpsertBody[];
}

/** 编辑 provider:apiKey 只写不读(空/缺省 = 不变)。 */
export interface ProviderUpdateBody {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly type?: ProviderCreateBody['type'];
  readonly customHeaders?: Record<string, string>;
  readonly extraBody?: Record<string, unknown>;
}

/** models 别名行(新增/编辑共用;maxContextSize 由客户端解析 256K/1M 后传数字)。 */
export interface ModelUpsertBody {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly maxContextSize: number;
  readonly maxOutputSize?: number;
  readonly capabilities?: readonly string[];
  readonly displayName?: string;
}

export type ModelUpdateBody = Partial<Omit<ModelUpsertBody, 'id'>>;

/** fetch available models 草稿探测(R-D3):不落盘。 */
export interface DiscoverModelsBody {
  readonly type: ProviderCreateBody['type'];
  readonly baseUrl: string;
  readonly apiKey?: string;
}

export interface DiscoverModelsResponse {
  readonly models: readonly { readonly id: string }[];
}

/** 归档管理区数据源(PRD-0034 R-A3):session_index 聚合,不依赖工作区注册表。 */
export interface ArchivedSessionsResponse {
  readonly sessions: readonly SessionSummary[];
}

/**
 * resume 响应。运行时对象即 SDK 的完整 `ResumeSessionResult`——除摘要字段外
 * 还携带 `agents.main.replay`(agent-core 从磁盘 wire 重建的历史记录),客户端
 * 据此恢复转录;此处仅收敛其类型,线路数据自 resume 端点原样透传。
 */
export interface ResumeSessionResponse {
  readonly session: ResumedSessionSummary;
}

export interface SessionStatusResponse {
  readonly session: SessionSummary;
  readonly status: SessionStatus;
}

// ---- 配置(设置弹层;脱敏视图,apiKey 不回线路) --------------------------------

/** 模型别名条目(可设为默认)。 */
export interface ConfigModelView {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly displayName?: string;
  /** R-D3:编辑表单回显。 */
  readonly maxContextSize?: number;
  readonly capabilities?: readonly string[];
  /**
   * 服务端按别名合并的能力(别名标签 ∪ provider 注册表),用于编辑器预填;
   * 别名无法解析(如 provider 缺失)时为 undefined。加注释:与注册表取并集,
   * 只能加不能减。
   */
  readonly resolvedCapabilities?: ResolvedCapabilities;
}

/** 合并后的能力布尔面(与 @byfriends/agent-core 的 ResolvedModelCapabilities 同构)。 */
export interface ResolvedCapabilities {
  readonly image_in: boolean;
  readonly video_in: boolean;
  readonly audio_in: boolean;
  readonly tool_use: boolean;
  readonly thinking: boolean;
  readonly thinking_effort: boolean;
  readonly thinking_xhigh: boolean;
  readonly thinking_max: boolean;
}

/** provider 摘要(不携带密钥本身,仅是否已配置)。 */
export interface ConfigProviderView {
  readonly id: string;
  readonly type: string;
  readonly baseUrl?: string;
  readonly hasApiKey: boolean;
  /** R-D3:key 来源标记:env 引用 → 输入禁用;oauth → 只读引导 CLI。 */
  readonly keyFromEnv?: boolean;
  readonly oauth?: boolean;
}

export interface ConfigResponse {
  readonly configPath: string;
  readonly defaultModel?: string;
  readonly defaultPermissionMode?: PermissionMode;
  readonly defaultThinking?: boolean;
  /** 思考模式与默认强度(设置弹层「思考」行)。 */
  readonly thinking?: {
    readonly mode?: ThinkingMode;
    readonly effort?: ThinkingEffort;
  };
  readonly models: readonly ConfigModelView[];
  readonly providers: readonly ConfigProviderView[];
}

export interface ApiError {
  readonly error: string;
  readonly code?: string;
}

// ---- Inspector / ConfigDocument（PRD-0035 Wave B/E）-------------------------

/** `GET /api/sessions` 无 workDir 时的全量投影（原 vis 列表语义）。 */
export interface ListInspectableSessionsResponse {
  readonly sessions: readonly InspectorSessionSummary[];
}

/** `GET /api/sessions/:id/wire`——WireResponse 原样（含 warnings）。 */
export type SessionWireResponse = WireResponse;

/** `GET /api/sessions/:id/context`——ContextProjection 原样。 */
export type SessionContextResponse = ContextProjection;

/** `GET /api/sessions/:id/agents`——AgentTreeResponse 原样。 */
export type SessionAgentsResponse = AgentTreeResponse;

/** `GET /api/sessions/:id/state`——SessionDetail 原样（state 为原始 JSON）。 */
export type SessionStateResponse = SessionDetail;

export interface ConfigDocumentResponse {
  readonly path: string;
  /** 磁盘原文，密钥值已服务端掩码（ADI-0038 D4：无明文回显）。 */
  readonly text: string;
  /** sha256(磁盘原文)；文件缺失为 null。 */
  readonly revision: string | null;
  /** 脱敏解析视图（apiKey 仅 hasApiKey）；文件缺失或损坏时为 null。 */
  readonly parsed: ConfigResponse | null;
  /** 文件损坏（TOML/schema 无效）时为 true；错误细节不回线路（防密钥样文本泄漏）。 */
  readonly invalid?: boolean;
}

export interface WriteConfigResponse {
  readonly config: ConfigResponse;
  readonly revision: string;
}

// ---- MCP 配置页签(PRD-0036 / ADR-0039)--------------------------------------

/**
 * `GET /api/mcp/servers?workDir=` —— 按 scope 分组的 server 列表(env/headers
 * 值已掩码);user 条目在 project 同名时带 `overridden`。响应体即
 * `McpConfigListing`(自 web-shared 再导出)。
 */

/** `PUT /api/mcp/servers/:scope?workDir=` —— upsert(字段级合并 + 占位符还原)。 */
export interface McpServerUpsertBody {
  readonly name: string;
  /** 常用字段;env/headers 值可为占位符(不动 = 保留磁盘原值)。 */
  readonly config: Record<string, unknown>;
}

/** `PUT /api/mcp/raw/:scope?workDir=` —— RAW 兜底写盘(校验失败 422)。 */
export interface McpRawWriteBody {
  readonly text: string;
}
