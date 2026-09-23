import { JsonlSessionStorage } from './storage/jsonl';
import type { WireEntry, WireRecord } from './storage/types';
import { WIRE2_FORMAT_VERSION } from './storage/types';
import type { JournalLine } from './storage/types';

/**
 * wire 2.0 检视投影（PRD-0037 #341，读侧）。
 *
 * Inspector/检视图对 2.0 会话的只读投影：entries 树（parent 链 + 分支结构）、
 * records 操作日志（时间轴）、lanes 状态。旧 1.1 会话在过渡期内沿用既有
 * 投影（只读可见，不打开为 live）。
 */

/** 检视用 entry 投影（对话树节点）。 */
export interface InspectionEntry2 {
  readonly id: string;
  readonly parentId: string | null;
  readonly kind: WireEntry['kind'];
  readonly seq: number;
  readonly createdAt: number;
  /** message entry 的角色与文本预览。 */
  readonly role?: string;
  readonly textPreview?: string;
  readonly toolCalls?: readonly { readonly id: string; readonly name: string }[];
  /** custom entry 的类型标记。 */
  readonly customType?: string;
  /** 子节点（树形渲染）。 */
  readonly children: InspectionEntry2[];
}

/** 检视用 record 投影（操作日志时间轴行）。 */
export interface InspectionRecord2 {
  readonly id: string;
  readonly kind: WireRecord['kind'];
  readonly laneId: string;
  readonly seq: number;
  readonly createdAt: number;
  readonly summary: string;
}

export interface InspectionLane2 {
  readonly laneId: string;
  readonly name: string;
  readonly leafEntryId: string | null;
}

/** 2.0 会话的完整检视投影。 */
export interface SessionInspection2 {
  readonly formatVersion: typeof WIRE2_FORMAT_VERSION;
  readonly sessionId: string;
  readonly lanes: readonly InspectionLane2[];
  /** 会话树根节点（多根 = 多分叉森林）。 */
  readonly roots: readonly InspectionEntry2[];
  /** 操作日志时间轴（seq 序）。 */
  readonly timeline: readonly InspectionRecord2[];
  /** 全部 journal 行（调试视图）。 */
  readonly log: readonly JournalLine[];
}

export class UnsupportedWireFormatException extends Error {
  constructor(
    readonly foundVersion: string | undefined,
    path: string,
  ) {
    super(`wire format ${foundVersion ?? '(none)'} not supported for inspection: ${path}`);
    this.name = 'UnsupportedWireFormatException';
  }
}

/** 打开 2.0 会话目录并生成检视投影（只读，不获取锁、不物理截断）。 */
export async function readSessionInspection2(sessionDir: string): Promise<SessionInspection2> {
  const storage = await JsonlSessionStorage.open(`${sessionDir}/wire.jsonl`, { readonly: true });
  try {
    const [entries, records, lanes, log] = await Promise.all([
      storage.getEntries(),
      storage.getRecords(),
      storage.getLanes(),
      storage.getLog(),
    ]);
    const byId = new Map<string, InspectionEntry2>();
    const roots: InspectionEntry2[] = [];
    // 按 seq 升序建树（父先于子——存储不变量）
    for (const entry of entries.toSorted((a, b) => a.seq - b.seq)) {
      const node = projectEntry(entry);
      byId.set(node.id, node);
      if (entry.parentId === null) {
        roots.push(node);
      } else {
        byId.get(entry.parentId)?.children.push(node);
      }
    }
    return {
      formatVersion: WIRE2_FORMAT_VERSION,
      sessionId: storage.sessionId,
      lanes: lanes.map((lane) => ({
        laneId: lane.laneId,
        name: lane.name,
        leafEntryId: lane.leafEntryId,
      })),
      roots,
      timeline: records.toSorted((a, b) => a.seq - b.seq).map(projectRecord),
      log,
    };
  } finally {
    await storage.close();
  }
}

function projectEntry(entry: WireEntry): InspectionEntry2 {
  const base: InspectionEntry2 = {
    id: entry.id,
    parentId: entry.parentId,
    kind: entry.kind,
    seq: entry.seq,
    createdAt: entry.createdAt,
    children: [],
  };
  switch (entry.kind) {
    case 'message':
      return {
        ...base,
        role: entry.message.role,
        textPreview: entry.message.content
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p: { type: 'text'; text: string }) => p.text)
          .join('')
          .slice(0, 120),
        ...(entry.message.toolCalls
          ? {
              toolCalls: entry.message.toolCalls.map((call: { id: string; name: string }) => ({
                id: call.id,
                name: call.name,
              })),
            }
          : {}),
      };
    case 'custom':
      return { ...base, customType: entry.customType };
    case 'compaction':
      return { ...base, textPreview: entry.summary.slice(0, 120) };
    case 'branch_summary':
      return { ...base, textPreview: entry.summary.slice(0, 120) };
    default:
      return base;
  }
}

function projectRecord(record: WireRecord): InspectionRecord2 {
  const payload = record.payload as Record<string, unknown>;
  const summary =
    typeof payload['opId'] === 'string'
      ? `op ${payload['opId']}`
      : typeof payload['queue'] === 'string'
        ? `queue ${payload['queue']}`
        : record.kind;
  return {
    id: record.id,
    kind: record.kind,
    laneId: record.laneId,
    seq: record.seq,
    createdAt: record.createdAt,
    summary,
  };
}
