import { open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { Wire2StorageError } from './memory';
import type { RecordFilter, SessionStorage } from './storage';
import type {
  AppendEntryInput,
  CreateLaneInput,
  EntryId,
  JournalLine,
  LaneId,
  LaneOp,
  LaneSnapshot,
  Seq,
  StoredMessage,
  WireEntry,
  WireFact,
  WireRecord,
} from './types';
import { WIRE2_FORMAT_VERSION } from './types';

/**
 * wire 2.0 JSONL 后端（PRD-0037 #320）。
 *
 * 会话级单文件 `sessions/<id>/wire.jsonl`，五种行类型：
 * header（v2.0）/ entry / record / lane / fact。lane 为信封字段（decode 即弃，
 * 不进 entry）；seq = 行位（header 之后第 N 行 = N）。
 *
 * 崩溃容错（沿用 1.1 经验）：
 * - 末行撕裂（无换行符或解析失败）→ 按未确认追加截断丢弃，无已确认数据丢失；
 * - 非末行损坏 → 判定 journal 损坏，拒绝打开；
 * - header 版本不是 2.0 → 拒绝打开（旧 1.1 会话走 #322 的清晰错误路径）。
 *
 * 一行 = 原子单元：写入带换行符，行完整落盘才被视为已确认。
 * 行写入经串行写链排队：seq 分配、文件写入、内存状态推进在同一链节完成，
 * 顺序与调用序一致，写失败不推进状态。
 */

interface LaneState {
  laneId: LaneId;
  name: string;
  leafEntryId: EntryId | null;
  createdAt: number;
  deleted: boolean;
}

interface LoadedState {
  lanes: Map<LaneId, LaneState>;
  entries: Map<EntryId, WireEntry>;
  recordsById: Map<string, WireRecord>;
  records: WireRecord[];
  facts: WireFact[];
  log: JournalLine[];
  nextSeq: Seq;
}

export interface JsonlStorageOptions {
  /** 每次追加后 fsync（#324 的接受边界分级在此之上分层）。 */
  readonly fsync?: boolean;
  /**
   * 只读打开（检视路径）：撕裂尾行仅在内存视图丢弃，不物理截断——
   * 避免与 live 写者的并发追加竞态。
   */
  readonly readonly?: boolean;
}

export class JsonlSessionStorage implements SessionStorage {
  readonly sessionId: string;
  readonly path: string;

  private state: LoadedState;
  private closed = false;
  private writeChain: Promise<unknown> = Promise.resolve();
  private readonly fsync: boolean;

  private constructor(sessionId: string, path: string, state: LoadedState, fsync: boolean) {
    this.sessionId = sessionId;
    this.path = path;
    this.state = state;
    this.fsync = fsync;
  }

  /** 创建新 journal（写 header）。文件已存在时报错。 */
  static async create(
    path: string,
    sessionId: string,
    options?: JsonlStorageOptions,
  ): Promise<JsonlSessionStorage> {
    const header = {
      kind: 'header',
      formatVersion: WIRE2_FORMAT_VERSION,
      sessionId,
      createdAt: Date.now(),
    };
    await ensureDir(dirname(path));
    let handle;
    try {
      handle = await open(path, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Wire2StorageError('CORRUPTED_JOURNAL', `journal already exists: ${path}`);
      }
      throw error;
    }
    try {
      await handle.write(`${JSON.stringify(header)}\n`);
      if (options?.fsync) await handle.sync();
    } finally {
      await handle.close();
    }
    return new JsonlSessionStorage(sessionId, path, emptyState(), options?.fsync ?? false);
  }

  /** 打开既有 journal 并重放（torn-tail 截断）。 */
  static async open(path: string, options?: JsonlStorageOptions): Promise<JsonlSessionStorage> {
    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Wire2StorageError('CORRUPTED_JOURNAL', `journal not found: ${path}`);
      }
      throw error;
    }
    const { state, sessionId, truncateTo } = parseJournal(text, path);
    if (truncateTo !== null && truncateTo < text.length && options?.readonly !== true) {
      // 撕裂尾行物理截断：按未确认追加丢弃
      const tmp = `${path}.trunc`;
      await writeFile(tmp, text.slice(0, truncateTo));
      await rename(tmp, path);
    }
    return new JsonlSessionStorage(sessionId, path, state, options?.fsync ?? false);
  }

  async createLane(input: CreateLaneInput): Promise<LaneSnapshot> {
    this.assertOpen();
    const laneId = input.laneId ?? `lane-${Date.now().toString(36)}`;
    if (this.state.lanes.has(laneId) && !this.state.lanes.get(laneId)!.deleted) {
      throw new Wire2StorageError('DUPLICATE_LANE', `lane already exists: ${laneId}`);
    }
    if (input.fromEntryId !== undefined && !this.state.entries.has(input.fromEntryId)) {
      throw new Wire2StorageError('ENTRY_NOT_FOUND', `fromEntryId not found: ${input.fromEntryId}`);
    }
    const name = input.name ?? laneId;
    const createdAt = Date.now();
    return this.enqueue((seq) => {
      const lane: LaneState = {
        laneId,
        name,
        leafEntryId: input.fromEntryId ?? null,
        createdAt,
        deleted: false,
      };
      const op: LaneOp = {
        op: 'create',
        laneId,
        seq,
        createdAt,
        name,
        fromEntryId: input.fromEntryId,
      };
      return {
        line: {
          kind: 'lane',
          createdAt,
          l: { op: 'create', laneId, name, fromEntryId: input.fromEntryId ?? null },
        },
        apply: () => {
          this.state.lanes.set(laneId, lane);
          this.state.log.push({ kind: 'lane', seq, lane: op });
          return snapshotOf(lane);
        },
      };
    });
  }

  async moveLane(laneId: LaneId, toEntryId: EntryId): Promise<void> {
    this.assertOpen();
    const lane = this.requireLane(laneId);
    if (!this.state.entries.has(toEntryId)) {
      throw new Wire2StorageError('ENTRY_NOT_FOUND', `toEntryId not found: ${toEntryId}`);
    }
    const createdAt = Date.now();
    await this.enqueue((seq) => ({
      line: { kind: 'lane', createdAt, l: { op: 'move', laneId, toEntryId } },
      apply: () => {
        lane.leafEntryId = toEntryId;
        this.state.log.push({
          kind: 'lane',
          seq,
          lane: { op: 'move', laneId, seq, createdAt, toEntryId },
        });
      },
    }));
  }

  async deleteLane(laneId: LaneId): Promise<void> {
    this.assertOpen();
    const lane = this.requireLane(laneId);
    const createdAt = Date.now();
    await this.enqueue((seq) => ({
      line: { kind: 'lane', createdAt, l: { op: 'delete', laneId } },
      apply: () => {
        lane.deleted = true;
        this.state.log.push({
          kind: 'lane',
          seq,
          lane: { op: 'delete', laneId, seq, createdAt },
        });
      },
    }));
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
    const createdAt = Date.now();
    return this.enqueue((seq) => {
      const id = input.id ?? `e${seq}`;
      const parentId = lane.leafEntryId;
      const entry = materializeEntry(id, parentId, seq, createdAt, entryPayloadOf(input));
      return {
        line: {
          kind: 'entry',
          lane: input.laneId,
          id,
          parentId,
          createdAt,
          e: entryPayloadOf(input),
        },
        apply: () => {
          this.state.entries.set(entry.id, entry);
          lane.leafEntryId = entry.id;
          this.state.log.push({ kind: 'entry', seq, entry });
          return entry;
        },
      };
    });
  }

  async getEntry(id: EntryId): Promise<WireEntry | undefined> {
    this.assertOpen();
    return this.state.entries.get(id);
  }

  async getEntries(): Promise<readonly WireEntry[]> {
    this.assertOpen();
    return [...this.state.entries.values()];
  }

  async appendRecord(input: {
    laneId: LaneId;
    kind: WireRecord['kind'];
    payload: unknown;
    id?: string;
    durability?: 'boundary' | 'bulk';
  }): Promise<WireRecord> {
    this.assertOpen();
    const existing = input.id ? this.state.recordsById.get(input.id) : undefined;
    if (existing) return existing;
    const createdAt = Date.now();
    // 接受边界记录 fsync-before-resolve（#324 分级）；bulk 走类级默认
    const fsync = input.durability === 'boundary' ? true : this.fsync;
    return this.enqueue((seq) => {
      const id = input.id ?? `r${seq}`;
      const record: WireRecord = {
        id,
        kind: input.kind,
        laneId: input.laneId,
        seq,
        createdAt,
        payload: input.payload,
      };
      return {
        line: {
          kind: 'record',
          lane: input.laneId,
          id,
          createdAt,
          r: { kind: input.kind, payload: input.payload },
        },
        fsync,
        apply: () => {
          this.state.recordsById.set(id, record);
          this.state.records.push(record);
          this.state.log.push({ kind: 'record', seq, record });
          return record;
        },
      };
    });
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

  async appendFact(input: {
    name: string;
    value: unknown;
    label?: string | null;
  }): Promise<WireFact> {
    this.assertOpen();
    const previous = this.state.facts.toReversed().find((fact) => fact.name === input.name);
    const label = input.label !== undefined ? input.label : (previous?.label ?? null);
    const createdAt = Date.now();
    return this.enqueue((seq) => {
      const fact: WireFact = { name: input.name, label, value: input.value, seq, createdAt };
      return {
        line: { kind: 'fact', createdAt, f: { name: input.name, label, value: input.value } },
        apply: () => {
          this.state.facts.push(fact);
          this.state.log.push({ kind: 'fact', seq, fact });
          return fact;
        },
      };
    });
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
    await this.writeChain;
  }

  async close(): Promise<void> {
    await this.writeChain;
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

  /**
   * 串行写链：seq 分配（行位）、文件写入、状态推进在同一链节完成。
   * 写失败时该链节抛出且状态不推进（append 是唯一事实源）。
   */
  private enqueue<T>(
    make: (seq: Seq) => { line: Record<string, unknown>; apply: () => T; fsync?: boolean },
  ): Promise<T> {
    this.assertOpen();
    const task = this.writeChain.then(async () => {
      const seq = this.state.nextSeq;
      const { line, apply, fsync } = make(seq);
      await appendLine(this.path, JSON.stringify({ ...line, seq }), fsync ?? this.fsync);
      this.state.nextSeq = seq + 1;
      return apply();
    });
    this.writeChain = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

// ===== 行编解码 =====

type EntryPayloadShape =
  | { kind: 'message'; message: StoredMessage }
  | { kind: 'model_change'; modelAlias: string }
  | { kind: 'thinking_level_change'; thinkingLevel: string }
  | { kind: 'active_tools_change'; activeTools: readonly string[] }
  | {
      kind: 'compaction';
      summary: string;
      compactedUpTo: EntryId | null;
      stats: Readonly<Record<string, unknown>> | null;
    }
  | { kind: 'branch_summary'; summary: string }
  | { kind: 'custom'; customType: string; data: unknown };

function entryPayloadOf(input: AppendEntryInput): EntryPayloadShape {
  switch (input.kind) {
    case 'message':
      return { kind: 'message', message: input.message };
    case 'model_change':
      return { kind: 'model_change', modelAlias: input.modelAlias };
    case 'thinking_level_change':
      return { kind: 'thinking_level_change', thinkingLevel: input.thinkingLevel };
    case 'active_tools_change':
      return { kind: 'active_tools_change', activeTools: input.activeTools };
    case 'compaction':
      return {
        kind: 'compaction',
        summary: input.summary,
        compactedUpTo: input.compactedUpTo ?? null,
        stats: input.stats ?? null,
      };
    case 'branch_summary':
      return { kind: 'branch_summary', summary: input.summary };
    case 'custom':
      return { kind: 'custom', customType: input.customType, data: input.data };
  }
}

function materializeEntry(
  id: string,
  parentId: EntryId | null,
  seq: Seq,
  createdAt: number,
  e: EntryPayloadShape,
): WireEntry {
  const base = { id, parentId, seq, createdAt } as const;
  switch (e.kind) {
    case 'message':
      return { ...base, kind: 'message', message: e.message };
    case 'model_change':
      return { ...base, kind: 'model_change', modelAlias: e.modelAlias };
    case 'thinking_level_change':
      return { ...base, kind: 'thinking_level_change', thinkingLevel: e.thinkingLevel };
    case 'active_tools_change':
      return { ...base, kind: 'active_tools_change', activeTools: [...e.activeTools] };
    case 'compaction':
      return {
        ...base,
        kind: 'compaction',
        summary: e.summary,
        compactedUpTo: e.compactedUpTo ?? undefined,
        stats: e.stats ?? undefined,
      };
    case 'branch_summary':
      return { ...base, kind: 'branch_summary', summary: e.summary };
    case 'custom':
      return { ...base, kind: 'custom', customType: e.customType, data: e.data };
  }
}

/** 解析整份 journal：返回重放状态与撕裂截断偏移（null = 无需截断）。 */
function parseJournal(
  text: string,
  path: string,
): { state: LoadedState; sessionId: string; truncateTo: number | null } {
  if (text.length === 0) {
    throw new Wire2StorageError('CORRUPTED_JOURNAL', `journal is empty: ${path}`);
  }
  // 按行切分；末段无换行符 = 撕裂尾行
  const lines: { text: string; start: number; terminated: boolean }[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const nl = text.indexOf('\n', cursor);
    if (nl === -1) {
      lines.push({ text: text.slice(cursor), start: cursor, terminated: false });
      cursor = text.length;
    } else {
      lines.push({ text: text.slice(cursor, nl), start: cursor, terminated: true });
      cursor = nl + 1;
    }
  }
  const headerLine = lines.shift()!;
  if (!headerLine.terminated) {
    throw new Wire2StorageError('CORRUPTED_JOURNAL', `journal header torn: ${path}`);
  }
  let header: { kind?: string; sessionId?: string; formatVersion?: string };
  try {
    header = JSON.parse(headerLine.text);
  } catch {
    throw new Wire2StorageError('CORRUPTED_JOURNAL', `journal header unparseable: ${path}`);
  }
  if (header.kind !== 'header' || typeof header.sessionId !== 'string') {
    throw new Wire2StorageError('CORRUPTED_JOURNAL', `journal header invalid: ${path}`);
  }
  if (header.formatVersion !== WIRE2_FORMAT_VERSION) {
    throw new Wire2StorageError(
      'UNSUPPORTED_FORMAT',
      `journal format ${String(header.formatVersion)} unsupported (expected ${WIRE2_FORMAT_VERSION}): ${path}`,
    );
  }

  const state = emptyState();
  let truncateTo: number | null = null;
  let replayed = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isLast = i === lines.length - 1;
    if (!line.terminated) {
      // 无换行终结 = 撕裂（只可能出现在最后一行；非末行说明中间缺行，损坏）
      if (isLast) {
        truncateTo = line.start;
        break;
      }
      throw new Wire2StorageError('CORRUPTED_JOURNAL', `line ${i + 2} unterminated: ${path}`);
    }
    if (line.text.trim().length === 0) {
      // 空白行：写器从不产生；末行视为撕裂截断，非末行判定损坏
      if (isLast) {
        truncateTo = line.start;
        break;
      }
      throw new Wire2StorageError('CORRUPTED_JOURNAL', `line ${i + 2} is blank: ${path}`);
    }
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line.text);
    } catch {
      if (isLast) {
        truncateTo = line.start;
        break;
      }
      throw new Wire2StorageError('CORRUPTED_JOURNAL', `line ${i + 2} unparseable: ${path}`);
    }
    replayLine(state, obj, replayed + 1, path);
    replayed++;
  }
  state.nextSeq = replayed + 1;
  return { state, sessionId: header.sessionId, truncateTo };
}

function replayLine(
  state: LoadedState,
  obj: Record<string, unknown>,
  seq: Seq,
  path: string,
): void {
  const lineKind = obj['kind'];
  switch (lineKind) {
    case 'entry': {
      const laneId = obj['lane'] as string;
      const lane = state.lanes.get(laneId);
      if (!lane || lane.deleted) {
        throw new Wire2StorageError(
          'CORRUPTED_JOURNAL',
          `entry on unknown lane ${laneId}: ${path}`,
        );
      }
      const e = obj['e'] as EntryPayloadShape;
      const entry = materializeEntry(
        obj['id'] as string,
        (obj['parentId'] as string | null) ?? null,
        seq,
        obj['createdAt'] as number,
        e,
      );
      state.entries.set(entry.id, entry);
      lane.leafEntryId = entry.id;
      state.log.push({ kind: 'entry', seq, entry });
      break;
    }
    case 'record': {
      const r = obj['r'] as { kind: WireRecord['kind']; payload: unknown };
      const record: WireRecord = {
        id: obj['id'] as string,
        kind: r.kind,
        laneId: obj['lane'] as string,
        seq,
        createdAt: obj['createdAt'] as number,
        payload: r.payload,
      };
      state.recordsById.set(record.id, record);
      state.records.push(record);
      state.log.push({ kind: 'record', seq, record });
      break;
    }
    case 'fact': {
      const f = obj['f'] as { name: string; label: string | null; value: unknown };
      const fact: WireFact = {
        name: f.name,
        label: f.label,
        value: f.value,
        seq,
        createdAt: obj['createdAt'] as number,
      };
      state.facts.push(fact);
      state.log.push({ kind: 'fact', seq, fact });
      break;
    }
    case 'lane': {
      const l = obj['l'] as {
        op: 'create' | 'move' | 'delete';
        laneId: string;
        name?: string | null;
        fromEntryId?: string | null;
        toEntryId?: string;
      };
      const createdAt = obj['createdAt'] as number;
      if (l.op === 'create') {
        state.lanes.set(l.laneId, {
          laneId: l.laneId,
          name: l.name ?? l.laneId,
          leafEntryId: l.fromEntryId ?? null,
          createdAt,
          deleted: false,
        });
      } else if (l.op === 'move') {
        const lane = state.lanes.get(l.laneId);
        if (lane && !lane.deleted && l.toEntryId) lane.leafEntryId = l.toEntryId;
      } else {
        const lane = state.lanes.get(l.laneId);
        if (lane) lane.deleted = true;
      }
      state.log.push({
        kind: 'lane',
        seq,
        lane: {
          op: l.op,
          laneId: l.laneId,
          seq,
          createdAt,
          name: l.name ?? undefined,
          fromEntryId: l.fromEntryId ?? undefined,
          toEntryId: l.toEntryId,
        },
      });
      break;
    }
    default:
      throw new Wire2StorageError(
        'CORRUPTED_JOURNAL',
        `unknown line kind ${String(lineKind)}: ${path}`,
      );
  }
}

async function appendLine(path: string, line: string, fsync: boolean): Promise<void> {
  const handle = await open(path, 'a');
  try {
    await handle.write(`${line}\n`);
    if (fsync) await handle.sync();
  } finally {
    await handle.close();
  }
}

async function ensureDir(dir: string): Promise<void> {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
}

function emptyState(): LoadedState {
  return {
    lanes: new Map(),
    entries: new Map(),
    recordsById: new Map(),
    records: [],
    facts: [],
    log: [],
    nextSeq: 1,
  };
}

function snapshotOf(lane: LaneState): LaneSnapshot {
  return {
    laneId: lane.laneId,
    name: lane.name,
    leafEntryId: lane.leafEntryId,
    createdAt: lane.createdAt,
  };
}
