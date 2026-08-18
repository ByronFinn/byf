import {
  ensureConfigFile,
  ErrorCodes,
  ByfError,
  getRootLogger,
  resolveConfigPath,
  resolveByfHome,
  resolveLoggingConfig,
} from '@byfriends/agent-core';
import type {
  ConfigDocumentResult,
  ConfigValidationResult,
  ConfigWriteResult,
  McpConfigListing,
  McpConfigScope,
  McpRawDocument,
  McpScopeState,
  WorkspaceSkillListing,
} from '@byfriends/agent-core';
import type {
  AgentTreeResponse,
  ContextProjection,
  InspectorSessionSummary,
  SessionDetail,
  WireResponse,
} from '@byfriends/agent-core/session/inspector';

import { ByfAuthFacade } from '#/auth';
import { SDKRpcClient } from '#/rpc';
import { Session } from '#/session';
import type {
  CreateSessionOptions,
  ExportSessionInput,
  ExportSessionResult,
  ForkSessionInput,
  GetConfigOptions,
  ByfConfig,
  ByfConfigPatch,
  ByfHarnessOptions,
  ListSessionsOptions,
  RenameSessionInput,
  ResumeSessionInput,
  ResolvedModelCapabilities,
  ShellExecResult,
  UpdateSessionMetadataInput,
  SessionSummary,
} from '#/types';

export class ByfHarness {
  readonly homeDir: string;
  readonly configPath: string;
  readonly auth: ByfAuthFacade;

  private readonly identity:
    | { readonly userAgentProduct: string; readonly version: string }
    | undefined;
  private readonly uiMode: string;
  private readonly activeSessions = new Map<string, Session>();
  private readonly rpc: SDKRpcClient;

  constructor(options: ByfHarnessOptions) {
    this.identity = options.identity;
    this.uiMode = options.uiMode ?? DEFAULT_SESSION_STARTED_UI_MODE;
    this.homeDir = resolveByfHome(options.homeDir);
    this.configPath = resolveConfigPath({
      homeDir: this.homeDir,
      configPath: options.configPath,
    });
    this.configureLogging();
    this.auth = new ByfAuthFacade({
      homeDir: this.homeDir,
      configPath: this.configPath,
    });
    this.rpc = new SDKRpcClient({
      homeDir: options.homeDir,
      configPath: this.configPath,
      skillDirs: options.skillDirs,
      runtime: options.runtime,
    });
  }

  private configureLogging(): void {
    void getRootLogger().configure(resolveLoggingConfig({ homeDir: this.homeDir }));
  }

  get sessions(): ReadonlyMap<string, Session> {
    return this.activeSessions;
  }

  get interactiveAgentId(): string {
    return this.rpc.interactiveAgentId;
  }

  set interactiveAgentId(agentId: string) {
    this.rpc.interactiveAgentId = agentId;
  }

  track(_event: string, _properties?: Record<string, unknown>): void {
    // No-op: telemetry has been removed.
  }

  async createSession(options: CreateSessionOptions): Promise<Session> {
    const summary = await this.rpc.createSession(options);
    const session = new Session({
      id: summary.id,
      workDir: summary.workDir,
      summary,
      rpc: this.rpc,
      onClose: () => {
        this.activeSessions.delete(summary.id);
      },
    });
    this.activeSessions.set(session.id, session);
    return session;
  }

  async resumeSession(input: ResumeSessionInput): Promise<Session> {
    const id = normalizeSessionId(input.id);
    const active = this.activeSessions.get(id);
    if (active !== undefined) {
      // live 会话:core active 路径现场重建 replay(config/replayBuilder 均最新),
      // 刷新快照后返回同一实例——不重复 attach onEvent,也不返回创建时旧快照
      // (PRD-0035 Chat 空回归)。
      active.refreshSummary(await this.rpc.resumeSession({ id }));
      return active;
    }

    const summary = await this.rpc.resumeSession({ id });
    const session = new Session({
      id: summary.id,
      workDir: summary.workDir,
      summary,
      rpc: this.rpc,
      onClose: () => {
        this.activeSessions.delete(summary.id);
      },
    });
    this.activeSessions.set(session.id, session);
    return session;
  }

  async forkSession(input: ForkSessionInput): Promise<Session> {
    const summary = await this.rpc.forkSession({
      id: normalizeSessionId(input.id),
      forkId: input.forkId,
      title: input.title,
      metadata: input.metadata,
      upToMessage: input.upToMessage,
    });
    const session = new Session({
      id: summary.id,
      workDir: summary.workDir,
      summary,
      rpc: this.rpc,
      onClose: () => {
        this.activeSessions.delete(summary.id);
      },
    });
    this.activeSessions.set(session.id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.activeSessions.get(id);
  }

  async closeSession(id: string): Promise<void> {
    await this.activeSessions.get(id)?.close();
  }

  async renameSession(input: RenameSessionInput): Promise<void> {
    await this.rpc.renameSession(input);
    this.activeSessions.get(input.id)?.emitMetaUpdated({ title: input.title });
  }

  async updateSessionMetadata(input: UpdateSessionMetadataInput): Promise<void> {
    await this.rpc.updateSessionMetadata(input);
    this.activeSessions.get(input.id)?.emitMetaUpdated(input.metadata);
  }

  async exportSession(input: ExportSessionInput): Promise<ExportSessionResult> {
    const result = await this.rpc.exportSession({
      ...input,
      version: input.version ?? this.identity?.version,
    });
    return result;
  }

  async listSessions(options: ListSessionsOptions): Promise<readonly SessionSummary[]> {
    return this.rpc.listSessions(options);
  }

  // ── Inspector（PRD-0035 R-A2）────────────────────────────────────────────

  async listInspectableSessions(): Promise<readonly InspectorSessionSummary[]> {
    return this.rpc.listInspectableSessions();
  }

  async readSessionInspection(sessionId: string): Promise<SessionDetail | null> {
    return this.rpc.readSessionInspection({ sessionId });
  }

  async readAgentWire(sessionId: string, agentId: string): Promise<WireResponse> {
    return this.rpc.readAgentWire({ sessionId, agentId });
  }

  async readContextProjection(sessionId: string, agentId: string): Promise<ContextProjection> {
    return this.rpc.readContextProjection({ sessionId, agentId });
  }

  async readAgentTree(sessionId: string): Promise<AgentTreeResponse> {
    return this.rpc.readAgentTree({ sessionId });
  }

  /** 删除会话目录并重建 index；live/busy 抛 SESSION_BUSY。 */
  async deleteSession(sessionId: string): Promise<void> {
    return this.rpc.deleteSession(sessionId);
  }

  // ── ConfigDocument（PRD-0035 R-A3/A4、ADR-0038）──────────────────────────

  async getConfigDocument(): Promise<ConfigDocumentResult> {
    return this.rpc.getConfigDocument();
  }

  async validateConfigText(text: string): Promise<ConfigValidationResult> {
    return this.rpc.validateConfigText(text);
  }

  async writeConfigText(text: string, expectedRevision: string | null): Promise<ConfigWriteResult> {
    return this.rpc.writeConfigText(text, expectedRevision);
  }

  // ── WorkspaceRegistry（PRD-0035 R-A6）────────────────────────────────────

  async listWorkspaces(): Promise<string[]> {
    return this.rpc.listWorkspaces();
  }

  async hiddenWorkspaces(): Promise<string[]> {
    return this.rpc.hiddenWorkspaces();
  }

  async addWorkspace(workDir: string): Promise<string[]> {
    return this.rpc.addWorkspace(workDir);
  }

  async removeWorkspace(workDir: string): Promise<boolean> {
    return this.rpc.removeWorkspace(workDir);
  }

  // ── MCP config store(PRD-0036 / ADR-0039)────────────────────────────────

  async listMcpServerConfigs(workDir: string): Promise<McpConfigListing> {
    return this.rpc.listMcpServerConfigs(workDir);
  }

  async readMcpConfigRaw(workDir: string, scope: McpConfigScope): Promise<McpRawDocument> {
    return this.rpc.readMcpConfigRaw(workDir, scope);
  }

  async upsertMcpServerConfig(
    workDir: string,
    scope: McpConfigScope,
    name: string,
    config: Record<string, unknown>,
  ): Promise<McpScopeState> {
    return this.rpc.upsertMcpServerConfig(workDir, scope, name, config);
  }

  async removeMcpServerConfig(
    workDir: string,
    scope: McpConfigScope,
    name: string,
  ): Promise<McpScopeState> {
    return this.rpc.removeMcpServerConfig(workDir, scope, name);
  }

  async writeMcpConfigRaw(
    workDir: string,
    scope: McpConfigScope,
    text: string,
  ): Promise<McpRawDocument> {
    return this.rpc.writeMcpConfigRaw(workDir, scope, text);
  }

  // ── Workspace skills(PRD-0036)────────────────────────────────────────────

  async listWorkspaceSkills(workDir: string): Promise<WorkspaceSkillListing> {
    return this.rpc.listWorkspaceSkills(workDir);
  }

  async getConfig(options: GetConfigOptions = {}): Promise<ByfConfig> {
    return this.rpc.getConfig(options);
  }

  async ensureConfigFile(): Promise<void> {
    await ensureConfigFile(this.configPath);
  }

  async setConfig(patch: ByfConfigPatch): Promise<ByfConfig> {
    return this.rpc.setConfig(patch);
  }

  async removeModel(modelId: string): Promise<ByfConfig> {
    return this.rpc.removeModel(modelId);
  }

  async removeProvider(providerId: string): Promise<ByfConfig> {
    return this.rpc.removeProvider(providerId);
  }

  /** 按模型别名解析合并能力(别名标签 ∪ 注册表),供 Web 编辑器预填。 */
  async resolveModelCapabilities(model: string): Promise<ResolvedModelCapabilities> {
    return this.rpc.resolveModelCapabilities(model);
  }

  async shellExec(
    command: string,
    options: { cwd?: string; timeout?: number } = {},
  ): Promise<ShellExecResult> {
    const normalizedCommand = command.trim();
    if (normalizedCommand.length === 0) {
      throw new ByfError(ErrorCodes.REQUEST_INVALID, 'Shell command cannot be empty.');
    }
    const session = this.firstActiveSession();
    if (session === undefined) {
      throw new ByfError(
        ErrorCodes.SESSION_NOT_FOUND,
        'No active session. Start or resume a session first.',
      );
    }
    const cwd = options.cwd ?? session.workDir;
    return this.rpc.shellExec({
      sessionId: session.id,
      command: normalizedCommand,
      cwd,
      timeout: options.timeout,
    });
  }

  async close(): Promise<void> {
    await Promise.all(Array.from(this.activeSessions.values(), (session) => session.close()));
    try {
      await getRootLogger().flush();
    } catch {
      // never let logger flush block process exit
    }
  }

  private firstActiveSession(): Session | undefined {
    return this.activeSessions.values().next().value;
  }
}

const DEFAULT_SESSION_STARTED_UI_MODE = 'shell';

function normalizeSessionId(value: string): string {
  if (typeof value !== 'string') {
    throw new ByfError(ErrorCodes.SESSION_ID_REQUIRED, 'Session id is required.');
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ByfError(ErrorCodes.SESSION_ID_EMPTY, 'Session id cannot be empty.');
  }
  return normalized;
}
