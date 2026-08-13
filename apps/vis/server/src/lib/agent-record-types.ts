// apps/vis/server/src/lib/agent-record-types.ts
// 从 @byfriends/vis-shared 重导出共享 DTO。
// 仅服务端运行时代码(如 AGENT_WIRE_PROTOCOL_VERSION)留在此处。

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
} from '@byfriends/vis-shared';

export type { Message, ContentPart, ToolCall, TokenUsage } from '@byfriends/kosong';
