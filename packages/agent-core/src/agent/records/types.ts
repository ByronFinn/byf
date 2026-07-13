import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import type { LoopRecordedEvent } from '../../loop';
import type { ToolStoreUpdate } from '../../tools/store';
import type { CompactionBeginData, CompactionResult } from '../compaction';
import type { AgentConfigUpdateData } from '../config';
import type { ContextMessage, PromptOrigin } from '../context';
import type { GoalSnapshot } from '../goal/types';
import type { PermissionApprovalResultRecord, PermissionMode } from '../permission';
import type { UserToolRegistration } from '../tool';
import type { UsageRecordScope } from '../usage';

export interface AgentRecordEvents {
  metadata: {
    protocol_version: string;
    created_at: number;
  };

  'turn.prompt': {
    input: readonly ContentPart[];
    origin: PromptOrigin;
  };
  'turn.steer': {
    input: readonly ContentPart[];
    origin: PromptOrigin;
  };
  'turn.cancel': { turnId?: number };

  'config.update': AgentConfigUpdateData;

  'permission.set_mode': {
    mode: PermissionMode;
  };
  'permission.record_approval_result': PermissionApprovalResultRecord;

  'full_compaction.begin': CompactionBeginData;

  'tools.register_user_tool': UserToolRegistration;
  'tools.unregister_user_tool': {
    name: string;
  };
  'tools.set_active_tools': {
    names: readonly string[];
  };

  'background.stop': {
    taskId: string;
  };

  'usage.record': {
    model: string;
    usage: TokenUsage;
    usageScope?: UsageRecordScope;
  };

  'full_compaction.cancel': {};
  'full_compaction.complete': CompactionResult;

  'context.append_message': { message: ContextMessage };
  'context.mark_last_user_prompt_blocked': { hookEvent: string };
  'context.append_loop_event': { event: LoopRecordedEvent };
  'context.clear': {};
  'context.apply_compaction': CompactionResult;
  'context.observation_masking': {
    maskedCount: number;
    tokensBefore: number;
    tokensAfter: number;
  };
  'context.output_offloaded': {
    toolCallId: string;
    filePath?: string;
  };
  'context.pruning': {
    prunedCount: number;
  };

  'tools.update_store': ToolStoreUpdate;

  'goal.create': {
    objective: string;
    /** 初始预算上限（来自 createGoal options 或 slash flag）。 */
    budget?: GoalSnapshot['budget'];
    /** 创建时的墙钟时间戳（ms），replay 据此重建 createdAt。 */
    createdAt: number;
  };
  'goal.update': {
    /** 完整 snapshot 落盘——replay 时据此重建。 */
    snapshot: GoalSnapshot;
  };
  'goal.clear': {};
}

export type AgentRecord = {
  [K in keyof AgentRecordEvents]: Readonly<AgentRecordEvents[K]> & {
    readonly type: K;
    readonly time?: number;
  };
}[keyof AgentRecordEvents];

export type AgentRecordOf<K extends keyof AgentRecordEvents> = Extract<
  AgentRecord,
  { readonly type: K }
>;

/**
 * Records whose `type` is `Prefix.*` (e.g. `context`, `turn`).
 * Used by subsystem `restoreRecord` handlers so their switches can be
 * exhaustively checked over the routed subset only.
 */
export type AgentRecordsOfPrefix<Prefix extends string> = Extract<
  AgentRecord,
  { readonly type: `${Prefix}.${string}` }
>;

/** Type guard: narrow `AgentRecord` to the prefix subset routed to one handler. */
export function isAgentRecordOfPrefix<Prefix extends string>(
  record: AgentRecord,
  prefix: Prefix,
): record is AgentRecordsOfPrefix<Prefix> {
  return record.type.startsWith(`${prefix}.`);
}

export interface AgentRecordPersistence {
  read(): AsyncIterable<AgentRecord>;
  append(input: AgentRecord): void;
  rewrite(records: readonly AgentRecord[]): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}
