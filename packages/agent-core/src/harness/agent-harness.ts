import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';

import { addUsage, emptyUsage } from '@byfriends/kosong';
import type { ContentPart, TokenUsage } from '@byfriends/kosong';

import { createLoopEventDispatcher } from '../loop/events';
import type { LoopEvent } from '../loop/events';
import type { LLM } from '../loop/llm';
import { runTurn } from '../loop/run-turn';
import type { ExecutableTool } from '../loop/types';
import { V2EventBus } from './events';
import {
  clearGoal,
  isGoalOverBudget,
  MAX_GOAL_ROUNDS,
  readGoal,
  recordGoalTurn,
  setGoal,
  updateGoal,
} from './goal';
import type { GoalView } from './goal';
import { V2HookRegistry } from './hooks';
import { err, ok } from './lane-result';
import type { LaneError, LaneResult } from './lane-result';
import { LaneStateReducer } from './lane-state';
import type { LaneState } from './lane-state';
import { acquireSessionLock } from './lock';
import type { SessionLockHandle } from './lock';
import { findDeferredHandleAtLeaf, ParkSignal, persistDeferredAssistant } from './park';
import type { DeferredCapableLLM } from './park';
import {
  asOperationStarted,
  asWriteDeferred,
  isReplayableToolReplaySafety,
  operationRecordId,
  toolStartedRecordId,
} from './records';
import type { OperationStartedPayload, ToolStartedPayload, ToolReplaySafety } from './records';
import { WireSession } from './session/session';
import { JsonlSessionStorage } from './storage/jsonl';
import { InMemorySessionStorage } from './storage/memory';
import type { SessionStorage } from './storage/storage';
import type { LaneId, StoredPromptOrigin } from './storage/types';
import { MAIN_LANE_ID } from './storage/types';
import { SpanTree } from './telemetry';
import { TranscriptBridge, projectEntryMessage, synthesizeOrphanToolResults } from './transcript';

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
  /**
   * per-lane 模型解析（#328）：按 lane 路径点查询到的 modelAlias 构造 LLM；
   * 缺省回退 config.llm。两 lane 可各跑不同模型互不感知。
   */
  readonly resolveLLM?: (modelAlias: string | undefined) => Promise<LLM>;
  /** 各 lane 共享的系统提示（per-lane systemPrompt 由 #332 transform_context 承接）。 */
  readonly systemPrompt?: string;
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
  readonly outcome: 'completed' | 'aborted' | 'failed' | 'suspended';
  readonly stopReason?: string;
  readonly errorMessage?: string;
  readonly usage?: TokenUsage;
  readonly steps: number;
  /** abort 时死亡的 steer/followUp payload（归还调用方，R3）。 */
  readonly deadQueuePayloads?: readonly {
    readonly queue: string;
    readonly input: readonly ContentPart[];
  }[];
}

interface LaneRuntime {
  readonly controller: AbortController;
  readonly opId: string;
}

const DEFAULT_MAX_RESUME_ATTEMPTS = 3;

/** 本机副作用档悬空工具的合成观察：效果半确认，恢复不撤销、不重放。 */
const SYNTHETIC_INTERRUPTED_LOCAL =
  '[interrupted] 工具在本机上的执行被崩溃打断：文件可能已被部分修改、效果未获确认。' +
  'BYF 不会重放该调用，也不会把本机文件改动撤销回崩溃前的状态。请核实实际文件内容后再决定。';

/**
 * 远程不可逆档悬空工具的合成观察：效果可能已在远端发生，重放会二次生效，
 * 恢复既不重放也不存在能回滚远端的操作。
 */
const SYNTHETIC_INTERRUPTED_REMOTE =
  '[interrupted] 该工具的效果可能已经在远端发生（例如消息已发出、订单已提交），' +
  '且这类效果不可逆。BYF 不会重放该调用，也不存在能让远端回到原位的操作。请先核实远端实际状态。';

/** 接受边界记录集合（fsync-before-resolve 分级）。 */
const BOUNDARY_RECORD_KINDS = new Set([
  'operation_started',
  'queue_enqueued',
  'write_deferred',
  'abort_requested',
]);

export class AgentHarness {
  readonly session: WireSession;
  /** v2 hooks 目录（#332：注册 harness 全局、串行、payload 带 lane）。 */
  readonly hooks = new V2HookRegistry();
  /** v2 事件总线（#334：提交后触发、listener 抛错隔离）。 */
  readonly events = new V2EventBus();
  private readonly config: AgentHarnessConfig;
  private readonly reducer = new LaneStateReducer();
  private readonly runtimes = new Map<LaneId, LaneRuntime>();
  /** 仅关闭自建的存储（注入的存储归调用方所有）。 */
  private readonly ownsStorage: boolean;
  private readonly lock: SessionLockHandle | undefined;
  private closed = false;

  /** telemetry span 树（#338：第三通道；订阅者转 OTel/日志）。 */
  readonly spans = new SpanTree();

  private constructor(
    session: WireSession,
    config: AgentHarnessConfig,
    ownsStorage: boolean,
    lock: SessionLockHandle | undefined,
  ) {
    this.session = session;
    this.config = config;
    this.ownsStorage = ownsStorage;
    this.lock = lock;
    // hook 抛错 → handler_error 事件（除 before_tool fail-closed 外的隔离通道）
    this.hooks.onHandlerError = (error) => {
      this.events.emit(error.laneId, (base) => ({
        type: 'handler_error',
        hookPoint: error.hookPoint,
        message: error.message,
        ...base,
      }));
    };
  }

  /** 打开（或新建）会话并恢复全部 lane。 */
  static async create(config: AgentHarnessConfig = {}): Promise<AgentHarness> {
    const ownsStorage = config.storage === undefined;
    const storage = config.storage ?? new InMemorySessionStorage(randomUUID());
    // 会话级单写者（R10，修 D1）：磁盘后端自动上锁；第二进程打开同会话被拒绝
    const lock =
      storage instanceof JsonlSessionStorage
        ? await acquireSessionLock(dirname(storage.path))
        : undefined;
    try {
      const lanes = await storage.getLanes();
      const session =
        lanes.length > 0 ? await WireSession.open(storage) : await WireSession.create(storage);
      const harness = new AgentHarness(session, config, ownsStorage, lock);
      // restore 归约：全部 records 重放 + finishRestore（running → suspended）
      const records = await storage.getRecords();
      for (const record of records) harness.reducer.apply(record);
      harness.reducer.finishRestore();
      return harness;
    } catch (error) {
      await lock?.release(); // 获取锁后失败回滚（修锁泄漏）
      throw error;
    }
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
    // 挂起≡崩溃（live 面）：开放操作但无 in-flight 运行时（Park unwind 后）
    if (state.status === 'running' && !this.runtimes.has(laneId)) {
      return { ...state, status: 'suspended', suspendedReason: 'deferred' };
    }
    return state;
  }

  async close(): Promise<void> {
    for (const runtime of this.runtimes.values()) runtime.controller.abort();
    this.closed = true;
    if (this.ownsStorage) {
      await this.session.close();
    }
    await this.lock?.release();
  }

  // ===== lane CRUD（#328：lane() 按名查找永不创建） =====

  /** lane 是否存在（操作面守卫用）。 */
  async laneExists(laneId: LaneId): Promise<boolean> {
    return (await this.session.lanes()).some((lane) => lane.laneId === laneId);
  }

  async createLane(
    laneId: LaneId,
    options?: { readonly name?: string; readonly fromEntryId?: string },
  ): Promise<LaneResult<LaneId>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    try {
      await this.session.createLane({
        laneId,
        name: options?.name,
        fromEntryId: options?.fromEntryId,
      });
      this.reducer.snapshot(laneId); // 确保归约器知道该 lane
      this.events.emit(laneId, (base) => ({ type: 'lane_change', detail: 'create', ...base }));
      return ok(laneId);
    } catch (error) {
      return err('INVALID_INPUT', error instanceof Error ? error.message : String(error));
    }
  }

  /** 删除 lane（墓碑）。main 不可删；操作活跃或 suspended 时拒绝。 */
  async deleteLane(laneId: LaneId): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    if (laneId === MAIN_LANE_ID) {
      return err('LANE_MAIN_UNDELETABLE', 'main lane cannot be deleted');
    }
    const state = this.reducer.snapshot(laneId);
    if (state.status !== 'idle') {
      return err('NOT_IDLE', `lane ${laneId} is ${state.status}; delete requires idle`);
    }
    if (!(await this.laneExists(laneId))) {
      return err('LANE_NOT_FOUND', `lane ${laneId} not found`);
    }
    await this.session.deleteLane(laneId);
    this.events.emit(laneId, (base) => ({ type: 'lane_change', detail: 'delete', ...base }));
    return ok(undefined);
  }

  /** 等待 lane 回到 idle（busy 操作的同步原语）。 */
  async waitForIdle(
    laneId: LaneId,
    options?: { readonly timeoutMs?: number; readonly pollMs?: number },
  ): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    const timeoutMs = options?.timeoutMs ?? 120_000;
    const pollMs = options?.pollMs ?? 10;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.laneState(laneId).status === 'idle') return ok(undefined);
      if (Date.now() >= deadline) {
        return err('LANE_BUSY', `lane ${laneId} still busy after ${timeoutMs}ms`);
      }
      await sleep(pollMs);
    }
  }

  /** 原子 check-and-run：lane idle 时立即以 fn 发起操作，否则 busy。 */
  async runWhenIdle<T>(laneId: LaneId, fn: () => Promise<LaneResult<T>>): Promise<LaneResult<T>> {
    const guard = this.guardPrompt(laneId);
    if (guard) return guard;
    return fn();
  }

  // ===== per-lane 配置（点查询：lane 路径上最新 config entry，#328） =====

  /** lane 路径上某类 config entry 的最新值（点查询还原）。 */
  private async latestConfigEntry<T>(
    laneId: LaneId,
    kind: 'model_change' | 'thinking_level_change' | 'active_tools_change',
  ): Promise<T | undefined> {
    const branch = await this.session.branchOf(laneId, {
      direction: 'newestFirst',
      types: [kind],
      limit: 1,
    });
    const entry = branch.entries[0];
    if (!entry) return undefined;
    if (entry.kind === 'model_change') return entry.modelAlias as T;
    if (entry.kind === 'thinking_level_change') return entry.thinkingLevel as T;
    if (entry.kind === 'active_tools_change') return [...entry.activeTools] as T;
    return undefined;
  }

  async getModel(laneId: LaneId): Promise<string | undefined> {
    return this.latestConfigEntry<string>(laneId, 'model_change');
  }

  async getThinkingLevel(laneId: LaneId): Promise<string | undefined> {
    return this.latestConfigEntry<string>(laneId, 'thinking_level_change');
  }

  async getActiveTools(laneId: LaneId): Promise<readonly string[] | undefined> {
    return this.latestConfigEntry<readonly string[]>(laneId, 'active_tools_change');
  }

  /** 写配置 entry（要求 idle：mid-run 改配置破坏 run 语义）。 */
  async setModel(laneId: LaneId, modelAlias: string): Promise<LaneResult<void>> {
    return this.appendConfigEntry(laneId, 'model_change', modelAlias);
  }

  async setThinkingLevel(laneId: LaneId, level: string): Promise<LaneResult<void>> {
    return this.appendConfigEntry(laneId, 'thinking_level_change', level);
  }

  async setActiveTools(laneId: LaneId, tools: readonly string[]): Promise<LaneResult<void>> {
    return this.appendConfigEntry(laneId, 'active_tools_change', tools);
  }

  private async appendConfigEntry(
    laneId: LaneId,
    kind: 'model_change' | 'thinking_level_change' | 'active_tools_change',
    value: string | readonly string[],
  ): Promise<LaneResult<void>> {
    const guard = this.guardPrompt(laneId);
    if (guard) return guard;
    try {
      if (kind === 'model_change') {
        await this.session.append({ laneId, kind, modelAlias: value as string });
      } else if (kind === 'thinking_level_change') {
        await this.session.append({ laneId, kind, thinkingLevel: value as string });
      } else {
        await this.session.append({ laneId, kind, activeTools: value as readonly string[] });
      }
      this.events.emit(laneId, (base) => ({ type: 'config_change', detail: kind, ...base }));
      return ok(undefined);
    } catch (error) {
      return err('INTERNAL', error instanceof Error ? error.message : String(error));
    }
  }

  /** run 用 LLM 解析：per-lane 模型优先（resolveLLM），回退全局 llm。 */
  private async resolveLLMFor(laneId: LaneId): Promise<LLM> {
    if (this.config.resolveLLM) {
      return this.config.resolveLLM(await this.getModel(laneId));
    }
    if (this.config.llm) return this.config.llm;
    throw new Error('AgentHarness requires an llm (config.llm or resolveLLM)');
  }

  /** run 用工具集：per-lane activeTools 过滤全局注册表。 */
  private async resolveToolsFor(laneId: LaneId): Promise<readonly ExecutableTool[] | undefined> {
    if (!this.config.tools) return undefined;
    const active = await this.getActiveTools(laneId);
    if (active === undefined) return this.config.tools;
    const activeSet = new Set(active);
    return this.config.tools.filter((tool) => activeSet.has(tool.name));
  }

  // ===== 导航与压缩（#329） =====

  /**
   * 导航（#329）：移动 lane 指针到任意 entry（前向/后向皆可）。
   * 可选 branch summary（LLM 摘要被离开的路径）链到目标；label 写为 global fact。
   * 崩溃一致性：started → 效果（预分配 id 幂等）→ move → finished；
   * 任意位点崩溃，lane 要么在旧位置（resume 幂等重放），要么导航完成。
   */
  async navigateTree(
    laneId: LaneId,
    targetEntryId: string,
    options?: {
      readonly summarize?: boolean;
      readonly customInstructions?: string;
      readonly label?: string;
    },
  ): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    const guard = this.guardPrompt(laneId);
    if (guard) return guard;
    if (!(await this.laneExists(laneId))) return err('LANE_NOT_FOUND', `lane ${laneId} not found`);
    if (!this.session.getEntry(targetEntryId)) {
      return err('INVALID_INPUT', `target entry not found: ${targetEntryId}`);
    }
    const opId = randomUUID();
    const payload: OperationStartedPayload = {
      opId,
      kind: 'navigation',
      targetEntryId,
      summarize: options?.summarize === true,
      ...(options?.customInstructions !== undefined
        ? { customInstructions: options.customInstructions }
        : {}),
      ...(options?.label !== undefined ? { label: options.label } : {}),
      summaryEntryId: `entry:${opId}:summary`,
      startedAt: Date.now(),
    };
    try {
      await this.appendRecordTracked(laneId, 'operation_started', operationRecordId(opId), payload);
      await this.applyNavigation(laneId, payload);
      return ok(undefined);
    } catch (error) {
      return err('INTERNAL', error instanceof Error ? error.message : String(error));
    }
  }

  /** 导航效果（live 与 resume 幂等共用；效果全部预分配 id）。 */
  private async applyNavigation(laneId: LaneId, op: OperationStartedPayload): Promise<void> {
    const target = op.targetEntryId!;
    // 摘要存在（或刚写入）时导航终点是 summary（它链到 target）；否则是 target 自身
    let leafTarget = target;
    if (op.summarize === true && op.summaryEntryId !== undefined) {
      const existing = this.session.getEntry(op.summaryEntryId);
      if (!existing) {
        const summary = await this.summarizeBranch(laneId, target, op.customInstructions);
        // 先移到目标，再追加 branch_summary——entry 链到目标
        await this.session.navigate(laneId, target);
        await this.session.append({
          laneId,
          kind: 'branch_summary',
          id: op.summaryEntryId,
          summary,
        });
      }
      leafTarget = op.summaryEntryId;
    }
    if (op.label !== undefined) {
      await this.session.setFact({ name: `label:${laneId}`, value: op.label });
    }
    await this.session.navigate(laneId, leafTarget);
    await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
      opId: op.opId,
      outcome: 'completed',
      finishedAt: Date.now(),
    });
  }

  /** LLM 摘要被离开的路径（leaf → target 区间，不含 target）。 */
  private async summarizeBranch(
    laneId: LaneId,
    targetEntryId: string,
    customInstructions?: string,
  ): Promise<string> {
    const llm = await this.resolveLLMFor(laneId);
    const leaf = await this.session.leaf(laneId);
    if (!leaf) return '(no departed branch)';
    // 被离开路径 = 从 leaf 向根走到 target（不含 target）
    const departed: string[] = [];
    let cursor: string | undefined = leaf.id;
    while (cursor !== undefined && cursor !== targetEntryId) {
      const entry = this.session.getEntry(cursor);
      if (!entry) break;
      if (entry.kind === 'message') {
        departed.push(`${entry.message.role}: ${summarizeContent(entry)}`);
      }
      cursor = entry.parentId ?? undefined;
    }
    const transcript = departed.toReversed().slice(-30).join('\n');
    const parts: string[] = [];
    await llm.chat({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `请把以下对话段压缩为简明摘要（保留关键事实与未决事项）${
                customInstructions ? `；附加要求：${customInstructions}` : ''
              }：\n${transcript}`,
            },
          ],
          toolCalls: [],
        },
      ],
      tools: [],
      signal: new AbortController().signal,
      onTextPart: (part) => {
        parts.push(part.text);
      },
    });
    return parts.length > 0 ? parts.join('') : `（branch summary）${transcript.slice(0, 400)}`;
  }

  /**
   * 手动压缩（#329）：独立操作（operation_started kind compaction）。
   * declined（before_compaction 拒绝）由 #332 hooks 接入；aborted/failed 齐全。
   */
  async compact(laneId: LaneId): Promise<LaneResult<OperationOutcome>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    const guard = this.guardPrompt(laneId);
    if (guard) return guard;
    const opId = randomUUID();
    const payload: OperationStartedPayload = {
      opId,
      kind: 'compaction',
      compactionEntryId: `entry:${opId}:compaction`,
      startedAt: Date.now(),
    };
    const controller = new AbortController();
    this.runtimes.set(laneId, { controller, opId });
    try {
      await this.appendRecordTracked(laneId, 'operation_started', operationRecordId(opId), payload);
      return ok(await this.applyCompaction(laneId, payload, controller.signal));
    } catch (error) {
      return err('INTERNAL', error instanceof Error ? error.message : String(error));
    } finally {
      this.runtimes.delete(laneId); // 成功路径同样清理（修 runtime 泄漏锁死 lane）
    }
  }

  /** 压缩效果：摘要当前上下文窗口 → compaction entry（含端成为新窗口起点）。 */
  private async applyCompaction(
    laneId: LaneId,
    op: OperationStartedPayload,
    signal: AbortSignal,
  ): Promise<OperationOutcome> {
    try {
      signal.throwIfAborted();
      // before_compaction（#332）：declined → 跳过压缩直接收尾（结局齐全）
      const compactionHook = (await this.hooks.run('before_compaction', {
        laneId,
        hookPoint: 'before_compaction',
      })) as { decline?: boolean; reason?: string } | undefined;
      if (compactionHook?.decline === true) {
        await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
          opId: op.opId,
          outcome: 'completed',
          stopReason: 'declined',
          ...(compactionHook.reason !== undefined ? { errorMessage: compactionHook.reason } : {}),
          finishedAt: Date.now(),
        });
        return { opId: op.opId, outcome: 'completed', stopReason: 'declined', steps: 0 };
      }
      if (op.compactionEntryId !== undefined && !this.session.getEntry(op.compactionEntryId)) {
        const window = await this.session.branchOf(laneId, {
          direction: 'oldestFirst',
          stopAtType: 'compaction',
        });
        const transcript = window.entries
          .filter((e) => e.kind === 'message')
          .map((e) => (e.kind === 'message' ? `${e.message.role}: ${summarizeContent(e)}` : ''))
          .filter((s) => s.length > 0)
          .join('\n');
        await this.session.append({
          laneId,
          kind: 'compaction',
          id: op.compactionEntryId,
          summary: `（compaction）${transcript.slice(0, 2000)}`,
        });
      }
      await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
        opId: op.opId,
        outcome: 'completed',
        finishedAt: Date.now(),
      });
      return { opId: op.opId, outcome: 'completed', steps: 0 };
    } catch (error) {
      const aborted = signal.aborted;
      await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
        opId: op.opId,
        outcome: aborted ? 'aborted' : 'failed',
        ...(aborted ? {} : { errorMessage: String(error) }),
        finishedAt: Date.now(),
      });
      return {
        opId: op.opId,
        outcome: aborted ? 'aborted' : 'failed',
        steps: 0,
      };
    }
  }

  // ===== 三队列（R3：接受即持久、消费点才写树） =====

  /** 运行中转向：消费点在 checkpoint（下一 step 前写入树）。 */
  async steer(
    laneId: LaneId,
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    const status = this.laneState(laneId).status; // 含接受窗口的同步占位
    if (status !== 'running' && status !== 'aborting') {
      return err('NOT_RUNNING', `lane ${laneId} is ${status}; steer requires a running operation`);
    }
    await this.enqueueQueueItem(laneId, 'steer', input, options?.origin);
    return ok(undefined);
  }

  /** 下一个 run 的输入：当前操作结束后消费；abort 时死亡并归还 payload。 */
  async followUp(
    laneId: LaneId,
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    await this.enqueueQueueItem(laneId, 'followUp', input, options?.origin);
    return ok(undefined);
  }

  /** 跨操作存活的输入队列：abort 后仍存活，lane idle 时消费。 */
  async nextRun(
    laneId: LaneId,
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    await this.enqueueQueueItem(laneId, 'nextRun', input, options?.origin);
    return ok(undefined);
  }

  private async enqueueQueueItem(
    laneId: LaneId,
    queue: 'steer' | 'followUp' | 'nextRun',
    input: readonly ContentPart[],
    origin: StoredPromptOrigin | undefined,
  ): Promise<void> {
    const itemId = randomUUID();
    await this.appendRecordTracked(laneId, 'queue_enqueued', `q:${itemId}`, {
      queue,
      input,
      origin,
      entryId: `entry:${itemId}:queued`,
      enqueuedAt: Date.now(),
    });
    this.events.emit(laneId, (base) => ({
      type: 'queue_change',
      detail: queue,
      ...base,
    }));
  }

  // ===== deferred writes（R4：mid-step 写入延迟到 checkpoint 尾部追加） =====

  /**
   * 延迟写：意图（write_deferred，含完整追加载荷与预分配 entry id）先落盘，
   * 实际 entry 在 checkpoint 应用——保护 KV 缓存"上下文只在尾部增长"不变量。
   */
  async deferWrite(
    laneId: LaneId,
    append: { readonly customType: string; readonly data: unknown },
  ): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    const itemId = randomUUID();
    await this.appendRecordTracked(laneId, 'write_deferred', `dw:${itemId}`, {
      append: { kind: 'custom', ...append, id: `entry:${itemId}:deferred` },
      deferredAt: Date.now(),
    });
    return ok(undefined);
  }

  /** 应用尚未落树的 deferred writes（checkpoint 与 abort 路径共用；abort 存活）。 */
  private async applyDeferredWrites(laneId: LaneId): Promise<number> {
    const records = await this.session.storageRef.getRecords({ laneId, kinds: ['write_deferred'] });
    let applied = 0;
    for (const record of records) {
      const payload = asWriteDeferred(record.payload);
      if (!payload) continue;
      const append = payload.append as {
        kind: 'custom';
        customType: string;
        data: unknown;
        id?: string;
      };
      if (!append?.id) continue;
      if (this.session.getEntry(append.id)) continue; // 幂等：已应用
      await this.session.append({
        laneId,
        kind: 'custom',
        customType: append.customType,
        data: append.data,
        id: append.id,
      });
      applied += 1;
    }
    return applied;
  }

  /**
   * checkpoint（步骤边界）：应用 pending deferred writes → 消费 steering
   * （写树）→ 压缩占位（#329）。挂在 loop 的 beforeStep 钩子——先于
   * buildMessages，被消费的 steer 立即进入本 step 上下文。
   */
  private async checkpoint(laneId: LaneId): Promise<void> {
    await this.applyDeferredWrites(laneId);
    const state = this.reducer.snapshot(laneId);
    for (const item of state.queues.steer) {
      if (this.session.getEntry(item.entryId)) continue; // 已消费
      await this.session.append({
        laneId,
        kind: 'message',
        id: item.entryId,
        message: {
          role: 'user',
          content: item.input,
          origin: item.origin ?? { kind: 'injection', variant: 'steer' },
        },
      });
    }
  }

  // ===== 操作面（AgentLane 委托到此） =====

  async prompt(
    laneId: LaneId,
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin; readonly inputEntryId?: string },
  ): Promise<LaneResult<OperationOutcome>> {
    const guard = this.guardPrompt(laneId);
    if (guard) return guard;
    const opId = randomUUID();
    // 同步占位运行时：接受即视为 busy（任何 await 之前的竞态窗口关闭）
    const controller = new AbortController();
    this.runtimes.set(laneId, { controller, opId });
    try {
      // before_run（#332）：block 拒绝；persisted 输出随 operation_started 落盘
      const beforeRun = (await this.hooks.run('before_run', {
        laneId,
        hookPoint: 'before_run',
        input,
      })) as { block?: boolean; reason?: string; persisted?: unknown } | undefined;
      if (beforeRun?.block === true) {
        this.runtimes.delete(laneId);
        return err('INVALID_INPUT', beforeRun.reason ?? 'blocked by before_run hook');
      }
      const payload: OperationStartedPayload = {
        opId,
        kind: 'prompt',
        input,
        origin: options?.origin ?? { kind: 'user' },
        // 队列消费路径传入队列项的预分配 entryId（消费点写树）
        inputEntryId: options?.inputEntryId ?? `entry:${opId}:input`,
        startedAt: Date.now(),
      };
      // 意图先行：接受边界记录先于任何效果；before_run 的 persisted 输出
      // 一并落盘（重放不重算——重放矩阵：fresh 跑、restore 读记录）
      await this.appendRecordTracked(laneId, 'operation_started', operationRecordId(opId), {
        ...payload,
        ...(beforeRun?.persisted !== undefined ? { hookPersisted: beforeRun.persisted } : {}),
      });
      this.events.emit(laneId, (base) => ({ type: 'run_start', opId, ...base }));
      const span = this.spans.start('pi.harness.run', laneId, undefined, { runId: opId });
      const outcome = await this.runOperation(laneId, payload, controller, 1);
      span.end({ runId: opId, outcome: outcome.outcome, steps: outcome.steps });
      this.events.emit(laneId, (base) => ({
        type: 'run_end',
        opId,
        outcome: outcome.outcome,
        ...(outcome.usage !== undefined ? { usage: outcome.usage } : {}),
        ...base,
      }));
      return ok(outcome);
    } catch (error) {
      this.runtimes.delete(laneId);
      return err('INTERNAL', error instanceof Error ? error.message : String(error));
    }
  }

  /** prompt 的同步守卫（results-not-exceptions：拒绝以错误码返回，AC11）。 */
  private guardPrompt(laneId: LaneId): LaneError | undefined {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    if (this.runtimes.has(laneId)) {
      return err('LANE_BUSY', `lane ${laneId} has an in-flight operation`);
    }
    const state = this.reducer.snapshot(laneId);
    if (state.status !== 'idle') {
      return err('NOT_IDLE', `lane ${laneId} is ${state.status}; prompt requires idle`);
    }
    return undefined;
  }

  async resume(laneId: LaneId = MAIN_LANE_ID): Promise<LaneResult<OperationOutcome>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    if (this.runtimes.has(laneId))
      return err('LANE_BUSY', `lane ${laneId} has an in-flight operation`);
    // 折叠视图（Park 挂起的 live 面 = suspended）
    const state = this.laneState(laneId);
    if (state.status !== 'suspended' && state.status !== 'aborting') {
      return err('NOT_SUSPENDED', `lane ${laneId} is ${state.status}, nothing to resume`);
    }
    const open = state.openOperation;
    if (!open) return err('NOT_SUSPENDED', `lane ${laneId} has no open operation to resume`);
    try {
      if (open.abortRequested) {
        return ok(await this.reconcileAbortedOperation(laneId, open.opId));
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
        return ok({ opId: open.opId, outcome: 'failed', errorMessage, steps: 0 });
      }
      const attempt = open.attempts + 1;
      await this.appendRecordTracked(laneId, 'task_attempt', `attempt:${open.opId}:${attempt}`, {
        opId: open.opId,
        attempt,
        maxAttempts,
        at: Date.now(),
      });

      const started = await this.findOperationStarted(laneId, open.opId);
      if (!started) {
        return err('INTERNAL', `operation_started record missing for ${open.opId}`);
      }
      // resume 的 run 事件对（与 prompt 对齐；恢复期工作经 recovery 标记预留）
      this.events.emit(laneId, (base) => ({
        type: 'run_start',
        opId: open.opId,
        ...base,
      }));
      // navigation 挂起：幂等重放（效果预分配 id，无部分结果）
      if (started.kind === 'navigation') {
        await this.applyNavigation(laneId, started);
        this.events.emit(laneId, (base) => ({
          type: 'run_end',
          opId: open.opId,
          outcome: 'completed',
          ...base,
        }));
        return ok({ opId: open.opId, outcome: 'completed', steps: 0 });
      }
      // deferred 挂起（#336）：leaf 是无后继的 deferred 助手消息 → 兑换
      const deferredHandle = await findDeferredHandleAtLeaf(this.session, laneId);
      if (deferredHandle !== undefined) {
        const deferredOutcome = await this.resumeDeferred(
          laneId,
          open.opId,
          deferredHandle,
          attempt,
        );
        this.events.emit(laneId, (base) => ({
          type: 'run_end',
          opId: open.opId,
          outcome: deferredOutcome.outcome,
          ...base,
        }));
        return ok(deferredOutcome);
      }
      // 悬空工具批分类处置（AC5）：never → 合成 interrupted 结果；
      // safe → 用真实工具安全重放一次并写真实结果。重跑前必须清空悬空——
      // provider 拒绝无结果的 toolCalls。
      await this.reconcileDanglingTools(laneId, open.danglingTools);
      const controller = new AbortController();
      this.runtimes.set(laneId, { controller, opId: open.opId });
      // 预分配 entry id 的 attempt 空间必须与已确认的历史错开：live 首跑占用
      // a1，第 k 次 resume 用 a(k+1)。若复用同一空间，resume 新写的 assistant/
      // tool 结果 entry 会被 appendIfMissing 幂等吞掉（旧 entry 还声明着旧
      // toolCall），已执行的副作用进不了上下文，provider 收到原样重发的请求，
      // 于是同一 action 被再执行一次（PRD-0038 AC-3.2 (iii)）。task_attempt
      // 的持久计数仍用 `attempt` 本身。
      const outcome = await this.runOperation(laneId, started, controller, attempt + 1);
      this.events.emit(laneId, (base) => ({
        type: 'run_end',
        opId: open.opId,
        outcome: outcome.outcome,
        ...base,
      }));
      return ok(outcome);
    } catch (error) {
      this.runtimes.delete(laneId);
      return err('INTERNAL', error instanceof Error ? error.message : String(error));
    }
  }

  async abort(laneId: LaneId = MAIN_LANE_ID): Promise<LaneResult<void>> {
    if (this.closed) return err('HARNESS_CLOSED', 'AgentHarness is closed');
    const runtime = this.runtimes.get(laneId);
    if (runtime) {
      runtime.controller.abort();
      return ok(undefined);
    }
    // 无 live 运行时的 abort：持久化意图，resume 时 reconcile（#325 完整化）
    const state = this.reducer.snapshot(laneId);
    if (state.openOperation) {
      await this.appendRecordTracked(laneId, 'abort_requested', undefined, {
        opId: state.openOperation.opId,
        requestedAt: Date.now(),
      });
    }
    return ok(undefined);
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
            const entry = await this.session.append({
              laneId,
              kind: 'message',
              ...(provisionedId !== undefined ? { id: provisionedId } : {}),
              message,
            });
            // 事件在提交后触发（宣告的事实已可查询）
            this.events.emit(laneId, (base) => ({
              type: 'message',
              role: message.role,
              entryId: entry.id,
              preview:
                message.content
                  .find((part): part is { type: 'text'; text: string } => part.type === 'text')
                  ?.text.slice(0, 80) ?? '',
              ...base,
            }));
            this.events.emit(laneId, (base) => ({
              type: 'tree_change',
              detail: 'message',
              ...base,
            }));
            // tool 结果 → after_tool hook（补丁语义；抛错跳过并报 handler_error）
            if (message.role === 'tool' && message.toolCallId !== undefined) {
              await this.hooks.run('after_tool', {
                laneId,
                hookPoint: 'after_tool',
                toolCallId: message.toolCallId,
                name: message.name ?? '',
                isError: message.isError === true,
              });
              this.events.emit(laneId, (base) => ({
                type: 'tool_end',
                toolCallId: message.toolCallId ?? '',
                name: message.name ?? '',
                isError: message.isError === true || undefined,
                ...base,
              }));
            }
          },
          appendToolStarted: async (payload) => {
            await this.appendRecordTracked(
              laneId,
              'tool_started',
              toolStartedRecordId(payload.assistantEntryId, payload.toolIndex),
              payload,
            );
            this.events.emit(laneId, (base) => ({
              type: 'tool_start',
              toolCallId: payload.toolCallId,
              name: payload.name,
              ...base,
            }));
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
        // 孤儿 tool call（fork 自工具批中途）在投影层合成空结果——会话所存不改；
        // transform_context（#332）：链式塑形 provider 所见，永不改会话所存
        const transformed = await this.hooks.transform(
          laneId,
          synthesizeOrphanToolResults(
            branch.entries.flatMap((entry) =>
              entry.kind === 'message' ? [projectEntryMessage(entry.message)] : [],
            ),
          ),
        );
        return [...transformed];
      };

      try {
        // goal 续跑循环（#331：before_run_end 缝隙——goal active 时同一 run
        //（同一 opId）内继续推进；absent/paused/blocked/complete 即停）。
        let accumulatedSteps = 0;
        let accumulatedUsage = emptyUsage();
        for (let round = 0; ; round++) {
          const result = await runTurn({
            turnId: op.opId, // 持久 runId（B8：turnId 不稳定问题的终局解）
            signal: controller.signal,
            llm: await this.resolveLLMFor(laneId), // per-lane 模型（#328 AC）
            buildMessages,
            dispatchEvent,
            tools: await this.resolveToolsFor(laneId), // per-lane activeTools 过滤
            maxSteps: this.config.maxSteps,
            maxRetryAttempts: this.config.maxRetryAttempts,
            // checkpoint（#325）：beforeStep 先于 buildMessages——deferred writes
            // 应用 + steering 消费写树，被消费内容立即进入本 step 上下文。
            hooks: {
              beforeStep: async () => {
                await this.checkpoint(laneId);
                return undefined;
              },
              // v2 before_tool（#332）：fail-closed；effective args 返回给 loop
              prepareToolExecution: async (ctx) => {
                if (!this.hooks.has('before_tool')) return undefined;
                const result = (await this.hooks.run('before_tool', {
                  laneId,
                  hookPoint: 'before_tool',
                  toolCallId: ctx.toolCall.id,
                  name: ctx.toolCall.name,
                  args: JSON.parse(ctx.toolCall.arguments ?? '{}'),
                })) as { block?: boolean; reason?: string; args?: unknown } | undefined;
                if (result?.block === true) {
                  return {
                    syntheticResult: {
                      output: result.reason ?? 'blocked by before_tool hook',
                      isError: true,
                    },
                  };
                }
                if (result?.args !== undefined) {
                  return { updatedArgs: result.args };
                }
                return undefined;
              },
            },
          });
          await transcript.flushAll();
          accumulatedSteps += result.steps;
          accumulatedUsage = addUsage(accumulatedUsage, result.usage);
          if (result.stopReason === 'aborted') {
            // live abort 收尾（reconcile 的 live 侧）：合成收尾消息 + 队列处置
            return await this.finishAbortedOperation(laneId, op.opId, accumulatedSteps);
          }
          // before_run_end（#332/#333）：hook 可返回 followUp 续跑一轮
          //（shell Stop block 桥的续跑语义）；goal 状态是另一个续跑来源。
          const runEndHook = (await this.hooks.run('before_run_end', {
            laneId,
            hookPoint: 'before_run_end',
            outcome: 'completed',
          })) as { followUp?: boolean } | undefined;
          if (runEndHook?.followUp === true && round < MAX_GOAL_ROUNDS) {
            await this.session.append({
              laneId,
              kind: 'message',
              message: {
                role: 'user',
                content: [
                  { type: 'text', text: '(run continuation requested by before_run_end hook)' },
                ],
                origin: { kind: 'hook_result', event: 'Stop' },
              },
            });
            continue;
          }
          // before_run_end：goal 状态决定是否返回 followUp（继续本 run）
          const goal = await readGoal(this.session, laneId);
          if (goal.status !== 'active') break;
          if (round >= MAX_GOAL_ROUNDS) {
            await updateGoal(this.session, laneId, goal, {
              status: 'blocked',
              blockedReason: `goal 驱动轮次达到上限（${MAX_GOAL_ROUNDS}）`,
            });
            break;
          }
          await recordGoalTurn(this.session, laneId, goal, grandTotal(accumulatedUsage));
          const afterCount = await readGoal(this.session, laneId);
          if (afterCount.status === 'active') {
            const overBudget = isGoalOverBudget(afterCount);
            if (overBudget) {
              await updateGoal(this.session, laneId, afterCount, {
                status: 'blocked',
                blockedReason: overBudget,
              });
              break;
            }
          }
          // continuation 写树（system_trigger，豁免 UserPromptSubmit 语义对齐 ADR-0026）
          await this.session.append({
            laneId,
            kind: 'message',
            message: {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `(goal continuation) 请继续朝目标「${goal.objective}」推进；完成时将 goal 标记为 complete。`,
                },
              ],
              origin: { kind: 'system_trigger', name: 'goal_continuation' },
            },
          });
        }
        await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
          opId: op.opId,
          outcome: 'completed',
          stopReason: 'end_turn',
          usage: usageToRecord(accumulatedUsage),
          finishedAt: Date.now(),
        });
        return {
          opId: op.opId,
          outcome: 'completed',
          stopReason: 'end_turn',
          usage: accumulatedUsage,
          steps: accumulatedSteps,
        };
      } catch (error) {
        if (error instanceof ParkSignal) {
          // Park unwind（#336）：deferred handle 随消息落树；不写
          // operation_finished——挂起 lane 在存储中与崩溃 lane 不可区分
          await persistDeferredAssistant(this.session, laneId, error.handle, op.opId);
          return { opId: op.opId, outcome: 'suspended', steps: 0 };
        }
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

  /**
   * deferred 兑换（#336，AC8）：fetchDeferred 三态——
   * ready → 落真实结果 + 继续完成 run；
   * still-pending → 再挂起（轮询节奏属应用策略）；
   * terminal → 按失败处理（operation_finished failed；持久 attempt 封顶在
   * 上层 resume 已检查）。兑换幂等无副作用：崩溃重跑安全。
   */
  private async resumeDeferred(
    laneId: LaneId,
    opId: string,
    handle: import('@byfriends/kosong').DeferredHandle,
    attempt: number,
  ): Promise<OperationOutcome> {
    void attempt;
    const llm = await this.resolveLLMFor(laneId);
    if (typeof (llm as DeferredCapableLLM).redeem !== 'function') {
      // 无兑换能力：按失败收尾
      await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
        opId,
        outcome: 'failed',
        errorMessage: 'deferred handle present but llm lacks redemption capability',
        finishedAt: Date.now(),
      });
      return { opId, outcome: 'failed', errorMessage: 'no redemption capability', steps: 0 };
    }
    const redemption = await (llm as DeferredCapableLLM).redeem(handle);
    if (redemption.state === 'ready') {
      const text = redemption.message.content
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
      await this.session.append({
        laneId,
        kind: 'message',
        message: { role: 'assistant', content: [{ type: 'text', text }] },
      });
      await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
        opId,
        outcome: 'completed',
        stopReason: 'end_turn',
        finishedAt: Date.now(),
      });
      return { opId, outcome: 'completed', stopReason: 'end_turn', steps: 1 };
    }
    if (redemption.state === 'still-pending') {
      return { opId, outcome: 'suspended', steps: 0 };
    }
    await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
      opId,
      outcome: 'failed',
      errorMessage: redemption.reason,
      finishedAt: Date.now(),
    });
    return { opId, outcome: 'failed', errorMessage: redemption.reason, steps: 0 };
  }

  /**
   * abort reconcile（#325 R2，v2 abort 语义）：
   * 1. 悬空工具调用（tool_started 无结果 entry）补合成 interrupted 结果；
   * 2. 收尾 assistant 消息（stop reason aborted）；
   * 3. pending deferred writes 在 abort 路径仍应用（事实存活）；
   * 4. operation_finished aborted——steer/followUp 死亡（payload 归还调用方）、
   *    nextRun 存活（归约侧由 finished 处置）。
   * restore 路径（resume of aborting）与 live 收尾共用。
   */
  private async reconcileAbortedOperation(laneId: LaneId, opId: string): Promise<OperationOutcome> {
    const state = this.reducer.snapshot(laneId);
    const dangling = state.openOperation?.danglingTools ?? [];
    await this.reconcileDanglingToolsAsInterrupted(laneId, dangling);
    return this.finishAbortedOperation(laneId, opId, 0);
  }

  /**
   * 悬空工具批分类处置（AC5，#326）：重跑（resume）前清空悬空 toolCalls。
   * - 先保证 assistant entry 存在：工具执行窗口崩溃时 assistant 消息可能
   *   尚未落盘（只在首个 tool.result/step.end 刷出）——从 tool_started 载荷
   *   合成 partial assistant 消息（预分配 id 幂等），否则 provider 会面对
   *   无主的 tool 结果（400 拒绝，会话砖化——review C2）；
   * - replay 可重放档（`read-only`，含 legacy `safe`）：用真实工具安全重放一次
   *   并写真实结果；
   * - 不可重放档（`side-effect`/`remote-irreversible`，含 legacy `never`）：按档
   *   合成 interrupted 观察——合成观察只是把边界说给模型，≠ 回滚。
   */
  private async reconcileDanglingTools(
    laneId: LaneId,
    dangling: readonly ToolStartedPayload[],
  ): Promise<void> {
    await this.ensureAssistantEntriesForDangling(laneId, dangling);
    for (const tool of dangling) {
      if (this.session.getEntry(tool.resultEntryId)) continue; // 已有结果
      if (isReplayableToolReplaySafety(tool.replay)) {
        const replayed = await this.safeReplayTool(laneId, tool);
        if (replayed) continue;
      }
      await this.appendSyntheticInterrupted(laneId, tool);
    }
  }

  /** abort 路径：悬空工具一律合成 interrupted（abort 语义下不重放）。 */
  private async reconcileDanglingToolsAsInterrupted(
    laneId: LaneId,
    dangling: readonly ToolStartedPayload[],
  ): Promise<void> {
    await this.ensureAssistantEntriesForDangling(laneId, dangling);
    for (const tool of dangling) {
      if (this.session.getEntry(tool.resultEntryId)) continue;
      await this.appendSyntheticInterrupted(laneId, tool);
    }
  }

  /**
   * 为悬空工具批补齐缺失的 assistant entry（含全部 toolCalls，partial 标记）。
   * 幂等：预分配 assistantEntryId（tool_started 载荷携带）。
   */
  private async ensureAssistantEntriesForDangling(
    laneId: LaneId,
    dangling: readonly ToolStartedPayload[],
  ): Promise<void> {
    const byAssistant = new Map<string, ToolStartedPayload[]>();
    for (const tool of dangling) {
      if (this.session.getEntry(tool.assistantEntryId)) continue; // assistant 已落盘
      const list = byAssistant.get(tool.assistantEntryId) ?? [];
      list.push(tool);
      byAssistant.set(tool.assistantEntryId, list);
    }
    for (const [assistantEntryId, tools] of byAssistant) {
      // 移动到该批 assistant 的父点再追加，保证链正确（该批的 parent =
      // 批前 leaf——无法从记录恢复时挂到当前 leaf，恢复场景中批前内容
      // 通常就是 leaf 链的前缀）
      await this.session.append({
        laneId,
        kind: 'message',
        id: assistantEntryId,
        message: {
          role: 'assistant',
          content: [],
          partial: true,
          toolCalls: tools
            .toSorted((a, b) => a.toolIndex - b.toolIndex)
            .map((tool) => ({
              type: 'function' as const,
              id: tool.toolCallId,
              name: tool.name,
              arguments: JSON.stringify(tool.args ?? {}),
            })),
        },
      });
    }
  }

  /**
   * 不可重放档的悬空工具：按档合成 interrupted 观察（预分配 resultEntryId 幂等
   * 落会话）。两档文本必须互相可区分——"本机可能留下半改动"与"远端效果已不可
   * 撤销"是两种风险，说成同一种等于没说（AC-3.4）。两条都不得暗示存在文件级
   * 事务回滚。
   */
  private async appendSyntheticInterrupted(
    laneId: LaneId,
    tool: ToolStartedPayload,
  ): Promise<void> {
    await this.session.append({
      laneId,
      kind: 'message',
      id: tool.resultEntryId,
      message: {
        role: 'tool',
        toolCallId: tool.toolCallId,
        content: [
          {
            type: 'text',
            text:
              tool.replay === 'remote-irreversible'
                ? SYNTHETIC_INTERRUPTED_REMOTE
                : SYNTHETIC_INTERRUPTED_LOCAL,
          },
        ],
        isError: true,
      },
    });
  }

  /** 安全重放：工具在注册表中且 replay=safe 时执行一次并写真实结果。 */
  private async safeReplayTool(laneId: LaneId, tool: ToolStartedPayload): Promise<boolean> {
    const executable = this.config.tools?.find((candidate) => candidate.name === tool.name);
    if (!executable) return false;
    try {
      const execution = executable.resolveExecution(tool.args as never);
      if ('execute' in execution) {
        const result = await execution.execute({
          turnId: tool.opId,
          toolCallId: tool.toolCallId,
          signal: new AbortController().signal,
        });
        await this.session.append({
          laneId,
          kind: 'message',
          id: tool.resultEntryId,
          message: {
            role: 'tool',
            toolCallId: tool.toolCallId,
            content:
              typeof result.output === 'string'
                ? [{ type: 'text', text: result.output }]
                : Array.isArray(result.output)
                  ? (result.output as ContentPart[])
                  : [{ type: 'text', text: JSON.stringify(result.output) }],
            isError: result.isError === true || undefined,
          },
        });
        return true;
      }
      return false;
    } catch {
      return false; // 重放失败降级为合成 interrupted
    }
  }

  /** abort 收尾：收尾 assistant 消息 + deferred writes 应用 + finished aborted。 */
  private async finishAbortedOperation(
    laneId: LaneId,
    opId: string,
    steps: number,
  ): Promise<OperationOutcome> {
    // 归还 steer/followUp payload（queue 死亡；读取于 finished 记录之前）。
    // 已消费项（entry 已写树，内容已进上下文）不归还——否则调用方重新投递
    // 会重复注入（review M1）。
    const before = this.reducer.snapshot(laneId);
    const deadPayloads = [...before.queues.steer, ...before.queues.followUp].filter(
      (item) => !this.session.getEntry(item.entryId),
    );
    await this.session.append({
      laneId,
      kind: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: '(aborted)' }],
        partial: true,
      },
    });
    await this.applyDeferredWrites(laneId); // deferred writes 在 abort 中存活
    await this.appendRecordTracked(laneId, 'operation_finished', undefined, {
      opId,
      outcome: 'aborted',
      stopReason: 'aborted',
      finishedAt: Date.now(),
    });
    return {
      opId,
      outcome: 'aborted',
      stopReason: 'aborted',
      steps,
      deadQueuePayloads: deadPayloads,
    };
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

  /**
   * 消费下一项 followUp/nextRun 输入（消费点写树：预分配 entryId 落为
   * 该操作的输入消息）。followUp 优先于 nextRun；无待办返回 undefined。
   */
  async consumeNextQueuedInput(laneId: LaneId): Promise<
    | {
        input: readonly ContentPart[];
        origin: StoredPromptOrigin | undefined;
        entryId: string;
      }
    | undefined
  > {
    const state = this.reducer.snapshot(laneId);
    if (state.status !== 'idle') return undefined;
    for (const item of [...state.queues.followUp, ...state.queues.nextRun]) {
      if (this.session.getEntry(item.entryId)) continue; // 已消费
      return { input: item.input, origin: item.origin, entryId: item.entryId };
    }
    return undefined;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('AgentHarness is closed');
  }
}

/**
 * 按名绑定的 lane 操作门面（无状态：全部状态在 harness）。
 *
 * 完整操作面（#328）：prompt/resume/abort + 三队列 + waitForIdle/runWhenIdle +
 * 配置 getter/setter，全部 async、results-not-exceptions（判别联合返回，
 * 永不 throw，rejection 即 bug）。
 */
export class AgentLane {
  constructor(
    private readonly harness: AgentHarness,
    readonly laneId: LaneId,
  ) {}

  state(): LaneState {
    return this.harness.laneState(this.laneId);
  }

  exists(): Promise<boolean> {
    return this.harness.laneExists(this.laneId);
  }

  prompt(
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<LaneResult<OperationOutcome>> {
    return this.harness.prompt(this.laneId, input, options);
  }

  resume(): Promise<LaneResult<OperationOutcome>> {
    return this.harness.resume(this.laneId);
  }

  abort(): Promise<LaneResult<void>> {
    return this.harness.abort(this.laneId);
  }

  steer(
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<LaneResult<void>> {
    return this.harness.steer(this.laneId, input, options);
  }

  followUp(
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<LaneResult<void>> {
    return this.harness.followUp(this.laneId, input, options);
  }

  nextRun(
    input: readonly ContentPart[],
    options?: { readonly origin?: StoredPromptOrigin },
  ): Promise<LaneResult<void>> {
    return this.harness.nextRun(this.laneId, input, options);
  }

  deferWrite(input: {
    readonly customType: string;
    readonly data: unknown;
  }): Promise<LaneResult<void>> {
    return this.harness.deferWrite(this.laneId, input);
  }

  /** 树上移动（#329）：可选 branch summary 与 label。 */
  navigateTree(
    targetEntryId: string,
    options?: {
      readonly summarize?: boolean;
      readonly customInstructions?: string;
      readonly label?: string;
    },
  ): Promise<LaneResult<void>> {
    return this.harness.navigateTree(this.laneId, targetEntryId, options);
  }

  /** 手动压缩（#329）：独立操作。 */
  compact(): Promise<LaneResult<OperationOutcome>> {
    return this.harness.compact(this.laneId);
  }

  // ===== goal 域（#331：custom entries 点查询 + before_run_end 续跑） =====

  /** slash 命令权：创建/替换 goal。 */
  async setGoal(input: {
    readonly objective: string;
    readonly budget?: { readonly maxTurns?: number; readonly maxTokens?: number };
  }): Promise<void> {
    await setGoal(this.harness.session, this.laneId, input);
  }

  /** slash 命令权：清除 goal。 */
  async clearGoal(): Promise<void> {
    await clearGoal(this.harness.session, this.laneId);
  }

  /** 点查询还原 goal 状态。 */
  async goal(): Promise<GoalView> {
    return readGoal(this.harness.session, this.laneId);
  }

  waitForIdle(options?: { readonly timeoutMs?: number }): Promise<LaneResult<void>> {
    return this.harness.waitForIdle(this.laneId, options);
  }

  runWhenIdle<T>(fn: () => Promise<LaneResult<T>>): Promise<LaneResult<T>> {
    return this.harness.runWhenIdle(this.laneId, fn);
  }

  // ===== per-lane 配置视图（点查询还原） =====

  getModel(): Promise<string | undefined> {
    return this.harness.getModel(this.laneId);
  }

  getThinkingLevel(): Promise<string | undefined> {
    return this.harness.getThinkingLevel(this.laneId);
  }

  getActiveTools(): Promise<readonly string[] | undefined> {
    return this.harness.getActiveTools(this.laneId);
  }

  setModel(modelAlias: string): Promise<LaneResult<void>> {
    return this.harness.setModel(this.laneId, modelAlias);
  }

  setThinkingLevel(level: string): Promise<LaneResult<void>> {
    return this.harness.setThinkingLevel(this.laneId, level);
  }

  setActiveTools(tools: readonly string[]): Promise<LaneResult<void>> {
    return this.harness.setActiveTools(this.laneId, tools);
  }

  /**
   * 消费 followUp/nextRun 队列驱动后续操作（driverLoop 的 drain 段）：
   * followUp 优先；每项以预分配 entryId 写树后发起操作，直至队列空。
   */
  async drain(): Promise<LaneResult<readonly OperationOutcome[]>> {
    const outcomes: OperationOutcome[] = [];
    for (;;) {
      const next = await this.harness.consumeNextQueuedInput(this.laneId);
      if (!next) break;
      const result = await this.harness.prompt(this.laneId, next.input, {
        origin: next.origin,
        inputEntryId: next.entryId,
      });
      if (!result.ok) return result;
      outcomes.push(result.value);
    }
    return ok(outcomes);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function grandTotal(usage: TokenUsage): number {
  return usage.inputOther + usage.output + usage.inputCacheRead + usage.inputCacheCreation;
}

/** message entry 的首个文本内容（摘要 transcript 用）。 */
function summarizeContent(entry: {
  message: { content: readonly { type: string; text?: string }[] };
}): string {
  const firstText = entry.message.content.find((part) => part.type === 'text');
  return firstText !== undefined && firstText.type === 'text' && firstText.text !== undefined
    ? firstText.text
    : '';
}

function usageToRecord(usage: TokenUsage): Record<string, number> {
  return {
    inputOther: usage.inputOther,
    output: usage.output,
    inputCacheRead: usage.inputCacheRead,
    inputCacheCreation: usage.inputCacheCreation,
  };
}
