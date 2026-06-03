// Client-side types — re-export shared DTOs (type-only cross-package import).
// The shared types module is the single source of truth for all session /
// agent / wire shapes. vis-server imports from ../shared/types.ts; vis-web
// uses the copy at ./shared-types.ts for tsconfig isolation.

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
} from './shared-types';

export interface DeleteSessionResponse {
  sessionId: string;
  deleted: true;
}

/**
 * Shape returned by `GET /api/sessions/:id/context?agent=<agentId>`.
 *
 * Mirrors `ContextProjection` from shared/types, plus the `sessionId`
 * and `agentId` echoed by the route.
 */
export interface ContextResponse {
  sessionId: string;
  agentId: string;
  messages: import('./shared-types').ProjectedMessage[];
  usage: import('./shared-types').UsageTotals;
  config: import('./shared-types').ConfigSnapshot;
  permission: { mode: import('./shared-types').PermissionMode | null };
  planMode: { active: boolean; id?: string };
}
