import { createHash } from 'node:crypto';
import { join } from 'node:path';

import {
  generate,
  type CacheStrategy,
  type ChatProvider,
  type ContentPart,
  type Message,
  type PromptPlan,
  type ProviderCacheCapability,
  type Tool,
} from '@byfriends/kosong';

import { ErrorCodes, ByfError, makeErrorPayload, toByfErrorPayload } from '#/errors';
import { log } from '#/logging/logger';
import type { Logger } from '#/logging/types';
import { buildPromptPlan } from '#/prompt-plan/index';
import type { AgentAPI, AgentEvent, SDKAgentRPC, UsageStatus } from '#/rpc';

import { isAbortError } from '../loop/errors';
import type { McpConnectionManager } from '../mcp';
import {
  resolveSystemPromptCwd,
  type PreparedSystemPromptContext,
  type ResolvedAgentProfile,
} from '../profile';
import type { ProviderManager } from '../providers/provider-manager';
import { withProviderRequestAuth } from '../providers/request-auth';
import type { RuntimeConfig } from '../runtime-types';
import type { SessionSubagentHost } from '../session/subagent-host';
import type { SkillRegistry } from '../skill';
import { noopTelemetryClient, type TelemetryClient } from '../telemetry';
import { ImageLimits } from '../tools/support/image-limits';
import { linkAbortSignal } from '../utils/abort';
import {
  estimateInputBreakdown,
  estimateTokens,
  estimateTokensForMessages,
  estimateTokensForTools,
} from '../utils/tokens';
import type { PromisableMethods } from '../utils/types';
import { BackgroundManager } from './background';
import { FullCompaction, type CompactionStrategy } from './compaction';
import { ConfigState, type AgentConfigUpdateData } from './config';
import { ContextMemory } from './context';
import { CronManager } from './cron';
import { GoalMode } from './goal';
import { HookEngine } from './hooks';
import { InjectionManager } from './injection/manager';
import { PermissionManager, type PermissionManagerOptions } from './permission';
import {
  AgentRecords,
  FileSystemAgentRecordPersistence,
  isAgentRecordOfPrefix,
  type AgentRecord,
  type AgentRecordPersistence,
} from './records';
import { ReplayBuilder } from './replay';
import { SkillManager } from './skill';
// import 即注册全部业务 Op（纯 reducer 子系统；legacy 前缀走 legacyRoute）。
import './wire/ops';
import { ToolManager } from './tool/index';
import { TurnFlow } from './turn';
import {
  GENERATE_REQUEST_LOG_CONTEXT,
  getProviderCacheCapability,
  type GenerateOptionsWithRequestLog,
} from './turn/kosong-llm';
import { UsageRecorder } from './usage';
import { WireService, wireRecordToPayload, type WirePersistence, type WireRecord } from './wire';

export type { AgentRecord, AgentRecordPersistence } from './records';
export type { BuiltinTool, ToolInfo, ToolSource, UserToolRegistration } from './tool';
export type {
  GoalBudgetLimits,
  GoalBudgetReport,
  GoalChange,
  GoalSnapshot,
  GoalStatus,
  GoalTurnTokens,
  GoalUsage,
} from './goal';
export { GoalMode, MAX_GOAL_OBJECTIVE_LENGTH } from './goal';
export { CronManager, type CronManagerOptions, type CronTaskSnapshot } from './cron';

export type AgentType = 'main' | 'sub' | 'independent';

/**
 * Instruction injected into every `/btw` side query.
 *
 * The side query reuses the main agent's system prompt (which encourages
 * tool use and action) but is sent with **no tools**. Without this
 * correction the model, faced with a question it would normally answer
 * via a tool, falls back to emitting tool-call syntax as plain text
 * (e.g. `<tool_call><function=WebSearch>…`). This directive closes that
 * gap by making the read-only, text-only contract explicit and forbidding
 * any tool-call-like output. It is injected as a `system` message
 * *between* the stable snapshot and the user's question, so the main
 * system prompt (and its cache prefix) is untouched.
 */
const BTW_READONLY_INSTRUCTION = [
  'You are answering a read-only side question ("by the way").',
  'You have NO tools available and cannot take any action.',
  'Answer directly in natural language using only the conversation context above.',
  'Do NOT emit tool calls, function calls, or any markup such as <tool_call>, <function=>, or <parameter>.',
  'If the question cannot be answered without tools (e.g. it needs a web search or file access), say so in plain text instead of pretending to call a tool.',
].join(' ');

const BTW_READONLY_INSTRUCTION_MESSAGE: Message = {
  role: 'system',
  content: [{ type: 'text', text: BTW_READONLY_INSTRUCTION }],
  toolCalls: [],
};

export interface AgentConfig {
  readonly runtime: RuntimeConfig;
  readonly homedir?: string;
  readonly skills?: SkillRegistry;
  readonly rpc: SDKAgentRPC;
  readonly persistence?: AgentRecordPersistence;
  readonly type?: AgentType;
  readonly generate?: typeof generate;
  readonly compactionStrategy?: CompactionStrategy;
  readonly providerManager?: ProviderManager;
  readonly sessionId?: string;
  readonly subagentHost?: SessionSubagentHost;
  readonly mcp?: McpConnectionManager;
  readonly hookEngine?: HookEngine;
  readonly backgroundMaxRunningTasks?: number;
  readonly backgroundSessionDir?: string;
  readonly imageLimits?: ImageLimits;
  readonly permission?: PermissionManagerOptions;
  /** Parent logger; the agent appends its own ctx (agentId already bound by session). */
  readonly log?: Logger;
  readonly telemetry?: TelemetryClient;
}

/**
 * 无 homedir / 无注入 persistence 时的 no-op journal（记录丢弃、restore 空转）。
 * 等价旧 AgentRecords 无 persistence 语义（logRecord 丢记录）；replay 由旧「抛错」
 * 放宽为「空 journal no-op」（无调用点依赖旧抛错，session 层恒有 homedir）。
 */
const NOOP_WIRE_PERSISTENCE: WirePersistence = {
  read: async function* () {},
  append: () => {},
  rewrite: () => {},
  flush: async () => {},
  close: async () => {},
};

/** Phase 1 legacy adapter 前缀：restore 走 restoreRecord（非纯 reducer）。 */
function isLegacyRestorePrefix(record: AgentRecord): boolean {
  return (
    isAgentRecordOfPrefix(record, 'context') ||
    isAgentRecordOfPrefix(record, 'permission') ||
    isAgentRecordOfPrefix(record, 'full_compaction')
  );
}

export class Agent {
  readonly runtime: RuntimeConfig;
  readonly homedir?: string;
  /**
   * Session-scoped working directory for side files that should follow the
   * session lifecycle (background task output logs, media-originals cache).
   * `undefined` when persistence is off — callers fall back to os.tmpdir().
   */
  readonly backgroundSessionDir?: string;
  readonly imageLimits: ImageLimits;
  readonly skills?: SkillManager;
  readonly rawGenerate: typeof generate;
  readonly rpc: SDKAgentRPC;
  readonly telemetry: TelemetryClient;
  readonly providerManager: ProviderManager | undefined;
  readonly subagentHost: SessionSubagentHost | undefined;
  readonly mcp: McpConnectionManager | undefined;
  readonly hooks: HookEngine | undefined;

  readonly type: AgentType;
  /** wire reducer 引擎：独占 wire.jsonl（PRD-0027 Phase 1）。 */
  readonly wire: WireService;
  readonly records: AgentRecords;
  readonly fullCompaction: FullCompaction;
  readonly context: ContextMemory;
  readonly config: ConfigState;
  readonly turn: TurnFlow;
  readonly injection: InjectionManager;
  readonly permission: PermissionManager;
  readonly goal: GoalMode;

  readonly usage: UsageRecorder;
  readonly tools: ToolManager;
  readonly background: BackgroundManager;
  /**
   * Session-scoped cron scheduler. `null` for subagents (they never
   * schedule; getCronTasks reports an empty list).
   */
  readonly cron: CronManager | null;
  readonly replayBuilder: ReplayBuilder;
  readonly log: Logger;

  private lastLlmConfigLogSignature?: string;
  private btwQueryCounter = 0;
  private readonly btwQueries = new Map<string, AbortController>();

  constructor(config: AgentConfig) {
    this.log = config.log ?? log;
    this.runtime = config.runtime;
    this.homedir = config.homedir;
    this.backgroundSessionDir = config.backgroundSessionDir;
    this.imageLimits = config.imageLimits ?? new ImageLimits();
    if (config.skills !== undefined) {
      this.skills = new SkillManager(this, config.skills);
    }
    this.rawGenerate = config.generate ?? generate;
    this.providerManager =
      config.sessionId === undefined
        ? config.providerManager
        : config.providerManager?.withPromptCacheKey(config.sessionId);
    this.subagentHost = config.subagentHost;
    this.mcp = config.mcp;
    this.hooks = config.hookEngine;

    this.type = config.type ?? 'main';

    this.rpc = config.rpc;
    this.telemetry = config.telemetry ?? noopTelemetryClient;
    this.wire = new WireService({
      persistence:
        config.persistence ??
        (config.homedir
          ? new FileSystemAgentRecordPersistence(join(config.homedir, 'wire.jsonl'), {
              onError: (error) => {
                this.emitRecordsWriteError(error);
              },
            })
          : NOOP_WIRE_PERSISTENCE),
      publishEvent: (event) => {
        this.emitEvent(event as AgentEvent);
      },
      legacyRoute: (record: WireRecord) => {
        this.routeLegacyRecord(record as AgentRecord);
      },
      onReplayRecord: (record: WireRecord) => {
        // config 走纯 reducer（update() 不执行），replayBuilder 的 config_updated
        // 在此派生（payload 即 changed 子集，对标旧路径 config/index.ts:43 的 push）。
        if (isAgentRecordOfPrefix(record as AgentRecord, 'config')) {
          this.replayBuilder.push({
            type: 'config_updated',
            config: wireRecordToPayload(record) as AgentConfigUpdateData,
          });
        }
      },
      onSkippedRecord: (error) => {
        this.log.error('wire record skipped during restore', { error });
      },
    });
    this.records = new AgentRecords(this.wire);
    this.fullCompaction = new FullCompaction(this, config.compactionStrategy);
    this.context = new ContextMemory(this, config.sessionId);
    this.config = new ConfigState(this);
    this.turn = new TurnFlow(this);
    this.injection = new InjectionManager(this);
    this.permission = new PermissionManager(this, config.permission);
    this.goal = new GoalMode(this);

    this.usage = new UsageRecorder(this);
    this.tools = new ToolManager(this);
    this.background = new BackgroundManager(this, {
      maxRunningTasks: config.backgroundMaxRunningTasks ?? 10,
      sessionDir: config.backgroundSessionDir,
    });
    // Subagents never host cron tasks — only the main agent does.
    this.cron = this.type === 'sub' ? null : new CronManager(this);
    this.replayBuilder = new ReplayBuilder(this);

    // Register restore handlers after all subsystems are initialized
    this.records.registerHandlers({
      context: this.context,
      config: this.config,
      usage: this.usage,
      turn: this.turn,
      permission: this.permission,
      tools: this.tools,
      fullCompaction: this.fullCompaction,
      goal: this.goal,
    });

    // restore 后的 model → 私有状态同步 + 归一化副作用（kimi 式分布式 hook）。
    // 顺序即注册顺序（goal/turn/config 各自先 sync 再归一化；其余只 sync）。
    // 注意：hook 在 wire.restore() 内、phase='ready' 后同步跑完 —— restore 返回前
    // 子系统状态已就绪（Agent.resume 的下轮 turn 依赖）。
    this.wire.hooks.onDidRestore.register('sync', () => {
      this.syncFromWire();
    });
    this.wire.hooks.onDidRestore.register('goal', () => {
      this.goal.normalizeAfterReplay();
    });
    this.wire.hooks.onDidRestore.register('turn', () => {
      this.turn.finishResume();
    });
    this.wire.hooks.onDidRestore.register('config', () => {
      // 坑点外提（PRD Phase 3）：initializeBuiltinTools 从「replay 期间副作用」
      // 移到 onDidRestore（restore 返回前完成，下轮 turn 需要工具实例）。幂等。
      if (this.config.hasProvider) {
        this.tools.initializeBuiltinTools();
      }
    });
  }

  /**
   * 5 个纯 reducer 子系统 model → 私有状态同步（onDidRestore 'sync' hook 与
   * 测试 harness 的单条 restore 都用）。context / permission / full_compaction 是
   * legacy（restoreRecord 直接改私有状态），不在此列。
   */
  syncFromWire(): void {
    this.goal.syncFromWire();
    this.usage.syncFromWire();
    this.tools.syncFromWire();
    this.turn.syncFromWire();
    this.config.syncFromWire();
  }

  /**
   * 单条 record 的 restore 语义（测试 harness 的 dispatch 用）。
   * - 已注册 Op：logRecord 的 dispatch 已 apply 到 model，此处同步 model→私有。
   * - legacy 前缀（context / permission / full_compaction）：restoreRecord 在
   *   restoring 相位下执行（调 appendMessage/setMode 等 live 方法，靠 restoring
   *   抑制其 logRecord/emit —— 对标旧 records.restore 的 _restoring 语义）。
   * 生产路径不使用（restore 走 wire.restore() 全量 + onDidRestore hooks）。
   */
  restoreRecord(record: AgentRecord): void {
    if (isLegacyRestorePrefix(record)) {
      this.wire.withRestoringPhase(() => {
        this.routeLegacyRecord(record);
      });
    } else {
      this.syncFromWire();
    }
  }

  /**
   * legacy adapter 路由（context / permission / full_compaction 的 restoreRecord）。
   * 被 wire.legacyRoute（完整 restore）与 restoreRecord（测试 harness）共用。
   */
  private routeLegacyRecord(record: AgentRecord): void {
    if (isAgentRecordOfPrefix(record, 'context')) {
      // context 的 restore 会读 config 私有状态（如 observation masking 读
      // modelCapabilities 判定遮蔽压力）。config 私有字段在 restore 结束的
      // onDidRestore 'sync' hook 才同步，此处先同步，使 mid-replay 读取到该时间点
      // 的最新配置（对标旧路径 config.restoreRecord 立即更新私有状态的语义）。
      this.config.syncFromWire();
      this.context.restoreRecord(record);
    } else if (isAgentRecordOfPrefix(record, 'permission')) {
      this.permission.restoreRecord(record);
    } else if (isAgentRecordOfPrefix(record, 'full_compaction')) {
      this.fullCompaction.restoreRecord(record);
    }
  }

  get generate(): typeof generate {
    return async (provider, systemPrompt, tools, history, callbacks, options) => {
      if (options?.auth !== undefined) {
        this.logLlmRequest(provider, systemPrompt, tools, history, options);
        return this.rawGenerate(provider, systemPrompt, tools, history, callbacks, options);
      }
      const modelAlias = this.config.modelAlias;
      const resolveAuth =
        modelAlias === undefined
          ? undefined
          : this.providerManager?.createAuthResolverForModel(modelAlias, {
              log: this.log,
            });
      return withProviderRequestAuth(resolveAuth, (auth) => {
        const requestOptions = auth === undefined ? options : { ...options, auth };
        this.logLlmRequest(provider, systemPrompt, tools, history, requestOptions);
        return this.rawGenerate(provider, systemPrompt, tools, history, callbacks, requestOptions);
      });
    };
  }

  /**
   * Answer a read-only side question (e.g. `/btw`) from a stable snapshot of
   * the current conversation context, without entering the main turn flow.
   *
   * The question is appended to a {@link ContextMemory.getStableSnapshot}
   * snapshot and sent to the model with **no tools** — the model can only
   * answer from what it already sees. Text deltas are streamed as
   * `btw.delta` events; the final text and usage land in `btw.completed`.
   *
   * The exchange is deliberately detached from the main turn pipeline: it
   * does not write to {@link ContextMemory}, does not log to wire records
   * (so resume/fork never see it), does not record usage, and never emits
   * turn events. This mirrors the "detached generate" pattern already used
   * by {@link FullCompaction}.
   */
  async askSide(
    query: string,
    options: {
      readonly signal?: AbortSignal;
      readonly queryId?: string;
    } = {},
  ): Promise<{ readonly queryId: string }> {
    if (query.trim().length === 0) {
      throw new ByfError(ErrorCodes.REQUEST_INVALID, 'Side query cannot be empty');
    }
    const queryId = options.queryId ?? `btw-${String((this.btwQueryCounter += 1))}`;
    const provider = this.config.provider.withThinking(this.config.thinkingLevel);
    const model = this.config.model;
    const systemPrompt = this.config.systemPrompt;
    const messages: Message[] = [
      ...this.context.getStableSnapshot(),
      BTW_READONLY_INSTRUCTION_MESSAGE,
      { role: 'user', content: [{ type: 'text', text: query }], toolCalls: [] },
    ];

    if (this.btwQueries.has(queryId)) {
      throw new ByfError(
        ErrorCodes.REQUEST_INVALID,
        `Side query id "${queryId}" is already in flight`,
      );
    }
    const controller = new AbortController();
    this.btwQueries.set(queryId, controller);
    const unlinkCallerSignal =
      options.signal !== undefined ? linkAbortSignal(options.signal, controller) : undefined;

    this.emitEvent({ type: 'btw.started', queryId });

    try {
      const cacheCapability = getProviderCacheCapability(provider);
      const promptPlan = buildPromptPlan(systemPrompt, cacheCapability);

      const result = await this.generate(
        provider,
        systemPrompt,
        [],
        messages,
        {
          onMessagePart: (part) => {
            if (part.type === 'text') {
              this.emitEvent({ type: 'btw.delta', queryId, delta: part.text });
            }
          },
        },
        { signal: controller.signal, promptPlan },
      );

      const text = result.message.content
        .filter((part): part is ContentPart & { type: 'text' } => part.type === 'text')
        .map((part) => part.text)
        .join('');

      this.emitEvent({
        type: 'btw.completed',
        queryId,
        text,
        ...(result.usage !== null ? { usage: result.usage } : {}),
      });
      this.telemetry.track('btw_query', {
        model,
        aborted: false,
        ...(result.usage !== null
          ? {
              input_cache_read: result.usage.inputCacheRead,
              input_cache_creation: result.usage.inputCacheCreation,
              input_other: result.usage.inputOther,
              output: result.usage.output,
            }
          : {}),
      });
    } catch (error) {
      if (isAbortError(error)) {
        // Abort is an expected exit (user closed the overlay); emit no error.
        this.telemetry.track('btw_query', { model, aborted: true });
        return { queryId };
      }
      this.emitEvent({
        type: 'btw.failed',
        queryId,
        ...toByfErrorPayload(error),
      });
    } finally {
      unlinkCallerSignal?.();
      this.btwQueries.delete(queryId);
    }

    return { queryId };
  }

  /**
   * Cancel an in-flight side query by aborting its per-query controller.
   * No-op if the query is already finished or unknown.
   */
  cancelSideQuery(queryId: string): void {
    this.btwQueries.get(queryId)?.abort();
  }

  private logLlmRequest(
    provider: ChatProvider,
    systemPrompt: string,
    tools: readonly Tool[],
    history: readonly Message[],
    options: Parameters<typeof generate>[5],
  ): void {
    const context = buildLlmRequestContext(options);
    const configMetadata = buildLlmConfigMetadata(
      provider,
      this.config.modelAlias,
      systemPrompt,
      tools,
      options,
    );
    this.logLlmConfigIfChanged(
      context,
      configMetadata,
      buildLlmConfigSignature(configMetadata, systemPrompt, tools),
    );
    this.log.info('llm request', {
      ...context,
      ...buildLlmRequestMetadata(systemPrompt, tools, history),
    });
  }

  private logLlmConfigIfChanged(
    context: LlmRequestContextFields,
    metadata: LlmConfigMetadata,
    signature: string,
  ): void {
    if (signature === this.lastLlmConfigLogSignature) return;
    this.lastLlmConfigLogSignature = signature;
    this.log.info('llm config', {
      ...context,
      ...metadata,
    });
  }

  useProfile(profile: ResolvedAgentProfile, context?: PreparedSystemPromptContext): void {
    const cwd = context?.cwd ?? resolveSystemPromptCwd(this.runtime.kaos, this.config.cwd);
    const systemPrompt = applyPromptSizeGuard(
      profile.systemPrompt({
        osEnv: this.runtime.osEnv,
        cwd,
        skills: this.skills?.registry,
        agentsMd: context?.agentsMd,
      }),
    );
    this.config.update({ profileName: profile.name, systemPrompt });
    this.tools.setActiveTools(profile.tools);
  }

  async resume(): Promise<{ warning?: string; error?: Error }> {
    try {
      // wire.restore() 内部：重放（7 纯 reducer + context legacy）→ onDidRestore
      // hooks（goal.normalizeAfterReplay / turn.finishResume / config.initializeBuiltinTools
      // 已随各子系统 hook 在 restore 返回前完成）。
      const result = await this.records.replay();
      await this.background.loadFromDisk();
      await this.background.reconcile();
      await this.cron?.loadFromDisk();
      return result;
    } catch (error) {
      // Return error instead of throwing
      return {
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  get rpcMethods(): PromisableMethods<AgentAPI> {
    return {
      prompt: (payload) => {
        this.turn.prompt(payload.input);
      },
      steer: (payload) => {
        this.telemetry.track('input_steer', { parts: payload.input.length });
        this.turn.steer(payload.input);
      },
      askSide: (payload) => {
        void this.askSide(payload.query, { queryId: payload.queryId });
      },
      cancelSideQuery: (payload) => {
        this.cancelSideQuery(payload.queryId);
      },
      cancel: (payload) => {
        if (this.turn.hasActiveTurn) {
          this.telemetry.track('cancel', { from: 'streaming' });
        }
        this.turn.cancel(payload.turnId);
      },
      setThinking: (payload) => {
        const wasEnabled = this.config.thinkingLevel !== 'off';
        this.config.update({ thinkingLevel: payload.level });
        const enabled = this.config.thinkingLevel !== 'off';
        if (enabled !== wasEnabled) {
          this.telemetry.track('thinking_toggle', { enabled });
        }
      },
      setPermission: (payload) => {
        const wasYolo = this.permission.mode === 'yolo';
        const wasAuto = this.permission.mode === 'auto';
        this.permission.setMode(payload.mode);
        const enabled = this.permission.mode === 'yolo';
        if (enabled !== wasYolo) {
          this.telemetry.track('yolo_toggle', { enabled });
        }
        const afkEnabled = this.permission.mode === 'auto';
        if (afkEnabled !== wasAuto) {
          this.telemetry.track('afk_toggle', { enabled: afkEnabled });
        }
      },
      createGoal: (payload) => {
        this.goal.createGoal(payload.objective, {
          replace: payload.replace,
          budget: payload.budget,
        });
        return this.goal.getSnapshot();
      },
      getGoal: () => this.goal.getSnapshot(),
      pauseGoal: () => {
        this.goal.pause();
        return this.goal.getSnapshot();
      },
      resumeGoal: () => {
        this.goal.resume();
        return this.goal.getSnapshot();
      },
      cancelGoal: () => {
        this.goal.cancel();
        return this.goal.getSnapshot();
      },
      // Subagents never schedule; report empty so host polls stay uniform.
      getCronTasks: () => ({ tasks: this.cron?.listTaskSnapshots() ?? [] }),
      // Host privilege delete (PRD-0024 / ADR-0030) — not tool permission.
      deleteCronTask: (payload) => this.cron?.deleteCronTask(payload.id) ?? { deleted: false },
      setModel: async (payload) => {
        const previous = this.config.modelAlias;
        const resolved = await this.providerManager?.resolveProviderForModel(payload.model);
        if (resolved === undefined) {
          throw new Error('Runtime provider model cannot be empty');
        }
        this.config.update({
          modelAlias: resolved.modelName,
        });
        if (previous !== resolved.modelName) {
          this.telemetry.track('model_switch', { model: resolved.modelName });
        }
        return {
          model: resolved.modelName,
          providerName: resolved.providerName,
        };
      },
      getModel: () => {
        return this.config.modelAlias ?? '';
      },
      beginCompaction: (payload) => {
        this.fullCompaction.begin({ source: 'manual', instruction: payload.instruction });
      },
      cancelCompaction: () => {
        if (this.fullCompaction.isCompacting) {
          this.telemetry.track('cancel', { from: 'compacting' });
        }
        this.fullCompaction.cancel();
      },
      registerTool: (payload) => {
        this.tools.registerUserTool(payload);
      },
      unregisterTool: (payload) => {
        this.tools.unregisterUserTool(payload.name);
      },
      setActiveTools: (payload) => {
        this.tools.setActiveTools(payload.names);
      },
      stopBackground: (payload) => {
        void this.background.stop(payload.taskId, payload.reason);
      },
      clearContext: () => {
        this.context.clear();
      },
      activateSkill: (payload) => {
        if (this.skills === undefined) {
          throw new ByfError(ErrorCodes.SKILL_NOT_FOUND, `Skill "${payload.name}" was not found`);
        }
        this.skills.activate(payload);
      },
      getBackgroundOutput: (payload) => this.background.readOutput(payload.taskId, payload.tail),
      getBackgroundOutputPath: (payload) => this.background.getOutputPath(payload.taskId),
      getContext: () => this.context.data(),
      getConfig: () => this.config.data(),
      getPermission: () => this.permission.data(),
      getUsage: () => {
        const usageData = this.usage.data();
        // Rebuild the prompt plan on demand: this mirrors the per-turn rebuild
        // in askSide / kosong-llm. Idle rebuild is safe because
        // getMessages()/loopTools hold no turn-state guards. Without a model,
        // the plan still splits into blocks for estimation purposes.
        const cacheCapability: ProviderCacheCapability = this.config.hasModel
          ? getProviderCacheCapability(this.config.provider)
          : { strategy: 'none' };
        const promptPlan = buildPromptPlan(this.config.systemPrompt, cacheCapability);
        const inputBreakdown = estimateInputBreakdown({
          promptPlan,
          tools: this.tools.loopTools,
          messages: this.context.getMessages(),
          maxContextTokens: this.config.modelCapabilities.max_context_tokens,
        });
        return { ...usageData, inputBreakdown };
      },
      getTools: () => this.tools.data(),
      getBackground: (payload) => this.background.list(payload.activeOnly ?? false, payload.limit),
    };
  }

  emitEvent(event: AgentEvent): void {
    if (this.records.restoring) return;
    void this.rpc.emitEvent(event);
  }

  emitStatusUpdated(): void {
    if (this.records.restoring) return;
    if (!this.config.hasModel) return;

    const contextTokens = this.context.tokenCount;
    const maxContextTokens = this.config.modelCapabilities.max_context_tokens;
    const contextUsage =
      maxContextTokens !== undefined && maxContextTokens > 0
        ? contextTokens / maxContextTokens
        : undefined;
    const usage: UsageStatus | undefined = this.usage.status();
    const model = this.config.model;

    this.emitEvent({
      type: 'agent.status.updated',
      model,
      contextTokens,
      maxContextTokens,
      contextUsage,

      permission: this.permission.mode,
      usage,
    });
  }

  private emitRecordsWriteError(error: unknown, record?: AgentRecord): void {
    const message = error instanceof Error ? error.message : String(error);
    this.log.error('wire record persist failed', {
      agentHomedir: this.homedir,
      recordType: record?.type,
      error,
    });
    this.emitEvent({
      type: 'error',
      ...makeErrorPayload(
        ErrorCodes.RECORDS_WRITE_FAILED,
        `Failed to write agent records: ${message}`,
        {
          details: { recordType: record?.type },
        },
      ),
    });
  }
}

interface LlmRequestContextFields {
  turnId?: string;
  step?: number;
  attempt?: number;
  maxAttempts?: number;
}

interface LlmRequestMetadata {
  estimatedInputTokens: number;
  messageCount: number;
  toolCallCount: number;
  partialMessageCount?: number;
}

/**
 * Fields that identify an LLM configuration for deduplication.
 * Keep this interface simple and avoid dynamic keys — the shape is
 * serialized with `JSON.stringify` to produce a stable signature in
 * `logLlmConfigIfChanged`.
 */
interface LlmConfigMetadata {
  provider: string;
  model: string;
  modelAlias?: string;
  thinkingEffort?: string;
  systemPromptChars: number;
  toolCount: number;
  /** Cache block hashes extracted from PromptPlan, if available */
  cacheBlockHashes?: Record<string, string>;
  /** Provider's cache strategy */
  providerCacheStrategy?: CacheStrategy;
}

/**
 * Token budget beyond which the rendered system prompt is considered
 * oversized. ADR 0009 targets ~3,500–4,500 tokens for the system prompt;
 * this guard fires at a higher ceiling that leaves room for legitimately
 * large AGENTS.md content while still catching runaway growth. When
 * exceeded, a hint is appended to the prompt so the model favors concise,
 * targeted actions over context-heavy exploration.
 */
const SYSTEM_PROMPT_SIZE_WARN_TOKENS = 6000;

/**
 * Append a context-frugality hint when the rendered system prompt exceeds
 * {@link SYSTEM_PROMPT_SIZE_WARN_TOKENS}.
 *
 * The hint is appended to the very end of the prompt — i.e. inside the
 * last session-scoped block (`# Skills`), after ADR 0013's cache
 * boundaries — so the global/project cache prefixes stay byte-for-byte
 * stable. This is a guardrail, not a hard limit: it nudges behavior
 * without changing prompt structure.
 */
function applyPromptSizeGuard(systemPrompt: string): string {
  if (estimateTokens(systemPrompt) <= SYSTEM_PROMPT_SIZE_WARN_TOKENS) {
    return systemPrompt;
  }
  return (
    systemPrompt +
    '\n\n<!-- NOTE: The system prompt is large. Prefer targeted reads and ' +
    'concise tool output; avoid dumping whole files or broad searches unless ' +
    'necessary. -->'
  );
}

function buildLlmRequestContext(options: Parameters<typeof generate>[5]): LlmRequestContextFields {
  const context = requestLogContext(options);
  if (context === undefined) return {};

  const fields: LlmRequestContextFields = {
    turnId: context.turnId,
    step: context.step,
  };
  if (context.attempt !== undefined && context.maxAttempts !== undefined && context.attempt > 1) {
    fields.attempt = context.attempt;
    fields.maxAttempts = context.maxAttempts;
  }
  return fields;
}

function buildLlmRequestMetadata(
  systemPrompt: string,
  tools: readonly Tool[],
  history: readonly Message[],
): LlmRequestMetadata {
  let toolCallCount = 0;
  let partialMessageCount = 0;

  for (const message of history) {
    if (message.partial === true) partialMessageCount += 1;
    toolCallCount += message.toolCalls.length;
  }

  const estimatedInputTokens =
    estimateTokens(systemPrompt) +
    estimateTokensForMessages([...history]) +
    estimateTokensForTools(tools);

  const metadata: LlmRequestMetadata = {
    estimatedInputTokens,
    messageCount: history.length,
    toolCallCount,
  };
  if (partialMessageCount > 0) {
    metadata.partialMessageCount = partialMessageCount;
  }
  return metadata;
}

function buildLlmConfigMetadata(
  provider: ChatProvider,
  modelAlias: string | undefined,
  systemPrompt: string,
  tools: readonly Tool[],
  options: Parameters<typeof generate>[5],
): LlmConfigMetadata {
  const metadata: LlmConfigMetadata = {
    provider: provider.name,
    model: provider.modelName,
    modelAlias,
    thinkingEffort: provider.thinkingEffort ?? undefined,
    systemPromptChars: systemPrompt.length,
    toolCount: tools.length,
  };

  // Extract cache strategy from provider capability
  const providerCacheStrategy = getProviderCacheStrategy(provider);
  if (providerCacheStrategy !== undefined) {
    metadata.providerCacheStrategy = providerCacheStrategy;
  }

  // Extract cache block hashes from PromptPlan if available
  const promptPlan = options?.promptPlan;
  if (promptPlan !== undefined && promptPlan.blocks.length > 0) {
    metadata.cacheBlockHashes = extractCacheBlockHashes(promptPlan);
  }

  return metadata;
}

/**
 * Get the cache strategy from a provider's capability.
 *
 * Safely handles providers that don't implement getCapability or don't have cache.
 */
function getProviderCacheStrategy(provider: ChatProvider): CacheStrategy | undefined {
  if (typeof provider.getCapability !== 'function') {
    return undefined;
  }
  const capability = provider.getCapability();
  return capability?.cache?.strategy;
}

/**
 * Extract cache block hashes from a PromptPlan.
 *
 * Returns a Record mapping block names to their SHA256 hashes.
 */
function extractCacheBlockHashes(promptPlan: PromptPlan): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const block of promptPlan.blocks) {
    hashes[block.name] = fingerprint(block.text);
  }
  return hashes;
}

function buildLlmConfigSignature(
  metadata: LlmConfigMetadata,
  systemPrompt: string,
  tools: readonly Tool[],
): string {
  const toolsForSignature = tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));
  return JSON.stringify({
    ...metadata,
    systemPromptHash: fingerprint(systemPrompt),
    toolsHash: fingerprint(JSON.stringify(toolsForSignature)),
  });
}

function fingerprint(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function requestLogContext(options: Parameters<typeof generate>[5]) {
  return (options as GenerateOptionsWithRequestLog | undefined)?.[GENERATE_REQUEST_LOG_CONTEXT];
}
