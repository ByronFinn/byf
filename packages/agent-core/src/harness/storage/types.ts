import type { ContentPart, Role, ToolCall } from '@byfriends/kosong';

/**
 * wire 2.0 类型全集（PRD-0037 / ADR-0040）。
 *
 * 会话由四部分组成，共用一条单调 {@link Seq} 序列：
 * - entries：对话树（七类，parentId 链）——删掉其余三部分仍是完整合法对话
 * - records：执行日志（lane 操作日志）——永不进模型上下文
 * - lanes：lane 指针行（create/move/delete），推导各 lane 当前 leaf
 * - facts：全局事实（append-only，按 name latest-wins）
 *
 * 本模块自包含：不 import 旧 agent/ 目录的任何类型，Phase 4 删除旧路径时不受影响。
 */

// ===== 标识符 =====

/** 会话内唯一的树节点 id。由存储指派（`e<seq>`），调用方不可预造。 */
export type EntryId = string;

/** lane id。main lane 固定为 `'main'`，其余由调用方命名。 */
export type LaneId = string;

/** 跨 entries/records/facts/lane 行全局单调递增的行号（1 起）。 */
export type Seq = number;

/** wire 2.0 协议版本号（PRD-0037 grill 自决）。 */
export const WIRE2_FORMAT_VERSION = '2.0';

/** main lane 的保留 id。 */
export const MAIN_LANE_ID = 'main';

// ===== 消息（entry 载荷用，自包含副本） =====

export interface UserPromptOrigin2 {
  readonly kind: 'user';
  readonly blockedByHook?: string;
}

export interface SkillActivationOrigin2 {
  readonly kind: 'skill_activation';
  readonly activationId: string;
  readonly skillName: string;
  readonly skillArgs?: string;
  readonly trigger: 'user-slash' | 'model-tool' | 'nested-skill';
  readonly skillType?: string;
  readonly skillPath?: string;
  readonly skillSource?: string;
}

export interface InjectionOrigin2 {
  readonly kind: 'injection';
  readonly variant: string;
}

export interface CompactionSummaryOrigin2 {
  readonly kind: 'compaction_summary';
}

export interface SystemTriggerOrigin2 {
  readonly kind: 'system_trigger';
  readonly name: string;
}

export interface BackgroundTaskOrigin2 {
  readonly kind: 'background_task';
  readonly taskId: string;
  readonly status: string;
  readonly notificationId: string;
}

export interface HookResultOrigin2 {
  readonly kind: 'hook_result';
  readonly event: string;
  readonly blocked?: boolean;
}

export interface CronJobOrigin2 {
  readonly kind: 'cron_job';
  readonly jobId: string;
  readonly cron: string;
  readonly recurring: boolean;
  readonly coalescedCount: number;
  readonly stale: boolean;
}

export interface CronMissedOrigin2 {
  readonly kind: 'cron_missed';
  readonly count: number;
}

/** 消息写入会话树的来源标记（与旧 ContextMessage.origin 同形，自包含）。 */
export type StoredPromptOrigin =
  | UserPromptOrigin2
  | SkillActivationOrigin2
  | InjectionOrigin2
  | CompactionSummaryOrigin2
  | SystemTriggerOrigin2
  | BackgroundTaskOrigin2
  | HookResultOrigin2
  | CronJobOrigin2
  | CronMissedOrigin2;

/** 落入 entries 树的消息形状（kosong Message 的可存储超集）。 */
export interface StoredMessage {
  readonly role: Role;
  readonly name?: string;
  readonly content: readonly ContentPart[];
  readonly toolCalls?: readonly ToolCall[];
  readonly toolCallId?: string;
  readonly partial?: boolean;
  readonly isError?: boolean;
  readonly origin?: StoredPromptOrigin;
}

// ===== entries：对话树 =====

export type EntryKind =
  | 'message'
  | 'model_change'
  | 'thinking_level_change'
  | 'active_tools_change'
  | 'compaction'
  | 'branch_summary'
  | 'custom';

export interface WireEntryBase {
  readonly id: EntryId;
  /** 父节点 id；仅根 entry 为 null。由存储按追加时的 lane leaf 指派。 */
  readonly parentId: EntryId | null;
  readonly seq: Seq;
  readonly createdAt: number;
}

export interface MessageWireEntry extends WireEntryBase {
  readonly kind: 'message';
  readonly message: StoredMessage;
}

export interface ModelChangeWireEntry extends WireEntryBase {
  readonly kind: 'model_change';
  readonly modelAlias: string;
}

export interface ThinkingLevelChangeWireEntry extends WireEntryBase {
  readonly kind: 'thinking_level_change';
  readonly thinkingLevel: string;
}

export interface ActiveToolsChangeWireEntry extends WireEntryBase {
  readonly kind: 'active_tools_change';
  readonly activeTools: readonly string[];
}

/** 压缩边界：stopAtType 'compaction' 的含端扫描以它为窗口起点。 */
export interface CompactionWireEntry extends WireEntryBase {
  readonly kind: 'compaction';
  readonly summary: string;
  /** 被压缩覆盖段的最深 entry（锚点，可选）。 */
  readonly compactedUpTo?: EntryId;
  readonly stats?: Readonly<Record<string, unknown>>;
}

export interface BranchSummaryWireEntry extends WireEntryBase {
  readonly kind: 'branch_summary';
  readonly summary: string;
}

/**
 * 扩展 entry：goal 状态（customType `goal.*`）、权限模式等域数据走这里，
 * 按点查询还原（读到该路径上最新一条即状态）。
 */
export interface CustomWireEntry extends WireEntryBase {
  readonly kind: 'custom';
  readonly customType: string;
  readonly data: unknown;
}

export type WireEntry =
  | MessageWireEntry
  | ModelChangeWireEntry
  | ThinkingLevelChangeWireEntry
  | ActiveToolsChangeWireEntry
  | CompactionWireEntry
  | BranchSummaryWireEntry
  | CustomWireEntry;

/** goal 域 custom entry 的 customType 前缀；fork 复制时按此过滤（ADR-0023）。 */
export const GOAL_CUSTOM_TYPE_PREFIX = 'goal.';

export function isGoalCustomEntry(entry: WireEntry): boolean {
  return entry.kind === 'custom' && entry.customType.startsWith(GOAL_CUSTOM_TYPE_PREFIX);
}

// ===== records：执行日志 =====

export type RecordKind =
  | 'operation_started'
  | 'abort_requested'
  | 'operation_finished'
  | 'task_attempt'
  | 'tool_started'
  | 'queue_enqueued'
  | 'write_deferred';

/**
 * 执行记录。payload 对存储不透明（存储对操作/队列/恢复零知识），
 * 仅索引列（kind/laneId/seq/id）可查询。
 */
export interface WireRecord {
  /** 记录 id；调用方可预分配（恢复幂等），缺省由存储生成（`r<seq>`）。 */
  readonly id: string;
  readonly kind: RecordKind;
  readonly laneId: LaneId;
  readonly seq: Seq;
  readonly createdAt: number;
  readonly payload: unknown;
}

// ===== facts：全局事实 =====

/** 会话级全局事实（title/pinned/archived 等迁出 state.json 的落点）。 */
export interface WireFact {
  readonly name: string;
  /** 可选展示标签；传 null 清除。 */
  readonly label: string | null;
  readonly value: unknown;
  readonly seq: Seq;
  readonly createdAt: number;
}

// ===== lanes =====

export type LaneOpKind = 'create' | 'move' | 'delete';

export interface LaneOp {
  readonly op: LaneOpKind;
  readonly laneId: LaneId;
  readonly seq: Seq;
  readonly createdAt: number;
  /** create：lane 名称。 */
  readonly name?: string;
  /** create：从既有 entry 分叉的起点（lane leaf 初始指向它）。 */
  readonly fromEntryId?: EntryId;
  /** move：lane 指针移动目标。 */
  readonly toEntryId?: EntryId;
}

/** lane 的当前状态（由 lane 行序列归约得出）。 */
export interface LaneSnapshot {
  readonly laneId: LaneId;
  readonly name: string;
  readonly leafEntryId: EntryId | null;
  readonly createdAt: number;
}

// ===== 合并日志（getLog） =====

export type JournalLine =
  | { readonly kind: 'entry'; readonly seq: Seq; readonly entry: WireEntry }
  | { readonly kind: 'record'; readonly seq: Seq; readonly record: WireRecord }
  | { readonly kind: 'fact'; readonly seq: Seq; readonly fact: WireFact }
  | { readonly kind: 'lane'; readonly seq: Seq; readonly lane: LaneOp };

// ===== append 输入 =====

export type AppendEntryInput =
  | { readonly laneId: LaneId; readonly kind: 'message'; readonly message: StoredMessage }
  | { readonly laneId: LaneId; readonly kind: 'model_change'; readonly modelAlias: string }
  | {
      readonly laneId: LaneId;
      readonly kind: 'thinking_level_change';
      readonly thinkingLevel: string;
    }
  | {
      readonly laneId: LaneId;
      readonly kind: 'active_tools_change';
      readonly activeTools: readonly string[];
    }
  | {
      readonly laneId: LaneId;
      readonly kind: 'compaction';
      readonly summary: string;
      readonly compactedUpTo?: EntryId;
      readonly stats?: Readonly<Record<string, unknown>>;
    }
  | { readonly laneId: LaneId; readonly kind: 'branch_summary'; readonly summary: string }
  | {
      readonly laneId: LaneId;
      readonly kind: 'custom';
      readonly customType: string;
      readonly data: unknown;
    };

export interface AppendRecordInput {
  readonly laneId: LaneId;
  readonly kind: RecordKind;
  readonly payload: unknown;
  /** 预分配 id：同 id 记录已存在时幂等返回既有记录（恢复可重入）。 */
  readonly id?: string;
}

export interface AppendFactInput {
  readonly name: string;
  readonly value: unknown;
  readonly label?: string | null;
}

export interface CreateLaneInput {
  readonly laneId?: LaneId;
  readonly name?: string;
  /** 从既有 entry 分叉；缺省从空树开始。 */
  readonly fromEntryId?: EntryId;
}
