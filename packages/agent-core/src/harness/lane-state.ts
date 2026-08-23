import {
  asAbortRequested,
  asOperationFinished,
  asOperationStarted,
  asQueueEnqueued,
  asTaskAttempt,
  asToolStarted,
} from './records';
import type { OperationKind, QueueEnqueuedPayload, ToolStartedPayload } from './records';
import type { LaneId, WireRecord } from './storage/types';

/**
 * lane 状态归约（PRD-0037 #323，v2 恢复归约）。
 *
 * 「状态 = 记录的归约」：live 执行与 restore 走同一 apply 函数——live 每追加
 * 一条记录推进一次，restore 重放全部记录重建。两侧永不漂移。
 */

export type LaneStatus = 'idle' | 'running' | 'suspended' | 'aborting' | 'deferred';

/** suspended 的两个原因（deferred 为 #335/#336 预留）。 */
export type SuspendedReason = 'crash' | 'deferred';

export interface OpenOperation {
  readonly opId: string;
  readonly kind: OperationKind;
  readonly startedAt: number;
  readonly abortRequested: boolean;
  /** 已持久化的最大 run-attempt 序号（0 = 尚无 resume；AC3 跨崩溃不可重置）。 */
  readonly attempts: number;
  /** attempts 达到 maxAttempts 时 resume 耗尽（错误消息 + failed 收尾）。 */
  readonly maxAttempts: number;
  /** 悬空工具批（tool_started 无配对结果 entry）。 */
  readonly danglingTools: readonly ToolStartedPayload[];
  /** 各队列待办（queue_enqueued 未消费）。 */
  readonly pendingQueues: Readonly<
    Record<'steer' | 'followUp' | 'nextRun', QueueEnqueuedPayload[]>
  >;
}

export interface LaneState {
  readonly laneId: LaneId;
  readonly status: LaneStatus;
  readonly suspendedReason?: SuspendedReason;
  readonly openOperation?: OpenOperation;
}

interface MutableLaneState {
  laneId: LaneId;
  status: LaneStatus;
  suspendedReason?: SuspendedReason;
  open?: {
    opId: string;
    kind: OperationKind;
    startedAt: number;
    abortRequested: boolean;
    attempts: number;
    maxAttempts: number;
    danglingTools: ToolStartedPayload[];
    pendingQueues: {
      steer: QueueEnqueuedPayload[];
      followUp: QueueEnqueuedPayload[];
      nextRun: QueueEnqueuedPayload[];
    };
  };
}

/**
 * 单写者 lane 状态机。一次只允许一个开放操作；`running` 仅在 live 进程内
 * 出现（记录里没有"开始执行"事件——operation_started 即执行意图），restore
 * 归约出的开放操作一律判 suspended（挂起≡崩溃）。
 */
export class LaneStateReducer {
  private readonly lanes = new Map<LaneId, MutableLaneState>();

  /** live/restore 共用：一条记录一次转移。 */
  apply(record: WireRecord): void {
    const lane = this.laneFor(record.laneId);
    switch (record.kind) {
      case 'operation_started': {
        const payload = asOperationStarted(record.payload);
        if (!payload) return;
        if (lane.open) return; // 单开放操作：重复 started（幂等重放）忽略
        lane.open = {
          opId: payload.opId,
          kind: payload.kind,
          startedAt: payload.startedAt,
          abortRequested: false,
          attempts: 0,
          maxAttempts: 0,
          danglingTools: [],
          pendingQueues: { steer: [], followUp: [], nextRun: [] },
        };
        lane.status = 'running';
        lane.suspendedReason = undefined;
        break;
      }
      case 'abort_requested': {
        const payload = asAbortRequested(record.payload);
        if (!payload || !lane.open || lane.open.opId !== payload.opId) return;
        lane.open.abortRequested = true;
        lane.status = 'aborting';
        break;
      }
      case 'operation_finished': {
        const payload = asOperationFinished(record.payload);
        if (!payload || !lane.open || lane.open.opId !== payload.opId) return;
        lane.open = undefined;
        lane.status = 'idle';
        lane.suspendedReason = undefined;
        break;
      }
      case 'tool_started': {
        const payload = asToolStarted(record.payload);
        if (!payload || !lane.open) return;
        lane.open.danglingTools.push(payload);
        break;
      }
      case 'queue_enqueued': {
        const payload = asQueueEnqueued(record.payload);
        if (!payload || !lane.open) return;
        lane.open.pendingQueues[payload.queue].push(payload);
        break;
      }
      case 'task_attempt': {
        // run-attempt 持久计数（AC3）：resume 前追加，restore 折叠出 max
        const payload = asTaskAttempt(record.payload);
        if (!payload || !lane.open || lane.open.opId !== payload.opId) return;
        lane.open.attempts = Math.max(lane.open.attempts, payload.attempt);
        lane.open.maxAttempts = Math.max(lane.open.maxAttempts, payload.maxAttempts);
        break;
      }
      // write_deferred 不改变 lane 状态机（#325 在 checkpoint 消费其载荷）
      case 'write_deferred':
        break;
    }
  }

  /**
   * restore 收尾：把 running 折叠为 suspended（挂起≡崩溃）。
   * deferred 原因由 #336 的 Park 记录区分，此处预留。
   */
  finishRestore(laneId?: LaneId): void {
    for (const lane of this.lanes.values()) {
      if (laneId !== undefined && lane.laneId !== laneId) continue;
      if (lane.status === 'running') {
        lane.status = 'suspended';
        lane.suspendedReason = 'crash';
      } else if (lane.status === 'aborting') {
        // abort_requested 持久化但 reconcile 未完成：保持 aborting，
        // resume 走 reconcile 路径（#325 完整化）
        lane.suspendedReason = 'crash';
      }
    }
  }

  snapshot(laneId: LaneId): LaneState {
    const lane = this.laneFor(laneId);
    if (!lane.open) return { laneId, status: lane.status };
    return {
      laneId,
      status: lane.status,
      suspendedReason: lane.suspendedReason,
      openOperation: {
        opId: lane.open.opId,
        kind: lane.open.kind,
        startedAt: lane.open.startedAt,
        abortRequested: lane.open.abortRequested,
        attempts: lane.open.attempts,
        maxAttempts: lane.open.maxAttempts,
        danglingTools: [...lane.open.danglingTools],
        pendingQueues: {
          steer: [...lane.open.pendingQueues.steer],
          followUp: [...lane.open.pendingQueues.followUp],
          nextRun: [...lane.open.pendingQueues.nextRun],
        },
      },
    };
  }

  allLaneIds(): readonly LaneId[] {
    return [...this.lanes.keys()];
  }

  private laneFor(laneId: LaneId): MutableLaneState {
    let lane = this.lanes.get(laneId);
    if (!lane) {
      lane = { laneId, status: 'idle' };
      this.lanes.set(laneId, lane);
    }
    return lane;
  }
}

/** 便捷：从全部记录一次性归约（restore 用）。 */
export function reduceLaneStates(records: readonly WireRecord[]): LaneStateReducer {
  const reducer = new LaneStateReducer();
  for (const record of records) reducer.apply(record);
  reducer.finishRestore();
  return reducer;
}
