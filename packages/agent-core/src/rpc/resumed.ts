import type { AgentType } from '#/agent';
import type { AgentConfigData, AgentConfigUpdateData } from '#/agent/config';
import type { AgentContextData, ContextMessage } from '#/agent/context';
import type {
  PermissionApprovalResultRecord,
  PermissionData,
  PermissionMode,
} from '#/agent/permission';
import type { ToolInfo } from '#/agent/tool';
import type { SessionSummary } from '#/rpc/core-api';
import type { UsageStatus } from '#/rpc/events';
import type { SessionMeta } from '#/session';
import type { BackgroundTaskInfo } from '#/tools/builtin';

export type AgentReplayRecord =
  | { type: 'message'; message: ContextMessage }
  | { type: 'config_updated'; config: AgentConfigUpdateData }
  | { type: 'permission_updated'; mode: PermissionMode }
  | { type: 'approval_result'; record: PermissionApprovalResultRecord };

export interface ResumedAgentState {
  readonly type: AgentType;
  readonly config: AgentConfigData;
  readonly context: AgentContextData;
  readonly replay: readonly AgentReplayRecord[];
  readonly permission: PermissionData;
  readonly usage: UsageStatus;
  readonly tools: readonly ToolInfo[];
  readonly toolStore?: Readonly<Record<string, unknown>>;
  readonly background: readonly BackgroundTaskInfo[];
  /**
   * For sub-agents: the parent agent's tool-call id that spawned this agent.
   * Absent for the main agent and for sessions persisted before this field
   * existed. The TUI uses it to attach a resumed main-agent `Agent` tool-call
   * to this child's activity (replay/usage/text).
   */
  readonly parentToolCallId?: string | undefined;
}

export interface ResumeSessionResult extends SessionSummary {
  readonly sessionMetadata: SessionMeta;
  readonly agents: Readonly<Record<string, ResumedAgentState>>;
  readonly warning?: string | undefined;
}
