import {
  createByfCore,
  createRPC,
  ErrorCodes,
  makeErrorPayload,
  type ApprovalRequest,
  type ApprovalResponse,
  type ConfigDocumentResult,
  type ConfigValidationResult,
  type ConfigWriteResult,
  type CoreAPI,
  type CreateSkillResult,
  type Event,
  type McpConfigListing,
  type McpConfigScope,
  type McpConnectionTestResult,
  type McpRawDocument,
  type McpScopeState,
  type PromisableMethods,
  type QuestionRequest,
  type QuestionResult,
  type ResolvedModelCapabilities,
  type RuntimeConfig,
  type SDKAPI,
  type SDKRPCClient,
  type SetModelResult,
  type ToolCallRequest,
  type ToolCallResponse,
  type WorkspaceSkillListing,
} from '@byfriends/agent-core';
import type {
  AgentTreeResponse,
  ContextProjection,
  InspectorSessionSummary,
  SessionDetail,
  WireResponse,
} from '@byfriends/agent-core/session/inspector';

import type { ApprovalHandler, QuestionHandler } from '#/events';
import type {
  BackgroundTaskInfo,
  CreateSessionOptions,
  ExportSessionInput,
  ExportSessionResult,
  ForkSessionInput,
  GetConfigOptions,
  CronTaskSnapshot,
  GoalBudgetLimits,
  GoalSnapshot,
  ByfConfig,
  ByfConfigPatch,
  ListSessionsOptions,
  McpServerInfo,
  McpStartupMetrics,
  PermissionMode,
  CompactOptions,
  ShellExecPayload,
  ShellExecResult,
  SessionStatus,
  SessionUsage,
  PromptInput,
  RenameSessionInput,
  UpdateSessionMetadataInput,
  ResumeSessionInput,
  ResumedSessionSummary,
  SessionSummary,
  SkillSummary,
  Unsubscribe,
} from '#/types';

const MAIN_AGENT_ID = 'main';

export interface SDKRpcClientOptions {
  readonly homeDir?: string;
  readonly configPath?: string;
  readonly skillDirs?: readonly string[];
  readonly runtime?: RuntimeConfig;
}

export interface SessionPromptRpcInput {
  readonly sessionId: string;
  readonly input: PromptInput;
}

export interface SessionIdRpcInput {
  readonly sessionId: string;
}

export interface SetSessionModelRpcInput extends SessionIdRpcInput {
  readonly model: string;
}

/**
 * `setModel` 的结果直接透传 core RPC 的 `SetModelResult`(agent-core 单源),
 * 避免在 SDK 层重建同构类型。
 */
export type SetSessionModelRpcResult = SetModelResult;

export interface SetSessionThinkingRpcInput extends SessionIdRpcInput {
  readonly level: string;
}

export interface SetSessionPermissionRpcInput extends SessionIdRpcInput {
  readonly mode: PermissionMode;
}

export interface CreateSessionGoalRpcInput extends SessionIdRpcInput {
  readonly objective: string;
  readonly replace?: boolean;
  readonly budget?: GoalBudgetLimits;
}

export interface ActivateSkillRpcInput extends SessionIdRpcInput {
  readonly name: string;
  readonly args?: string;
}

export interface ReconnectMcpServerRpcInput extends SessionIdRpcInput {
  readonly name: string;
}

export interface SessionShellExecRpcInput extends SessionIdRpcInput {
  readonly command: string;
  readonly cwd?: string;
  readonly timeout?: number;
}

type ResolvedCoreAPI = Awaited<ReturnType<SDKRPCClient>>;

export class SDKRpcClient {
  readonly homeDir: string;
  readonly configPath: string;
  private readonly core: PromisableMethods<CoreAPI>;
  interactiveAgentId = MAIN_AGENT_ID;
  private readonly ready: Promise<void>;
  private rpc: ResolvedCoreAPI | undefined;
  private readonly eventListeners = new Set<(event: Event) => void>();
  private readonly approvalHandlers = new Map<string, ApprovalHandler>();
  private readonly questionHandlers = new Map<string, QuestionHandler>();

  constructor(options: SDKRpcClientOptions = {}) {
    const [coreRpc, sdkRpc] = createRPC<CoreAPI, SDKAPI>();
    const handle = createByfCore(coreRpc, {
      homeDir: options.homeDir,
      configPath: options.configPath,
      skillDirs: options.skillDirs,
      runtime: options.runtime,
    });
    this.core = handle.core;
    this.homeDir = handle.homeDir;
    this.configPath = handle.configPath;
    this.ready = sdkRpc(new ClientAPI(this)).then((rpc) => {
      this.rpc = rpc;
    });
  }

  async createSession(input: CreateSessionOptions): Promise<SessionSummary> {
    const rpc = await this.getRpc();
    return rpc.createSession(input);
  }

  async resumeSession(input: ResumeSessionInput): Promise<ResumedSessionSummary> {
    const rpc = await this.getRpc();
    return rpc.resumeSession({ sessionId: input.id });
  }

  async forkSession(input: ForkSessionInput): Promise<SessionSummary> {
    const rpc = await this.getRpc();
    return rpc.forkSession({
      sessionId: input.id,
      id: input.forkId,
      title: input.title,
      metadata: input.metadata,
      upToMessage: input.upToMessage,
    });
  }

  async closeSession(input: SessionIdRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.closeSession({ sessionId: input.sessionId });
  }

  async waitForBackgroundTasksOnPrint(input: SessionIdRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.waitForBackgroundTasksOnPrint({ sessionId: input.sessionId });
  }

  async addWorkspaceDir(input: { sessionId: string; dir: string; persist?: boolean }): Promise<{
    workspaceDir: string;
    additionalDirs: readonly string[];
    configPath?: string;
  }> {
    const rpc = await this.getRpc();
    return rpc.addWorkspaceDir({
      sessionId: input.sessionId,
      dir: input.dir,
      persist: input.persist,
    });
  }

  async getWorkspaceRoots(input: SessionIdRpcInput): Promise<{
    workspaceDir: string;
    additionalDirs: readonly string[];
  }> {
    const rpc = await this.getRpc();
    return rpc.getWorkspaceRoots({ sessionId: input.sessionId });
  }

  async listSessions(input: ListSessionsOptions): Promise<readonly SessionSummary[]> {
    const rpc = await this.getRpc();
    return rpc.listSessions(input);
  }

  // ── Inspector（PRD-0035 R-A2）────────────────────────────────────────────

  async listInspectableSessions(): Promise<readonly InspectorSessionSummary[]> {
    const rpc = await this.getRpc();
    return rpc.listInspectableSessions({});
  }

  async readSessionInspection(input: { sessionId: string }): Promise<SessionDetail | null> {
    const rpc = await this.getRpc();
    return rpc.readSessionInspection({ sessionId: input.sessionId });
  }

  async readAgentWire(input: { sessionId: string; agentId: string }): Promise<WireResponse> {
    const rpc = await this.getRpc();
    return rpc.readAgentWire({ sessionId: input.sessionId, agentId: input.agentId });
  }

  async readContextProjection(input: {
    sessionId: string;
    agentId: string;
  }): Promise<ContextProjection> {
    const rpc = await this.getRpc();
    return rpc.readContextProjection({ sessionId: input.sessionId, agentId: input.agentId });
  }

  async readAgentTree(input: { sessionId: string }): Promise<AgentTreeResponse> {
    const rpc = await this.getRpc();
    return rpc.readAgentTree({ sessionId: input.sessionId });
  }

  /** 删除会话目录并重建 index；live/busy 抛 SESSION_BUSY。 */
  async deleteSession(sessionId: string): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.deleteSession({ sessionId });
  }

  // ── ConfigDocument（PRD-0035 R-A3/A4、ADR-0038）──────────────────────────

  async getConfigDocument(): Promise<ConfigDocumentResult> {
    const rpc = await this.getRpc();
    return rpc.getConfigDocument({});
  }

  async validateConfigText(text: string): Promise<ConfigValidationResult> {
    const rpc = await this.getRpc();
    return rpc.validateConfigText({ text });
  }

  async writeConfigText(text: string, expectedRevision: string | null): Promise<ConfigWriteResult> {
    const rpc = await this.getRpc();
    return rpc.writeConfigText({ text, expectedRevision });
  }

  // ── WorkspaceRegistry（PRD-0035 R-A6）────────────────────────────────────

  async listWorkspaces(): Promise<string[]> {
    const rpc = await this.getRpc();
    return rpc.listWorkspaces({});
  }

  async hiddenWorkspaces(): Promise<string[]> {
    const rpc = await this.getRpc();
    return rpc.hiddenWorkspaces({});
  }

  async addWorkspace(workDir: string): Promise<string[]> {
    const rpc = await this.getRpc();
    return rpc.addWorkspace({ workDir });
  }

  async removeWorkspace(workDir: string): Promise<boolean> {
    const rpc = await this.getRpc();
    return rpc.removeWorkspace({ workDir });
  }

  // ── MCP config store(PRD-0036 / ADR-0039)─────────────────────────────────

  async listMcpServerConfigs(workDir: string): Promise<McpConfigListing> {
    const rpc = await this.getRpc();
    return rpc.listMcpServerConfigs({ workDir });
  }

  async readMcpConfigRaw(workDir: string, scope: McpConfigScope): Promise<McpRawDocument> {
    const rpc = await this.getRpc();
    return rpc.readMcpConfigRaw({ workDir, scope });
  }

  async upsertMcpServerConfig(
    workDir: string,
    scope: McpConfigScope,
    name: string,
    config: Record<string, unknown>,
  ): Promise<McpScopeState> {
    const rpc = await this.getRpc();
    return rpc.upsertMcpServerConfig({ workDir, scope, name, config });
  }

  async removeMcpServerConfig(
    workDir: string,
    scope: McpConfigScope,
    name: string,
  ): Promise<McpScopeState> {
    const rpc = await this.getRpc();
    return rpc.removeMcpServerConfig({ workDir, scope, name });
  }

  async writeMcpConfigRaw(
    workDir: string,
    scope: McpConfigScope,
    text: string,
  ): Promise<McpRawDocument> {
    const rpc = await this.getRpc();
    return rpc.writeMcpConfigRaw({ workDir, scope, text });
  }

  async testMcpConnection(input: {
    workDir: string;
    scope: McpConfigScope;
    name?: string;
    config: Record<string, unknown>;
  }): Promise<McpConnectionTestResult> {
    const rpc = await this.getRpc();
    return rpc.testMcpConnection(input);
  }

  // ── Workspace skills(PRD-0036)────────────────────────────────────────────

  async listWorkspaceSkills(workDir: string): Promise<WorkspaceSkillListing> {
    const rpc = await this.getRpc();
    return rpc.listWorkspaceSkills({ workDir });
  }

  async createWorkspaceSkill(input: {
    workDir: string;
    scope: 'user' | 'project';
    name: string;
    description: string;
  }): Promise<CreateSkillResult> {
    const rpc = await this.getRpc();
    return rpc.createWorkspaceSkill(input);
  }

  async removeWorkspaceSkill(workDir: string, skillPath: string): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.removeWorkspaceSkill({ workDir, skillPath });
  }

  async renameSession(input: RenameSessionInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.renameSession({
      sessionId: input.id,
      title: input.title,
    });
  }

  async updateSessionMetadata(input: UpdateSessionMetadataInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.updateSessionMetadata({
      sessionId: input.id,
      metadata: input.metadata,
    });
  }

  async exportSession(input: ExportSessionInput): Promise<ExportSessionResult> {
    const rpc = await this.getRpc();
    return rpc.exportSession({
      sessionId: input.id,
      outputPath: input.outputPath,
      includeGlobalLog: input.includeGlobalLog,
      version: input.version,
    });
  }

  async getConfig(input?: GetConfigOptions): Promise<ByfConfig> {
    const rpc = await this.getRpc();
    return rpc.getByfConfig(input ?? {});
  }

  async setConfig(input: ByfConfigPatch): Promise<ByfConfig> {
    const rpc = await this.getRpc();
    return rpc.setByfConfig(input);
  }

  async removeModel(modelId: string): Promise<ByfConfig> {
    const rpc = await this.getRpc();
    return rpc.removeByfModel({ modelId });
  }

  async removeProvider(providerId: string): Promise<ByfConfig> {
    const rpc = await this.getRpc();
    return rpc.removeByfProvider({ providerId });
  }

  async resolveModelCapabilities(model: string): Promise<ResolvedModelCapabilities> {
    const rpc = await this.getRpc();
    return rpc.resolveModelCapabilities({ model });
  }

  async prompt(input: SessionPromptRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.prompt({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      input: input.input,
    });
  }

  async steer(input: SessionPromptRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.steer({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      input: input.input,
    });
  }

  async askSide(
    input: { sessionId: string; query: string; queryId: string },
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.askSide(
      {
        sessionId: input.sessionId,
        agentId: this.interactiveAgentId,
        query: input.query,
        queryId: input.queryId,
      },
      options,
    );
  }

  async cancelSideQuery(input: { sessionId: string; queryId: string }): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.cancelSideQuery({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      queryId: input.queryId,
    });
  }

  async generateAgentsMd(input: SessionIdRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.generateAgentsMd({ sessionId: input.sessionId });
  }

  async cancel(input: SessionIdRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.cancel({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
    });
  }

  async setModel(input: SetSessionModelRpcInput): Promise<SetSessionModelRpcResult> {
    const rpc = await this.getRpc();
    return rpc.setModel({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      model: input.model,
    });
  }

  async setThinking(input: SetSessionThinkingRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.setThinking({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      level: input.level,
    });
  }

  async setPermission(input: SetSessionPermissionRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.setPermission({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      mode: input.mode,
    });
  }

  async createGoal(input: CreateSessionGoalRpcInput): Promise<GoalSnapshot | null> {
    const rpc = await this.getRpc();
    return rpc.createGoal({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      objective: input.objective,
      replace: input.replace,
      budget: input.budget,
    });
  }

  async getGoal(input: SessionIdRpcInput): Promise<GoalSnapshot | null> {
    const rpc = await this.getRpc();
    return rpc.getGoal({ sessionId: input.sessionId, agentId: this.interactiveAgentId });
  }

  async pauseGoal(input: SessionIdRpcInput): Promise<GoalSnapshot | null> {
    const rpc = await this.getRpc();
    return rpc.pauseGoal({ sessionId: input.sessionId, agentId: this.interactiveAgentId });
  }

  async resumeGoal(input: SessionIdRpcInput): Promise<GoalSnapshot | null> {
    const rpc = await this.getRpc();
    return rpc.resumeGoal({ sessionId: input.sessionId, agentId: this.interactiveAgentId });
  }

  async cancelGoal(input: SessionIdRpcInput): Promise<GoalSnapshot | null> {
    const rpc = await this.getRpc();
    return rpc.cancelGoal({ sessionId: input.sessionId, agentId: this.interactiveAgentId });
  }

  async getCronTasks(input: SessionIdRpcInput): Promise<{ tasks: readonly CronTaskSnapshot[] }> {
    const rpc = await this.getRpc();
    return rpc.getCronTasks({ sessionId: input.sessionId, agentId: this.interactiveAgentId });
  }

  async deleteCronTask(input: SessionIdRpcInput & { id: string }): Promise<{ deleted: boolean }> {
    const rpc = await this.getRpc();
    return rpc.deleteCronTask({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      id: input.id,
    });
  }

  async compact(input: SessionIdRpcInput & CompactOptions): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.beginCompaction({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      instruction: input.instruction,
    });
  }

  async cancelCompaction(input: SessionIdRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.cancelCompaction({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
    });
  }

  async getUsage(input: SessionIdRpcInput): Promise<SessionUsage> {
    const rpc = await this.getRpc();
    return rpc.getUsage({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
    });
  }

  async getStatus(input: SessionIdRpcInput): Promise<SessionStatus> {
    const rpc = await this.getRpc();
    const agentId = this.interactiveAgentId;
    const config = await rpc.getConfig({
      sessionId: input.sessionId,
      agentId,
    });
    const context = await rpc.getContext({
      sessionId: input.sessionId,
      agentId,
    });
    const permission = await rpc.getPermission({
      sessionId: input.sessionId,
      agentId,
    });
    const usage = await rpc.getUsage({
      sessionId: input.sessionId,
      agentId,
    });
    const maxContextTokens = config.modelCapabilities?.max_context_tokens ?? 0;
    const contextTokens = context.tokenCount;
    const contextUsage = maxContextTokens > 0 ? contextTokens / maxContextTokens : 0;
    const hasUsage =
      usage.byModel !== undefined || usage.total !== undefined || usage.currentTurn !== undefined;
    return {
      model: config.modelAlias ?? config.provider?.model,
      thinkingLevel: config.thinkingLevel,
      permission: permission.mode,
      contextTokens,
      maxContextTokens,
      contextUsage,
      usage: hasUsage ? usage : undefined,
    };
  }

  async listSkills(input: SessionIdRpcInput): Promise<readonly SkillSummary[]> {
    const rpc = await this.getRpc();
    return rpc.listSkills({ sessionId: input.sessionId });
  }

  async listBackgroundTasks(
    input: SessionIdRpcInput & { activeOnly?: boolean; limit?: number },
  ): Promise<readonly BackgroundTaskInfo[]> {
    const rpc = await this.getRpc();
    return rpc.getBackground({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      activeOnly: input.activeOnly,
      limit: input.limit,
    });
  }

  async getBackgroundTaskOutput(
    input: SessionIdRpcInput & { taskId: string; tail?: number },
  ): Promise<string> {
    const rpc = await this.getRpc();
    return rpc.getBackgroundOutput({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      taskId: input.taskId,
      tail: input.tail,
    });
  }

  async getBackgroundTaskOutputPath(
    input: SessionIdRpcInput & { taskId: string },
  ): Promise<string | undefined> {
    const rpc = await this.getRpc();
    return rpc.getBackgroundOutputPath({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      taskId: input.taskId,
    });
  }

  async stopBackgroundTask(
    input: SessionIdRpcInput & { taskId: string; reason?: string },
  ): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.stopBackground({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      taskId: input.taskId,
      reason: input.reason,
    });
  }

  async listMcpServers(input: SessionIdRpcInput): Promise<readonly McpServerInfo[]> {
    const rpc = await this.getRpc();
    return rpc.listMcpServers({ sessionId: input.sessionId });
  }

  async getMcpStartupMetrics(input: SessionIdRpcInput): Promise<McpStartupMetrics> {
    const rpc = await this.getRpc();
    return rpc.getMcpStartupMetrics({ sessionId: input.sessionId });
  }

  async reconnectMcpServer(input: ReconnectMcpServerRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.reconnectMcpServer({ sessionId: input.sessionId, name: input.name });
  }

  async activateSkill(input: ActivateSkillRpcInput): Promise<void> {
    const rpc = await this.getRpc();
    return rpc.activateSkill({
      sessionId: input.sessionId,
      agentId: this.interactiveAgentId,
      name: input.name,
      args: input.args,
    });
  }

  async shellExec(input: SessionShellExecRpcInput): Promise<ShellExecResult> {
    const rpc = await this.getRpc();
    const payload: ShellExecPayload = {
      sessionId: input.sessionId,
      command: input.command,
      cwd: input.cwd,
      timeout: input.timeout,
    };
    return rpc.shellExec(payload);
  }

  onEvent(listener: (event: Event) => void): Unsubscribe {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  receiveEvent(event: Event): void {
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  setApprovalHandler(sessionId: string, handler: ApprovalHandler | undefined): void {
    if (handler === undefined) {
      this.approvalHandlers.delete(sessionId);
      return;
    }
    this.approvalHandlers.set(sessionId, handler);
  }

  setQuestionHandler(sessionId: string, handler: QuestionHandler | undefined): void {
    if (handler === undefined) {
      this.questionHandlers.delete(sessionId);
      return;
    }
    this.questionHandlers.set(sessionId, handler);
  }

  clearSessionHandlers(sessionId: string): void {
    this.approvalHandlers.delete(sessionId);
    this.questionHandlers.delete(sessionId);
  }

  async requestApproval(
    request: ApprovalRequest & { sessionId: string; agentId: string },
  ): Promise<ApprovalResponse> {
    const handler = this.approvalHandlers.get(request.sessionId);
    if (handler === undefined) {
      return {
        decision: 'cancelled',
        feedback: 'No approval handler registered.',
      };
    }

    try {
      return await handler(request);
    } catch (error) {
      this.receiveEvent({
        type: 'error',
        sessionId: request.sessionId,
        agentId: request.agentId,
        ...makeErrorPayload(ErrorCodes.SESSION_APPROVAL_HANDLER_ERROR, errorMessage(error)),
      });
      return {
        decision: 'cancelled',
        feedback: 'Approval handler failed.',
      };
    }
  }

  async requestQuestion(
    request: QuestionRequest & { sessionId: string; agentId: string },
  ): Promise<QuestionResult> {
    const handler = this.questionHandlers.get(request.sessionId);
    if (handler === undefined) return null;

    try {
      return await handler(request);
    } catch (error) {
      this.receiveEvent({
        type: 'error',
        sessionId: request.sessionId,
        agentId: request.agentId,
        ...makeErrorPayload(ErrorCodes.SESSION_QUESTION_HANDLER_ERROR, errorMessage(error)),
      });
      return null;
    }
  }

  async toolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    return {
      output: `SDK custom tool calls are not supported: ${request.toolCallId}`,
      isError: true,
    };
  }

  private async getRpc(): Promise<ResolvedCoreAPI> {
    await this.ready;
    if (this.rpc === undefined) {
      throw new Error('SDK RPC client was not initialized.');
    }
    return this.rpc;
  }
}

export class ClientAPI implements SDKAPI {
  constructor(readonly client: SDKRpcClient) {}

  emitEvent(event: Event): void {
    this.client.receiveEvent(event);
  }

  requestApproval(
    request: ApprovalRequest & { sessionId: string; agentId: string },
  ): Promise<ApprovalResponse> {
    return this.client.requestApproval(request);
  }

  requestQuestion(
    request: QuestionRequest & { sessionId: string; agentId: string },
  ): Promise<QuestionResult> {
    return this.client.requestQuestion(request);
  }

  toolCall(request: ToolCallRequest): Promise<ToolCallResponse> {
    return this.client.toolCall(request);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
