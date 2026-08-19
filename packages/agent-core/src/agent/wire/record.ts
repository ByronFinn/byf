/**
 * `wire` 域 —— 落盘 journal record 语言（纯编解码）。
 *
 * 一个 `WireRecord` 是一条已落盘 Op 的扁平 JSONL 表示。Agent journal 的首行是
 * `WireMetadataRecord`；metadata 是 journal 信封，不是 Op，故永不进入 model reducer
 * 注册表。本模块只负责纯编码 / 解码。
 *
 * **字节一致性约束（PRD-0027 grill 代码核查 / AC6）**：`opToWireRecord` 产出的
 * JSONL 形状必须与现有 `records/index.ts` 的 `logRecord` 逐字节一致 —— 对象 payload
 * 走展开分支（`{ type, ...payload }`），`time` 缺失时补 `Date.now()`（复刻
 * `records/index.ts:39-40`）。因为全部 26 种业务 record 的 payload 都是对象，
 * `opToWireRecord` 永远走展开分支，形状与现有产出一致；vis reader 形状无关
 * （只要求顶层对象 + string `type`），不会读错。
 */

import { AGENT_WIRE_PROTOCOL_VERSION } from '#/agent/records/migration';

import type { Op } from './op';

/** wire journal 落盘的文件名（与 records 层一致）。 */
export const AGENT_WIRE_RECORD_KEY = 'wire.jsonl';

export interface WireRecord {
  readonly type: string;
  readonly time?: number;
  readonly [key: string]: unknown;
}

export interface WireMetadataRecord extends WireRecord {
  readonly type: 'metadata';
  readonly protocol_version: string;
  readonly created_at: number;
}

export function isWireRecord(record: unknown): record is WireRecord {
  return (
    record !== null &&
    typeof record === 'object' &&
    !Array.isArray(record) &&
    typeof (record as { type?: unknown }).type === 'string'
  );
}

export function createWireMetadataRecord(now = Date.now()): WireMetadataRecord {
  return {
    type: 'metadata',
    protocol_version: AGENT_WIRE_PROTOCOL_VERSION,
    created_at: now,
  };
}

export function isWireMetadataRecord(record: WireRecord): record is WireMetadataRecord {
  return (
    record.type === 'metadata' &&
    typeof record['protocol_version'] === 'string' &&
    typeof record['created_at'] === 'number'
  );
}

/**
 * 把一个 Op 编码为落盘 record。对象 payload 展开（与 `logRecord` 一致）；
 * 标量 / 数组 payload 包成 `{ payload }`（现行 26 种业务 record 不会走到此分支，
 * 但保留以兜底）。`time` 缺失时补 `now`，复刻 `records/index.ts:39-40`。
 */
export function opToWireRecord(op: Op, now = Date.now()): WireRecord {
  const payload = op.payload;
  const record: Record<string, unknown> =
    payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      ? { type: op.type, ...(payload as Record<string, unknown>) }
      : { type: op.type, payload };
  if (record['time'] === undefined) record['time'] = now;
  return record as WireRecord;
}

/**
 * `opToWireRecord` 的逆操作：从落盘 record 还原 payload。
 *
 * 单 `payload` 键解包分支（对标 kimi record.ts）只为标量 / 数组 payload 的「包裹」
 * 编码服务。**不变量**：byf 现有 26 种业务 record 的 payload 都是对象（字段名均非
 * `payload`），`opToWireRecord` 永远走展开分支，故本函数对它们永远走 else 分支
 * （原样返回 payload 字段集合）。新增 Op 时若 payload 是裸标量/数组才会触发解包；
 * 切勿给对象 payload 起名为 `payload` 的字段，否则 round-trip 会损坏。
 */
export function wireRecordToPayload(record: WireRecord): unknown {
  const { type: _type, time: _time, ...payload } = record;
  return Object.keys(payload).length === 1 && 'payload' in payload ? payload['payload'] : payload;
}

/**
 * wire journal 的持久化协议。结构上与 `records/types.ts` 的 `AgentRecordPersistence`
 * 对齐，但按宽松的 `WireRecord` 类型存取（落盘的是 Op 编码出的 record，运行时即
 * 任意 `{ type: string; ... }`）。现有 `FileSystemAgentRecordPersistence` /
 * `InMemoryAgentRecordPersistence` 因 `AgentRecord` 是 `WireRecord` 的子类型而结构
 * 兼容；Phase 1 切换时直接复用。
 */
export interface WirePersistence {
  read(): AsyncIterable<WireRecord>;
  append(record: WireRecord): void;
  rewrite(records: readonly WireRecord[]): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}
