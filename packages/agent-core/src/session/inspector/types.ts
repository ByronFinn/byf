/**
 * Inspector DTO（单一事实源）。
 *
 * 由 `apps/vis/shared/types.ts` 上移而来（PRD-0035 R-A1/R-B7）：vis 与 web
 * 不再各自定义这些类型，core 的 Inspector 是唯一出处，`web-shared` 从 core
 * re-export（type-only）。
 */

import type { Message, ContentPart, ToolCall, TokenUsage } from '@byfriends/kosong';

import type { ContextMessage, PromptOrigin } from '#/agent/context/types';
import type { PermissionMode } from '#/agent/permission/types';
import type { AgentRecord } from '#/agent/records/types';
import type { LoopRecordedEvent } from '#/loop/events';

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
  source: 'append_message' | 'compaction_summary' | 'cache_churn';
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
}

// ── Session / agent / wire DTOs ────────────────────────────────────────────

export type SessionHealth =
  | 'ok'
  | 'broken_state'
  | 'broken_main_wire'
  | 'missing_main_wire'
  | 'unsupported_protocol';

export interface InspectorSessionSummary {
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
