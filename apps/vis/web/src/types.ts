// Client-side types — re-export vis DTOs (type-only).
// Canonical shared DTO definitions live in @byfriends/vis-shared (apps/vis/shared/types.ts).
// Both vis-web and vis-server import from the same single source.

export type {
  SessionSummary,
  SessionDetail,
  AgentInfo,
  AgentNode,
  AgentTreeResponse,
  SessionHealth,
  WireResponse,
  WireEntry,
  ApiError,
  AgentRecord,
  ContextMessage,
  PromptOrigin,
  TokenUsage,
  PermissionMode,
  LoopRecordedEvent,
  ContentPart,
  Message,
  ToolCall,
  ProjectedMessage,
  UsageTotals,
  ConfigSnapshot,
  ContextProjection,
} from '@byfriends/vis-shared';

export interface DeleteSessionResponse {
  sessionId: string;
  deleted: true;
}

/**
 * Shape returned by `GET /api/sessions/:id/context?agent=<agentId>`.
 *
 * Mirrors `ContextProjection` from @byfriends/vis-shared, plus the `sessionId`
 * and `agentId` echoed by the route.
 */
export interface ContextResponse {
  sessionId: string;
  agentId: string;
  messages: import('@byfriends/vis-shared').ProjectedMessage[];
  usage: import('@byfriends/vis-shared').UsageTotals;
  config: import('@byfriends/vis-shared').ConfigSnapshot;
  permission: { mode: import('@byfriends/vis-shared').PermissionMode | null };
}
