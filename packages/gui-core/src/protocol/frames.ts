import type { Event } from '@byfriends/sdk';

// ── JSON-RPC 2.0 frame shapes ──────────────────────────────────────

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly result?: unknown;
  readonly error?: JsonRpcError;
}

export interface JsonRpcNotification {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: unknown;
}

export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ── gui-core method namespace ──────────────────────────────────────

// Host → core method names (mirroring CoreAPI)
export const METHOD_CORE_CREATE_SESSION = 'core.createSession';
export const METHOD_CORE_RESUME_SESSION = 'core.resumeSession';
export const METHOD_CORE_LIST_SESSIONS = 'core.listSessions';
export const METHOD_CORE_CLOSE_SESSION = 'core.closeSession';
export const METHOD_CORE_GET_BYF_CONFIG = 'core.getByfConfig';
export const METHOD_CORE_SET_BYF_CONFIG = 'core.setByfConfig';
export const METHOD_CORE_LIST_MCP_SERVERS = 'core.listMcpServers';
export const METHOD_CORE_RECONNECT_MCP_SERVER = 'core.reconnectMcpServer';

export const METHOD_SESSION_PROMPT = 'session.prompt';
export const METHOD_SESSION_STEER = 'session.steer';
export const METHOD_SESSION_CANCEL = 'session.cancel';
export const METHOD_SESSION_SET_MODEL = 'session.setModel';
export const METHOD_SESSION_SET_THINKING = 'session.setThinking';
export const METHOD_SESSION_SET_PERMISSION = 'session.setPermission';
export const METHOD_SESSION_COMPACT = 'session.compact';

export const METHOD_AGENT_GET_CONTEXT = 'agent.getContext';
export const METHOD_AGENT_GET_CONFIG = 'agent.getConfig';
export const METHOD_AGENT_GET_PERMISSION = 'agent.getPermission';
export const METHOD_AGENT_GET_USAGE = 'agent.getUsage';
export const METHOD_AGENT_GET_TOOLS = 'agent.getTools';
export const METHOD_AGENT_LIST_SKILLS = 'agent.listSkills';
export const METHOD_AGENT_ACTIVATE_SKILL = 'agent.activateSkill';
export const METHOD_AGENT_GET_BACKGROUND = 'agent.getBackground';
export const METHOD_AGENT_STOP_BACKGROUND = 'agent.stopBackground';

// Core → host (reverse RPC method names, mapped from SDKAPI)
export const METHOD_EVENT = 'event'; // notification (no id)
export const METHOD_REQUEST_APPROVAL = 'requestApproval'; // reverse request
export const METHOD_REQUEST_QUESTION = 'requestQuestion'; // reverse request
export const METHOD_TOOL_CALL = 'toolCall'; // reverse request

// ── Event frame shapes ─────────────────────────────────────────────

export interface EventNotification {
  readonly jsonrpc: '2.0';
  readonly method: typeof METHOD_EVENT;
  readonly params: Event;
}

export interface ApprovalRequestPayload {
  readonly turnId?: string | undefined;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly action: string;
  readonly display: unknown;
}

export interface ApprovalResponsePayload {
  readonly decision: 'approved' | 'rejected' | 'cancelled';
  readonly scope?: 'session' | undefined;
  readonly feedback?: string | undefined;
  readonly selectedLabel?: string | undefined;
}

export interface QuestionRequestPayload {
  readonly question: string;
  readonly options: readonly { label: string; description?: string }[];
  readonly multiSelect?: boolean;
}

export interface QuestionResultPayload {
  readonly answers: readonly string[];
}