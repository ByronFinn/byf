import type { ContentPart, DeferredHandle, Role, ToolCall } from '@byfriends/kosong';

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

/**
 * 唯一携带**用户裁决权威**的来源（#345）。`kind === 'user'` 只在真实用户路径上
 * 出现：host 调用方经 `AgentHarness.prompt()` 提交本轮输入。其余来源
 * （hook 贡献的文本、injection、skill 激活、cron 触发、后台任务通知、压缩摘要）
 * 都是"到达会话的内容"，不是"用户的决定"。
 *
 * 这是**来源与授权能力的分离**，不是安全边界（ADR-0033）：它不判断内容真伪，
 * 只保证一个可复查的事实——一条记录被持久化成 `user` 时，它是从用户输入入口
 * 进来的，而不是从某段文本（包括 hook 输出）拼出来的。
 */
export type UserAuthorityPromptOrigin = UserPromptOrigin2;

/**
 * 内容贡献方（hook / 三队列 / fork / 派生注入）可声明的来源：类型层面排除 `user`。
 * 见 {@link UserAuthorityPromptOrigin}——用户输入入口只有一个（`prompt()`），
 * 其余写入方即使拿到 hook 文本也只能落非权威来源，restore 后仍可区分。
 */
export type ContributablePromptOrigin = Exclude<StoredPromptOrigin, UserAuthorityPromptOrigin>;

/**
 * 特权判定唯一允许询问的来源问题："这条来源携带用户裁决权威吗？"
 *
 * 特权判定（审批放行 / 自动放行、config 写入、MCP stdio spawn、permission mode
 * 切换）的授权来源必须收窄到真实用户裁决路径，不得从消息文本、hook 输出或工具
 * 参数推断授权。hook 贡献的内容（`kind === 'hook_result'`）恒为 false。
 *
 * 读磁盘来源时的运行时用途见 `agent-harness.ts` 的队列消费点：journal 里的
 * `queue_enqueued.payload.origin` 是 `unknown`，恢复一条声称 `user` 的队列项
 * 不得让 hook / 派生文本获得用户权威。
 */
export function hasUserPromptAuthority(
  origin: StoredPromptOrigin | undefined,
): origin is UserAuthorityPromptOrigin {
  return origin?.kind === 'user';
}

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
  /** PRD-0037 #336：仅 deferred 助手消息携带（挂起兑换点）。 */
  readonly deferredHandle?: DeferredHandle;
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

/**
 * 预分配 entry id（PRD-0037 意图先行）：appendEntry 携带且已存在时幂等返回
 * 既有 entry（appendIfMissing，恢复可重入）；缺省由存储生成。
 */
export interface ProvisionedEntryId {
  readonly id?: string;
}

type AppendEntryInputVariant =
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

export type AppendEntryInput = AppendEntryInputVariant & ProvisionedEntryId;

/**
 * `Omit` 对联合不是可分配的：`Omit<A | B, K>` 会先把联合压成公共键，剩下的
 * 类型既不接受 A 的字段也不接受 B 的字段。去掉一个判别联合的公共字段（这里
 * 是 `laneId`）必须逐变体做，所以要一个以裸类型参数为检查对象的 helper。
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * lane 视图（`LaneView.append`）需要的输入：`AppendEntryInput` 去掉 `laneId`，
 * 但保留每个变体自己的 payload 和可选的预分配 `id`。
 */
export type AppendEntryInputWithoutLane = DistributiveOmit<AppendEntryInput, 'laneId'>;

/**
 * 持久化分级（PRD-0037 #324）：'boundary' = 接受边界记录，存储应在 resolve
 * 前 fsync（fsync-before-resolve）；'bulk' = 批量 flush 即可。契约上两者
 * resolve 即 durable，分级只是性能取舍。存储可忽略此提示（内存后端）。
 */
export type RecordDurability = 'boundary' | 'bulk';

export interface AppendRecordInput {
  readonly laneId: LaneId;
  readonly kind: RecordKind;
  readonly payload: unknown;
  /** 预分配 id：同 id 记录已存在时幂等返回既有记录（恢复可重入）。 */
  readonly id?: string;
  readonly durability?: RecordDurability;
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
