import type {
  AppendEntryInput,
  AppendFactInput,
  AppendRecordInput,
  CreateLaneInput,
  EntryId,
  JournalLine,
  LaneId,
  LaneSnapshot,
  WireEntry,
  WireFact,
  WireRecord,
} from './types';

/**
 * wire 2.0 会话存储契约（PRD-0037 R8）。
 *
 * 存储对操作、队列、恢复零知识：record payload 除索引列（id/kind/laneId/seq）外
 * 不透明；entries 树的语义（branch 查询、上下文窗口）由上层 Session 在
 * {@link WireEntry} 原语之上实现，从而保证三后端（内存/JSONL/SQLite）语义
 * 天然 parity。
 *
 * 契约不变量：
 * - appendEntry 由存储指派 parentId（lane 当前 leaf）/id/seq/createdAt 并同事务
 *   推进 leaf——调用方无法传入 stale parent（根本没有 parentId 参数）。
 * - seq 跨 entries/records/facts/lane 行全局单调。
 * - facts append-only，读取按 name latest-wins。
 * - appendRecord 携带预分配 id 时幂等（appendIfMissing）。
 */
export interface SessionStorage {
  readonly sessionId: string;

  // ----- lanes -----

  /** 创建 lane。fromEntryId 时新 lane leaf 指向该 entry（树上分叉）。 */
  createLane(input: CreateLaneInput): Promise<LaneSnapshot>;
  /** 移动 lane 指针（navigateTree）。目标 entry 必须存在。 */
  moveLane(laneId: LaneId, toEntryId: EntryId): Promise<void>;
  /** 删除 lane（墓碑）。entry 保留（append-only），仅指针消失。 */
  deleteLane(laneId: LaneId): Promise<void>;
  /** 活跃 lane 快照（不含已删除）。 */
  getLanes(): Promise<readonly LaneSnapshot[]>;

  // ----- entries -----

  /** 追加 entry：存储指派 parentId=lane 当前 leaf、id、seq、createdAt 并推进 leaf。 */
  appendEntry(input: AppendEntryInput): Promise<WireEntry>;
  getEntry(id: EntryId): Promise<WireEntry | undefined>;
  /** 全部 entries，按 seq 升序。 */
  getEntries(): Promise<readonly WireEntry[]>;

  // ----- records -----

  /** 追加执行记录。input.id 已存在时幂等返回既有记录。 */
  appendRecord(input: AppendRecordInput): Promise<WireRecord>;
  /** 执行记录查询，按 seq 升序。 */
  getRecords(filter?: RecordFilter): Promise<readonly WireRecord[]>;

  // ----- facts -----

  /** 追加事实（latest-wins）。label 显式传 null 清除标签。 */
  appendFact(input: AppendFactInput): Promise<WireFact>;
  /** 各 name 的最新事实。 */
  getFacts(): Promise<ReadonlyMap<string, WireFact>>;

  // ----- 调试 / 测试 -----

  /** entries/records/facts/lane 行按 seq 合并的全量时序视图。 */
  getLog(): Promise<readonly JournalLine[]>;

  // ----- 生命周期 -----

  /** 冲刷缓冲（契约上：任一 append resolve 即 durable；flush 供显式收尾）。 */
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface RecordFilter {
  readonly laneId?: LaneId;
  readonly fromSeq?: number;
  readonly kinds?: readonly string[];
}
