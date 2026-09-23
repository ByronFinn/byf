import { Wire2StorageError } from '../storage/memory';
import type { SessionStorage } from '../storage/storage';
import { MAIN_LANE_ID } from '../storage/types';
import type {
  AppendEntryInput,
  AppendEntryInputWithoutLane,
  EntryId,
  JournalLine,
  LaneId,
  LaneSnapshot,
  WireEntry,
  WireFact,
} from '../storage/types';
import { chainFrom, queryBranch } from './branch-query';
import type { BranchQueryOptions, BranchQueryResult } from './branch-query';

/**
 * wire 2.0 轻量 Session（PRD-0037 #321）。
 *
 * 可注入存储对象的语义层：实现 SessionTree（绑定 main lane），view(lane) 提供
 * 写绑定视图（读默认该 lane leaf、追加链到它并推进它），branch 查询语义、
 * facts latest-wins、fork 原语。存储对以上语义零知识——三后端天然 parity。
 *
 * 与旧重型 Session 容器（agents 注册表/RPC/subagent-host）无关；那些职责
 * 属于 AgentHarness（#323+）。内存后端下可完全独立构造运行（AGENTS.md 目标措辞）。
 */
export class WireSession {
  readonly sessionId: string;

  private constructor(
    private readonly storage: SessionStorage,
    private readonly entriesById: Map<EntryId, WireEntry>,
  ) {
    this.sessionId = storage.sessionId;
  }

  /** 打开会话：装载 entries 索引并校验 main lane 存在。 */
  static async open(storage: SessionStorage): Promise<WireSession> {
    const entries = await storage.getEntries();
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
    const lanes = await storage.getLanes();
    if (!lanes.some((lane) => lane.laneId === MAIN_LANE_ID)) {
      throw new Wire2StorageError(
        'LANE_NOT_FOUND',
        `main lane missing in session ${storage.sessionId}`,
      );
    }
    return new WireSession(storage, entriesById);
  }

  /** 创建会话：注入新存储并创建 main lane。 */
  static async create(storage: SessionStorage): Promise<WireSession> {
    await storage.createLane({ laneId: MAIN_LANE_ID, name: MAIN_LANE_ID });
    return new WireSession(storage, new Map());
  }

  // ----- SessionTree（绑定 main） -----

  /** main lane 当前 leaf entry。 */
  async leaf(laneId: LaneId = MAIN_LANE_ID): Promise<WireEntry | undefined> {
    const lanes = await this.storage.getLanes();
    const lane = lanes.find((l) => l.laneId === laneId);
    if (!lane) throw new Wire2StorageError('LANE_NOT_FOUND', `lane not found: ${laneId}`);
    return lane.leafEntryId ? this.entriesById.get(lane.leafEntryId) : undefined;
  }

  /** 导航：移动 lane 指针到任意 entry（树上移动）。 */
  async navigate(laneId: LaneId, toEntryId: EntryId): Promise<void> {
    await this.storage.moveLane(laneId, toEntryId);
  }

  /** 追加 entry 到指定 lane（缺省 main），推进该 lane leaf。 */
  async append(input: AppendEntryInput): Promise<WireEntry> {
    const entry = await this.storage.appendEntry(input);
    this.entriesById.set(entry.id, entry);
    return entry;
  }

  /** 写绑定视图：append 推进该 lane；branch 默认从该 lane leaf 扫描。 */
  view(laneId: LaneId = MAIN_LANE_ID): LaneView {
    return new LaneView(this, laneId);
  }

  /** branch 查询（缺省从 main leaf）。 */
  async branch(options: BranchQueryOptions = {}): Promise<BranchQueryResult> {
    return this.branchOf(MAIN_LANE_ID, options);
  }

  async branchOf(laneId: LaneId, options: BranchQueryOptions = {}): Promise<BranchQueryResult> {
    let startId = options.fromEntryId;
    if (startId === undefined) {
      const lanes = await this.storage.getLanes();
      const lane = lanes.find((l) => l.laneId === laneId);
      if (!lane) throw new Wire2StorageError('LANE_NOT_FOUND', `lane not found: ${laneId}`);
      startId = lane.leafEntryId ?? undefined;
    }
    if (startId === undefined) return { entries: [] };
    const chain = chainFrom(this.entriesById, startId);
    return queryBranch(chain, options);
  }

  getEntry(id: EntryId): WireEntry | undefined {
    return this.entriesById.get(id);
  }

  // ----- lanes -----

  async lanes(): Promise<readonly LaneSnapshot[]> {
    return this.storage.getLanes();
  }

  async createLane(input: {
    laneId?: LaneId;
    name?: string;
    fromEntryId?: EntryId;
  }): Promise<LaneSnapshot> {
    const lane = await this.storage.createLane(input);
    return lane;
  }

  async deleteLane(laneId: LaneId): Promise<void> {
    if (laneId === MAIN_LANE_ID) {
      throw new Wire2StorageError('BAD_INPUT', 'main lane cannot be deleted');
    }
    await this.storage.deleteLane(laneId);
  }

  // ----- facts -----

  async setFact(input: { name: string; value: unknown; label?: string | null }): Promise<WireFact> {
    return this.storage.appendFact(input);
  }

  async facts(): Promise<ReadonlyMap<string, WireFact>> {
    return this.storage.getFacts();
  }

  // ----- 调试 / 测试 -----

  async getLog(): Promise<readonly JournalLine[]> {
    return this.storage.getLog();
  }

  get storageRef(): SessionStorage {
    return this.storage;
  }

  async close(): Promise<void> {
    await this.storage.close();
  }

  /**
   * fork 原语（entries-only 复制）：把 [root, forkPoint] 链复制进目标会话。
   *
   * - 目标天生 idle：records/队列/facts 一概不复制；
   * - goal custom entries 不被复制（"fork 清空 goal"，ADR-0023）；
   * - 源会话完全不动。
   */
  async forkTo(target: WireSession, options?: { fromEntryId?: EntryId }): Promise<void> {
    let startId = options?.fromEntryId;
    if (startId === undefined) {
      startId = (await this.leaf())?.id;
    }
    if (startId === undefined) return; // 空会话 fork = 空会话
    const chain = chainFrom(this.entriesById, startId); // root → forkPoint
    for (const entry of chain) {
      if (entry.kind === 'custom' && entry.customType.startsWith('goal.')) continue;
      await target.append(copyEntryToInput(entry, MAIN_LANE_ID));
    }
  }
}

/** lane 写绑定视图。 */
export class LaneView {
  constructor(
    private readonly session: WireSession,
    readonly laneId: LaneId,
  ) {}

  async leaf(): Promise<WireEntry | undefined> {
    return this.session.leaf(this.laneId);
  }

  async append(input: AppendEntryInputWithoutLane): Promise<WireEntry> {
    return this.session.append({ ...input, laneId: this.laneId } as AppendEntryInput);
  }

  async branch(options: BranchQueryOptions = {}): Promise<BranchQueryResult> {
    return this.session.branchOf(this.laneId, options);
  }

  async navigate(toEntryId: EntryId): Promise<void> {
    await this.session.navigate(this.laneId, toEntryId);
  }
}

/** entry → 追加输入（fork 复制用）。 */
function copyEntryToInput(entry: WireEntry, laneId: LaneId): AppendEntryInput {
  switch (entry.kind) {
    case 'message':
      return { laneId, kind: 'message', message: entry.message };
    case 'model_change':
      return { laneId, kind: 'model_change', modelAlias: entry.modelAlias };
    case 'thinking_level_change':
      return { laneId, kind: 'thinking_level_change', thinkingLevel: entry.thinkingLevel };
    case 'active_tools_change':
      return { laneId, kind: 'active_tools_change', activeTools: entry.activeTools };
    case 'compaction':
      return {
        laneId,
        kind: 'compaction',
        summary: entry.summary,
        compactedUpTo: entry.compactedUpTo,
        stats: entry.stats,
      };
    case 'branch_summary':
      return { laneId, kind: 'branch_summary', summary: entry.summary };
    case 'custom':
      return { laneId, kind: 'custom', customType: entry.customType, data: entry.data };
  }
}
