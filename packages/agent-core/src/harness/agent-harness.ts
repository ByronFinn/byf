import { randomUUID } from 'node:crypto';

import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import { createLoopEventDispatcher } from '../loop/events';
import type { LoopEvent } from '../loop/events';
import type { LLM } from '../loop/llm';
import { runTurn } from '../loop/run-turn';
import type { ExecutableTool } from '../loop/types';
import { LaneStateReducer } from './lane-state';
import type { LaneState } from './lane-state';
import { asOperationStarted, operationRecordId, toolStartedRecordId } from './records';
import type { OperationStartedPayload, ToolReplaySafety } from './records';
import { WireSession } from './session/session';
import { InMemorySessionStorage } from './storage/memory';
import type { SessionStorage } from './storage/storage';
import type { LaneId, StoredPromptOrigin } from './storage/types';
import { MAIN_LANE_ID } from './storage/types';
import { TranscriptBridge, projectEntryMessage } from './transcript';

/**
 * AgentHarness（PRD-0037 #323/#324，ADR-0041 并行新建）。
 *
 * 执行模型：被接受的 prompt 即持久操作——operation_started（含预分配 id）先于
 * 任何效果落盘，随后驱动 loop 层（host-free step primitives）跑步骤，终态写
 * operation_finished。崩溃后 restore 归约出 lane 状态（idle/suspended），
 * resume() 与 live 走同一 runProcedure 代码路径。
 *
 * 意图先行记录全集（#324，v2 §5）：tool_started（预分配 assistant/result
 * entry id + replay 安全标记）、task_attempt（跨崩溃不可重置的 run-attempt
 * 计数）、queue_enqueued / write_deferred / abort_requested（#325 消费）。
 * 接受边界记录（operation_started / queue_enqueued / write_deferred /
 * abort_requested）以 durability 'boundary' 落盘——存储 fsync-before-resolve。
 *
 * 独立性（AGENTS.md 目标措辞）：内存 SessionStorage 后端下可完全独立构造运行，
 * 不依赖旧 Agent 类与旧 Session 容器，构造不强制 sessionId。
 */

export interface AgentHarnessConfig {
  /** 注入存储；缺省内存后端（独立性验证与测试）。 */
  readonly storage?: SessionStorage;
  /** LLM 驱动（loop 层契约）。 */
  readonly llm?: LLM;
  readonly tools?: readonly ExecutableTool[];
  readonly maxSteps?: number;
  readonly maxRetryAttempts?: number;
  /** resume 的持久重试上限（task_attempt 封顶，AC3）。 */
  readonly maxResumeAttempts?: number;
  /** 工具 replay 安全分类（AC5 悬空工具处置依据）；缺省保守判 never。 */
  readonly toolReplaySafety?: (toolName: string) => ToolReplaySafety;
  /** live 事件出口（#334 完整化为 v2 events 目录）。 */
  readonly onEvent?: (event: HarnessLiveEvent) => void;
}

/** loop live 事件的 harness 包装（lane 信封）。 */
export interface HarnessLiveEvent {
  readonly laneId: LaneId;
  readonly event: LoopEvent;
}

export interface OperationOutcome {
  readonly opId: string;
  readonly outcome: 'completed' | 'aborted' | 'failed';
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly usage?: TokenUsage;
  readonly steps: number;
}

interface LaneRuntime {
  readonly controller: AbortController;
  readonly opId: string;
}

const DEFAULT_MAX_RESUME_ATTEMPTS = 3;

/** 接受边界记录集合（fsync-before-resolve 分级）。 */
const BOUNDARY_RECORD_KINDS = new Set([
  'operation_started',
  'queue_enqueued',
  'write_deferred',
  'abort_requested',
]);

export class AgentHarness {
  readonly session: WireSession;
  private readonly config: AgentHarnessConfig;
  private readonly reducer = new LaneStateReducer();
  private readonly runtimes = new Map<LaneId, LaneRuntime>();
  /** 仅关闭自建的存储（注入的存储归调用方所有）。 */
  private readonly ownsStorage: boolean;
  private closed = false;

  private constructor(session: WireSession, config: AgentHarnessConfig, ownsStorage: boolean) {
    this.session = session;
    this.config = config;
    this.ownsStorage = ownsStorage;
  }

  /** 打开（或新建）会话并恢复全部 lane。 */
  static async create(config: AgentHarnessConfig = {}): Promise<AgentHarness> {
    const ownsStorage = config.storage === undefined;
    const storage = config.storage ?? new InMemorySessionStorage(randomUUID());
    const lanes = await storage.getLanes();
    const session =
      lanes.length > 0 ? await WireSession.open(storage) : await WireSession.create(storage);
    const harness = new AgentHarness(session, config, ownsStorage);
    // restore 归约：全部 records 重放 + finishRestore（running → suspended）
    const records = await storage.getRecords();
    for (const record of records) harness.reducer.apply(record);
    harness.reducer.finishRestore();
    return harness;
  }

  /** 按名绑定的无状态 lane 门面（main 为缺省）。 */
  lane(laneId: LaneId = MAIN_LANE_ID): AgentLane {
    return new AgentLane(this, laneId);
  }

  async lanes(): Promise<readonly LaneId[]> {
    return (await this.session.lanes()).map((lane) => lane.laneId);
  }

  laneState(laneId: LaneId = MAIN_LANE_ID): LaneState {
    const state = this.reducer.snapshot(laneId);
    // live 占位运行时（record 尚未落盘的接受窗口）视为 running
    if (state.status === 'idle' && this.runtimes.has(laneId)) {
      return { ...state, status: 'running' };
    }
    return state;
  }

  async close(): Promise<void> {
    for (const runtime of this.runtimes.values()) runtime.controller.abort();
    this.closed = true;
    if (this.ownsStorage) {
      await this.session.close();
    }
  }

  // ===== 操作面（AgentLane 委托到此） =====

  async prompt(
    laneId: LaneId,
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<OperationOutcome> {
    this.assertOpen();
    this.requireIdle(laneId);
    if (!this.config.llm) throw new Error('AgentHarness requires an llm to run operations');

    const opId = randomUUID();
    // 同步占位运行时：接受即视为 busy（任何 await 之前的竞态窗口关闭）
    const controller = new AbortController();
    this.runtimes.set(laneId, { controller, opId });
    const payload: OperationStartedPayload = {
      opId,
      kind: 'prompt',
      input,
      origin: options?.origin ?? { kind: 'user' },
      inputEntryId: `entry:${opId}:input`,
      startedAt: Date.now(),
    };
    // 意图先行：接受边界记录先于任何效果（含预分配 id 的输入消息）
    await this.appendRecordTracked(laneId, 'operation_started', operationRecordId(opId), payload);
    return this.runOperation(laneId, payload, controller, 1);
  }

  async resume(laneId: LaneId = MAIN_LANE_ID): Promise<OperationOutcome> {
    this.assertOpen();
    const state = this.reducer.snapshot(laneId);
    if (state.status !== 'suspended' && state.status !== 'aborting') {
      throw new Error(`lane ${laneId} is ${state.status}, nothing to resume`);
    }
    const open = state.openOperation;
    if (!open) throw new Error(`lane ${laneId} has no open operation to resume`);

    if (open.abortRequested) {
      // abort_requested 已持久化但 reconcile 未完成：直接以 aborted 收尾
      //（#325 完整化合成工具结果与收尾消息）
      await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
        opId: open.opId,
        outcome: 'aborted',
        stopReason: 'aborted',
        finishedAt: Date.now(),
      });
      return { opId: open.opId, outcome: 'aborted', stopReason: 'aborted', steps: 0 };
    }

    // task_attempt：1-based 持久 run-attempt 计数（AC3：跨崩溃-重启不可重置）
    const maxAttempts = this.config.maxResumeAttempts ?? DEFAULT_MAX_RESUME_ATTEMPTS;
    if (open.maxAttempts > 0 && open.attempts >= open.maxAttempts) {
      // 耗尽：落错误 assistant 消息 + operation_finished failed（AC3）
      const errorMessage = `操作重试次数已耗尽（${open.attempts}/${open.maxAttempts}）`;
      await this.session.append({
        laneId,
        kind: 'message',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: errorMessage }],
          isError: true,
        },
      });
      await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
        opId: open.opId,
        outcome: 'failed',
        errorMessage,
        finishedAt: Date.now(),
      });
      return { opId: open.opId, outcome: 'failed', errorMessage, steps: 0 };
    }
    const attempt = open.attempts + 1;
    await this.appendRecordTracked(laneId, 'task_attempt', `attempt:${open.opId}:${attempt}`, {
      opId: open.opId,
      attempt,
      maxAttempts,
      at: Date.now(),
    });

    const started = await this.findOperationStarted(laneId, open.opId);
    if (!started) throw new Error(`operation_started record missing for ${open.opId}`);
    const controller = new AbortController();
    this.runtimes.set(laneId, { controller, opId: open.opId });
    return this.runOperation(laneId, started, controller, attempt);
  }

  async abort(laneId: LaneId = MAIN_LANE_ID): Promise<void> {
    this.assertOpen();
    const runtime = this.runtimes.get(laneId);
    if (runtime) {
      runtime.controller.abort();
      return;
    }
    // 无 live 运行时的 abort：持久化意图，resume 时 reconcile（#325 完整化）
    const state = this.reducer.snapshot(laneId);
    if (state.openOperation) {
      await this.appendRecordTracked(laneId, 'abort_requested', undefined, {
        opId: state.openOperation.opId,
        requestedAt: Date.now(),
      });
    }
  }

  // ===== runProcedure：live 与 resume 同码 =====

  private async runOperation(
    laneId: LaneId,
    op: OperationStartedPayload,
    controller: AbortController,
    attempt: number,
  ): Promise<OperationOutcome> {
    try {
      // 1. 物化输入消息（预分配 id 幂等：live 首写 / resume 补写）
      if (op.input !== undefined && op.inputEntryId !== undefined) {
        await this.session.append({
          laneId,
          kind: 'message',
          id: op.inputEntryId,
          message: { role: 'user', content: op.input, origin: op.origin },
        });
      }

      // 2. 驱动 loop 层（step primitives）
      const transcript = new TranscriptBridge(
        {
          appendMessage: async (message, provisionedId) => {
            await this.session.append({
              laneId,
              kind: 'message',
              ...(provisionedId !== undefined ? { id: provisionedId } : {}),
              message,
            });
          },
          appendToolStarted: async (payload) => {
            await this.appendRecordTracked(
              laneId,
              'tool_started',
              toolStartedRecordId(payload.assistantEntryId, payload.toolIndex),
              payload,
            );
          },
        },
        { opId: op.opId, attempt },
        (toolName) => this.config.toolReplaySafety?.(toolName) ?? 'never',
      );
      const dispatchEvent = createLoopEventDispatcher({
        appendTranscriptRecord: (event) => transcript.handle(event),
        emitLiveEvent: (event) => this.config.onEvent?.({ laneId, event }),
      });
      const buildMessages = async () => {
        // 上下文窗口 = 压缩边界（含）之后的对话（R1 branch 语义）
        const branch = await this.session.branchOf(laneId, {
          direction: 'oldestFirst',
          stopAtType: 'compaction',
        });
        return branch.entries.flatMap((entry) =>
          entry.kind === 'message' ? [projectEntryMessage(entry.message)] : [],
        );
      };

      try {
        const result = await runTurn({
          turnId: op.opId, // 持久 runId（B8：turnId 不稳定问题的终局解）
          signal: controller.signal,
          llm: this.requireLLM(),
          buildMessages,
          dispatchEvent,
          tools: this.config.tools,
          maxSteps: this.config.maxSteps,
          maxRetryAttempts: this.config.maxRetryAttempts,
        });
        await transcript.flushAll();
        const outcome = result.stopReason === 'aborted' ? 'aborted' : 'completed';
        await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
          opId: op.opId,
          outcome,
          stopReason: result.stopReason,
          usage: usageToRecord(result.usage),
          finishedAt: Date.now(),
        });
        return {
          opId: op.opId,
          outcome,
          stopReason: result.stopReason,
          usage: result.usage,
          steps: result.steps,
        };
      } catch (error) {
        await transcript.flushAll();
        const messageText = error instanceof Error ? error.message : String(error);
        await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
          opId: op.opId,
          outcome: 'failed',
          errorMessage: messageText,
          finishedAt: Date.now(),
        });
        return { opId: op.opId, outcome: 'failed', errorMessage: messageText, steps: 0 };
      }
    } finally {
      this.runtimes.delete(laneId);
    }
  }

  // ===== 内部 =====

  private async appendRecordTracked(
    laneId: LaneId,
    kind: Parameters<SessionStorage['appendRecord']>[0]['kind'],
    id: string | undefined,
    payload: unknown,
  ): Promise<void> {
    const record = await this.session.storageRef.appendRecord({
      laneId,
      kind,
      id,
      payload,
      durability: BOUNDARY_RECORD_KINDS.has(kind) ? 'boundary' : 'bulk',
    });
    this.reducer.apply(record); // live 与 restore 共用同一归约
  }

  private async findOperationStarted(
    laneId: LaneId,
    opId: string,
  ): Promise<OperationStartedPayload | undefined> {
    const records = await this.session.storageRef.getRecords({ laneId });
    for (const record of records) {
      if (record.id !== operationRecordId(opId)) continue;
      return asOperationStarted(record.payload);
    }
    return undefined;
  }

  private requireIdle(laneId: LaneId): void {
    if (this.runtimes.has(laneId)) {
      throw new Error(`lane ${laneId} has an in-flight operation; prompt requires idle`);
    }
    const state = this.reducer.snapshot(laneId);
    if (state.status !== 'idle') {
      throw new Error(`lane ${laneId} is ${state.status}; prompt requires idle`);
    }
  }

  private requireLLM(): LLM {
    if (!this.config.llm) throw new Error('AgentHarness requires an llm to run operations');
    return this.config.llm;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('AgentHarness is closed');
  }
}

/** 按名绑定的 lane 操作门面（无状态：全部状态在 harness）。 */
export class AgentLane {
  constructor(
    private readonly harness: AgentHarness,
    readonly laneId: LaneId,
  ) {}

  state(): LaneState {
    return this.harness.laneState(this.laneId);
  }

  prompt(input: readonly ContentPart[], options?: { readonly origin?: StoredPromptOrigin }) {
    return this.harness.prompt(this.laneId, input, options);
  }

  resume(): Promise<OperationOutcome> {
    return this.harness.resume(this.laneId);
  }

  abort(): Promise<void> {
    return this.harness.abort(this.laneId);
  }
}

function usageToRecord(usage: TokenUsage): Record<string, number> {
  return {
    inputOther: usage.inputOther,
    output: usage.output,
    inputCacheRead: usage.inputCacheRead,
    inputCacheCreation: usage.inputCacheCreation,
  };
}
