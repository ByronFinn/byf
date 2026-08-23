import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import type { AgentHarness } from './agent-harness';
import type { LaneId } from './storage/types';

/**
 * v2 events 目录与订阅模型（PRD-0037 #334，R6）。
 *
 * 事件被动、按进程序、提交后触发（事件宣告的事实已可查询——emit 在落盘
 * 之后）、payload JSON 可序列化、恢复期工作带 recovery: true。
 *
 * watch()：原子捕获快照并开始缓冲 → start(listener) 依序冲刷转直播 →
 * unsubscribe 丢弃缓冲。重连 = 新 watch() 新快照（AC7：无丢无重、恰一次
 * 有序）。LaneSnapshot 含 transcript/operation/队列/pendingWrites——中途
 * attach 的观察者无需重放事件即可渲染。
 */

// ===== 事件目录 =====

export type V2EventType =
  | 'run_start'
  | 'run_end'
  | 'step_start'
  | 'step_end'
  | 'message'
  | 'tool_start'
  | 'tool_end'
  | 'tree_change'
  | 'queue_change'
  | 'fact_change'
  | 'config_change'
  | 'lane_change'
  | 'handler_error';

export interface V2EventBase {
  readonly type: V2EventType;
  readonly laneId: LaneId;
  readonly seq: number; // 事件序号（进程内单调）
  /** 恢复期工作（restore/reconcile 产生的事件）。 */
  readonly recovery?: boolean;
  readonly at: number;
}

export interface RunStartEvent extends V2EventBase {
  readonly type: 'run_start';
  readonly opId: string;
}
export interface RunEndEvent extends V2EventBase {
  readonly type: 'run_end';
  readonly opId: string;
  readonly outcome: 'completed' | 'aborted' | 'failed';
  readonly usage?: TokenUsage;
}
export interface StepEvent extends V2EventBase {
  readonly type: 'step_start' | 'step_end';
  readonly opId: string;
  readonly step: number;
}
export interface MessageEvent extends V2EventBase {
  readonly type: 'message';
  readonly role: string;
  readonly entryId: string;
  readonly preview: string;
}
export interface ToolEvent extends V2EventBase {
  readonly type: 'tool_start' | 'tool_end';
  readonly toolCallId: string;
  readonly name: string;
  readonly isError?: boolean;
}
export interface ChangeEvent extends V2EventBase {
  readonly type: 'tree_change' | 'queue_change' | 'fact_change' | 'config_change' | 'lane_change';
  readonly detail: string;
}
export interface HandlerErrorEvent2 extends V2EventBase {
  readonly type: 'handler_error';
  readonly hookPoint: string;
  readonly message: string;
}

export type V2Event =
  | RunStartEvent
  | RunEndEvent
  | StepEvent
  | MessageEvent
  | ToolEvent
  | ChangeEvent
  | HandlerErrorEvent2;

// ===== LaneSnapshot =====

export interface LaneOperationSnapshot {
  readonly opId: string;
  readonly status: 'running' | 'suspended' | 'aborting';
  /** 进行中流式文本（中途 attach 渲染用）。 */
  readonly streamingMessage: string;
  readonly runningTools: readonly { readonly toolCallId: string; readonly name: string }[];
}

export interface LaneSnapshot {
  readonly laneId: LaneId;
  readonly status: string;
  readonly operation: LaneOperationSnapshot | undefined;
  /** transcript（消息条目投影，最新在后）。 */
  readonly transcript: readonly {
    readonly role: string;
    readonly text: string;
    readonly entryId: string;
  }[];
  readonly queues: { readonly steer: number; readonly followUp: number; readonly nextRun: number };
  readonly pendingWrites: number;
}

export interface SessionSnapshot {
  readonly sessionId: string;
  readonly lanes: readonly LaneSnapshot[];
  /** 捕获快照时的事件序号（start() 冲刷从此之后开始）。 */
  readonly eventSeq: number;
  readonly capturedAt: number;
}

// ===== 事件总线 =====

type V2EventListener = (event: V2Event) => void;

/**
 * 事件总线：提交后触发（emit 由 harness 在落盘后调用）；listener 抛错被
 * handler_error 吞掉不影响执行；恢复期事件带 recovery: true。
 */
export class V2EventBus {
  private seq = 0;
  private readonly listeners = new Set<V2EventListener>();

  subscribe(listener: V2EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(
    laneId: LaneId,
    build: (base: {
      laneId: LaneId;
      seq: number;
      at: number;
    }) => Omit<V2Event, 'laneId' | 'seq' | 'at'>,
    options?: { readonly recovery?: boolean },
  ): void {
    const event = {
      ...build({ laneId, seq: ++this.seq, at: Date.now() }),
      laneId,
      seq: this.seq,
      ...(options?.recovery === true ? { recovery: true } : {}),
    } as V2Event;
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // listener 抛错不影响执行（handler_error 隔离）
      }
    }
  }

  currentSeq(): number {
    return this.seq;
  }
}

// ===== watch()：快照 + 缓冲订阅 =====

export interface WatchHandle {
  /** 冲刷缓冲并转直播。返回 unsubscribe。 */
  start(listener: V2EventListener): () => void;
  /** 丢弃缓冲（不冲刷）。 */
  discard(): void;
  readonly snapshot: SessionSnapshot;
}

/**
 * 原子捕获快照并开始缓冲（AC7）：快照读取与缓冲开启之间无事件丢失——
 * 缓冲从 snapshot.eventSeq+1 起步，start() 只冲刷快照之后的事件。
 */
export async function watch(harness: AgentHarness): Promise<WatchHandle> {
  const bus = harness.events;
  const laneIds = await harness.lanes();
  const lanes: LaneSnapshot[] = [];
  for (const laneId of laneIds) {
    const state = harness.laneState(laneId);
    const branch = await harness.session.branchOf(laneId, { direction: 'oldestFirst' });
    lanes.push({
      laneId,
      status: state.status,
      operation:
        state.openOperation !== undefined
          ? {
              opId: state.openOperation.opId,
              status:
                state.status === 'running' ? 'running' : (state.status as 'suspended' | 'aborting'),
              streamingMessage: '',
              runningTools: [],
            }
          : undefined,
      transcript: branch.entries.flatMap((entry) =>
        entry.kind === 'message'
          ? [
              {
                role: entry.message.role,
                text: entry.message.content
                  .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
                  .map((p) => p.text)
                  .join(''),
                entryId: entry.id,
              },
            ]
          : [],
      ),
      queues: {
        steer: state.queues.steer.length,
        followUp: state.queues.followUp.length,
        nextRun: state.queues.nextRun.length,
      },
      pendingWrites: 0,
    });
  }
  // 快照 seq 与缓冲注册在同一同步段完成——JS 单线程保证无 onEvent 交错
  const eventSeq = bus.currentSeq();
  const buffer: V2Event[] = [];
  const unsubscribeBuffer = bus.subscribe((event) => {
    if (event.seq > eventSeq) buffer.push(event);
  });
  let started = false;
  return {
    snapshot: { sessionId: harness.session.sessionId, lanes, eventSeq, capturedAt: Date.now() },
    start(listener: V2EventListener): () => void {
      if (started) throw new Error('watch already started');
      started = true;
      unsubscribeBuffer();
      // 依序冲刷缓冲（快照之后、直播之前），再转直播——恰一次有序
      for (const event of buffer.splice(0)) {
        try {
          listener(event);
        } catch {
          // listener 抛错被吞（handler_error 隔离）
        }
      }
      return bus.subscribe(listener);
    },
    discard(): void {
      unsubscribeBuffer();
      buffer.length = 0;
    },
  };
}

/** 会话级观察者（全部 lane 事件 + 会话结构变化）。 */
export async function watchSession(
  harness: AgentHarness,
  listener: V2EventListener,
): Promise<() => void> {
  const handle = await watch(harness);
  return handle.start(listener);
}

export type { ContentPart };
