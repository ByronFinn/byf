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
  AgentReplayRecord,
  ApprovalDecision,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalScope,
  ContentPart,
  ContextMessage,
  Event,
  PermissionMode,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionItem,
  QuestionOption,
  QuestionRequest,
  QuestionResponse,
  QuestionResult,
  ResumedSessionSummary,
  SessionStatus,
  SessionSummary,
  SkillSummary,
  ToolInputDisplay,
} from '@byfriends/sdk';

// 公开再导出:消费方(web-client / web-server)从 web-shared 取线路类型。
export type {
  AgentReplayRecord,
  ContentPart,
  ContextMessage,
  Event,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalDecision,
  ApprovalScope,
  ToolInputDisplay,
  QuestionRequest,
  QuestionItem,
  QuestionOption,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionResponse,
  QuestionResult,
  PermissionMode,
  ResumedSessionSummary,
  SessionSummary,
  SessionStatus,
  SkillSummary,
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

export interface PromptBody {
  readonly input: string;
}

export interface SteerBody {
  readonly input: string;
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
}

/** provider 摘要(不携带密钥本身,仅是否已配置)。 */
export interface ConfigProviderView {
  readonly id: string;
  readonly type: string;
  readonly baseUrl?: string;
  readonly hasApiKey: boolean;
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
