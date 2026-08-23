import type { RecordFilter, SessionStorage } from './storage';
import type {
  AppendEntryInput,
  AppendFactInput,
  AppendRecordInput,
  CreateLaneInput,
  EntryId,
  JournalLine,
  LaneId,
  LaneOp,
  LaneSnapshot,
  Seq,
  WireEntry,
  WireFact,
  WireRecord,
} from './types';

/** wire 2.0 存储层错误。code 供 JSONL 打开与契约测试断言。 */
export class Wire2StorageError extends Error {
  constructor(
    readonly code:
      | 'LANE_NOT_FOUND'
      | 'ENTRY_NOT_FOUND'
      | 'DUPLICATE_LANE'
      | 'BAD_INPUT'
      | 'CORRUPTED_JOURNAL'
      | 'UNSUPPORTED_FORMAT'
      | 'CLOSED',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'Wire2StorageError';
  }
}

interface LaneState {
  laneId: LaneId;
  name: string;
  leafEntryId: EntryId | null;
  createdAt: number;
  deleted: boolean;
}

interface MemoryState {
  lanes: Map<LaneId, LaneState>;
  entries: Map<EntryId, WireEntry>;
  recordsById: Map<string, WireRecord>;
  records: WireRecord[];
  facts: WireFact[];
  log: JournalLine[];
  nextSeq: Seq;
}

/**
 * 内存参考实现——其余后端的语义基准（parity 套件的参考语义来源）。
 * 单线程 JS 下每步同步变异即原子；seq 单调分配贯穿四部分。
 */
export class InMemorySessionStorage implements SessionStorage {
  readonly sessionId: string;
  private readonly state: MemoryState;
  private closed = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.state = {
      lanes: new Map(),
      entries: new Map(),
      recordsById: new Map(),
      records: [],
      facts: [],
      log: [],
      nextSeq: 1,
    };
  }

  async createLane(input: CreateLaneInput): Promise<LaneSnapshot> {
    this.assertOpen();
    const laneId = input.laneId ?? generateLaneId();
    if (this.state.lanes.has(laneId) && !this.state.lanes.get(laneId)!.deleted) {
      throw new Wire2StorageError('DUPLICATE_LANE', `lane already exists: ${laneId}`);
    }
    if (input.fromEntryId !== undefined && !this.state.entries.has(input.fromEntryId)) {
      throw new Wire2StorageError('ENTRY_NOT_FOUND', `fromEntryId not found: ${input.fromEntryId}`);
    }
    const createdAt = Date.now();
    const op: LaneOp = {
      op: 'create',
      laneId,
      seq: this.allocSeq(),
      createdAt,
      name: input.name,
      fromEntryId: input.fromEntryId,
    };
    const lane: LaneState = {
      laneId,
      name: input.name ?? laneId,
      leafEntryId: input.fromEntryId ?? null,
      createdAt,
      deleted: false,
    };
    this.state.lanes.set(laneId, lane);
    this.state.log.push({ kind: 'lane', seq: op.seq, lane: op });
    return snapshotOf(lane);
  }

  async moveLane(laneId: LaneId, toEntryId: EntryId): Promise<void> {
    this.assertOpen();
    const lane = this.requireLane(laneId);
    if (!this.state.entries.has(toEntryId)) {
      throw new Wire2StorageError('ENTRY_NOT_FOUND', `toEntryId not found: ${toEntryId}`);
    }
    lane.leafEntryId = toEntryId;
    this.state.log.push({
      kind: 'lane',
      seq: this.allocSeq(),
      lane: { op: 'move', laneId, seq: 0, createdAt: Date.now(), toEntryId },
    });
  }

  async deleteLane(laneId: LaneId): Promise<void> {
    this.assertOpen();
    const lane = this.requireLane(laneId);
    lane.deleted = true;
    this.state.log.push({
      kind: 'lane',
      seq: this.allocSeq(),
      lane: { op: 'delete', laneId, seq: 0, createdAt: Date.now() },
    });
  }

  async getLanes(): Promise<readonly LaneSnapshot[]> {
    this.assertOpen();
    return [...this.state.lanes.values()].filter((lane) => !lane.deleted).map(snapshotOf);
  }

  async appendEntry(input: AppendEntryInput): Promise<WireEntry> {
    this.assertOpen();
    const lane = this.requireLane(input.laneId);
    if (input.id !== undefined) {
      const existing = this.state.entries.get(input.id);
      if (existing) return existing; // appendIfMissing：预分配 id 已存在即幂等返回
    }
    const seq = this.allocSeq();
    const entry: WireEntry = withEntryBase(input, {
      id: input.id ?? `e${seq}`,
      parentId: lane.leafEntryId,
      seq,
      createdAt: Date.now(),
    });
    this.state.entries.set(entry.id, entry);
    lane.leafEntryId = entry.id;
    this.state.log.push({ kind: 'entry', seq, entry });
    return entry;
  }

  async getEntry(id: EntryId): Promise<WireEntry | undefined> {
    this.assertOpen();
    return this.state.entries.get(id);
  }

  async getEntries(): Promise<readonly WireEntry[]> {
    this.assertOpen();
    return [...this.state.entries.values()];
  }

  async appendRecord(input: AppendRecordInput): Promise<WireRecord> {
    this.assertOpen();
    const id = input.id ?? `r${this.state.nextSeq}`;
    const existing = this.state.recordsById.get(id);
    if (existing) return existing;
    const record: WireRecord = {
      id,
      kind: input.kind,
      laneId: input.laneId,
      seq: this.allocSeq(),
      createdAt: Date.now(),
      payload: input.payload,
    };
    this.state.recordsById.set(id, record);
    this.state.records.push(record);
    this.state.log.push({ kind: 'record', seq: record.seq, record });
    return record;
  }

  async getRecords(filter?: RecordFilter): Promise<readonly WireRecord[]> {
    this.assertOpen();
    return this.state.records.filter((record) => {
      if (filter?.laneId !== undefined && record.laneId !== filter.laneId) return false;
      if (filter?.fromSeq !== undefined && record.seq < filter.fromSeq) return false;
      if (filter?.kinds && !filter.kinds.includes(record.kind)) return false;
      return true;
    });
  }

  async appendFact(input: AppendFactInput): Promise<WireFact> {
    this.assertOpen();
    const previous = [...this.state.facts].toReversed().find((fact) => fact.name === input.name);
    const fact: WireFact = {
      name: input.name,
      label: input.label !== undefined ? input.label : (previous?.label ?? null),
      value: input.value,
      seq: this.allocSeq(),
      createdAt: Date.now(),
    };
    this.state.facts.push(fact);
    this.state.log.push({ kind: 'fact', seq: fact.seq, fact });
    return fact;
  }

  async getFacts(): Promise<ReadonlyMap<string, WireFact>> {
    this.assertOpen();
    const latest = new Map<string, WireFact>();
    for (const fact of this.state.facts) latest.set(fact.name, fact);
    return latest;
  }

  async getLog(): Promise<readonly JournalLine[]> {
    this.assertOpen();
    return [...this.state.log].toSorted((a, b) => a.seq - b.seq);
  }

  async flush(): Promise<void> {
    this.assertOpen();
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Wire2StorageError('CLOSED', 'storage is closed');
  }

  private requireLane(laneId: LaneId): LaneState {
    const lane = this.state.lanes.get(laneId);
    if (!lane || lane.deleted) {
      throw new Wire2StorageError('LANE_NOT_FOUND', `lane not found: ${laneId}`);
    }
    return lane;
  }

  private allocSeq(): Seq {
    return this.state.nextSeq++;
  }
}

function snapshotOf(lane: LaneState): LaneSnapshot {
  return {
    laneId: lane.laneId,
    name: lane.name,
    leafEntryId: lane.leafEntryId,
    createdAt: lane.createdAt,
  };
}

function withEntryBase(
  input: AppendEntryInput,
  base: { id: EntryId; parentId: EntryId | null; seq: Seq; createdAt: number },
): WireEntry {
  switch (input.kind) {
    case 'message':
      return { ...base, kind: 'message', message: input.message };
    case 'model_change':
      return { ...base, kind: 'model_change', modelAlias: input.modelAlias };
    case 'thinking_level_change':
      return { ...base, kind: 'thinking_level_change', thinkingLevel: input.thinkingLevel };
    case 'active_tools_change':
      return { ...base, kind: 'active_tools_change', activeTools: input.activeTools };
    case 'compaction':
      return {
        ...base,
        kind: 'compaction',
        summary: input.summary,
        compactedUpTo: input.compactedUpTo,
        stats: input.stats,
      };
    case 'branch_summary':
      return { ...base, kind: 'branch_summary', summary: input.summary };
    case 'custom':
      return { ...base, kind: 'custom', customType: input.customType, data: input.data };
  }
}

let laneCounter = 0;

function generateLaneId(): string {
  return `lane-${Date.now().toString(36)}-${(laneCounter++).toString(36)}`;
}
