import {
  ensureConfigFile,
  ErrorCodes,
  ByfError,
  getRootLogger,
  noopTelemetryClient,
  resolveConfigPath,
  resolveByfHome,
  resolveLoggingConfig,
  withTelemetryContext,
  type TelemetryClient,
  type TelemetryContextPatch,
  type TelemetryProperties,
} from '@byfriends/agent-core';

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
  ShellExecResult,
  SessionSummary,
} from '#/types';

export class ByfHarness {
  readonly homeDir: string;
  readonly configPath: string;
  readonly auth: ByfAuthFacade;

  private readonly identity: { readonly userAgentProduct: string; readonly version: string } | undefined;
  private readonly uiMode: string;
  private readonly telemetry: TelemetryClient;
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
    this.telemetry = options.telemetry ?? noopTelemetryClient;
    this.auth = new ByfAuthFacade({
      homeDir: this.homeDir,
      configPath: this.configPath,
    });
    this.rpc = new SDKRpcClient({
      homeDir: options.homeDir,
      configPath: this.configPath,
      skillDirs: options.skillDirs,
      telemetry: this.telemetry,
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

  track(event: string, properties?: TelemetryProperties): void {
    this.telemetry.track(event, properties);
  }

  setTelemetryContext(patch: TelemetryContextPatch): void {
    this.telemetry.setContext?.(patch);
  }

  async createSession(options: CreateSessionOptions): Promise<Session> {
    const { planMode, ...coreOptions } = options;
    const summary = await this.rpc.createSession(coreOptions);
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
    if (planMode === true) {
      await session.setPlanMode(true);
    }
    this.trackSessionStarted(summary.id, false);
    this.trackSessionEvent(session.id, 'session_new');
    return session;
  }

  async resumeSession(input: ResumeSessionInput): Promise<Session> {
    const id = normalizeSessionId(input.id);
    const active = this.activeSessions.get(id);
    if (active !== undefined) return active;

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
    this.trackSessionStarted(summary.id, true);
    this.trackSessionEvent(session.id, 'session_resume');
    return session;
  }

  async forkSession(input: ForkSessionInput): Promise<Session> {
    const summary = await this.rpc.forkSession({
      id: normalizeSessionId(input.id),
      forkId: input.forkId,
      title: input.title,
      metadata: input.metadata,
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
    this.trackSessionStarted(summary.id, true);
    this.trackSessionEvent(session.id, 'session_fork');
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

  async exportSession(input: ExportSessionInput): Promise<ExportSessionResult> {
    const result = await this.rpc.exportSession({
      ...input,
      version: input.version ?? this.identity?.version,
    });
    this.trackSessionEvent(input.id, 'export');
    return result;
  }

  async listSessions(options: ListSessionsOptions): Promise<readonly SessionSummary[]> {
    return this.rpc.listSessions(options);
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

  async removeProvider(providerId: string): Promise<ByfConfig> {
    return this.rpc.removeProvider(providerId);
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

  private trackSessionEvent(eventSessionId: string, event: string): void {
    withTelemetryContext(this.telemetry, { sessionId: eventSessionId }).track(event);
  }

  private trackSessionStarted(eventSessionId: string, resumed: boolean): void {
    withTelemetryContext(this.telemetry, { sessionId: eventSessionId }).track('session_started', {
      client_name: this.identity?.userAgentProduct ?? null,
      client_version: this.identity?.version ?? null,
      ui_mode: this.uiMode,
      resumed,
    });
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
