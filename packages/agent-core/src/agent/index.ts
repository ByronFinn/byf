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
import { ConfigState } from './config';
import { ContextMemory } from './context';
import { GoalMode } from './goal';
import { HookEngine } from './hooks';
import { InjectionManager } from './injection/manager';
import { PermissionManager, type PermissionManagerOptions } from './permission';
import {
  AgentRecords,
  FileSystemAgentRecordPersistence,
  type AgentRecord,
  type AgentRecordPersistence,
} from './records';
import { ReplayBuilder } from './replay';
import { SkillManager } from './skill';
import { ToolManager } from './tool/index';
import { TurnFlow } from './turn';
import {
  GENERATE_REQUEST_LOG_CONTEXT,
  getProviderCacheCapability,
  type GenerateOptionsWithRequestLog,
} from './turn/kosong-llm';
import { UsageRecorder } from './usage';

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
  readonly permission?: PermissionManagerOptions;
  /** Parent logger; the agent appends its own ctx (agentId already bound by session). */
  readonly log?: Logger;
  readonly telemetry?: TelemetryClient;
}

export class Agent {
  readonly runtime: RuntimeConfig;
  readonly homedir?: string;
  readonly skills?: SkillManager;
  readonly rawGenerate: typeof generate;
  readonly rpc: SDKAgentRPC;
  readonly telemetry: TelemetryClient;
  readonly providerManager: ProviderManager | undefined;
  readonly subagentHost: SessionSubagentHost | undefined;
  readonly mcp: McpConnectionManager | undefined;
  readonly hooks: HookEngine | undefined;

  readonly type: AgentType;
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
  readonly replayBuilder: ReplayBuilder;
  readonly log: Logger;

  private lastLlmConfigLogSignature?: string;
  private btwQueryCounter = 0;
  private readonly btwQueries = new Map<string, AbortController>();

  constructor(config: AgentConfig) {
    this.log = config.log ?? log;
    this.runtime = config.runtime;
    this.homedir = config.homedir;
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
    this.records = new AgentRecords(
      this,
      config.persistence ??
        (config.homedir
          ? new FileSystemAgentRecordPersistence(join(config.homedir, 'wire.jsonl'), {
              onError: (error) => {
                this.emitRecordsWriteError(error);
              },
            })
          : undefined),
    );
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
      const result = await this.records.replay();
      // goal 在 replay 后修正状态（active→paused 降级、清零 wall-clock 锚点）。
      this.goal.normalizeAfterReplay();
      await this.background.loadFromDisk();
      await this.background.reconcile();
      this.turn.finishResume();
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
