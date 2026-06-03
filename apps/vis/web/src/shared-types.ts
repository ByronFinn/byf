// Shared DTO types for vis-web and vis-server.
// Type-only module — no runtime code. Both packages import from here.

import type {
  AgentRecord,
  PermissionMode,
  LoopRecordedEvent,
  ContextMessage,
  PromptOrigin,
} from '@byfriends/agent-core';

import type { Message, ContentPart, ToolCall, TokenUsage } from '@byfriends/kosong';

// Re-export upstream types
export type {
  AgentRecord,
  ContextMessage,
  PromptOrigin,
  PermissionMode,
  LoopRecordedEvent,
  TokenUsage,
  ContentPart,
  ToolCall,
  Message,
};

// ── Projected context ──────────────────────────────────────────────────────

export interface ProjectedMessage {
  lineNo: number;
  time?: number;
  source: 'append_message' | 'compaction_summary';
  message: ContextMessage;
  toolStepUuids: string[];
}

export interface UsageTotals {
  byScope: { session: TokenUsage; turn: TokenUsage };
  byModel: Record<string, TokenUsage>;
}

export interface ConfigSnapshot {
  cwd?: string;
  modelAlias?: string;
  profileName?: string;
  thinkingLevel?: string;
  systemPrompt?: string;
}

export interface ContextProjection {
  messages: ProjectedMessage[];
  usage: UsageTotals;
  config: ConfigSnapshot;
  permission: { mode: PermissionMode | null };
  planMode: { active: boolean; id?: string };
}

// ── Session / agent / wire DTOs ────────────────────────────────────────────

export interface ApiError {
  error: string;
  code:
    | 'NOT_FOUND'
    | 'BAD_REQUEST'
    | 'UNAUTHORIZED'
    | 'READ_ERROR'
    | 'PARSE_ERROR'
    | 'DELETE_ERROR'
    | 'UNSUPPORTED_PROTOCOL';
}

export type SessionHealth =
  | 'ok'
  | 'broken_state'
  | 'broken_main_wire'
  | 'missing_main_wire'
  | 'unsupported_protocol';

export interface SessionSummary {
  sessionId: string;
  sessionDir: string;
  workDir: string;
  title: string | null;
  lastPrompt: string | null;
  isCustomTitle: boolean;
  createdAt: number;
  updatedAt: number;
  agentCount: number;
  mainAgentExists: boolean;
  mainWireRecordCount: number;
  wireProtocolVersion: string | null;
  health: SessionHealth;
}

export interface AgentInfo {
  agentId: string;
  type: 'main' | 'sub' | 'independent';
  parentAgentId: string | null;
  homedir: string;
  wireExists: boolean;
  wireRecordCount: number;
  wireProtocolVersion: string | null;
}

export interface SessionDetail {
  sessionId: string;
  sessionDir: string;
  workDir: string;
  state: unknown;
  agents: AgentInfo[];
}

export interface WireEntry {
  lineNo: number;
  data: AgentRecord;
  raw: unknown;
}

export interface WireResponse {
  sessionId: string;
  agentId: string;
  protocolVersion: string;
  metadata: { protocolVersion: string; createdAt: number };
  records: readonly WireEntry[];
  warnings: string[];
}

export interface AgentNode extends AgentInfo {
  children: AgentNode[];
}

export interface AgentTreeResponse {
  sessionId: string;
  tree: AgentNode[];
}
