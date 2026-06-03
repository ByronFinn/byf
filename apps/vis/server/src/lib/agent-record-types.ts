// apps/vis/server/src/lib/agent-record-types.ts
// Re-exports shared DTOs from the vis shared types module.
// Server-only runtime code (e.g. AGENT_WIRE_PROTOCOL_VERSION) stays here.

export { AGENT_WIRE_PROTOCOL_VERSION } from '@byfriends/agent-core';

export type {
  AgentRecord,
  ContextMessage,
  PromptOrigin,
  PermissionMode,
  LoopRecordedEvent,
  ApiError,
  SessionHealth,
  SessionSummary,
  AgentInfo,
  SessionDetail,
  WireEntry,
  WireResponse,
  AgentNode,
  AgentTreeResponse,
} from '../../../shared/types';

export type { Message, ContentPart, ToolCall, TokenUsage } from '@byfriends/kosong';
