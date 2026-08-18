import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { localKaos } from '@byfriends/kaos';

import { ErrorCodes, ByfError } from '#/errors';
import { getRootLogger, log } from '#/logging/logger';
import { LocalFetchURLProvider } from '#/tools/providers/local-fetch-url';
import { createProxiedFetch } from '#/tools/providers/proxied-fetch';
import { createProvider, registerBuiltinWebSearchProviders } from '#/tools/providers/registry';
import { RemoteFetchURLProvider } from '#/tools/providers/remote-fetch-url';
import { PriorityRouter } from '#/tools/providers/router';
import { detectSystemProxy } from '#/tools/providers/system-proxy';
import { detectEnvironmentFromNode } from '#/utils/environment';
import type { PromisableMethods } from '#/utils/types';
import { getCoreVersion } from '#/version';

import {
  ensureByfHome,
  mergeConfigPatch,
  normalizeAdditionalDirs,
  readConfigFile,
  readWorkspaceAdditionalDirs,
  resolveConfigPath,
  resolveByfHome,
  resolveWorkspaceAdditionalDirs,
  writeConfigFile,
  type ByfConfig,
  type ByfServiceConfig,
} from '../config';
import * as configDocument from '../config/document';
import type { ConfigValidationResult } from '../config/document';
import { WorkspaceRegistry } from '../home/workspace-registry';
import type { Logger } from '../logging/types';
import { resolveSessionMcpConfig } from '../mcp';
import * as mcpConfigStore from '../mcp/config-store';
import { ProviderManager } from '../providers/provider-manager';
import {
  type BearerTokenProvider,
  type OAuthTokenProviderResolver,
} from '../providers/runtime-provider';
import type { RuntimeConfig } from '../runtime-types';
import { Session, type SessionMeta, type SessionSkillConfig } from '../session';
import { exportSessionDirectory } from '../session/export';
import type {
  AgentTreeResponse,
  ContextProjection,
  InspectorSessionSummary,
  SessionDetail,
  WireResponse,
} from '../session/inspector';
import * as inspector from '../session/inspector';
import { SessionAPIImpl } from '../session/rpc';
import { normalizeWorkDir, SessionStore } from '../session/store';
import * as skillStore from '../skill/store';
import { noopTelemetryClient, type TelemetryClient } from '../telemetry';
import type { CoreRPCClient } from './client';
import type {
  ActivateSkillPayload,
  AskSidePayload,
  BeginCompactionPayload,
  CancelPayload,
  CancelSideQueryPayload,
  CloseSessionPayload,
  AddWorkspaceDirPayload,
  AddWorkspaceDirResult,
  AddWorkspacePayload,
  CoreAPI,
  CoreInfo,
  CreateGoalPayload,
  CreateSessionPayload,
  ConfigDocumentResult,
  ConfigWriteResult,
  DeleteCronTaskPayload,
  DeleteSessionPayload,
  EmptyPayload,
  ExportSessionPayload,
  ExportSessionResult,
  ForkSessionPayload,
  GetBackgroundOutputPathPayload,
  GetBackgroundOutputPayload,
  GetBackgroundPayload,
  ListMcpServerConfigsPayload,
  ListSessionsPayload,
  ListWorkspaceSkillsPayload,
  McpConfigListing,
  McpRawDocument,
  McpScopeState,
  McpServerInfo,
  McpStartupMetrics,
  PromptPayload,
  ReadAgentWirePayload,
  ReadContextProjectionPayload,
  ReadMcpRawPayload,
  ReconnectMcpServerPayload,
  RemoveByfModelPayload,
  RemoveByfProviderPayload,
  RemoveMcpServerConfigPayload,
  RemoveWorkspacePayload,
  RenameSessionPayload,
  ResolveModelCapabilitiesPayload,
  ResolvedModelCapabilities,
  ResumeSessionPayload,
  RegisterToolPayload,
  ShellExecPayload,
  ShellExecResult,
  SetByfConfigPayload,
  SetActiveToolsPayload,
  SetModelPayload,
  SetModelResult,
  SetPermissionPayload,
  SetThinkingPayload,
  SkillSummary,
  SteerPayload,
  StopBackgroundPayload,
  SessionSummary,
  UnregisterToolPayload,
  UpdateSessionMetadataPayload,
  UpsertMcpServerConfigPayload,
  ValidateConfigTextPayload,
  WorkspaceSkillListing,
  WriteConfigTextPayload,
  WriteMcpRawPayload,
} from './core-api';
import type { ResumedAgentState, ResumeSessionResult } from './resumed';
import type { SDKRPC } from './sdk-api';
import { proxyWithExtraPayload } from './types';

// Register builtin web-search providers (Exa, Brave, Firecrawl) once at module
// load. Done explicitly here instead of via side-effect imports in each provider
// module so registration is order-independent and discoverable from one place.
registerBuiltinWebSearchProviders();

const BYF_CODE_PROVIDER_NAME = 'byf';

type AgentScopedPayload<T> = T & { readonly agentId: string };
type SessionScopedPayload<T> = T & { readonly sessionId: string };
type SessionAgentPayload<T> = SessionScopedPayload<AgentScopedPayload<T>>;
type RenameSessionRequest = SessionScopedPayload<RenameSessionPayload>;
type UpdateSessionMetadataRequest = SessionScopedPayload<UpdateSessionMetadataPayload>;

export interface ByfCoreOptions {
  readonly homeDir?: string;
  readonly configPath?: string;
  readonly runtime?: RuntimeConfig;
  readonly byfRequestHeaders?: Record<string, string>;
  readonly resolveOAuthTokenProvider?: OAuthTokenProviderResolver;
  readonly skillDirs?: readonly string[];
}

/**
 * {@link createByfCore} 返回的窄句柄。
 *
 * SDK 消费者只需要 RPC 通道(一个可喂给 `createRPC` 的
 * `PromisableMethods<CoreAPI>`)加两个解析后的路径。暴露完整的 `ByfCore`
 * 具体类会把引擎的 40+ 内部成员(sessions 映射、sdk Promise、
 * providerManager、sessionStore、telemetry …)泄漏进 SDK 类型表面,
 * 破坏 ADR 0006 的隔离接缝。见 ADR 0006(Monorepo 分层架构)。
 */
export interface CoreEngineHandle {
  /** CoreRPC 就绪的 core:传给 `createRPC<CoreAPI, SDKAPI>()` 的第一个槽位。 */
  readonly core: PromisableMethods<CoreAPI>;
  readonly homeDir: string;
  readonly configPath: string;
}

/**
 * 构造 {@link ByfCore} 引擎,返回窄 {@link CoreEngineHandle}。
 *
 * 这是 SDK 层引导引擎的受支持方式。具体 `ByfCore` 类刻意不重导出到包公开
 * 面(见 `rpc/index.ts`);调用方经本工厂面向 {@link CoreAPI} 契约编程。
 */
export function createByfCore(
  rpcClient: CoreRPCClient,
  options: ByfCoreOptions = {},
): CoreEngineHandle {
  const core = new ByfCore(rpcClient, options);
  return { core, homeDir: core.homeDir, configPath: core.configPath };
}

export class ByfCore implements PromisableMethods<CoreAPI> {
  readonly sdk: Promise<SDKRPC>;
  readonly homeDir: string;
  readonly configPath: string;
  readonly sessions = new Map<string, Session>();
  readonly telemetry: TelemetryClient;

  private runtime: RuntimeConfig | undefined;
  private readonly userHomeDir: string;
  private readonly byfRequestHeaders: Record<string, string> | undefined;
  private readonly resolveOAuthTokenProvider: OAuthTokenProviderResolver | undefined;
  private readonly skillDirs: readonly string[];
  private readonly providerManager: ProviderManager;
  private readonly sessionStore: SessionStore;

  constructor(
    protected readonly rpcClient: CoreRPCClient,
    options: ByfCoreOptions = {},
  ) {
    this.homeDir = resolveByfHome(options.homeDir);
    this.userHomeDir = homedir();
    this.configPath = resolveConfigPath({
      homeDir: this.homeDir,
      configPath: options.configPath,
    });
    this.runtime = options.runtime;
    this.byfRequestHeaders = options.byfRequestHeaders;
    this.resolveOAuthTokenProvider = options.resolveOAuthTokenProvider;
    this.skillDirs = options.skillDirs ?? [];
    this.telemetry = noopTelemetryClient;
    ensureByfHome(this.homeDir);
    this.providerManager = new ProviderManager({
      config: readConfigFile(this.configPath),
      byfRequestHeaders: this.byfRequestHeaders,
      resolveOAuthTokenProvider: this.resolveOAuthTokenProvider,
    });
    this.sessionStore = new SessionStore(this.homeDir);

    this.sdk = rpcClient(this);
  }

  async createSession(input: CreateSessionPayload): Promise<SessionSummary> {
    const options = input;
    const workDir = requiredWorkDir('createSession', options.workDir);
    const config = this.reloadProviderManager();
    const id = options.id ?? createSessionId();
    const modelName = this.providerManager.resolveSelectedModel(options.model);
    const thinkingLevel = this.providerManager.resolveThinkingLevel(options.thinking);
    const permissionMode = options.permission ?? config.defaultPermissionMode;
    const mcpConfig = await resolveSessionMcpConfig({
      cwd: workDir,
      homeDir: this.homeDir,
    });
    const summary = await this.sessionStore.create({
      id,
      workDir,
    });
    const result: SessionSummary = {
      ...summary,
      metadata: options.metadata,
    };

    // Session ctor attaches its own log sink. If anything in the setup-after-
    // ctor block throws, `session.close()` releases the sink (and mcp).
    const session = new Session({
      runtime: await this.resolveRuntime(config),
      id,
      homedir: summary.sessionDir,
      byfHomeDir: this.homeDir,
      rpc: proxyWithExtraPayload(await this.sdk, { sessionId: summary.id }),
      cwd: workDir,
      additionalDirs: await this.resolveCreateSessionAdditionalDirs(
        workDir,
        options.additionalDirs,
      ),
      providerManager: this.providerManager,
      background: config.background,
      hooks: config.hooks,
      permissionRules: config.permission?.rules,
      skills: this.resolveSessionSkillConfig(config),
      mcpConfig,
      telemetry: this.telemetry,
    });
    try {
      session.metadata = {
        ...session.metadata,
        createdAt: new Date(summary.createdAt).toISOString(),
        updatedAt: new Date(summary.updatedAt).toISOString(),
        ...(summary.title !== undefined
          ? {
              title: summary.title,
              isCustomTitle: true,
            }
          : {}),
        custom: options.metadata === undefined ? {} : { ...options.metadata },
      };
      const mainAgent = await session.createMain();
      mainAgent.config.update({
        cwd: workDir,
        modelAlias: modelName,
        thinkingLevel,
      });
      if (permissionMode !== undefined) {
        mainAgent.permission.setMode(permissionMode);
      }
      await session.writeMetadata();
      await session.flushMetadata();
    } catch (error) {
      await session.close().catch(() => {});
      throw error;
    }
    this.sessions.set(id, session);
    return result;
  }

  getCoreInfo(): CoreInfo {
    return { version: getCoreVersion() };
  }

  async closeSession({ sessionId }: CloseSessionPayload): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.close();
      // keepAliveOnExit 语义：已关闭会话的后台任务可能仍在跑——保留 map
      // 条目，使 deleteSession 的 busy 判定仍能拦截（C3）。
      const hasRunning = Array.from(session.agents.values()).some(
        (agent) => agent.background.list(true).length > 0,
      );
      if (!hasRunning) {
        this.sessions.delete(sessionId);
      }
    }
  }

  async waitForBackgroundTasksOnPrint({ sessionId }: CloseSessionPayload): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      await session.waitForBackgroundTasksOnPrint();
    }
  }

  async addWorkspaceDir({
    sessionId,
    dir,
    persist,
  }: AddWorkspaceDirPayload): Promise<AddWorkspaceDirResult> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session.addWorkspaceDir(dir, { persist });
  }

  getWorkspaceRoots({ sessionId }: CloseSessionPayload): AddWorkspaceDirResult {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    return session.getWorkspaceRoots();
  }

  async resumeSession(input: ResumeSessionPayload): Promise<ResumeSessionResult> {
    const summary = await this.sessionStore.get(input.sessionId);
    const active = this.sessions.get(summary.id);
    if (active !== undefined) {
      return resumeSessionResult(summary, active);
    }

    const config = this.reloadProviderManager();
    const mcpConfig = await resolveSessionMcpConfig({
      cwd: summary.workDir,
      homeDir: this.homeDir,
    });
    const session = new Session({
      runtime: await this.resolveRuntime(config),
      id: summary.id,
      homedir: summary.sessionDir,
      byfHomeDir: this.homeDir,
      rpc: proxyWithExtraPayload(await this.sdk, { sessionId: summary.id }),
      cwd: summary.workDir,
      providerManager: this.providerManager,
      background: config.background,
      hooks: config.hooks,
      permissionRules: config.permission?.rules,
      skills: this.resolveSessionSkillConfig(config),
      mcpConfig,
      telemetry: this.telemetry,
      initializeMainAgent: false,
    });
    let warning: string | undefined;
    try {
      const resumeResult = await session.resume();
      warning = resumeResult.warning;
      await this.refreshSessionRuntimeConfig(session, config);
    } catch (error) {
      await session.close().catch(() => {});
      throw error;
    }
    this.sessions.set(summary.id, session);
    return resumeSessionResult(summary, session, warning);
  }

  async forkSession(input: ForkSessionPayload): Promise<ResumeSessionResult> {
    const source = await this.sessionStore.get(input.sessionId);
    const active = this.sessions.get(source.id);
    if (active !== undefined) {
      await active.flushMetadata();
    }

    const id = input.id ?? createSessionId();
    await this.sessionStore.fork({
      sourceId: source.id,
      targetId: id,
      title: input.title,
      metadata: input.metadata,
      upToMessage: input.upToMessage,
    });
    return this.resumeSession({ sessionId: id });
  }

  async listSessions(input: ListSessionsPayload): Promise<readonly SessionSummary[]> {
    const options = input;
    return this.sessionStore.list({
      ...options,
      workDir: requiredWorkDir('listSessions', options.workDir),
    });
  }

  // ── Inspector（PRD-0035 R-A2）────────────────────────────────────────────
  // 只读投影走 `session/inspector`（core 内部单一实现，web/TUI/headless 经
  // SDK 复用；web-server 不直接 import core，见 ADR 0006/0037）。

  async listInspectableSessions(): Promise<readonly InspectorSessionSummary[]> {
    return inspector.listInspectableSessions(this.homeDir);
  }

  async readSessionInspection(input: {
    readonly sessionId: string;
  }): Promise<SessionDetail | null> {
    return inspector.readSessionDetail(this.homeDir, input.sessionId);
  }

  async readAgentWire(input: ReadAgentWirePayload): Promise<WireResponse> {
    const sessionDir = await this.sessionStore.assertDirectory(input.sessionId);
    if (!inspector.isSafeAgentId(input.agentId)) {
      throw new ByfError(ErrorCodes.AGENT_NOT_FOUND, `Agent "${input.agentId}" not found`);
    }
    const wirePath = join(sessionDir, 'agents', input.agentId, 'wire.jsonl');
    let result: Awaited<ReturnType<typeof inspector.readAgentWire>>;
    try {
      result = await inspector.readAgentWire(wirePath);
    } catch (error) {
      throw new ByfError(
        ErrorCodes.RECORDS_READ_FAILED,
        `Cannot read wire for agent "${input.agentId}" in session "${input.sessionId}"`,
        { cause: error },
      );
    }
    return {
      sessionId: input.sessionId,
      agentId: input.agentId,
      protocolVersion: result.metadata.protocolVersion,
      metadata: result.metadata,
      records: result.records,
      warnings: result.warnings,
    };
  }

  async readContextProjection(input: ReadContextProjectionPayload): Promise<ContextProjection> {
    const wire = await this.readAgentWire(input);
    return inspector.projectContext(wire.records);
  }

  async readAgentTree(input: { readonly sessionId: string }): Promise<AgentTreeResponse> {
    const detail = await inspector.readSessionDetail(this.homeDir, input.sessionId);
    if (detail === null) {
      throw new ByfError(
        ErrorCodes.SESSION_NOT_FOUND,
        `Session "${input.sessionId}" was not found`,
      );
    }
    return { sessionId: input.sessionId, tree: inspector.buildAgentTree(detail.agents) };
  }

  async deleteSession(input: DeleteSessionPayload): Promise<void> {
    // busy 判定（PRD-0035 Q5 /grill 决议）：live Session 实例或运行中后台任务
    // 都拒删。后台任务挂在 Session 实例上；close 会 stopAll，但
    // keepAliveOnExit 语义下已关闭会话的任务可能仍在跑——必须显式检查。
    // map 条目 = live（未 close）或已 close 但仍跑后台任务（closeSession
    // 保留）——两者都拒删（Q5 /grill 决议：live Session 实例或运行中后台任务）。
    if (this.sessions.has(input.sessionId)) {
      const session = this.sessions.get(input.sessionId)!;
      const hasRunning = Array.from(session.agents.values()).some(
        (agent) => agent.background.list(true).length > 0,
      );
      throw new ByfError(
        ErrorCodes.SESSION_BUSY,
        hasRunning
          ? `Session "${input.sessionId}" has running background tasks — stop them before deleting`
          : `Session "${input.sessionId}" is live (resumed) — close it before deleting`,
      );
    }
    await this.sessionStore.delete(input.sessionId);
  }

  // ── ConfigDocument（PRD-0035 R-A3/A4、ADR-0038）──────────────────────────

  async getConfigDocument(): Promise<ConfigDocumentResult> {
    const doc = await configDocument.readConfigDocument(this.configPath);
    return { path: doc.path, text: doc.text, revision: doc.revision, parsed: doc.parsed };
  }

  async validateConfigText(input: ValidateConfigTextPayload): Promise<ConfigValidationResult> {
    return configDocument.validateConfigText(input.text, this.configPath);
  }

  async writeConfigText(input: WriteConfigTextPayload): Promise<ConfigWriteResult> {
    return configDocument.writeConfigDocument(this.configPath, input.text, input.expectedRevision);
  }

  // ── WorkspaceRegistry（PRD-0035 R-A6 / ADR-0037 D3）──────────────────────

  async listWorkspaces(): Promise<string[]> {
    return this.workspaceRegistry().list();
  }

  async hiddenWorkspaces(): Promise<string[]> {
    return this.workspaceRegistry().hidden();
  }

  async addWorkspace(input: AddWorkspacePayload): Promise<string[]> {
    return this.workspaceRegistry().add(input.workDir);
  }

  async removeWorkspace(input: RemoveWorkspacePayload): Promise<boolean> {
    return this.workspaceRegistry().remove(input.workDir);
  }

  // ── MCP config store(PRD-0036 / ADR-0039)────────────────────────────────

  async listMcpServerConfigs(input: ListMcpServerConfigsPayload): Promise<McpConfigListing> {
    const workDir = requiredWorkDir('listMcpServerConfigs', input.workDir);
    return mcpConfigStore.listMcpConfigs({ cwd: workDir, homeDir: this.homeDir });
  }

  async readMcpConfigRaw(input: ReadMcpRawPayload): Promise<McpRawDocument> {
    const workDir = requiredWorkDir('readMcpConfigRaw', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.readMcpRaw({
      cwd: workDir,
      homeDir: this.homeDir,
      scope: input.scope,
    });
  }

  async upsertMcpServerConfig(input: UpsertMcpServerConfigPayload): Promise<McpScopeState> {
    const workDir = requiredWorkDir('upsertMcpServerConfig', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.upsertMcpServer({
      cwd: workDir,
      homeDir: this.homeDir,
      scope: input.scope,
      name: input.name,
      config: input.config,
    });
  }

  async removeMcpServerConfig(input: RemoveMcpServerConfigPayload): Promise<McpScopeState> {
    const workDir = requiredWorkDir('removeMcpServerConfig', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.removeMcpServer({
      cwd: workDir,
      homeDir: this.homeDir,
      scope: input.scope,
      name: input.name,
    });
  }

  async writeMcpConfigRaw(input: WriteMcpRawPayload): Promise<McpRawDocument> {
    const workDir = requiredWorkDir('writeMcpConfigRaw', input.workDir);
    mcpConfigStore.assertMcpConfigScope(input.scope);
    return mcpConfigStore.writeMcpRaw({
      cwd: workDir,
      homeDir: this.homeDir,
      scope: input.scope,
      text: input.text,
    });
  }

  // ── Workspace skills(PRD-0036)────────────────────────────────────────────

  async listWorkspaceSkills(input: ListWorkspaceSkillsPayload): Promise<WorkspaceSkillListing> {
    const workDir = requiredWorkDir('listWorkspaceSkills', input.workDir);
    const config = this.reloadProviderManager();
    return skillStore.listWorkspaceSkills({
      workDir,
      userHomeDir: this.userHomeDir,
      extraDirs: config.extraSkillDirs,
      mergeAllAvailableSkills: config.mergeAllAvailableSkills,
    });
  }

  private workspaceRegistry(): WorkspaceRegistry {
    return new WorkspaceRegistry(this.homeDir);
  }

  async renameSession({ sessionId, ...payload }: RenameSessionRequest): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) {
      await new SessionAPIImpl(session).renameSession(payload);
      return;
    }
    await this.sessionStore.rename(sessionId, payload.title);
  }

  async updateSessionMetadata({
    sessionId,
    ...payload
  }: UpdateSessionMetadataRequest): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session !== undefined) {
      await new SessionAPIImpl(session).updateSessionMetadata(payload);
      return;
    }
    await this.sessionStore.updateMetadata(sessionId, payload.metadata);
  }

  async exportSession(input: ExportSessionPayload): Promise<ExportSessionResult> {
    const summary = await this.sessionStore.get(input.sessionId);
    const active = this.sessions.get(input.sessionId);
    // Closed sessions have no `Session.log`; create an ad-hoc child bound to
    // their id so the entries still route to the session log file.
    const exportLog = active?.log ?? log.createChild({ sessionId: input.sessionId });
    if (active !== undefined) {
      try {
        await active.flushMetadata();
      } catch (error) {
        exportLog.warn('flushMetadata failed before export', { error });
      }
    }
    await warnIfLogFlushFails(exportLog, 'export session log flush failed', () =>
      getRootLogger().flushSession(input.sessionId),
    );
    if (input.includeGlobalLog === true) {
      await warnIfLogFlushFails(exportLog, 'export global log flush failed', () =>
        getRootLogger().flushGlobal(),
      );
    }
    const result = await exportSessionDirectory({
      request: input,
      summary,
      homeDir: this.homeDir,
      globalLogPath: getRootLogger().getConfig()?.globalLogPath,
    });
    return result;
  }

  async getByfConfig(input: EmptyPayload = {}): Promise<ByfConfig> {
    void input;
    return readConfigFile(this.configPath);
  }

  async setByfConfig(input: SetByfConfigPayload): Promise<ByfConfig> {
    const config = mergeConfigPatch(readConfigFile(this.configPath), input);
    await writeConfigFile(this.configPath, config);
    const updated = readConfigFile(this.configPath);
    this.providerManager.updateConfig(updated);
    return updated;
  }

  async removeByfProvider(input: RemoveByfProviderPayload): Promise<ByfConfig> {
    const config = readConfigFile(this.configPath);
    delete config.providers[input.providerId];

    let removedDefault = false;
    const existingModels = config.models ?? {};
    for (const [key, model] of Object.entries(existingModels)) {
      if (
        typeof model === 'object' &&
        model !== null &&
        !Array.isArray(model) &&
        model['provider'] === input.providerId
      ) {
        delete existingModels[key];
        if (config.defaultModel === key) removedDefault = true;
      }
    }
    config.models = existingModels;

    if (removedDefault) {
      config.defaultModel = undefined;
    }

    if (config.defaultProvider === input.providerId) {
      config.defaultProvider = undefined;
    }

    await writeConfigFile(this.configPath, config);
    const updated = readConfigFile(this.configPath);
    this.providerManager.updateConfig(updated);
    return updated;
  }

  /** PRD-0034 R-D3:删除模型别名(deepMerge 无法删键,镜像 removeByfProvider)。 */
  async removeByfModel(input: RemoveByfModelPayload): Promise<ByfConfig> {
    const config = readConfigFile(this.configPath);
    const existingModels = config.models ?? {};
    if (!(input.modelId in existingModels)) {
      throw new ByfError(ErrorCodes.MODEL_CONFIG_INVALID, `Unknown model alias: ${input.modelId}`);
    }
    delete existingModels[input.modelId];
    config.models = existingModels;
    if (config.defaultModel === input.modelId) {
      config.defaultModel = undefined;
    }
    await writeConfigFile(this.configPath, config);
    const updated = readConfigFile(this.configPath);
    this.providerManager.updateConfig(updated);
    return updated;
  }

  /**
   * 按模型别名解析合并能力(别名 capabilities ∪ provider 注册表),供 Web
   * 模型编辑器预填勾选。validateCredentials=false:只看能力面,不要求凭据。
   */
  async resolveModelCapabilities(
    input: ResolveModelCapabilitiesPayload,
  ): Promise<ResolvedModelCapabilities> {
    this.reloadProviderManager();
    const resolved = this.providerManager.resolveProviderConfigForModel(input.model);
    if (resolved === undefined) {
      throw new ByfError(ErrorCodes.MODEL_CONFIG_INVALID, `Unknown model alias: ${input.model}`);
    }
    const caps = resolved.modelCapabilities;
    return {
      image_in: caps.image_in,
      video_in: caps.video_in,
      audio_in: caps.audio_in,
      tool_use: caps.tool_use,
      thinking: caps.thinking,
      thinking_effort: caps.thinking_effort,
      thinking_xhigh: caps.thinking_xhigh,
      thinking_max: caps.thinking_max,
    };
  }

  prompt({ sessionId, ...payload }: SessionAgentPayload<PromptPayload>) {
    return this.sessionApi(sessionId).prompt(payload);
  }

  steer({ sessionId, ...payload }: SessionAgentPayload<SteerPayload>) {
    return this.sessionApi(sessionId).steer(payload);
  }

  askSide({ sessionId, ...payload }: SessionAgentPayload<AskSidePayload>) {
    return this.sessionApi(sessionId).askSide(payload);
  }

  cancelSideQuery({ sessionId, ...payload }: SessionAgentPayload<CancelSideQueryPayload>) {
    return this.sessionApi(sessionId).cancelSideQuery(payload);
  }

  cancel({ sessionId, ...payload }: SessionAgentPayload<CancelPayload>) {
    return this.sessionApi(sessionId).cancel(payload);
  }

  async setModel({
    sessionId,
    ...payload
  }: SessionAgentPayload<SetModelPayload>): Promise<SetModelResult> {
    this.reloadProviderManager();
    return this.sessionApi(sessionId).setModel(payload);
  }

  setThinking({ sessionId, ...payload }: SessionAgentPayload<SetThinkingPayload>) {
    return this.sessionApi(sessionId).setThinking(payload);
  }

  setPermission({ sessionId, ...payload }: SessionAgentPayload<SetPermissionPayload>) {
    return this.sessionApi(sessionId).setPermission(payload);
  }

  createGoal({ sessionId, ...payload }: SessionAgentPayload<CreateGoalPayload>) {
    return this.sessionApi(sessionId).createGoal(payload);
  }

  getGoal({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getGoal(payload);
  }

  pauseGoal({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).pauseGoal(payload);
  }

  resumeGoal({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).resumeGoal(payload);
  }

  cancelGoal({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).cancelGoal(payload);
  }

  getCronTasks({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getCronTasks(payload);
  }

  deleteCronTask({ sessionId, ...payload }: SessionAgentPayload<DeleteCronTaskPayload>) {
    return this.sessionApi(sessionId).deleteCronTask(payload);
  }

  getModel({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getModel(payload);
  }

  beginCompaction({ sessionId, ...payload }: SessionAgentPayload<BeginCompactionPayload>) {
    return this.sessionApi(sessionId).beginCompaction(payload);
  }

  cancelCompaction({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).cancelCompaction(payload);
  }

  registerTool({ sessionId, ...payload }: SessionAgentPayload<RegisterToolPayload>) {
    return this.sessionApi(sessionId).registerTool(payload);
  }

  unregisterTool({ sessionId, ...payload }: SessionAgentPayload<UnregisterToolPayload>) {
    return this.sessionApi(sessionId).unregisterTool(payload);
  }

  setActiveTools({ sessionId, ...payload }: SessionAgentPayload<SetActiveToolsPayload>) {
    return this.sessionApi(sessionId).setActiveTools(payload);
  }

  stopBackground({ sessionId, ...payload }: SessionAgentPayload<StopBackgroundPayload>) {
    return this.sessionApi(sessionId).stopBackground(payload);
  }

  clearContext({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).clearContext(payload);
  }

  activateSkill({
    sessionId,
    ...payload
  }: SessionAgentPayload<ActivateSkillPayload>): Promise<void> {
    return this.sessionApi(sessionId).activateSkill(payload);
  }

  getBackgroundOutput({ sessionId, ...payload }: SessionAgentPayload<GetBackgroundOutputPayload>) {
    return this.sessionApi(sessionId).getBackgroundOutput(payload);
  }

  getBackgroundOutputPath({
    sessionId,
    ...payload
  }: SessionAgentPayload<GetBackgroundOutputPathPayload>) {
    return this.sessionApi(sessionId).getBackgroundOutputPath(payload);
  }

  getContext({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getContext(payload);
  }

  getConfig({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getConfig(payload);
  }

  getPermission({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getPermission(payload);
  }

  getUsage({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getUsage(payload);
  }

  getTools({ sessionId, ...payload }: SessionAgentPayload<EmptyPayload>) {
    return this.sessionApi(sessionId).getTools(payload);
  }

  getBackground({ sessionId, ...payload }: SessionAgentPayload<GetBackgroundPayload>) {
    return this.sessionApi(sessionId).getBackground(payload);
  }

  getSessionMetadata({ sessionId, ...payload }: SessionScopedPayload<EmptyPayload>): SessionMeta {
    return this.sessionApi(sessionId).getSessionMetadata(payload);
  }

  listSkills({
    sessionId,
    ...payload
  }: SessionScopedPayload<EmptyPayload>): Promise<readonly SkillSummary[]> {
    return this.sessionApi(sessionId).listSkills(payload);
  }

  listMcpServers({
    sessionId,
    ...payload
  }: SessionScopedPayload<EmptyPayload>): readonly McpServerInfo[] {
    return this.sessionApi(sessionId).listMcpServers(payload);
  }

  getMcpStartupMetrics({
    sessionId,
    ...payload
  }: SessionScopedPayload<EmptyPayload>): Promise<McpStartupMetrics> {
    return this.sessionApi(sessionId).getMcpStartupMetrics(payload);
  }

  reconnectMcpServer({
    sessionId,
    ...payload
  }: SessionScopedPayload<ReconnectMcpServerPayload>): Promise<void> {
    return this.sessionApi(sessionId).reconnectMcpServer(payload);
  }

  generateAgentsMd({ sessionId, ...payload }: SessionScopedPayload<EmptyPayload>): Promise<void> {
    return this.sessionApi(sessionId).generateAgentsMd(payload);
  }

  shellExec({
    sessionId,
    ...payload
  }: SessionScopedPayload<Omit<ShellExecPayload, 'sessionId'>>): Promise<ShellExecResult> {
    return this.sessionApi(sessionId).shellExec(payload);
  }

  private async resolveRuntime(config: ByfConfig): Promise<RuntimeConfig> {
    if (this.runtime !== undefined) return this.runtime;
    const runtime = await createRuntimeConfig({
      config,
      byfRequestHeaders: this.byfRequestHeaders,
      resolveOAuthTokenProvider: this.resolveOAuthTokenProvider,
    });
    this.runtime = runtime;
    return runtime;
  }

  private resolveSessionSkillConfig(config: ByfConfig): SessionSkillConfig {
    const explicitDirs = this.skillDirs.length > 0 ? this.skillDirs : undefined;
    return {
      userHomeDir: this.userHomeDir,
      explicitDirs,
      extraDirs: config.extraSkillDirs,
      mergeAllAvailableSkills: config.mergeAllAvailableSkills,
    };
  }

  /**
   * Merge `.byf/local.toml` workspace.additional_dir with caller `--add-dir`
   * paths (PRD-0023 R5.2 / R5.4). Local config loads first; CLI flags append.
   */
  private async resolveCreateSessionAdditionalDirs(
    workDir: string,
    callerDirs: readonly string[] | undefined,
  ): Promise<readonly string[] | undefined> {
    const runtime = this.runtime ?? (await this.resolveRuntime(this.reloadProviderManager()));
    const local = await readWorkspaceAdditionalDirs(runtime.kaos, workDir);
    const caller =
      callerDirs !== undefined && callerDirs.length > 0
        ? await resolveWorkspaceAdditionalDirs(runtime.kaos, workDir, callerDirs)
        : [];
    const merged = normalizeAdditionalDirs([...local.additionalDirs, ...caller]);
    return merged.length > 0 ? merged : undefined;
  }

  private sessionApi(sessionId: string): SessionAPIImpl {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      throw new ByfError(ErrorCodes.SESSION_NOT_FOUND, `Session "${sessionId}" was not found`, {
        details: { sessionId },
      });
    }
    return new SessionAPIImpl(session);
  }

  private reloadProviderManager(): ByfConfig {
    const config = readConfigFile(this.configPath);
    this.providerManager.updateConfig(config);
    return config;
  }

  private async refreshSessionRuntimeConfig(session: Session, config: ByfConfig): Promise<void> {
    const api = new SessionAPIImpl(session);
    // A session migrated from an external tool carries no model, and any
    // session may reference a model alias that no longer exists in config.toml.
    // Try the session's own model first, then fall back to the configured
    // default, so resume degrades gracefully instead of hard-failing.
    const requested = (await api.getModel({ agentId: 'main' })).trim();
    const fallback = config.defaultModel?.trim() ?? '';
    const candidates = [...new Set([requested, fallback].filter((model) => model.length > 0))];
    for (const model of candidates) {
      try {
        await api.setModel({ agentId: 'main', model });
        await session.flushMetadata();
        return;
      } catch (error) {
        // Skip a candidate only when the alias is genuinely absent from
        // config (a stale or migrated model) — that is the graceful-degrade
        // case. A *configured* alias that fails to resolve (missing provider,
        // no credentials, bad max_context_size) is an actionable config error
        // the user must see; surface it instead of silently swapping models.
        const aliasMissing = config.models?.[model] === undefined;
        if (aliasMissing && error instanceof ByfError && error.code === ErrorCodes.CONFIG_INVALID) {
          continue;
        }
        throw error;
      }
    }
    // No candidate resolved (the replayed alias and the configured default are
    // both invalid/unset). Clear the stale alias so the session is honestly
    // model-less — the TUI then prompts for a model instead of showing a
    // selection whose next prompt fails with a config error. Not persisted:
    // `refreshSessionRuntimeConfig` re-derives this on every resume.
    if (requested.length > 0) {
      session.agents.get('main')?.config.update({ modelAlias: undefined });
    }
  }
}

async function createRuntimeConfig(input: {
  readonly config: ByfConfig;
  readonly byfRequestHeaders?: Record<string, string>;
  readonly resolveOAuthTokenProvider?: OAuthTokenProviderResolver;
}): Promise<RuntimeConfig> {
  const proxiedFetch = createProxiedFetch({
    envLookup: (key) => process.env[key],
    systemProxy: () => detectSystemProxy(),
  });
  const localFetcher = new LocalFetchURLProvider({ fetchImpl: proxiedFetch });
  const fetchService = input.config.services?.fetchUrl;
  const webSearchConfig = input.config.services?.webSearch;

  return {
    kaos: localKaos,
    osEnv: await detectEnvironmentFromNode(),
    fetch: proxiedFetch,
    urlFetcher:
      fetchService?.baseUrl === undefined
        ? localFetcher
        : new RemoteFetchURLProvider({
            baseUrl: fetchService.baseUrl,
            localFallback: localFetcher,
            defaultHeaders: input.byfRequestHeaders,
            fetchImpl: proxiedFetch,
            ...serviceCredentials(fetchService, input.resolveOAuthTokenProvider),
          }),
    webSearcher:
      webSearchConfig === undefined
        ? undefined
        : (() => {
            const sorted = [...webSearchConfig.providers].toSorted(
              (a, b) => a.priority - b.priority,
            );
            return new PriorityRouter(
              sorted.map((p) =>
                createProvider(p.type, {
                  apiKeys: p.apiKeys,
                  baseUrl: p.baseUrl,
                  fetchImpl: proxiedFetch,
                }),
              ),
            );
          })(),
  };
}

function serviceCredentials(
  service: ByfServiceConfig,
  resolveOAuthTokenProvider: OAuthTokenProviderResolver | undefined,
): {
  readonly apiKey?: string;
  readonly tokenProvider?: BearerTokenProvider;
  readonly customHeaders?: Record<string, string>;
} {
  const apiKey = nonEmptyString(service.apiKey);
  return {
    apiKey,
    tokenProvider:
      service.oauth !== undefined
        ? resolveOAuthTokenProvider?.(BYF_CODE_PROVIDER_NAME, service.oauth)
        : undefined,
    customHeaders: service.customHeaders,
  };
}

function nonEmptyString(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function requiredWorkDir(operation: string, value: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ByfError(ErrorCodes.REQUEST_WORK_DIR_REQUIRED, `${operation} requires workDir`);
  }
  return normalizeWorkDir(value);
}

function createSessionId(): string {
  return `session_${randomUUID()}`;
}

async function resumeSessionResult(
  summary: SessionSummary,
  session: Session,
  warning?: string,
): Promise<ResumeSessionResult> {
  const api = new SessionAPIImpl(session);
  const agents: Record<string, ResumedAgentState> = {};
  for (const [agentId, agent] of session.agents) {
    const config = await api.getConfig({ agentId });
    const context = await api.getContext({ agentId });
    const permission = await api.getPermission({ agentId });
    const usage = await api.getUsage({ agentId });
    agents[agentId] = {
      type: agent.type,
      config,
      context,
      replay: agent.replayBuilder.buildResult(),
      permission,
      usage,
      tools: await api.getTools({ agentId }),
      toolStore: agent.tools.storeData(),
      background: agent.background.list(false),
      parentToolCallId: session.metadata.agents[agentId]?.parentToolCallId,
      // Only the main agent ever holds a goal; non-main agents pass null.
      goal: agent.type === 'main' ? agent.goal.getSnapshot() : null,
    };
  }
  return {
    ...summary,
    sessionMetadata: api.getSessionMetadata({}),
    agents,
    warning,
  };
}

async function warnIfLogFlushFails(
  exportLog: Logger,
  message: string,
  flush: () => Promise<boolean>,
): Promise<void> {
  try {
    if (await flush()) return;
    exportLog.warn(message);
  } catch (error) {
    exportLog.warn(message, { error });
  }
  try {
    await flush();
  } catch {}
}
