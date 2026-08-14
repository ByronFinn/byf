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
  ApprovalDecision,
  ApprovalRequest,
  ApprovalResponse,
  ApprovalScope,
  Event,
  PermissionMode,
  QuestionAnswerMethod,
  QuestionAnswers,
  QuestionItem,
  QuestionOption,
  QuestionRequest,
  QuestionResponse,
  QuestionResult,
  SessionStatus,
  SessionSummary,
  ToolInputDisplay,
} from '@byfriends/sdk';

// 公开再导出:消费方(web-client / web-server)从 web-shared 取线路类型。
export type {
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
  SessionSummary,
  SessionStatus,
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

export interface CreateSessionResponse {
  readonly session: SessionSummary;
}

export interface SessionStatusResponse {
  readonly session: SessionSummary;
  readonly status: SessionStatus;
}

export interface ApiError {
  readonly error: string;
  readonly code?: string;
}
