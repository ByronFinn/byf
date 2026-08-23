import type { EntryId, EntryKind, WireEntry } from '../storage/types';

/**
 * branch 查询语义（PRD-0037 #321）——纯函数内核。
 *
 * 三后端共享同一份实现（parity by construction）：输入是完整 parent 链
 * （start → root 方向），输出按 direction/filter/stop/limit/cursor 语义切片。
 */

export type BranchDirection = 'oldestFirst' | 'newestFirst';

export interface BranchQueryOptions {
  /** 扫描起点（缺省 = lane leaf）。 */
  readonly fromEntryId?: EntryId;
  /** 输出方向，缺省 newestFirst。 */
  readonly direction?: BranchDirection;
  /** 只保留这些 entry 类型。 */
  readonly types?: readonly EntryKind[];
  /** 只保留这些 customType（仅对 custom entry 生效）。 */
  readonly customTypes?: readonly string[];
  /** 向根行走时的含端边界：命中该类型的第一个 entry 之后停止（含它）。 */
  readonly stopAtType?: EntryKind;
  /** 含端边界：走到该 entry（含它）停止。 */
  readonly stopAtId?: EntryId;
  /** 输出条数上限。 */
  readonly limit?: number;
  /** 分页游标（上一页最后一条 entry id；不含它继续）。 */
  readonly cursor?: EntryId;
}

export interface BranchQueryResult {
  readonly entries: readonly WireEntry[];
  readonly nextCursor?: EntryId;
}

export class BranchQueryError extends Error {
  constructor(
    readonly code: 'UNKNOWN_ENTRY',
    message: string,
  ) {
    super(message);
    this.name = 'BranchQueryError';
  }
}

/**
 * 沿 parent 链切片。
 *
 * stopAtType/stopAtId 在 start→root 方向上截断（含端）——
 * `stopAtType: 'compaction'` 即当前上下文窗口（压缩边界之后 + 边界自身）。
 * cursor 在输出方向上排除已翻页条目：newestFirst 向根继续、oldestFirst 向叶继续。
 */
export function queryBranch(
  chainRootFirst: readonly WireEntry[],
  options: BranchQueryOptions,
): BranchQueryResult {
  // chainRootFirst: root → start 方向
  if (chainRootFirst.length === 0) {
    return { entries: [] };
  }

  // stop 边界：从 start 向根行走，命中即停（含端）。root→start 序列上表现为
  // 保留 [命中项, start] 区间——`stopAtType: 'compaction'` 即当前上下文窗口
  // （压缩边界自身 + 其后全部）。
  let cut = 0; // 含端下界（root→start 序）
  for (let i = chainRootFirst.length - 1; i >= 0; i--) {
    const entry = chainRootFirst[i]!;
    if (options.stopAtId !== undefined && entry.id === options.stopAtId) {
      cut = i;
      break;
    }
    if (options.stopAtType !== undefined && entry.kind === options.stopAtType) {
      cut = i;
      break;
    }
  }
  const windowed = chainRootFirst.slice(cut);

  // 方向：newestFirst = start → root；oldestFirst = root → start
  const ordered = options.direction === 'oldestFirst' ? windowed : windowed.toReversed();

  // cursor：排除已翻页条目，从下一条继续
  let slice = ordered;
  if (options.cursor !== undefined) {
    const cursorIndex = ordered.findIndex((entry) => entry.id === options.cursor);
    if (cursorIndex === -1) {
      throw new BranchQueryError('UNKNOWN_ENTRY', `cursor not in branch: ${options.cursor}`);
    }
    slice = ordered.slice(cursorIndex + 1);
  }

  // 类型过滤（stop 边界之后应用）
  const filtered = slice.filter((entry) => {
    if (options.types && !options.types.includes(entry.kind)) return false;
    if (
      options.customTypes &&
      !(entry.kind === 'custom' && options.customTypes.includes(entry.customType))
    ) {
      return false;
    }
    return true;
  });

  // limit
  const limited = options.limit !== undefined ? filtered.slice(0, options.limit) : filtered;

  // nextCursor：以过滤后最后一条为游标（还有剩余时）
  let nextCursor: EntryId | undefined;
  if (options.limit !== undefined && filtered.length > limited.length && limited.length > 0) {
    nextCursor = limited.at(-1)!.id;
  }
  return nextCursor !== undefined ? { entries: limited, nextCursor } : { entries: limited };
}

/** 从 start 沿 parent 收集到 root（root → start 方向返回），校验起点存在。 */
export function chainFrom(
  byId: ReadonlyMap<EntryId, WireEntry>,
  startEntryId: EntryId,
): readonly WireEntry[] {
  const chain: WireEntry[] = [];
  let cursor: EntryId | null = startEntryId;
  const seen = new Set<EntryId>();
  while (cursor !== null) {
    if (seen.has(cursor)) {
      throw new BranchQueryError('UNKNOWN_ENTRY', `cycle detected at ${cursor}`);
    }
    seen.add(cursor);
    const entry = byId.get(cursor);
    if (!entry) {
      throw new BranchQueryError('UNKNOWN_ENTRY', `entry not found: ${cursor}`);
    }
    chain.push(entry);
    cursor = entry.parentId;
  }
  return chain.toReversed(); // root → start
}
