import { Database } from 'bun:sqlite';

import type { RecordFilter, SessionStorage } from '@byfriends/agent-core';
import type {
  AppendEntryInput,
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
} from '@byfriends/agent-core';

/**
 * wire 2.0 SQLite 后端（PRD-0037 #337，ADR-0006 分层：契约在 agent-core，
 * 本包实现契约；bun:sqlite 依赖隔离于本包）。
 *
 * schema：entries/records/lane_moves/facts/lanes（复合主键 session 内唯一；
 * 祖先链经 entries.parent_id 索引点查）。leases（owner/heartbeat）接管锁
 * 文件的单一职责：原子条件写获取 + 自动心跳 + 超时自动接管；每会话独立
 * lease（同库多会话互不阻塞）。
 */

export interface SqliteStorageOptions {
  /** 心跳超时（lease 接管阈值）；默认 60s。 */
  readonly leaseStaleMs?: number;
  /** lease 持有者标识；缺省 pid。 */
  readonly owner?: string;
}

export class StorageLeaseError extends Error {
  constructor(
    readonly holder: string,
    message: string,
  ) {
    super(message);
    this.name = 'StorageLeaseError';
  }
}

export class SqliteSessionStorage implements SessionStorage {
  readonly sessionId: string;
  readonly path: string;

  private readonly db: Database;
  private readonly leaseStaleMs: number;
  private readonly owner: string;
  private leaseTimer: ReturnType<typeof setInterval> | undefined;
  private closed = false;

  /** 打开（或创建）数据库并获取会话 lease。 */
  static open(
    path: string,
    sessionId: string,
    options?: SqliteStorageOptions,
  ): SqliteSessionStorage {
    return new SqliteSessionStorage(path, sessionId, options);
  }

  private constructor(path: string, sessionId: string, options?: SqliteStorageOptions) {
    this.path = path;
    this.sessionId = sessionId;
    this.db = new Database(path, { create: true });
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.leaseStaleMs = options?.leaseStaleMs ?? 60_000;
    this.owner = options?.owner ?? `pid-${process.pid}`;
    this.migrate();
    this.acquireLease();
    this.initSeqCounter();
  }

  // ===== lease（单写者，接管锁文件职责） =====

  private acquireLease(): void {
    const now = Date.now();
    // 原子条件写（修 check-then-act 竞态）：仅当本人持有或心跳超时才更新；
    // 行数 0 → 尝试插入（无持有者），插入冲突 → 新鲜持有者拒绝。
    const update = this.db
      .query(
        'UPDATE leases SET owner = ?, heartbeat_at = ? WHERE session_id = ? AND (owner = ? OR heartbeat_at <= ?)',
      )
      .run(this.owner, now, this.sessionId, this.owner, now - this.leaseStaleMs);
    if (update.changes === 0) {
      try {
        this.db
          .query('INSERT INTO leases (session_id, owner, heartbeat_at) VALUES (?, ?, ?)')
          .run(this.sessionId, this.owner, now);
      } catch {
        const existing = this.db
          .query('SELECT owner FROM leases WHERE session_id = ?')
          .get(this.sessionId) as { owner: string } | null;
        throw new StorageLeaseError(
          existing?.owner ?? 'unknown',
          `会话 ${this.sessionId} lease 心跳新鲜（持有者 ${existing?.owner ?? 'unknown'}）；跨进程第二写入者被拒。`,
        );
      }
    }
    // 自动心跳（unref）：持有期间持续续期——否则 lease 过期后单写者保证蒸发
    this.leaseTimer = setInterval(
      () => this.heartbeat(),
      Math.max(1, Math.min(20_000, Math.floor(this.leaseStaleMs / 3))),
    );
    this.leaseTimer.unref?.();
  }

  /** 刷新 lease 心跳（持有者周期调用）。 */
  heartbeat(): void {
    this.assertOpen();
    this.db
      .query('UPDATE leases SET heartbeat_at = ? WHERE session_id = ? AND owner = ?')
      .run(Date.now(), this.sessionId, this.owner);
  }

  // ===== lanes =====

  async createLane(input: CreateLaneInput): Promise<LaneSnapshot> {
    this.assertOpen();
    const laneId = input.laneId ?? `lane-${Date.now().toString(36)}`;
    const existing = this.laneRow(laneId);
    if (existing && !existing.deleted) {
      throw new Error(`lane already exists: ${laneId}`);
    }
    if (input.fromEntryId !== undefined && !this.entryRow(input.fromEntryId)) {
      throw new Error(`fromEntryId not found: ${input.fromEntryId}`);
    }
    const createdAt = Date.now();
    const seq = this.allocSeq();
    const name = input.name ?? laneId;
    const tx = this.db.transaction(() => {
      this.db
        .query(
          'INSERT INTO lane_moves (seq, session_id, op, lane_id, name, from_entry_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        )
        .run(seq, this.sessionId, 'create', laneId, name, input.fromEntryId ?? null, createdAt);
      this.db
        .query(
          'INSERT INTO lanes (session_id, lane_id, name, leaf_entry_id, created_at, deleted) VALUES (?, ?, ?, ?, ?, 0) ' +
            'ON CONFLICT(session_id, lane_id) DO UPDATE SET deleted = 0, name = excluded.name, leaf_entry_id = excluded.leaf_entry_id, created_at = excluded.created_at',
        )
        .run(this.sessionId, laneId, name, input.fromEntryId ?? null, createdAt);
    });
    tx();
    this.cacheInvalidate();
    return { laneId, name, leafEntryId: input.fromEntryId ?? null, createdAt };
  }

  async moveLane(laneId: LaneId, toEntryId: EntryId): Promise<void> {
    this.assertOpen();
    const lane = this.requireLane(laneId);
    if (!this.entryRow(toEntryId)) throw new Error(`toEntryId not found: ${toEntryId}`);
    const seq = this.allocSeq();
    const tx = this.db.transaction(() => {
      this.db
        .query(
          'INSERT INTO lane_moves (seq, session_id, op, lane_id, to_entry_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run(seq, this.sessionId, 'move', laneId, toEntryId, Date.now());
      this.db
        .query('UPDATE lanes SET leaf_entry_id = ? WHERE session_id = ? AND lane_id = ?')
        .run(toEntryId, this.sessionId, laneId);
    });
    tx();
    void lane;
    this.cacheInvalidate();
  }

  async deleteLane(laneId: LaneId): Promise<void> {
    this.assertOpen();
    this.requireLane(laneId);
    const seq = this.allocSeq();
    this.db
      .query(
        'INSERT INTO lane_moves (seq, session_id, op, lane_id, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(seq, this.sessionId, 'delete', laneId, Date.now());
    this.db
      .query('UPDATE lanes SET deleted = 1 WHERE session_id = ? AND lane_id = ?')
      .run(this.sessionId, laneId);
    this.cacheInvalidate();
  }

  async getLanes(): Promise<readonly LaneSnapshot[]> {
    this.assertOpen();
    return this.db
      .query(
        'SELECT lane_id AS laneId, name, leaf_entry_id AS leafEntryId, created_at AS createdAt FROM lanes WHERE session_id = ? AND deleted = 0 ORDER BY created_at',
      )
      .all(this.sessionId) as LaneSnapshot[];
  }

  // ===== entries =====

  async appendEntry(input: AppendEntryInput): Promise<WireEntry> {
    this.assertOpen();
    const lane = this.requireLane(input.laneId);
    if (input.id !== undefined && this.entryRow(input.id)) {
      return this.decodeEntry(this.entryRow(input.id)!);
    }
    const seq = this.allocSeq();
    const id = input.id ?? `e${seq}`;
    const parentId = lane.leaf_entry_id;
    const createdAt = Date.now();
    const payload = entryPayloadOf(input);
    const tx = this.db.transaction(() => {
      this.db
        .query(
          'INSERT INTO entries (id, session_id, parent_id, seq, kind, payload, created_at, lane_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        )
        .run(
          id,
          this.sessionId,
          parentId,
          seq,
          payload.kind,
          JSON.stringify(payload),
          createdAt,
          input.laneId,
        );
      this.db
        .query('UPDATE lanes SET leaf_entry_id = ? WHERE session_id = ? AND lane_id = ?')
        .run(id, this.sessionId, input.laneId);
    });
    tx();
    this.cacheInvalidate();
    return materialize(id, parentId, seq, createdAt, payload);
  }

  async getEntry(id: EntryId): Promise<WireEntry | undefined> {
    this.assertOpen();
    const row = this.entryRow(id);
    return row ? this.decodeEntry(row) : undefined;
  }

  async getEntries(): Promise<readonly WireEntry[]> {
    this.assertOpen();
    return (
      this.db
        .query('SELECT * FROM entries WHERE session_id = ? ORDER BY seq')
        .all(this.sessionId) as unknown[]
    ).map((row) => this.decodeEntry(row as EntryRow));
  }

  // ===== records =====

  async appendRecord(input: {
    laneId: LaneId;
    kind: WireRecord['kind'];
    payload: unknown;
    id?: string;
  }): Promise<WireRecord> {
    this.assertOpen();
    const existing = input.id
      ? (this.db
          .query('SELECT * FROM records WHERE session_id = ? AND id = ?')
          .get(this.sessionId, input.id) as RecordRow | null)
      : null;
    if (existing) return this.decodeRecord(existing);
    const seq = this.allocSeq();
    const id = input.id ?? `r${seq}`;
    const createdAt = Date.now();
    this.db
      .query(
        'INSERT INTO records (id, session_id, lane_id, seq, kind, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        id,
        this.sessionId,
        input.laneId,
        seq,
        input.kind,
        JSON.stringify(input.payload ?? null),
        createdAt,
      );
    return { id, kind: input.kind, laneId: input.laneId, seq, createdAt, payload: input.payload };
  }

  async getRecords(filter?: RecordFilter): Promise<readonly WireRecord[]> {
    this.assertOpen();
    // 过滤下推 SQL（review M8）：checkpoint 热路径每步调用，避免全表扫描
    const conditions = ['session_id = ?'];
    const params: (string | number)[] = [this.sessionId];
    if (filter?.laneId !== undefined) {
      conditions.push('lane_id = ?');
      params.push(filter.laneId);
    }
    if (filter?.fromSeq !== undefined) {
      conditions.push('seq >= ?');
      params.push(filter.fromSeq);
    }
    let kinds = filter?.kinds;
    if (kinds !== undefined && kinds.length === 0) kinds = ['__none__'];
    if (kinds !== undefined) {
      conditions.push(`kind IN (${kinds.map(() => '?').join(', ')})`);
      params.push(...kinds);
    }
    const rows = this.db
      .query(`SELECT * FROM records WHERE ${conditions.join(' AND ')} ORDER BY seq`)
      .all(...params) as RecordRow[];
    return rows.map((row) => this.decodeRecord(row));
  }

  // ===== facts =====

  async appendFact(input: {
    name: string;
    value: unknown;
    label?: string | null;
  }): Promise<WireFact> {
    this.assertOpen();
    const previous = (
      this.db
        .query(
          'SELECT label FROM facts WHERE session_id = ? AND name = ? ORDER BY seq DESC LIMIT 1',
        )
        .get(this.sessionId, input.name) as { label: string | null } | null
    )?.label;
    const seq = this.allocSeq();
    const label = input.label !== undefined ? input.label : (previous ?? null);
    const createdAt = Date.now();
    this.db
      .query(
        'INSERT INTO facts (seq, session_id, name, label, value, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(seq, this.sessionId, input.name, label, JSON.stringify(input.value ?? null), createdAt);
    return { name: input.name, label, value: input.value, seq, createdAt };
  }

  async getFacts(): Promise<ReadonlyMap<string, WireFact>> {
    this.assertOpen();
    const rows = this.db
      .query('SELECT * FROM facts WHERE session_id = ? ORDER BY seq')
      .all(this.sessionId) as FactRow[];
    const latest = new Map<string, WireFact>();
    for (const row of rows) {
      latest.set(row.name, {
        name: row.name,
        label: row.label,
        value: JSON.parse(row.value),
        seq: row.seq,
        createdAt: row.created_at,
      });
    }
    return latest;
  }

  // ===== 调试 / 测试 =====

  async getLog(): Promise<readonly JournalLine[]> {
    this.assertOpen();
    const lines: JournalLine[] = [];
    for (const row of this.db
      .query('SELECT * FROM entries WHERE session_id = ? ORDER BY seq')
      .all(this.sessionId) as EntryRow[]) {
      lines.push({ kind: 'entry', seq: row.seq, entry: this.decodeEntry(row) });
    }
    for (const row of this.db
      .query('SELECT * FROM records WHERE session_id = ? ORDER BY seq')
      .all(this.sessionId) as RecordRow[]) {
      lines.push({ kind: 'record', seq: row.seq, record: this.decodeRecord(row) });
    }
    for (const row of this.db
      .query('SELECT * FROM facts WHERE session_id = ? ORDER BY seq')
      .all(this.sessionId) as FactRow[]) {
      lines.push({
        kind: 'fact',
        seq: row.seq,
        fact: {
          name: row.name,
          label: row.label,
          value: JSON.parse(row.value),
          seq: row.seq,
          createdAt: row.created_at,
        },
      });
    }
    for (const row of this.db
      .query('SELECT * FROM lane_moves WHERE session_id = ? ORDER BY seq')
      .all(this.sessionId) as LaneMoveRow[]) {
      lines.push({
        kind: 'lane',
        seq: row.seq,
        lane: {
          op: row.op as LaneOp['op'],
          laneId: row.lane_id,
          seq: row.seq,
          createdAt: row.created_at,
          ...(row.name !== null ? { name: row.name } : {}),
          ...(row.from_entry_id !== null ? { fromEntryId: row.from_entry_id } : {}),
          ...(row.to_entry_id !== null ? { toEntryId: row.to_entry_id } : {}),
        },
      });
    }
    return lines.toSorted((a, b) => a.seq - b.seq);
  }

  async flush(): Promise<void> {
    this.assertOpen();
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  }

  async close(): Promise<void> {
    if (this.leaseTimer !== undefined) clearInterval(this.leaseTimer);
    // 释放 lease（只删自己的）
    this.db
      .query('DELETE FROM leases WHERE session_id = ? AND owner = ?')
      .run(this.sessionId, this.owner);
    this.db.close();
    this.closed = true;
  }

  // ===== 内部 =====

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        parent_id TEXT,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        lane_id TEXT NOT NULL DEFAULT 'main',
        PRIMARY KEY (session_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_entries_session ON entries(session_id, seq);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_entries_session_seq ON entries(session_id, seq);
      CREATE TABLE IF NOT EXISTS records (
        id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (session_id, id)
      );
      CREATE INDEX IF NOT EXISTS idx_records_session ON records(session_id, seq);
      CREATE TABLE IF NOT EXISTS lane_moves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seq INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        op TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        name TEXT,
        from_entry_id TEXT,
        to_entry_id TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS facts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seq INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        label TEXT,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lanes (
        session_id TEXT NOT NULL,
        lane_id TEXT NOT NULL,
        name TEXT NOT NULL,
        leaf_entry_id TEXT,
        created_at INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (session_id, lane_id)
      );
      CREATE TABLE IF NOT EXISTS leases (
        session_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        heartbeat_at INTEGER NOT NULL
      );
    `);
  }

  /** 进程内 seq 计数器（lease 单写者独占；构造时四表 MAX 初始化一次——
   * 消除每次追加 4 次 MAX 查询的热路径开销，review M8）。 */
  private seqCounter = 0;

  private initSeqCounter(): void {
    const maxOf = (table: string): number =>
      (
        this.db
          .query(`SELECT MAX(seq) AS m FROM ${table} WHERE session_id = ?`)
          .get(this.sessionId) as { m: number | null }
      ).m ?? 0;
    this.seqCounter = Math.max(
      maxOf('entries'),
      maxOf('records'),
      maxOf('facts'),
      maxOf('lane_moves'),
    );
  }

  private allocSeq(): Seq {
    return ++this.seqCounter;
  }

  private entryRow(id: string): EntryRow | null {
    return this.db
      .query('SELECT * FROM entries WHERE session_id = ? AND id = ?')
      .get(this.sessionId, id) as EntryRow | null;
  }

  private requireLane(laneId: LaneId): LaneRow {
    const lane = this.db
      .query('SELECT * FROM lanes WHERE session_id = ? AND lane_id = ? AND deleted = 0')
      .get(this.sessionId, laneId) as LaneRow | null;
    if (!lane) throw new Error(`lane not found: ${laneId}`);
    return lane;
  }

  private laneRow(laneId: LaneId): LaneRow | null {
    return this.db
      .query('SELECT * FROM lanes WHERE session_id = ? AND lane_id = ?')
      .get(this.sessionId, laneId) as LaneRow | null;
  }

  private decodeEntry(row: EntryRow): WireEntry {
    return materialize(row.id, row.parent_id, row.seq, row.created_at, JSON.parse(row.payload));
  }

  private decodeRecord(row: RecordRow): WireRecord {
    return {
      id: row.id,
      kind: row.kind as WireRecord['kind'],
      laneId: row.lane_id,
      seq: row.seq,
      createdAt: row.created_at,
      payload: JSON.parse(row.payload),
    };
  }

  /** getLanes/getEntries 结果缓存失效钩子（当前直查；大库可换快照缓存）。 */
  private cacheInvalidate(): void {
    // 直查模式：无缓存可失效
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('storage is closed');
  }
}

interface EntryRow {
  id: string;
  session_id: string;
  parent_id: string | null;
  seq: number;
  kind: string;
  payload: string;
  created_at: number;
}
interface RecordRow {
  id: string;
  session_id: string;
  lane_id: string;
  seq: number;
  kind: string;
  payload: string;
  created_at: number;
}
interface FactRow {
  seq: number;
  session_id: string;
  name: string;
  label: string | null;
  value: string;
  created_at: number;
}
interface LaneMoveRow {
  seq: number;
  session_id: string;
  op: string;
  lane_id: string;
  name: string | null;
  from_entry_id: string | null;
  to_entry_id: string | null;
  created_at: number;
}
interface LaneRow {
  session_id: string;
  lane_id: string;
  name: string;
  leaf_entry_id: string | null;
  created_at: number;
  deleted: number;
}

type EntryPayloadShape =
  | { kind: 'message'; message: unknown }
  | { kind: 'model_change'; modelAlias: string }
  | { kind: 'thinking_level_change'; thinkingLevel: string }
  | { kind: 'active_tools_change'; activeTools: readonly string[] }
  | {
      kind: 'compaction';
      summary: string;
      compactedUpTo?: string | null;
      stats?: unknown;
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
        ...(input.compactedUpTo !== undefined ? { compactedUpTo: input.compactedUpTo } : {}),
        ...(input.stats !== undefined ? { stats: input.stats } : {}),
      };
    case 'branch_summary':
      return { kind: 'branch_summary', summary: input.summary };
    case 'custom':
      return { kind: 'custom', customType: input.customType, data: input.data };
  }
}

function materialize(
  id: string,
  parentId: string | null,
  seq: Seq,
  createdAt: number,
  payload: EntryPayloadShape,
): WireEntry {
  const base = { id, parentId, seq, createdAt } as const;
  switch (payload.kind) {
    case 'message':
      return {
        ...base,
        kind: 'message',
        message: payload.message as WireEntry extends never
          ? never
          : import('@byfriends/agent-core').StoredMessage,
      };
    case 'model_change':
      return { ...base, kind: 'model_change', modelAlias: payload.modelAlias };
    case 'thinking_level_change':
      return { ...base, kind: 'thinking_level_change', thinkingLevel: payload.thinkingLevel };
    case 'active_tools_change':
      return { ...base, kind: 'active_tools_change', activeTools: [...payload.activeTools] };
    case 'compaction':
      return {
        ...base,
        kind: 'compaction',
        summary: payload.summary,
        ...(payload.compactedUpTo !== undefined && payload.compactedUpTo !== null
          ? { compactedUpTo: payload.compactedUpTo }
          : {}),
        ...(payload.stats !== undefined && payload.stats !== null
          ? { stats: payload.stats as Record<string, unknown> }
          : {}),
      };
    case 'branch_summary':
      return { ...base, kind: 'branch_summary', summary: payload.summary };
    case 'custom':
      return { ...base, kind: 'custom', customType: payload.customType, data: payload.data };
  }
}
