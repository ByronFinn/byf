import { join } from 'node:path';

import { type ContentPart, type Message, type TokenUsage } from '@byfriends/kosong';

import type { Agent } from '..';
import type { LoopRecordedEvent } from '../../loop';
import { clearTokenEstimateCache, estimateTokensForMessages } from '../../utils/tokens';
import type { CompactionResult } from '../compaction';
import { isAgentRecordOfPrefix, type AgentRecord } from '../records/types';
import {
  contextAppendLoopEvent,
  contextApplyCompaction,
  contextAppendMessage,
  contextClear,
  contextMarkLastUserPromptBlocked,
  contextModel,
  contextOutputOffloaded,
  contextPruning,
} from '../wire/ops/context';
import {
  applyObservationMasking,
  DEFAULT_MASKING_CONFIG,
  type MaskingConfig,
  type MaskingResult,
} from './observation-masking';
import { DEFAULT_OFFLOADING_CONFIG, offloadOutput } from './output-offloading';
import {
  degradeOlderMediaParts,
  MEDIA_DEGRADE_KEEP_RECENT,
  MEDIA_STRIPPED_PLACEHOLDERS,
  project,
  type EphemeralInjection,
} from './projector';
import { ScratchManager } from './scratch-manager';
import {
  USER_PROMPT_ORIGIN,
  type AgentContextData,
  type ContextMessage,
  type PromptOrigin,
} from './types';
import { findMaskedToolResultIndices, type WireFoldState } from './wire-fold';

export * from './types';
export * from './observation-masking';
export * from './output-offloading';
export * from './scratch-manager';
export * from './wire-fold';

/**
 * ContextMemory —— context 子系统的 service 层（PRD-0027 Phase 5）。
 *
 * 状态归 `context` wire model 所有：构造时把本实例的 fold 视图挂载为 model 状态
 * （`WireService.mountModel`），因此每次 `wire.dispatch(op)` → apply
 * （wire-fold 纯函数）直接原地变更共享的 `_history` 等嵌套结构 —— 单次 fold、无
 * 内存双份，restore 重放也落在同一状态上（无需 syncFromWire）。
 *
 * 副作用（background 投递 / replayBuilder / token 快照 / offload 写 scratch）不在
 * apply 内：live 路径在本类方法里 dispatch 之后执行；restore 路径由 Agent 的
 * `onReplayRecord` 回调逐条调用 {@link handleReplayRecord}。offload 是 dispatch 后的
 * service 层 effect —— 写 scratch 文件 + dispatch `context.output_offloaded`
 * （transient，persist:false，只改内存不落盘）。
 */
export class ContextMemory {
  private _history: ContextMessage[] = [];
  private _tokenCount = 0;
  private tokenCountCoveredMessageCount = 0;
  private openSteps: Map<string, ContextMessage> = new Map();
  private pendingToolResultIds = new Set<string>();
  private deferredMessages: ContextMessage[] = [];
  private toolCallInfo = new Map<string, { name: string; args: unknown }>();
  /** restore 重放时已处理副作用的 message 水位（handleReplayRecord 的 committed 切片）。 */
  private replayCommittedWatermark = 0;
  readonly scratchManager: ScratchManager | undefined;

  constructor(
    protected readonly agent: Agent,
    sessionId?: string,
  ) {
    // 共享状态：把本实例的 fold 视图挂载为 context model 的实例状态，apply 的原地
    // 变更直接作用于下方字段（须在首次 dispatch / restore 前完成）。
    agent.wire.mountModel(contextModel, this.foldState());
    if (agent.homedir !== undefined && sessionId !== undefined) {
      this.scratchManager = new ScratchManager(agent.runtime.kaos, {
        scratchDir: join(agent.homedir, 'sessions', sessionId, 'scratch'),
        maxSessionSize: 50_000_000,
        maxFileCount: 100,
      });
    }
  }

  appendUserMessage(
    content: readonly ContentPart[],
    origin: PromptOrigin = USER_PROMPT_ORIGIN,
  ): void {
    this.appendMessage({
      role: 'user',
      content: [...content],
      toolCalls: [],
      origin,
    });
  }

  appendSystemReminder(content: string, origin: PromptOrigin): void {
    const text = `<system-reminder>\n${content}\n</system-reminder>`;
    this.appendMessage({
      role: 'user',
      content: [{ type: 'text', text }],
      toolCalls: [],
      origin,
    });
  }

  markLastUserPromptBlocked(hookEvent: string): void {
    // 纯替换逻辑在 `context.mark_last_user_prompt_blocked` 的 apply 内（按 origin
    // 从后往前找最后一条 user prompt 消息，打 blockedByHook 标记）。
    this.agent.wire.dispatch(contextMarkLastUserPromptBlocked({ hookEvent }));
  }

  clear(): void {
    // 状态清空在 `context.clear` 的 apply 内（resetWireFoldState）。
    this.agent.wire.dispatch(contextClear({}));
    this._tokenCount = 0;
    this.tokenCountCoveredMessageCount = 0;
    // 历史被清空，token 估算缓存里的旧文本失去引用——一并丢弃。
    clearTokenEstimateCache();
    void this.scratchManager?.cleanup();
    this.agent.injection.onContextClear();
    this.agent.emitStatusUpdated();
  }

  applyCompaction(summary: CompactionResult): void {
    // 历史重建在 `context.apply_compaction` 的 apply 内（foldApplyCompaction）。
    this.agent.wire.dispatch(contextApplyCompaction(summary));
    this._tokenCount = summary.tokensAfter;
    this.tokenCountCoveredMessageCount = this._history.length;
    // 压缩丢弃了最早的消息，其文本仍被缓存强引用——清理以约束长会话内存。
    clearTokenEstimateCache();
    this.agent.injection.onContextCompacted(summary.compactedCount);
    this.agent.emitStatusUpdated();
  }

  data(): AgentContextData {
    return {
      history: this.history,
      tokenCount: this.tokenCount,
    };
  }

  get tokenCount(): number {
    return this._tokenCount;
  }

  get tokenCountWithPending(): number {
    const pendingMessages = this._history.slice(this.tokenCountCoveredMessageCount);
    return this._tokenCount + estimateTokensForMessages(project(pendingMessages));
  }

  get history(): readonly ContextMessage[] {
    return this._history;
  }

  get messages(): Message[] {
    return this.getMessages();
  }

  /**
   * 当前消息的 media-degraded 投影:除最近
   * {@link MEDIA_DEGRADE_KEEP_RECENT} 个媒体 part 外的全部被替换为文本标记。
   * 用于 provider 以请求体过大(HTTP 413 体积)拒绝后的一次性重发。
   * 纯读侧——底层历史原封不动。
   *
   * 接受与 {@link getMessages} 相同的可选 ephemeral 注入,使降级投影包含
   * 与常规投影相同的每请求动态内容(时间戳、权限模式)。
   */
  getMediaDegradedMessages(ephemeral?: readonly EphemeralInjection[]): Message[] {
    return degradeOlderMediaParts(this.getMessages(ephemeral), MEDIA_DEGRADE_KEEP_RECENT);
  }

  /**
   * media-stripped 投影:所有媒体 part 被替换为文本标记。
   * 用于 provider 拒绝图片格式 / 数据后的一次性重发(坏图可能位于任意位置,
   * 只有整体剥离才能保证请求干净)。纯读侧。
   */
  getMediaStrippedMessages(ephemeral?: readonly EphemeralInjection[]): Message[] {
    return degradeOlderMediaParts(this.getMessages(ephemeral), 0, MEDIA_STRIPPED_PLACEHOLDERS);
  }

  /**
   * 把历史投影为 provider 就绪的消息,可选地在 `'before_user'` 位置
   * 追加 ephemeral 注入(如时间戳、权限模式)。
   */
  getMessages(ephemeral?: readonly EphemeralInjection[]): Message[] {
    return project(this.history, ephemeral);
  }

  /**
   * 可安全喂给独立只读 LLM 调用(如 `/btw` 侧查询)的会话历史
   * provider 就绪快照。
   *
   * 与 {@link getMessages} 不同,当主 turn 处于工具调用中间时,它会截掉
   * 尾部 assistant 消息(及其后的任何内容)。含 `tool_call` 而无配对的
   * `tool_result` 的消息序列是非法的,会被 provider 拒绝,因此快照回滚到
   * 最后一个完整 step 边界。ephemeral 注入被排除——侧查询会追加自己的
   * user 消息,否则 `before_user` 位置的注入会落在主历史与该问题之间。
   */
  getStableSnapshot(): Message[] {
    const messages = this.getMessages();
    if (this.pendingToolResultIds.size === 0) return messages;

    const cutIndex = findLastAssistantWithPendingToolCall(messages, this.pendingToolResultIds);
    if (cutIndex === -1) return messages;
    return messages.slice(0, cutIndex);
  }

  applyObservationMasking(config?: MaskingConfig): MaskingResult {
    const effectiveConfig = config ?? DEFAULT_MASKING_CONFIG;
    const maxContextSize = this.agent.config.modelCapabilities.max_context_tokens;
    const { history, result } = applyObservationMasking(
      this._history,
      maxContextSize,
      this.toolCallInfo,
      effectiveConfig,
    );
    if (result.masked) {
      this.agent.wire.persistRaw({
        type: 'context.observation_masking',
        maskedCount: result.maskedCount,
        tokensBefore: result.tokensBefore,
        tokensAfter: result.tokensAfter,
      });
      // 原地替换：`_history` 与 context model 状态共享同一数组引用，不能换字段。
      replaceHistoryInPlace(this._history, history);
      this.agent.emitStatusUpdated();
    }
    return result;
  }

  applyPruning(config?: { effectiveCapacityRatio?: number; pruningThreshold?: number }): {
    pruned: boolean;
    prunedCount: number;
  } {
    const maxContextSize = this.agent.config.modelCapabilities.max_context_tokens;
    if (maxContextSize <= 0) {
      return { pruned: false, prunedCount: 0 };
    }
    const effectiveCapacity = maxContextSize * (config?.effectiveCapacityRatio ?? 0.6);
    const currentTokens = this.tokenCountWithPending;
    const threshold = effectiveCapacity * (config?.pruningThreshold ?? 0.85);

    if (currentTokens < threshold) {
      return { pruned: false, prunedCount: 0 };
    }

    // 被 masking 遮蔽的 tool message 索引（与 `context.pruning` apply 同源纯函数）。
    const maskedIndices = findMaskedToolResultIndices(this.foldState());

    let prunedCount = 0;
    let tokensAfter = currentTokens;
    for (const index of maskedIndices) {
      if (tokensAfter < threshold) break;
      const message = this._history[index];
      if (message === undefined) continue;
      const tokensBeforeMessage = estimateTokensForMessages([message]);
      tokensAfter -= tokensBeforeMessage;
      prunedCount++;
    }

    if (prunedCount > 0) {
      // 实际替换在 `context.pruning` 的 apply 内（transient：只改内存不落盘）。
      this.agent.wire.dispatch(
        contextPruning({ prunedCount, maskedIndices: maskedIndices.slice(0, prunedCount) }),
      );
      this.agent.emitStatusUpdated();
    }

    return { pruned: prunedCount > 0, prunedCount };
  }

  async appendLoopEvent(event: LoopRecordedEvent): Promise<void> {
    // 状态变更在 `context.append_loop_event` 的 apply 内（foldLoopEvent，同步纯
    // 函数）。dispatch 后按 committed 切片跑 service 层副作用；offload 是
    // dispatch 后的异步 effect（写 scratch + transient op 替换预览）。
    const before = this._history.length;
    this.agent.wire.dispatch(contextAppendLoopEvent({ event }));
    for (const message of this._history.slice(before)) {
      this.pushHistorySideEffects(message);
    }
    if (event.type === 'step.end' && event.usage !== undefined) {
      this.refreshTokenFromStepEnd(event.usage);
    }
    if (event.type === 'tool.result') {
      await this.offloadToolResult(event);
    }
  }

  appendMessage(message: ContextMessage): void {
    // 状态变更在 `context.append_message` 的 apply 内（foldAppendMessage）。交换
    // 打开时消息被 defer，committed 切片为空 → 副作用延迟到 flush 时（后续某个
    // fold 调用的 committed 切片里）。
    const before = this._history.length;
    this.agent.wire.dispatch(contextAppendMessage({ message }));
    for (const committed of this._history.slice(before)) {
      this.pushHistorySideEffects(committed);
    }
  }

  /**
   * restore 重放路径的逐条副作用（Agent.onReplayRecord 回调调用）：对
   * append_message / append_loop_event 按水位切片跑 committed 副作用与 token
   * 快照，clear / apply_compaction 补 service 层状态。纯状态变更已由 wire 引擎的
   * silent apply 落在共享状态上，此处只做 apply 不能做的部分。
   */
  handleReplayRecord(record: AgentRecord): void {
    if (!isAgentRecordOfPrefix(record, 'context')) return;
    switch (record.type) {
      case 'context.append_message':
      case 'context.append_loop_event': {
        const committed = this._history.slice(this.replayCommittedWatermark);
        this.replayCommittedWatermark = this._history.length;
        for (const message of committed) {
          this.pushHistorySideEffects(message);
        }
        if (record.type === 'context.append_loop_event' && record.event.type === 'step.end') {
          if (record.event.usage !== undefined) this.refreshTokenFromStepEnd(record.event.usage);
        }
        return;
      }
      case 'context.clear':
        this._tokenCount = 0;
        this.tokenCountCoveredMessageCount = 0;
        this.replayCommittedWatermark = 0;
        this.agent.injection.onContextClear();
        this.agent.emitStatusUpdated();
        return;
      case 'context.apply_compaction':
        this._tokenCount = record.tokensAfter;
        this.tokenCountCoveredMessageCount = this._history.length;
        this.replayCommittedWatermark = this._history.length;
        this.agent.injection.onContextCompacted(record.compactedCount);
        this.agent.emitStatusUpdated();
        return;
      case 'context.mark_last_user_prompt_blocked':
        // apply 已原地替换；水位不变（长度不变）。
        return;
      case 'context.cache_churn':
        // 归因/展示元数据（PRD-0029 R3）：apply 对 fold 无操作，水位/长度不动。
        // 持久化仅为 vis/replay 渲染 churn ribbon；补登 live 侧归因备忘与计数，使 resume
        // 后 /status 与 /usage 反映历史 churn。live 侧的「上一 turn 指纹」比对状态由 Agent
        // 在 restore 后首个 live turn 从当前 system prompt 重算基线。
        this.agent.recordReplayedCacheChurn(record.blockName, record.cacheScope);
        return;
      case 'context.observation_masking':
        // legacyRoute 已先跑 restoreObservationMasking；长度不变，水位不动。
        return;
      case 'context.output_offloaded':
      case 'context.pruning':
        // transient（旧 journal 才有）：apply 已按 schema 可选字段 no-op。
        return;
    }
  }

  /** Expose ContextMemory's fold-relevant fields as a WireFoldState view.
   *  The returned object shares storage with this instance — fold functions
   *  mutate the same maps/arrays in place. Also mounted as the `context` wire
   *  model's instance state (single fold, no duplicate history copy). */
  private foldState(): WireFoldState {
    return {
      history: this._history,
      openSteps: this.openSteps,
      pendingToolResultIds: this.pendingToolResultIds,
      toolCallInfo: this.toolCallInfo,
      deferredMessages: this.deferredMessages,
    };
  }

  /** Apply the live-agent side-effects for a message that the fold has
   *  already pushed onto `_history` (dispatch after / replay watermark):
   *  notify background-task delivery and feed the replay builder. */
  private pushHistorySideEffects(message: ContextMessage): void {
    if (message.origin?.kind === 'background_task') {
      this.agent.background.markDeliveredNotification(message.origin);
    }
    this.agent.replayBuilder.push({
      type: 'message',
      message,
    });
  }

  /**
   * step.end 后刷新 token 快照（service 层替代旧的 onStepEnd port）：usage 覆盖
   * 到该 step 的 assistant 消息为止，之后的 tool 消息计入 pending。step 按顺序
   * 流式推进（step.begin → … → step.end 不嵌套），故该 step 的 assistant 就是
   * 历史上最后一条 assistant 消息（与旧 fold 内 indexOf(openStep) 等价）。
   */
  private refreshTokenFromStepEnd(usage: TokenUsage): void {
    const openStepIndex = findLastAssistantIndex(this._history);
    this._tokenCount =
      usage.inputCacheRead + usage.inputCacheCreation + usage.inputOther + usage.output;
    this.tokenCountCoveredMessageCount =
      openStepIndex === -1 ? this._history.length : openStepIndex + 1;
  }

  /**
   * Offload effect（dispatch 后）：把大 tool 输出写 scratch 文件并 dispatch
   * `context.output_offloaded`（transient），其 apply 把历史里的 tool message
   * 内容替换为预览 —— 历史最终形态与旧 fold 内 offload 等价（PRD R3 原型验证）。
   * Agent-tool 子代理摘要（已由另一 LLM 蒸馏）永不卸载；restore 不触发（本方法
   * 只在 live 路径被调，restore 重放 apply 同步折叠完整输出，下一轮 beforeStep
   * 重做压缩）。
   */
  private async offloadToolResult(
    event: Extract<LoopRecordedEvent, { type: 'tool.result' }>,
  ): Promise<void> {
    const toolName = this.toolCallInfo.get(event.toolCallId)?.name ?? 'unknown';
    if (
      toolName === 'Agent' ||
      this.scratchManager === undefined ||
      typeof event.result.output !== 'string'
    ) {
      return;
    }
    const offloaded = await offloadOutput(
      event.toolCallId,
      toolName,
      event.result,
      this.scratchManager,
      DEFAULT_OFFLOADING_CONFIG,
    );
    if (
      !offloaded.offloaded ||
      offloaded.output === undefined ||
      offloaded.filePath === undefined
    ) {
      return;
    }
    this.agent.wire.dispatch(
      contextOutputOffloaded({
        toolCallId: event.toolCallId,
        filePath: offloaded.filePath,
        preview: offloaded.output,
      }),
    );
  }

  restoreRecord(record: AgentRecord): void {
    // AgentRecords 按前缀路由：Phase 5 起仅 context.observation_masking 未注册
    // Op（apply 需读 config 的 maxContextSize），其余 context.* 由 wire 引擎重放。
    if (!isAgentRecordOfPrefix(record, 'context')) return;
    switch (record.type) {
      case 'context.observation_masking':
        this.restoreObservationMasking();
        break;
      case 'context.append_message':
      case 'context.append_loop_event':
      case 'context.clear':
      case 'context.apply_compaction':
      case 'context.mark_last_user_prompt_blocked':
      case 'context.output_offloaded':
      case 'context.pruning':
      case 'context.cache_churn':
        // 已注册 Op（Phase 5 / PRD-0029），restore 由 wire 引擎重放，不会到达（防漂移守卫）。
        break;
    }
  }

  private restoreObservationMasking(): void {
    const maxContextSize = this.agent.config.modelCapabilities.max_context_tokens;
    const { history } = applyObservationMasking(this._history, maxContextSize, this.toolCallInfo);
    // 原地替换：`_history` 与 context model 状态共享同一数组引用，不能换字段。
    replaceHistoryInPlace(this._history, history);
    this.agent.emitStatusUpdated();
  }
}

/** 把 source 内容原地写入 target（保持引用不变，供共享状态数组使用）。 */
function replaceHistoryInPlace(target: ContextMessage[], source: readonly ContextMessage[]): void {
  target.length = 0;
  target.push(...source);
}

/**
 * Find the index of the last assistant message whose `tool_calls` include any
 * id still pending a `tool_result`. Returns -1 when no such message exists.
 *
 * The caller slices everything from this index onward to roll back to the
 * last step boundary where every tool call already has its result — the only
 * shape providers accept for a fresh, tool-call-free generation.
 */
function findLastAssistantWithPendingToolCall(
  messages: readonly Message[],
  pendingToolResultIds: ReadonlySet<string>,
): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message === undefined || message.role !== 'assistant') continue;
    if (message.toolCalls.some((call) => pendingToolResultIds.has(call.id))) {
      return i;
    }
  }
  return -1;
}

/** 最后一条 assistant 消息的下标（无则 -1）。 */
function findLastAssistantIndex(messages: readonly ContextMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') return i;
  }
  return -1;
}
