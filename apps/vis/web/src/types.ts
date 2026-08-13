// 客户端类型——重导出 vis DTO(仅类型)。
// 规范共享 DTO 定义位于 @byfriends/vis-shared(apps/vis/shared/types.ts)。
// vis-web 与 vis-server 都从同一单一来源导入。

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
 * `GET /api/sessions/:id/context?agent=<agentId>` 返回的形态。
 *
 * 镜像 @byfriends/vis-shared 的 `ContextProjection`,外加路由回显的
 * `sessionId` 与 `agentId`。
 */
export interface ContextResponse {
  sessionId: string;
  agentId: string;
  messages: import('@byfriends/vis-shared').ProjectedMessage[];
  usage: import('@byfriends/vis-shared').UsageTotals;
  config: import('@byfriends/vis-shared').ConfigSnapshot;
  permission: { mode: import('@byfriends/vis-shared').PermissionMode | null };
}
