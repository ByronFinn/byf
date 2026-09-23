import { afterEach, beforeEach, describe, expect, it, spyOn, test } from 'bun:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  ByfError,
  ByfHarness,
  ErrorCodes,
  MASKED_SECRET_PLACEHOLDER,
  type ByfConfig,
  type ByfConfigPatch,
  type ConfigDocumentResult,
  type ConfigValidationResult,
  type ConfigWriteResult,
  type ContextProjection,
  type CreateSkillResult,
  type InspectorSessionSummary,
  type McpConfigListing,
  type McpConfigScope,
  type McpConnectionTestResult,
  type McpRawDocument,
  type McpScopeState,
  type PromptInput,
  type ResumedSessionSummary,
  type SessionDetail,
  type SkillSummary,
  type WireResponse,
  type WorkspaceSkillListing,
} from '@byfriends/sdk';
import type {
  ApprovalRequest,
  ApprovalResponse,
  AgentTreeResponse,
  Event,
  PermissionMode,
  QuestionRequest,
  QuestionResult,
  ResolvedCapabilities,
  ServerFrame,
  SessionStatus,
  SessionSummary,
  WorkspaceView,
} from '@byfriends/web-shared';

import { createApp } from './app';
import { AsyncQueue } from './async-queue';
import { startWebServer } from './server';
import { WebSessionManager, type HarnessLike, type SessionLike } from './session-manager';

// ---- PRD-0038 R1 写门夹具 ---------------------------------------------------
// `createApp` 现在集中施加三层门(带 body 的写必须 application/json / 同源 Origin
// 或 `X-Byf-Requested-With` 标记头 / token)。既有既例只需经 `writeHeaders()` 取齐
// "合法写"的凭证,不逐条复制 token 字符串:最近一次 `createTestApp()` 交付的
// authToken 记在模块级变量里(bun test 在同一文件内串行执行用例,setup → 请求在
// 同一条用例内闭环,不存在并发串扰)。

const BYF_MARKER = 'x-byf-requested-with';

let currentAuthToken: string | undefined;

/** `createApp` + 记录生效 token,供 {@link writeHeaders} 使用。 */
async function createTestApp(
  options: Parameters<typeof createApp>[0],
): Promise<Awaited<ReturnType<typeof createApp>>> {
  const result = await createApp(options);
  currentAuthToken = result.authToken;
  return result;
}

function writeHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [BYF_MARKER]: 'byf-web',
    ...extra,
  };
  if (currentAuthToken !== undefined) headers['authorization'] = `Bearer ${currentAuthToken}`;
  return headers;
}

// ---- Fake harness / session (实现 SessionLike / HarnessLike 契约) ------------

class FakeSession implements SessionLike {
  readonly id: string;
  readonly workDir: string;
  summary: SessionSummary;
  status: SessionStatus = {
    model: 'fake-model',
    thinkingLevel: 'medium',
    permission: 'manual',
    contextTokens: 100,
    maxContextTokens: 1000,
    contextUsage: 0.1,
  };

  private readonly listeners = new Set<(event: Event) => void>();
  private approvalHandler: ((req: ApprovalRequest) => Promise<ApprovalResponse>) | undefined;
  private questionHandler: ((req: QuestionRequest) => Promise<QuestionResult>) | undefined;

  lastPrompt: string | PromptInput | undefined;
  cancelled = false;
  permission: PermissionMode | undefined;
  model: string | undefined;
  thinking: string | undefined;
  closed = false;

  constructor(id: string, workDir: string) {
    this.id = id;
    this.workDir = workDir;
    this.summary = {
      id,
      workDir,
      sessionDir: `/tmp/${id}`,
      createdAt: 0,
      updatedAt: 0,
    };
  }

  onEvent(listener: (event: Event) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: Event): void {
    for (const listener of this.listeners) listener(event);
  }

  setApprovalHandler(
    handler: ((req: ApprovalRequest) => Promise<ApprovalResponse>) | undefined,
  ): void {
    this.approvalHandler = handler;
  }

  setQuestionHandler(
    handler: ((req: QuestionRequest) => Promise<QuestionResult>) | undefined,
  ): void {
    this.questionHandler = handler;
  }

  triggerApproval(req: ApprovalRequest): Promise<ApprovalResponse> {
    if (this.approvalHandler === undefined) throw new Error('no approval handler');
    return this.approvalHandler(req);
  }

  triggerQuestion(req: QuestionRequest): Promise<QuestionResult> {
    if (this.questionHandler === undefined) throw new Error('no question handler');
    return this.questionHandler(req);
  }

  async prompt(input: string | PromptInput): Promise<void> {
    this.lastPrompt = input;
  }

  async steer(input: string | PromptInput): Promise<void> {
    this.lastPrompt = input;
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
  }

  async setPermission(mode: PermissionMode): Promise<void> {
    this.permission = mode;
  }

  async setModel(model: string): Promise<void> {
    this.model = model;
  }

  async setThinking(level: string): Promise<void> {
    this.thinking = level;
  }

  activatedSkill: { name: string; args: string | undefined } | undefined;
  compacted = false;
  skills: readonly SkillSummary[] = [];

  async activateSkill(name: string, args?: string): Promise<void> {
    this.activatedSkill = { name, args };
  }

  async listSkills(): Promise<readonly SkillSummary[]> {
    return this.skills;
  }

  async compact(): Promise<void> {
    this.compacted = true;
  }

  backgroundOutput: string | undefined = undefined;
  lastOutputTaskId: string | undefined = undefined;

  async getBackgroundTaskOutput(
    taskId: string,
    _options?: { readonly tail?: number },
  ): Promise<string> {
    this.lastOutputTaskId = taskId;
    return this.backgroundOutput ?? '';
  }

  async getStatus(): Promise<SessionStatus> {
    return this.status;
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  /** 会话在进程内产生的对话记录(模拟 core replayBuilder 演进;summary 需经 resume 刷新才可见)。 */
  private readonly replayRecords: unknown[] = [];

  growReplay(record: unknown): void {
    this.replayRecords.push(record);
  }

  /** 模拟真实 harness resume:把演进态合入 summary(真实实现由 core active 路径现场重建)。 */
  refreshSummaryFromState(): void {
    const agents = (this.summary as Partial<ResumedSessionSummary>).agents;
    const main = agents?.['main'] ?? {};
    this.summary = {
      ...this.summary,
      agents: {
        ...agents,
        main: { ...main, type: 'main', replay: [...this.replayRecords] },
      },
      updatedAt: Date.now(),
    } as SessionSummary;
  }
}

class FakeHarness implements HarnessLike {
  readonly sessions = new Map<string, FakeSession>();
  closed = false;
  config: ByfConfig = {
    providers: {},
    models: {},
  };
  configPath = '/tmp/fake-config.toml';
  renames: Array<{ id: string; title: string }> = [];
  metadataPatches: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  forks: Array<{ id: string; upToMessage?: number }> = [];
  nextForkResult: SessionLike | undefined;

  async renameSession(input: { readonly id: string; readonly title: string }): Promise<void> {
    this.renames.push({ id: input.id, title: input.title });
  }

  async updateSessionMetadata(input: {
    readonly id: string;
    readonly metadata: Record<string, unknown>;
  }): Promise<void> {
    this.metadataPatches.push({ id: input.id, metadata: input.metadata });
  }

  async forkSession(input: {
    readonly id: string;
    readonly upToMessage?: number;
  }): Promise<SessionLike> {
    this.forks.push({ id: input.id, upToMessage: input.upToMessage });
    const result = this.nextForkResult;
    if (result === undefined) throw new Error('no fork result configured');
    return result;
  }

  async createSession(options: {
    readonly workDir: string;
    readonly model?: string;
  }): Promise<SessionLike> {
    const id = randomUUID();
    const session = new FakeSession(id, options.workDir);
    session.model = options.model;
    this.sessions.set(id, session);
    return session;
  }

  async resumeSession(input: { readonly id: string }): Promise<SessionLike> {
    const existing = this.sessions.get(input.id);
    if (existing !== undefined) {
      // 模拟真实 ByfHarness active 分支:返回同一实例但刷新 summary
      existing.refreshSummaryFromState();
      return existing;
    }
    const session = new FakeSession(input.id, '/resumed');
    this.sessions.set(input.id, session);
    return session;
  }

  async listSessions(options: { readonly workDir: string }): Promise<readonly SessionSummary[]> {
    return [...this.sessions.values()]
      .filter((s) => s.workDir === options.workDir)
      .map((s) => s.summary);
  }

  async getConfig(): Promise<ByfConfig> {
    return this.config;
  }

  removedModels: string[] = [];

  async removeModel(modelId: string): Promise<ByfConfig> {
    this.removedModels.push(modelId);
    const models = { ...this.config.models };
    delete models[modelId];
    this.config = { ...this.config, models };
    return this.config;
  }

  async setConfig(patch: ByfConfigPatch): Promise<ByfConfig> {
    // 与 agent-core mergeConfigPatch 同语义的浅层深合并(测试镜像)。
    this.config = fakeDeepMerge(this.config as never, patch as never) as ByfConfig;
    return this.config;
  }

  async removeProvider(providerId: string): Promise<ByfConfig> {
    const providers = { ...this.config.providers };
    delete providers[providerId];
    this.config = { ...this.config, providers };
    return this.config;
  }

  async resolveModelCapabilities(model: string): Promise<ResolvedCapabilities> {
    const modelAlias = this.config.models?.[model];
    if (modelAlias === undefined) {
      throw new Error(`Unknown model alias: ${model}`);
    }
    // 测试镜像:能力 = 别名手写标签(无注册表)。布尔面与 WebSessionManager 同构。
    const tags = new Set(modelAlias.capabilities ?? ['tool_use']);
    return {
      image_in: tags.has('image_in'),
      video_in: tags.has('video_in'),
      audio_in: tags.has('audio_in'),
      tool_use: tags.has('tool_use'),
      thinking: tags.has('thinking') || tags.has('always_thinking'),
      thinking_effort: tags.has('thinking_effort'),
      thinking_xhigh: tags.has('thinking_xhigh'),
      thinking_max: tags.has('thinking_max'),
    };
  }

  // ---- PRD-0035 Wave A fake 面（Inspector / ConfigDocument / Workspace）----
  inspectableSessions: InspectorSessionSummary[] = [];
  sessionDetails = new Map<string, SessionDetail>();
  wireResponses = new Map<string, WireResponse>();
  contextProjections = new Map<string, ContextProjection>();
  agentTrees = new Map<string, AgentTreeResponse>();
  deletedSessions: string[] = [];
  configDocument: ConfigDocumentResult = {
    path: '/tmp/fake-config.toml',
    text: '# fake config\n',
    revision: 'rev-1',
    parsed: { providers: {}, models: {} },
  };
  configDocumentError: Error | undefined;
  configValidation: ConfigValidationResult = { valid: true, diagnostics: [] };
  configValidationTexts: string[] = [];
  configWriteResult: ConfigWriteResult = { revision: 'rev-2' };
  configWriteCalls: Array<{ text: string; expectedRevision: string | null }> = [];
  configWriteError: Error | undefined;
  workspaceList: string[] = [];
  workspaceHidden: string[] = [];

  async listInspectableSessions(): Promise<readonly InspectorSessionSummary[]> {
    return this.inspectableSessions;
  }

  async readSessionInspection(sessionId: string): Promise<SessionDetail | null> {
    return this.sessionDetails.get(sessionId) ?? null;
  }

  async readAgentWire(sessionId: string, agentId: string): Promise<WireResponse> {
    const wire = this.wireResponses.get(`${sessionId}:${agentId}`);
    if (wire === undefined) throw new Error('agent wire not found');
    return wire;
  }

  async readContextProjection(sessionId: string, agentId: string): Promise<ContextProjection> {
    const proj = this.contextProjections.get(`${sessionId}:${agentId}`);
    if (proj === undefined) throw new Error('context projection not found');
    return proj;
  }

  async readAgentTree(sessionId: string): Promise<AgentTreeResponse> {
    const tree = this.agentTrees.get(sessionId);
    if (tree === undefined) throw new Error('agent tree not found');
    return tree;
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.deletedSessions.push(sessionId);
  }

  async getConfigDocument(): Promise<ConfigDocumentResult> {
    if (this.configDocumentError !== undefined) throw this.configDocumentError;
    return this.configDocument;
  }

  async validateConfigText(text: string): Promise<ConfigValidationResult> {
    this.configValidationTexts.push(text);
    return this.configValidation;
  }

  async writeConfigText(text: string, expectedRevision: string | null): Promise<ConfigWriteResult> {
    if (this.configWriteError !== undefined) throw this.configWriteError;
    this.configWriteCalls.push({ text, expectedRevision });
    return this.configWriteResult;
  }

  async listWorkspaces(): Promise<string[]> {
    return this.workspaceList;
  }

  async hiddenWorkspaces(): Promise<string[]> {
    return this.workspaceHidden;
  }

  async addWorkspace(workDir: string): Promise<string[]> {
    if (!this.workspaceList.includes(workDir)) this.workspaceList.push(workDir);
    return this.workspaceList;
  }

  async removeWorkspace(workDir: string): Promise<boolean> {
    const before = this.workspaceList.length;
    this.workspaceList = this.workspaceList.filter((p) => p !== workDir);
    if (this.workspaceList.length !== before && !this.workspaceHidden.includes(workDir)) {
      this.workspaceHidden.push(workDir); // 镜像 core 语义：删除 = hidden
    }
    return this.workspaceList.length !== before;
  }

  // ---- MCP config store(PRD-0036 / ADR-0039)----

  mcpListing: McpConfigListing | undefined;
  mcpRawDocs = new Map<McpConfigScope, McpRawDocument>();
  mcpListCalls: string[] = [];
  mcpRawCalls: Array<{ workDir: string; scope: McpConfigScope }> = [];

  async listMcpServerConfigs(workDir: string): Promise<McpConfigListing> {
    this.mcpListCalls.push(workDir);
    return (
      this.mcpListing ?? {
        user: { path: '/home/u/.byf/mcp.json', servers: [] },
        project: { path: '/work/w/.byf/mcp.json', servers: [] },
      }
    );
  }

  async readMcpConfigRaw(workDir: string, scope: McpConfigScope): Promise<McpRawDocument> {
    this.mcpRawCalls.push({ workDir, scope });
    return this.mcpRawDocs.get(scope) ?? { path: `/work/w/.byf/mcp.json`, text: '' };
  }

  mcpUpsertCalls: Array<{
    workDir: string;
    scope: McpConfigScope;
    name: string;
    config: Record<string, unknown>;
  }> = [];
  mcpRemoveCalls: Array<{ workDir: string; scope: McpConfigScope; name: string }> = [];
  mcpRawWriteCalls: Array<{ workDir: string; scope: McpConfigScope; text: string }> = [];
  mcpWriteError: ByfError | undefined;

  async upsertMcpServerConfig(
    workDir: string,
    scope: McpConfigScope,
    name: string,
    config: Record<string, unknown>,
  ): Promise<McpScopeState> {
    if (this.mcpWriteError !== undefined) throw this.mcpWriteError;
    this.mcpUpsertCalls.push({ workDir, scope, name, config });
    return { path: `/work/w/.byf/mcp.json`, servers: [] };
  }

  async removeMcpServerConfig(
    workDir: string,
    scope: McpConfigScope,
    name: string,
  ): Promise<McpScopeState> {
    if (this.mcpWriteError !== undefined) throw this.mcpWriteError;
    this.mcpRemoveCalls.push({ workDir, scope, name });
    return { path: `/work/w/.byf/mcp.json`, servers: [] };
  }

  async writeMcpConfigRaw(
    workDir: string,
    scope: McpConfigScope,
    text: string,
  ): Promise<McpRawDocument> {
    if (this.mcpWriteError !== undefined) throw this.mcpWriteError;
    this.mcpRawWriteCalls.push({ workDir, scope, text });
    return { path: `/work/w/.byf/mcp.json`, text };
  }

  mcpTestCalls: Array<{
    workDir: string;
    scope: McpConfigScope;
    name?: string;
    config: Record<string, unknown>;
  }> = [];
  mcpTestResult: McpConnectionTestResult = { ok: true, toolCount: 2 };
  mcpTestError: ByfError | undefined;

  async testMcpConnection(input: {
    workDir: string;
    scope: McpConfigScope;
    name?: string;
    config: Record<string, unknown>;
  }): Promise<McpConnectionTestResult> {
    if (this.mcpTestError !== undefined) throw this.mcpTestError;
    this.mcpTestCalls.push(input);
    return this.mcpTestResult;
  }

  skillListing: WorkspaceSkillListing | undefined;
  skillListCalls: string[] = [];
  skillCreateCalls: Array<{
    workDir: string;
    scope: string;
    name: string;
    description: string;
  }> = [];
  skillRemoveCalls: Array<{ workDir: string; skillPath: string }> = [];
  skillWriteError: ByfError | undefined;

  async listWorkspaceSkills(workDir: string): Promise<WorkspaceSkillListing> {
    this.skillListCalls.push(workDir);
    return this.skillListing ?? { userHomeDir: '/home/u', projectRoot: '/work/ws', groups: [] };
  }

  async createWorkspaceSkill(input: {
    workDir: string;
    scope: 'user' | 'project';
    name: string;
    description: string;
  }): Promise<CreateSkillResult> {
    if (this.skillWriteError !== undefined) throw this.skillWriteError;
    this.skillCreateCalls.push(input);
    return {
      skill: {
        name: input.name,
        description: input.description,
        path: `/work/ws/.byf/skills/${input.name}/SKILL.md`,
        dir: `/work/ws/.byf/skills/${input.name}`,
        source: input.scope,
        writable: true,
      },
    };
  }

  async removeWorkspaceSkill(workDir: string, skillPath: string): Promise<void> {
    if (this.skillWriteError !== undefined) throw this.skillWriteError;
    this.skillRemoveCalls.push({ workDir, skillPath });
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

/** 测试镜像:与 mergeConfigPatch 同语义的对象级深合并。 */
function fakeDeepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainRecord(target) || !isPlainRecord(source)) return source;
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    out[key] =
      isPlainRecord(out[key]) && isPlainRecord(value) ? fakeDeepMerge(out[key], value) : value;
  }
  return out;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** FakeSession.summary 各字段 readonly;测试内经可变视图打补丁。 */
function patchSummary(session: FakeSession, patch: Partial<SessionSummary>): void {
  Object.assign(session.summary as unknown as Record<string, unknown>, patch);
}

function assistantDelta(sessionId: string, turnId: number, delta: string): Event {
  return { type: 'assistant.delta', sessionId, agentId: 'main', turnId, delta };
}

// ---- SessionManager ---------------------------------------------------------

describe('WebSessionManager', () => {
  test('createSession 挂载 onEvent,广播 agent 事件为 agent.event 帧', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const queue = new AsyncQueue<ServerFrame>();
    const summary = await manager.createSession({ workDir: '/proj' });

    manager.subscribe(summary.id, queue);
    harness.sessions.get(summary.id)!.emit(assistantDelta(summary.id, 1, 'hello'));

    const frame = await queue.next();
    expect(frame?.type).toBe('agent.event');
  });

  test('closeSession 等待期间 resume 失败:返回 false 而非抛错', async () => {
    const harness = new FakeHarness();
    harness.resumeSession = async (): Promise<never> => {
      throw new Error('resume boom');
    };
    const manager = new WebSessionManager(harness);
    const closing = manager.closeSession('sess-failing'); // resume 失败被 catch
    expect(await closing).toBe(false);
    expect(manager.getSession('sess-failing')).toBeUndefined();
  });

  test('closeSession 等待进行中的 resume 落地后再关闭', async () => {
    const harness = new FakeHarness();
    let release!: () => void;
    const origResume = harness.resumeSession.bind(harness);
    harness.resumeSession = async (input: { readonly id: string }) => {
      await new Promise<void>((r) => {
        release = r;
      });
      return origResume(input);
    };
    const manager = new WebSessionManager(harness);
    const id = 'sess-closing';

    const resuming = manager.resumeSession(id); // in-flight,尚未入 sessions map
    const closing = manager.closeSession(id); // 并发 close 不应 404 漏关
    expect(manager.getSession(id)).toBeUndefined();
    release();
    expect(await closing).toBe(true);
    await resuming;
    expect(manager.getSession(id)).toBeUndefined(); // 已关闭,未被 resume 复活
    expect(harness.sessions.get(id)!.closed).toBe(true);
  });

  test('resume 失败后可重试:不永久毒化该 id', async () => {
    const harness = new FakeHarness();
    let calls = 0;
    harness.resumeSession = async (): Promise<never> => {
      calls += 1;
      throw new Error(`boom ${calls}`);
    };
    const manager = new WebSessionManager(harness);
    await expect(manager.resumeSession('sess-flaky')).rejects.toThrow('boom 1');
    await expect(manager.resumeSession('sess-flaky')).rejects.toThrow('boom 2');
    expect(calls).toBe(2); // 失败不缓存:每次都真正重试
  });

  test('并发 resume 同一 id 去重:harness 只 resume 一次,事件只广播一次', async () => {
    const harness = new FakeHarness();
    let resumeCalls = 0;
    const origResume = harness.resumeSession.bind(harness);
    harness.resumeSession = async (input: { readonly id: string }) => {
      resumeCalls += 1;
      // 让并发窗口真实存在:两次调用都进入 await 后才返回
      await new Promise((r) => setTimeout(r, 10));
      return origResume(input);
    };
    const manager = new WebSessionManager(harness);
    const queue = new AsyncQueue<ServerFrame>();

    const id = 'sess-concurrent';
    const [a, b] = await Promise.all([manager.resumeSession(id), manager.resumeSession(id)]);
    expect(resumeCalls).toBe(1);
    expect(a.id).toBe(id);
    expect(b.id).toBe(id);

    manager.subscribe(id, queue);
    harness.sessions.get(id)!.emit(assistantDelta(id, 1, 'once'));
    const frame = await queue.next();
    expect(frame?.type).toBe('agent.event');
    // 单次 emit 只应有一帧(等一小段确认无第二帧)
    const extra = await Promise.race([
      queue.next(),
      new Promise<null>((r) => {
        setTimeout(() => {
          r(null);
        }, 30);
      }),
    ]);
    expect(extra).toBeNull();
  });

  test('live 会话 resume 返回最新 summary:对话期间演进 replay 在刷新后可读（PRD-0035 Chat 空回归）', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    // 会话在本进程内创建(hero 首条消息),summary 为创建时快照(无 replay)
    const created = await manager.createSession({ workDir: '/proj' });
    const session = harness.sessions.get(created.id)!;
    // 之后该 live 会话又产生了对话 → replay 演进(真实 harness 由 core replayBuilder 驱动)
    session.growReplay({ type: 'message', message: { role: 'user', text: 'hi' } });

    // 刷新页面 → resume:必须咨询 harness 拿到演进后的 summary,而不是返回创建快照
    const resumed = await manager.resumeSession(created.id);
    const replay = resumed.agents?.['main']?.replay;
    expect(replay).toHaveLength(1);
    expect(replay?.[0]).toMatchObject({ message: { text: 'hi' } });
  });

  test('每次 resume 都刷新 live summary:命中缓存也咨询 harness(不返回过期快照)', async () => {
    const harness = new FakeHarness();
    let resumeCalls = 0;
    const origResume = harness.resumeSession.bind(harness);
    harness.resumeSession = async (input: { readonly id: string }) => {
      resumeCalls += 1;
      return origResume(input);
    };
    const manager = new WebSessionManager(harness);
    const created = await manager.createSession({ workDir: '/proj' });

    const a = await manager.resumeSession(created.id);
    const b = await manager.resumeSession(created.id);
    expect(resumeCalls).toBe(2); // 串行两次 resume 各咨询一次(每次刷新);并发去重测试另行守护
    expect(a.id).toBe(created.id);
    expect(b.id).toBe(created.id);
  });

  test('审批反向 RPC:请求 → 广播 → resolve → 裁决与 settled 帧', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const queue = new AsyncQueue<ServerFrame>();
    const summary = await manager.createSession({ workDir: '/proj' });
    manager.subscribe(summary.id, queue);
    const session = harness.sessions.get(summary.id)!;

    const request: ApprovalRequest = {
      toolCallId: 'tc1',
      toolName: 'bash',
      action: 'run',
      display: { kind: 'command', command: 'ls' },
    };
    const pending = session.triggerApproval(request);

    const requested = await queue.next();
    expect(requested?.type).toBe('approval.requested');
    const requestId = (requested as { requestId: string }).requestId;

    expect(manager.resolveApproval(requestId, { decision: 'approved' })).toBe(true);
    expect((await pending).decision).toBe('approved');

    const settled = await queue.next();
    expect(settled?.type).toBe('approval.settled');
    expect((settled as { decision: string }).decision).toBe('approved');
  });

  test('问答反向 RPC', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const queue = new AsyncQueue<ServerFrame>();
    const summary = await manager.createSession({ workDir: '/proj' });
    manager.subscribe(summary.id, queue);
    const session = harness.sessions.get(summary.id)!;

    const pending = session.triggerQuestion({
      questions: [{ question: 'ok?', options: [{ label: 'yes' }, { label: 'no' }] }],
    });
    const requested = await queue.next();
    expect(requested?.type).toBe('question.requested');
    const requestId = (requested as { requestId: string }).requestId;

    expect(manager.resolveQuestion(requestId, { answers: { '0': 'yes' } })).toBe(true);
    expect(await pending).toEqual({ answers: { '0': 'yes' } });
    expect((await queue.next())?.type).toBe('question.settled');
  });

  test('replayPending 在重连时重放待裁决审批', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const summary = await manager.createSession({ workDir: '/proj' });
    const session = harness.sessions.get(summary.id)!;

    // 触发审批但暂不订阅(模拟断连期间发起的请求)
    const pending = session.triggerApproval({
      toolCallId: 'tc2',
      toolName: 'write',
      action: 'edit',
      display: { kind: 'file_io', operation: 'write', path: '/a' },
    });

    // 现在订阅(模拟重连),应重放该 pending
    const queue = new AsyncQueue<ServerFrame>();
    const subscriber = manager.subscribe(summary.id, queue);
    manager.replayPending(subscriber);

    const replayed = await queue.next();
    expect(replayed?.type).toBe('approval.requested');
    // 清理:resolve 掉,避免悬挂 promise
    const requestId = (replayed as { requestId: string }).requestId;
    manager.resolveApproval(requestId, { decision: 'rejected' });
    await pending;
  });

  test('closeSession reject 待裁决的反向 RPC', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const summary = await manager.createSession({ workDir: '/proj' });
    const session = harness.sessions.get(summary.id)!;

    const pending = session.triggerApproval({
      toolCallId: 'tc3',
      toolName: 'bash',
      action: 'run',
      display: { kind: 'generic', summary: 'x' },
    });
    // 立即接住 rejection,避免在断言接住前触发 unhandled-rejection。
    const pendingCaught = pending.catch((error: unknown) => error);
    await expect(manager.closeSession(summary.id)).resolves.toBe(true);
    const error = (await pendingCaught) as Error;
    expect(error.message).toBe('session closed');
    expect(session.closed).toBe(true);
  });

  test('prompt 失败时广播 sys.error(不抛出)', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const queue = new AsyncQueue<ServerFrame>();
    const summary = await manager.createSession({ workDir: '/proj' });
    manager.subscribe(summary.id, queue);
    const session = harness.sessions.get(summary.id)!;
    session.prompt = async (): Promise<void> => {
      throw new Error('boom');
    };

    manager.prompt(summary.id, 'do something');
    const frame = await queue.next();
    expect(frame?.type).toBe('sys.error');
    expect((frame as { message: string }).message).toBe('boom');
  });
});

// ---- HTTP 路由(经 createApp + app.request,无需真实网络) ----------------------

describe('HTTP routes', () => {
  async function setup(authToken?: string): Promise<{
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }> {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, authToken });
    return { app: result.app, harness };
  }

  test('POST /api/sessions 创建;GET 列出', async () => {
    const { app } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect(created.status).toBe(201);
    const data = (await created.json()) as { session: SessionSummary };
    expect(data.session.workDir).toBe('/proj');

    const listed = await app.request('/api/sessions?workDir=/proj');
    expect(listed.status).toBe(200);
    const listData = (await listed.json()) as { sessions: SessionSummary[] };
    expect(listData.sessions.length).toBe(1);
  });

  test('无 workDir 时返回全量 inspectable 投影（PRD-0035 R-B1）', async () => {
    const { app, harness } = await setup();
    harness.inspectableSessions = [
      {
        sessionId: 'session_1',
        sessionDir: '/tmp/sessions/w/session_1',
        workDir: '/w',
        title: 't',
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 1,
        updatedAt: 2,
        agentCount: 1,
        mainAgentExists: true,
        mainWireRecordCount: 3,
        wireProtocolVersion: '1.1',
        health: 'ok',
      },
    ];
    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { sessions: InspectorSessionSummary[] };
    expect(data.sessions).toHaveLength(1);
  });

  test('GET /api/sessions?q= 按 title/lastPrompt 过滤(不区分大小写)', async () => {
    const { app, harness } = await setup();
    const mk = async (): Promise<string> => {
      const res = await app.request('/api/sessions', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({ workDir: '/proj' }),
      });
      const data = (await res.json()) as { session: SessionSummary };
      return data.session.id;
    };
    const a = await mk();
    const b = await mk();
    const c = await mk();
    patchSummary(harness.sessions.get(a)!, { title: 'Refactor Markdown renderer' });
    patchSummary(harness.sessions.get(b)!, { lastPrompt: '排查 SSE 重连丢帧' });
    // c 两者皆空,任何 q 都不命中;id 也不参与过滤

    const list = async (q?: string): Promise<string[]> => {
      const url =
        q === undefined
          ? '/api/sessions?workDir=/proj'
          : `/api/sessions?workDir=/proj&q=${encodeURIComponent(q)}`;
      const res = await app.request(url);
      const data = (await res.json()) as { sessions: SessionSummary[] };
      return data.sessions.map((s) => s.id);
    };

    expect(await list()).toEqual([a, b, c]);
    expect(await list('   ')).toEqual([a, b, c]); // 纯空白 = 不过滤
    expect(await list('markdown')).toEqual([a]);
    expect(await list('SSE')).toEqual([b]);
    expect(await list('refactor')).toEqual([a]);
    expect(await list(c)).toEqual([]);
  });

  test('GET /api/sessions/:id 返回 status', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const res = await app.request(`/api/sessions/${id}`);
    expect(res.status).toBe(200);
  });

  test('POST prompt 与 PATCH permission 透传到 session', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const promptRes = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ input: 'hi' }),
    });
    expect(promptRes.status).toBe(202);

    const permRes = await app.request(`/api/sessions/${id}/permission`, {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ mode: 'yolo' }),
    });
    expect(permRes.status).toBe(200);
    expect(session.permission).toBe('yolo');
  });

  // 1×1 PNG:足够通过 data-URL 校验与 compressImageForModel 的快路径(passthrough)。
  const TINY_PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  test('POST prompt 带图:服务端展开为 text + image_url parts', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const res = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ input: '看图', images: [{ dataUrl: TINY_PNG_DATA_URL }] }),
    });
    expect(res.status).toBe(202);

    const parts = session.lastPrompt as PromptInput;
    expect(Array.isArray(parts)).toBe(true);
    expect(parts[0]).toEqual({ type: 'text', text: '看图' });
    expect(parts[1]?.type).toBe('image_url');
    expect((parts[1] as { imageUrl: { url: string } }).imageUrl.url).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  test('POST prompt 仅图片(无文本)也接受;非图片 data-URL 返回 400', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const okRes = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ input: '', images: [{ dataUrl: TINY_PNG_DATA_URL }] }),
    });
    expect(okRes.status).toBe(202);
    const parts = session.lastPrompt as PromptInput;
    expect(parts.length).toBe(1);
    expect(parts[0]?.type).toBe('image_url');

    const badRes = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ input: 'x', images: [{ dataUrl: 'data:text/plain;base64,aGk=' }] }),
    });
    expect(badRes.status).toBe(400);
  });

  test('非法 permission mode 返回 400', async () => {
    const { app } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const res = await app.request(`/api/sessions/${id}/permission`, {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ mode: 'bogus' }),
    });
    expect(res.status).toBe(400);
  });

  test('鉴权:配置 token 后,无凭证 401,正确 Bearer 放行', async () => {
    const { app } = await setup('s3cr3t');
    expect((await app.request('/api/sessions?workDir=/x')).status).toBe(401);
    const ok = await app.request('/api/sessions?workDir=/x', {
      headers: { authorization: 'Bearer s3cr3t' },
    });
    expect(ok.status).toBe(200);
    // ?token= 查询也放行(EventSource 用)
    const okQuery = await app.request('/api/sessions?workDir=/x&token=s3cr3t');
    expect(okQuery.status).toBe(200);
  });
});

// ---- 工作区路由(临时 homeDir:注册表 + 会话索引) ------------------------------

describe('Workspace routes', () => {
  const dirs: string[] = [];
  async function setup(): Promise<{
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
    homeDir: string;
    /** 真实存在的工作区目录(POST /workspaces 校验目录存在)。 */
    projDir: string;
  }> {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-ws-test-'));
    const projDir = await mkdtemp(join(tmpdir(), 'byf-ws-proj-'));
    dirs.push(homeDir, projDir);
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir });
    return { app: result.app, harness, homeDir, projDir };
  }

  afterEach(async () => {
    while (dirs.length > 0) {
      await rm(dirs.pop()!, { recursive: true, force: true });
    }
  });

  async function createSession(app: Awaited<ReturnType<typeof createApp>>['app'], workDir: string) {
    const res = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir }),
    });
    return ((await res.json()) as { session: SessionSummary }).session;
  }

  test('POST 添加工作区;GET 枚举注册表工作区及其会话', async () => {
    const { app, homeDir, harness, projDir } = await setup();
    await createSession(app, projDir);

    const added = await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: projDir }),
    });
    expect(added.status).toBe(200);
    const addedData = (await added.json()) as { workspace: WorkspaceView };
    expect(addedData.workspace.title).toBe(projDir.split('/').pop() ?? projDir);
    expect(addedData.workspace.sessions.length).toBe(1);

    const listed = await app.request('/api/workspaces');
    const listData = (await listed.json()) as { workspaces: WorkspaceView[] };
    expect(listData.workspaces.map((w) => w.workDir)).toEqual([projDir]);

    // PRD-0035 R-A6：注册表由 core 单源（SDK 透出）——fake 记录 add 调用
    expect(harness.workspaceList).toContain(projDir);
  });

  test('GET 合并会话索引中未注册的 workDir(按最近更新时间倒序)', async () => {
    const { app, harness } = await setup();
    // 索引枚举 = 全量 inspectable 投影（PRD-0035 R-A3/R-D5）
    harness.inspectableSessions = [
      {
        sessionId: 's1',
        sessionDir: '/x/s1',
        workDir: '/old-dir',
        title: null,
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 100,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
      {
        sessionId: 's2',
        sessionDir: '/x/s2',
        workDir: '/recent-dir',
        title: null,
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 200,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
    ];
    const recent = await createSession(app, '/recent-dir');
    const old = await createSession(app, '/old-dir');
    patchSummary(harness.sessions.get(recent.id)!, { updatedAt: 200 });
    patchSummary(harness.sessions.get(old.id)!, { updatedAt: 100 });

    const listed = await app.request('/api/workspaces');
    const listData = (await listed.json()) as { workspaces: WorkspaceView[] };
    expect(listData.workspaces.map((w) => w.workDir)).toEqual(['/recent-dir', '/old-dir']);
  });

  test('POST 拒绝相对路径与不存在目录;重复添加幂等', async () => {
    const { app, projDir } = await setup();
    const rel = await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: 'relative/dir' }),
    });
    expect(rel.status).toBe(400);

    const missing = await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: '/definitely/not/here' }),
    });
    expect(missing.status).toBe(400);

    const first = await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: projDir }),
    });
    const second = await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: projDir }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const listed = await app.request('/api/workspaces');
    const listData = (await listed.json()) as { workspaces: WorkspaceView[] };
    expect(listData.workspaces.map((w) => w.workDir)).toEqual([projDir]);
  });

  test('DELETE 从注册表移除(会话保留)', async () => {
    const { app, projDir } = await setup();
    await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: projDir }),
    });
    const del = await app.request(`/api/workspaces?workDir=${encodeURIComponent(projDir)}`, {
      method: 'DELETE',
      headers: writeHeaders(),
    });
    expect(del.status).toBe(200);
    expect(((await del.json()) as { removed: boolean }).removed).toBe(true);

    const listed = await app.request('/api/workspaces');
    const listData = (await listed.json()) as { workspaces: WorkspaceView[] };
    expect(listData.workspaces).toEqual([]);
  });

  test('空注册表视为空列表;POST 后可枚举（core 单源）', async () => {
    const { app, harness, projDir } = await setup();
    expect(harness.workspaceList).toEqual([]);
    const listed = await app.request('/api/workspaces');
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { workspaces: WorkspaceView[] }).workspaces).toEqual([]);

    const added = await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: projDir }),
    });
    expect(added.status).toBe(200);
    expect(harness.workspaceList).toEqual([projDir]);
  });

  test('DELETE 后即使会话索引仍含该目录也不再出现;重新添加恢复原位置', async () => {
    const { app, harness } = await setup();
    // 两个真实存在的目录(注册校验需要目录存在)
    const oldDir = await mkdtemp(join(tmpdir(), 'byf-ws-old-'));
    const recentDir = await mkdtemp(join(tmpdir(), 'byf-ws-recent-'));
    dirs.push(oldDir, recentDir);
    harness.inspectableSessions = [
      {
        sessionId: 's1',
        sessionDir: '/x/s1',
        workDir: oldDir,
        title: null,
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 100,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
      {
        sessionId: 's2',
        sessionDir: '/x/s2',
        workDir: recentDir,
        title: null,
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 200,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
    ];
    await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: oldDir }),
    });
    const list = async (): Promise<string[]> => {
      const res = await app.request('/api/workspaces');
      return ((await res.json()) as { workspaces: WorkspaceView[] }).workspaces.map(
        (w) => w.workDir,
      );
    };
    expect(await list()).toEqual([oldDir, recentDir]);

    // 删除后:索引枚举不得把它带回来(曾删除 = 用户意图隐藏)
    const del = await app.request(`/api/workspaces?workDir=${encodeURIComponent(oldDir)}`, {
      method: 'DELETE',
      headers: writeHeaders(),
    });
    expect(((await del.json()) as { removed: boolean }).removed).toBe(true);
    expect(await list()).toEqual([recentDir]);

    // 重新添加:从 hidden 移除,恢复原顺序位置(仍在 recentDir 前)
    await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: oldDir }),
    });
    expect(await list()).toEqual([oldDir, recentDir]);
  });

  test('GET /api/fs/list 列出工作区目录(隐藏过滤、目录优先);非工作区 root 与路径逃逸 400', async () => {
    const { app, projDir } = await setup();
    await app.request('/api/workspaces', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ path: projDir }),
    });
    await mkdir(join(projDir, 'sub'));
    await writeFile(join(projDir, 'a.txt'), 'x');
    await writeFile(join(projDir, '.hidden'), 'x');

    const list = async (
      path: string,
    ): Promise<{ status: number; entries?: { name: string; path: string; isDir: boolean }[] }> => {
      const res = await app.request(
        `/api/fs/list?root=${encodeURIComponent(projDir)}&path=${encodeURIComponent(path)}`,
      );
      const body = (await res.json()) as {
        entries?: { name: string; path: string; isDir: boolean }[];
      };
      return { status: res.status, entries: body.entries };
    };

    const root = await list('');
    expect(root.status).toBe(200);
    expect(root.entries).toEqual([
      { name: 'sub', path: 'sub', isDir: true },
      { name: 'a.txt', path: 'a.txt', isDir: false },
    ]); // 隐藏文件过滤;目录在前

    const sub = await list('sub');
    expect(sub.status).toBe(200);
    expect(sub.entries).toEqual([]);

    const badRoot = await app.request(`/api/fs/list?root=${encodeURIComponent('/not/registered')}`);
    expect(badRoot.status).toBe(400);

    const escape = await app.request(
      `/api/fs/list?root=${encodeURIComponent(projDir)}&path=${encodeURIComponent('../../etc')}`,
    );
    expect(escape.status).toBe(400);
  });
});

// ---- 配置与模型路由(设置弹层后端) --------------------------------------------

describe('Config routes', () => {
  const dirs: string[] = [];
  async function setup(): Promise<{
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }> {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-cfg-test-'));
    dirs.push(homeDir);
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir });
    return { app: result.app, harness };
  }

  afterEach(async () => {
    while (dirs.length > 0) {
      await rm(dirs.pop()!, { recursive: true, force: true });
    }
  });

  test('GET /api/config 返回脱敏视图(apiKey 不回线路,仅 hasApiKey)', async () => {
    const { app, harness } = await setup();
    harness.config = {
      providers: {
        local: {
          type: 'openai-completions',
          apiKey: 'sk-secret',
          baseUrl: 'http://127.0.0.1:11434/v1',
        },
        bare: { type: 'anthropic' },
      },
      models: {
        'local/qwen-3.6': {
          provider: 'local',
          model: 'qwen-3.6',
          maxContextSize: 32768,
          displayName: 'Qwen 3.6',
        },
      },
      defaultModel: 'local/qwen-3.6',
      defaultPermissionMode: 'yolo',
      defaultThinking: true,
      thinking: { mode: 'on', effort: 'high' },
    };
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      configPath: string;
      defaultModel?: string;
      defaultPermissionMode?: string;
      defaultThinking?: boolean;
      thinking?: { mode?: string; effort?: string };
      providers: {
        id: string;
        type: string;
        baseUrl?: string;
        hasApiKey: boolean;
        keyFromEnv: boolean;
        oauth: boolean;
      }[];
      models: { id: string; provider: string }[];
    };
    expect(body.configPath).toBe('/tmp/fake-config.toml');
    expect(body.defaultModel).toBe('local/qwen-3.6');
    expect(body.defaultPermissionMode).toBe('yolo');
    expect(body.defaultThinking).toBe(true);
    expect(body.thinking).toEqual({ mode: 'on', effort: 'high' });
    expect(body.providers).toEqual([
      {
        id: 'local',
        type: 'openai-completions',
        baseUrl: 'http://127.0.0.1:11434/v1',
        hasApiKey: true,
        keyFromEnv: false,
        oauth: false,
      },
      {
        id: 'bare',
        type: 'anthropic',
        baseUrl: undefined,
        hasApiKey: false,
        keyFromEnv: false,
        oauth: false,
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('sk-secret');
    expect(body.models[0]?.provider).toBe('local');
  });

  test('PATCH /api/config 更新默认模型/权限/思考并回读;非法模式与空 body 400', async () => {
    const { app, harness } = await setup();
    harness.config = {
      providers: {},
      models: { m1: { provider: 'p', model: 'm', maxContextSize: 1000 } },
    };

    const ok = await app.request('/api/config', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({
        defaultModel: 'm1',
        defaultPermissionMode: 'auto',
        thinking: { mode: 'on', effort: 'xhigh' },
      }),
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as {
      defaultModel: string;
      defaultPermissionMode: string;
      thinking: { mode: string; effort: string };
    };
    expect(body.defaultModel).toBe('m1');
    expect(body.defaultPermissionMode).toBe('auto');
    expect(body.thinking).toEqual({ mode: 'on', effort: 'xhigh' });
    expect(harness.config.defaultModel).toBe('m1');
    expect(harness.config.defaultPermissionMode).toBe('auto');
    expect(harness.config.thinking).toEqual({ mode: 'on', effort: 'xhigh' });

    const badMode = await app.request('/api/config', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ thinking: { mode: 'bogus' } }),
    });
    expect(badMode.status).toBe(400);

    const badEffort = await app.request('/api/config', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ thinking: { effort: 'insane' } }),
    });
    expect(badEffort.status).toBe(400);

    const bad = await app.request('/api/config', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ defaultPermissionMode: 'bogus' }),
    });
    expect(bad.status).toBe(400);

    const empty = await app.request('/api/config', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
  });

  test('DELETE /api/config/providers/:id 移除 provider', async () => {
    const { app, harness } = await setup();
    harness.config = { providers: { a: { type: 'anthropic' }, b: { type: 'anthropic' } } };
    const res = await app.request('/api/config/providers/a', {
      method: 'DELETE',
      headers: writeHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { providers: { id: string }[] };
    expect(body.providers.map((p) => p.id)).toEqual(['b']);
    expect(harness.config.providers['a']).toBeUndefined();
  });

  test('PATCH /api/sessions/:id/model 透传;空 model 400', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const ok = await app.request(`/api/sessions/${id}/model`, {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ model: 'local/qwen-3.6' }),
    });
    expect(ok.status).toBe(200);
    expect(session.model).toBe('local/qwen-3.6');

    const empty = await app.request(`/api/sessions/${id}/model`, {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ model: '  ' }),
    });
    expect(empty.status).toBe(400);
  });

  test('PATCH /api/sessions/:id/thinking 透传;非法档位 400', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    for (const level of ['off', 'low', 'medium', 'high', 'xhigh', 'max']) {
      const ok = await app.request(`/api/sessions/${id}/thinking`, {
        method: 'PATCH',
        headers: writeHeaders(),
        body: JSON.stringify({ level }),
      });
      expect(ok.status).toBe(200);
      expect(session.thinking).toBe(level);
    }

    const bad = await app.request(`/api/sessions/${id}/thinking`, {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ level: 'insane' }),
    });
    expect(bad.status).toBe(400);
  });

  test('POST activate-skill 与 compact 透传;空 skill 名 400', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const skill = await app.request(`/api/sessions/${id}/activate-skill`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ name: 'init', args: 'src' }),
    });
    expect(skill.status).toBe(200);
    expect(session.activatedSkill).toEqual({ name: 'init', args: 'src' });

    const empty = await app.request(`/api/sessions/${id}/activate-skill`, {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ name: '  ' }),
    });
    expect(empty.status).toBe(400);

    const compact = await app.request(`/api/sessions/${id}/compact`, {
      method: 'POST',
      headers: writeHeaders(),
    });
    expect(compact.status).toBe(200);
    expect(session.compacted).toBe(true);
  });

  test('GET /sessions/:id/skills 返回会话 skill 列表;未加载会话 404', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;
    session.skills = [
      {
        name: 'research',
        description: '调研技术主题',
        path: '/skills/research',
        source: 'builtin',
      },
      { name: 'init', description: '生成 AGENTS.md', path: '/skills/init', source: 'builtin' },
    ];

    const res = await app.request(`/api/sessions/${id}/skills`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { skills: SkillSummary[] };
    expect(body.skills.map((s) => s.name)).toEqual(['research', 'init']);
    expect(body.skills[0]?.description).toBe('调研技术主题');

    const missing = await app.request('/api/sessions/nope/skills');
    expect(missing.status).toBe(404);
  });

  test('GET ?tail 传递后台任务输出;未知会话 404', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;
    session.backgroundOutput = 'stdout 行一\nstderr 行二\n';

    const res = await app.request(`/api/sessions/${id}/background/tasks/bash-demo0001/output`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { taskId: string; output: string };
    expect(body.taskId).toBe('bash-demo0001');
    expect(body.output).toBe('stdout 行一\nstderr 行二\n');
    expect(session.lastOutputTaskId).toBe('bash-demo0001');

    const missing = await app.request(`/api/sessions/nope/background/tasks/bash-demo0001/output`);
    expect(missing.status).toBe(404);
  });

  test('POST /api/sessions/:id/resume 响应携带 agents.main.replay(转录恢复的线路契约)', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;
    // 会话在本进程内继续对话 → core replayBuilder 累积(模拟)
    session.growReplay({
      type: 'message',
      message: {
        role: 'user',
        content: [{ type: 'text', text: 'hi' }],
        toolCalls: [],
      },
    });
    session.growReplay({
      type: 'message',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'hello' }],
        toolCalls: [],
      },
    });
    patchSummary(session, {
      agents: {
        main: {
          type: 'main',
          config: {},
          context: { messages: [] },
          replay: [],
          permission: { mode: 'manual' },
          usage: {},
          tools: [],
        },
      } as unknown as Partial<SessionSummary>,
    } as unknown as Partial<SessionSummary>);

    const res = await app.request(`/api/sessions/${id}/resume`, {
      method: 'POST',
      headers: writeHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { session: ResumedSessionSummary };
    expect(body.session.agents?.['main']?.replay).toHaveLength(2);
    expect(
      (body.session.agents?.['main']?.replay[0] as { message: { role: string } }).message.role,
    ).toBe('user');
  });
});

// ---- SPA 静态源提示 ----------------------------------------------------------

describe('Static source hint', () => {
  test('publicDir 显式但不可用 → stderr 诊断;未指定 → stdout 中性说明(api-only fallback)', async () => {
    const stderrWrite = spyOn(process.stderr, 'write').mockImplementation(() => true);
    const stdoutWrite = spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      await createTestApp({
        manager: new WebSessionManager(new FakeHarness()),
        publicDir: '/nonexistent-public-dir-xyz',
      });
      expect(
        stderrWrite.mock.calls.some((args) => String(args[0]).includes('publicDir not found')),
      ).toBe(true);

      stderrWrite.mockClear();
      stdoutWrite.mockClear();
      await createTestApp({ manager: new WebSessionManager(new FakeHarness()) });
      expect(
        stdoutWrite.mock.calls.some((args) => String(args[0]).includes('serving API only')),
      ).toBe(true);
      // 未指定 publicDir 的 fallback 不是配置错误:不得走 stderr 警告。
      expect(
        stderrWrite.mock.calls.some((args) => String(args[0]).includes('publicDir not found')),
      ).toBe(false);
    } finally {
      stderrWrite.mockRestore();
      stdoutWrite.mockRestore();
    }
  });

  /**
   * review F3:目录前缀判定必须带分隔符。`resolve(publicDir, '.' + pathname)` 的结果
   * 只要**字符串上**以 publicDir 开头就会被当成目录内文件,于是兄弟目录
   * `<root>/public-evil/` 撞上 `<root>/public` 而漏过去。
   *
   * 可达路径是**编码斜杠**:`/..%2f..%2f` 里的 `%2f` 逃过 WHATWG URL 的段规范化
   * （裸 `%2e%2e` 会被解码并折叠掉,所以那条反而不是攻击面),`decodeURIComponent`
   * 之后才变成 `../`。与 `/fs/list`(routes.ts)的 `startsWith(`${base}${sep}`)` 同一判据。
   */
  test('兄弟目录名以 publicDir 开头时不算目录内文件(前缀判定要带分隔符)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'byf-static-'));
    const publicDir = join(root, 'public');
    await mkdir(publicDir, { recursive: true });
    await writeFile(join(publicDir, 'index.html'), '<html>spa</html>\n', 'utf-8');
    await mkdir(join(root, 'public-evil'), { recursive: true });
    await writeFile(join(root, 'public-evil', 'secret.txt'), 'leaked-by-prefix\n', 'utf-8');

    const manager = new WebSessionManager(new FakeHarness());
    const { app } = await createTestApp({ manager, publicDir });

    // 合法 SPA 路径不被误杀,深链接仍然回退到 index.html。
    const index = await app.request('/');
    expect(index.status).toBe(200);
    expect(await index.text()).toContain('<html>spa</html>');
    const spaRoute = await app.request('/sessions/abc123');
    expect(spaRoute.status).toBe(200);
    expect(await spaRoute.text()).toContain('<html>spa</html>');

    const escape = await app.request('/..%2fpublic-evil%2fsecret.txt');
    expect(escape.status).toBe(403);
    expect(await escape.text()).not.toContain('leaked-by-prefix');

    // 真正的目录外逃逸（`..` 到根以外）同样被拒,且不会因为判定失败而 500。
    const traversal = await app.request('/..%2f..%2f..%2fetc%2fpasswd');
    expect(traversal.status).toBe(403);
  });
});

// ---- Wave A 会话组织路由(PRD-0034) ------------------------------------------

describe('Wave A session organization routes (PRD-0034)', () => {
  async function setup(homeDir?: string): Promise<{
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
    homeDir: string;
  }> {
    const dir = homeDir ?? (await mkdtemp(join(tmpdir(), 'byf-wavea-')));
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir: dir });
    return { app: result.app, harness, homeDir: dir };
  }

  function seed(
    harness: FakeHarness,
    id: string,
    workDir: string,
    patch: Partial<SessionSummary> = {},
  ): FakeSession {
    const session = new FakeSession(id, workDir);
    patchSummary(session, { id, workDir, ...patch });
    harness.sessions.set(id, session);
    return session;
  }

  test('PATCH /api/sessions/:id 重命名经 harness.renameSession', async () => {
    const { app, harness } = await setup();
    seed(harness, 'ses_rename', '/proj', { title: 'Old' });

    const res = await app.request('/api/sessions/ses_rename', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ title: '新标题 🎯' }),
    });
    expect(res.status).toBe(200);
    expect(harness.renames).toEqual([{ id: 'ses_rename', title: '新标题 🎯' }]);
  });

  test('PATCH 不存在会话:harness 抛 session.not_found(经 RPC 丢类身份)映射为 404', async () => {
    const { app, harness } = await setup();
    harness.renameSession = async () => {
      throw new ByfError(ErrorCodes.SESSION_NOT_FOUND, 'session not found: ghost');
    };

    const res = await app.request('/api/sessions/ghost', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ title: 'Ghost' }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('NOT_FOUND');
  });

  test('PATCH 一次请求同时置顶 + 归档', async () => {
    const { app, harness } = await setup();
    seed(harness, 'ses_pin', '/proj');

    const res = await app.request('/api/sessions/ses_pin', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ pinned: true, archived: true }),
    });
    expect(res.status).toBe(200);
    expect(harness.metadataPatches).toEqual([
      { id: 'ses_pin', metadata: { pinned: true, archived: true } },
    ]);
  });

  test('PATCH 校验:title 超 200 字符 / 空白 / 空 body 返回 400', async () => {
    const { app } = await setup();

    const tooLong = await app.request('/api/sessions/ses_a', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ title: 'a'.repeat(201) }),
    });
    expect(tooLong.status).toBe(400);

    const blank = await app.request('/api/sessions/ses_a', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ title: '   ' }),
    });
    expect(blank.status).toBe(400);

    const empty = await app.request('/api/sessions/ses_a', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
  });

  test('PATCH 取消归档时把 hidden 工作区重新登记', async () => {
    const { app, harness } = await setup();
    const workDir = await mkdtemp(join(tmpdir(), 'wd-'));
    seed(harness, 'ses_unarchive', workDir);
    // PRD-0035 R-A6：workspaces.json 由 core 单源（SDK 透出）——fake 状态模拟
    // 「add 后 remove = hidden」+ 索引枚举（全量投影含 workDir）。
    harness.workspaceList = [workDir];
    harness.workspaceHidden = [workDir];
    harness.inspectableSessions = [
      {
        sessionId: 'ses_unarchive',
        sessionDir: '/tmp/ses_unarchive',
        workDir,
        title: 't',
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 1,
        updatedAt: 2,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
    ];

    const res = await app.request('/api/sessions/ses_unarchive', {
      method: 'PATCH',
      headers: writeHeaders(),
      body: JSON.stringify({ archived: false }),
    });
    expect(res.status).toBe(200);

    expect(harness.workspaceList).toContain(workDir);
  });

  test('POST /api/sessions/:id/fork 返回新会话 summary', async () => {
    const { app, harness } = await setup();
    seed(harness, 'ses_src', '/proj');
    const forked = seed(harness, 'ses_forked', '/proj', { title: 'Forked' });
    harness.nextForkResult = forked;

    const res = await app.request('/api/sessions/ses_src/fork', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({ upToMessage: 2 }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { session: SessionSummary };
    expect(data.session.id).toBe('ses_forked');
    expect(harness.forks).toEqual([{ id: 'ses_src', upToMessage: 2 }]);
  });

  test('POST fork 对 busy 会话返回 409,turn 结束后恢复', async () => {
    const { app, harness } = await setup();
    const session = seed(harness, 'ses_busy', '/proj');
    // resume 挂上事件监听(manager 跟踪 busy)
    await app.request('/api/sessions/ses_busy/resume', { method: 'POST', headers: writeHeaders() });
    session.emit({
      type: 'turn.started',
      sessionId: 'ses_busy',
      agentId: 'main',
      turnId: 0,
      origin: { kind: 'user' },
    });

    const busy = await app.request('/api/sessions/ses_busy/fork', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({}),
    });
    expect(busy.status).toBe(409);

    session.emit({
      type: 'turn.ended',
      sessionId: 'ses_busy',
      agentId: 'main',
      turnId: 0,
      reason: 'completed',
    });
    const forked = seed(harness, 'ses_forked2', '/proj');
    harness.nextForkResult = forked;
    const ok = await app.request('/api/sessions/ses_busy/fork', {
      method: 'POST',
      headers: writeHeaders(),
      body: JSON.stringify({}),
    });
    expect(ok.status).toBe(201);
  });

  test('fork busy 只由主 agent turn 生命周期驱动,子 agent 事件不参与', async () => {
    const { app, harness } = await setup();
    const session = seed(harness, 'ses_nested', '/proj');
    await app.request('/api/sessions/ses_nested/resume', {
      method: 'POST',
      headers: writeHeaders(),
    });

    const fork = () =>
      app.request('/api/sessions/ses_nested/fork', {
        method: 'POST',
        headers: writeHeaders(),
        body: JSON.stringify({}),
      });
    const childStarted = () => {
      session.emit({
        type: 'turn.started',
        sessionId: 'ses_nested',
        agentId: 'sub-1',
        turnId: 4,
        origin: { kind: 'user' },
      });
    };
    const childEnded = () => {
      session.emit({
        type: 'turn.ended',
        sessionId: 'ses_nested',
        agentId: 'sub-1',
        turnId: 4,
        reason: 'completed',
      });
    };

    // PRD-0037 #340（修 D2）：子 agent turn 进行中同样计为 busy——
    // 任意 lane 的任意操作（含子代理）不再误判空闲。
    harness.nextForkResult = seed(harness, 'ses_forked_sub', '/proj');
    childStarted();
    expect((await fork()).status).toBe(409);

    // 主 agent turn 期间,子 agent 结束不能清除 busy(深度计数天然正确)。
    harness.nextForkResult = seed(harness, 'ses_forked_main', '/proj');
    session.emit({
      type: 'turn.started',
      sessionId: 'ses_nested',
      agentId: 'main',
      turnId: 5,
      origin: { kind: 'user' },
    });
    expect((await fork()).status).toBe(409);
    childEnded();
    expect((await fork()).status).toBe(409);

    // 主 agent turn 结束后恢复可 fork。
    session.emit({
      type: 'turn.ended',
      sessionId: 'ses_nested',
      agentId: 'main',
      turnId: 5,
      reason: 'completed',
    });
    expect((await fork()).status).toBe(201);
  });

  test('GET /api/sessions 默认排除归档,?archived=true 仅返回归档', async () => {
    const { app, harness } = await setup();
    seed(harness, 'ses_normal', '/proj', { title: 'Normal', updatedAt: 10 });
    seed(harness, 'ses_arch', '/proj', { title: 'Archived', updatedAt: 20, archived: true });

    const def = (await (await app.request('/api/sessions?workDir=/proj')).json()) as {
      sessions: SessionSummary[];
    };
    expect(def.sessions.map((s) => s.id)).toEqual(['ses_normal']);

    const arch = (await (
      await app.request('/api/sessions?workDir=/proj&archived=true')
    ).json()) as { sessions: SessionSummary[] };
    expect(arch.sessions.map((s) => s.id)).toEqual(['ses_arch']);
  });

  test('GET /api/workspaces 的会话列表排除归档', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-ws-'));
    const { app, harness } = await setup(homeDir);
    const workDir = await mkdtemp(join(tmpdir(), 'wd-'));
    seed(harness, 'ses_normal', workDir, { title: 'Normal' });
    seed(harness, 'ses_arch', workDir, { title: 'Archived', archived: true });
    harness.inspectableSessions = [
      {
        sessionId: 'ses_normal',
        sessionDir: '/tmp/ses_normal',
        workDir,
        title: 'Normal',
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 1,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
      {
        sessionId: 'ses_arch',
        sessionDir: '/tmp/ses_arch',
        workDir,
        title: 'Archived',
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 2,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
    ];

    const res = await app.request('/api/workspaces');
    const data = (await res.json()) as {
      workspaces: { workDir: string; sessions: SessionSummary[] }[];
    };
    const view = data.workspaces.find((w) => w.workDir === workDir);
    expect(view?.sessions.map((s) => s.id)).toEqual(['ses_normal']);
  });

  test('GET /api/archived-sessions 聚合所有工作目录(含 hidden)按 updatedAt 倒序', async () => {
    const { app, harness } = await setup();
    const wd1 = await mkdtemp(join(tmpdir(), 'wd1-'));
    const wd2 = await mkdtemp(join(tmpdir(), 'wd2-'));
    seed(harness, 'ses_a1', wd1, { archived: true, updatedAt: 10 });
    seed(harness, 'ses_a2', wd2, { archived: true, updatedAt: 30 });
    seed(harness, 'ses_n', wd1, { updatedAt: 99 });
    harness.inspectableSessions = [
      {
        sessionId: 'ses_a1',
        sessionDir: '/tmp/ses_a1',
        workDir: wd1,
        title: null,
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 10,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
      {
        sessionId: 'ses_a2',
        sessionDir: '/tmp/ses_a2',
        workDir: wd2,
        title: null,
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 30,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
      {
        sessionId: 'ses_n',
        sessionDir: '/tmp/ses_n',
        workDir: wd1,
        title: null,
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 0,
        updatedAt: 99,
        agentCount: 0,
        mainAgentExists: false,
        mainWireRecordCount: 0,
        wireProtocolVersion: null,
        health: 'ok',
      },
    ];

    const res = await app.request('/api/archived-sessions');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { sessions: SessionSummary[] };
    expect(data.sessions.map((s) => s.id)).toEqual(['ses_a2', 'ses_a1']);
    expect(data.sessions.every((s) => s.archived === true)).toBe(true);
  });
});

// ---- 作用域白名单文件端点(PRD-0034 R-C2 / ADR-0036 D2) ------------------------

describe('GET /api/files scoped file endpoint (PRD-0034)', () => {
  async function setupFs(): Promise<{
    app: Awaited<ReturnType<typeof createApp>>['app'];
    homeDir: string;
    ws: string;
    outside: string;
  }> {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-files-home-'));
    const ws = await mkdtemp(join(tmpdir(), 'byf-files-ws-'));
    const outside = await mkdtemp(join(tmpdir(), 'byf-files-out-'));
    await writeFile(join(ws, 'a.ts'), 'const x = 1;\n', 'utf-8');
    await writeFile(join(outside, 'secret.txt'), 'secret\n', 'utf-8');
    const harness = new FakeHarness();
    harness.workspaceList = [ws];
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir });
    return { app: result.app, homeDir, ws, outside };
  }

  test('白名单内文本文件:200 + kind/language/content + ETag', async () => {
    const { app, ws } = await setupFs();
    const res = await app.request(`/api/files?path=${encodeURIComponent(join(ws, 'a.ts'))}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { kind: string; language: string; content: string };
    expect(data.kind).toBe('text');
    expect(data.language).toBe('ts');
    expect(data.content).toContain('const x = 1');
    expect(res.headers.get('etag')).toMatch(/^"?\d+-\d+"?$/);
  });

  test('白名单外路径 403;缺 path 400;不存在 404;目录 400', async () => {
    const { app, ws, outside } = await setupFs();

    const outsideRes = await app.request(
      `/api/files?path=${encodeURIComponent(join(outside, 'secret.txt'))}`,
    );
    expect(outsideRes.status).toBe(403);

    const missingParam = await app.request('/api/files');
    expect(missingParam.status).toBe(400);

    const notFound = await app.request(
      `/api/files?path=${encodeURIComponent(join(ws, 'nope.ts'))}`,
    );
    expect(notFound.status).toBe(404);

    const dir = await app.request(`/api/files?path=${encodeURIComponent(ws)}`);
    expect(dir.status).toBe(400);
  });

  test('.. 穿越与 symlink 逃逸被拒(403)', async () => {
    const { app, ws, outside } = await setupFs();
    const traversal = `/api/files?path=${encodeURIComponent(`${ws}/../${basename(outside)}/secret.txt`)}`;
    const travRes = await app.request(traversal);
    expect(travRes.status).toBe(403);

    await symlink(join(outside, 'secret.txt'), join(ws, 'link.txt'));
    const linkRes = await app.request(
      `/api/files?path=${encodeURIComponent(join(ws, 'link.txt'))}`,
    );
    expect(linkRes.status).toBe(403);
  });

  test('文本超 2MB → 413;媒体超 50MB → 413', async () => {
    const { app, ws } = await setupFs();
    // 稀疏文件:413 在读取前发生,内容无需真实写入(避免大缓冲拖慢并发套件)。
    await writeFile(join(ws, 'big.txt'), '', 'utf-8');
    await truncate(join(ws, 'big.txt'), 2 * 1024 * 1024 + 1);
    const bigText = await app.request(`/api/files?path=${encodeURIComponent(join(ws, 'big.txt'))}`);
    expect(bigText.status).toBe(413);

    await writeFile(join(ws, 'big.png'), '');
    await truncate(join(ws, 'big.png'), 50 * 1024 * 1024 + 1);
    const bigMedia = await app.request(
      `/api/files?path=${encodeURIComponent(join(ws, 'big.png'))}`,
    );
    expect(bigMedia.status).toBe(413);
  });

  test('图片返回二进制 + content-type;视频支持 Range 206', async () => {
    const { app, ws } = await setupFs();
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);
    await writeFile(join(ws, 'pic.png'), pngBytes);
    const img = await app.request(`/api/files?path=${encodeURIComponent(join(ws, 'pic.png'))}`);
    expect(img.status).toBe(200);
    expect(img.headers.get('content-type')).toBe('image/png');

    const mp4 = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));
    await writeFile(join(ws, 'clip.mp4'), mp4);
    const full = await app.request(`/api/files?path=${encodeURIComponent(join(ws, 'clip.mp4'))}`);
    expect(full.status).toBe(200);
    expect(full.headers.get('accept-ranges')).toBe('bytes');

    const partial = await app.request(
      `/api/files?path=${encodeURIComponent(join(ws, 'clip.mp4'))}`,
      {
        headers: { range: 'bytes=0-99' },
      },
    );
    expect(partial.status).toBe(206);
    expect(partial.headers.get('content-range')).toBe(`bytes 0-99/1000`);
    const body = Buffer.from(await partial.arrayBuffer());
    expect(body).toHaveLength(100);
  });

  test('If-None-Match 命中 ETag → 304', async () => {
    const { app, ws } = await setupFs();
    const path = `/api/files?path=${encodeURIComponent(join(ws, 'a.ts'))}`;
    const first = await app.request(path);
    const etag = first.headers.get('etag');
    expect(etag).not.toBeNull();
    const second = await app.request(path, { headers: { 'if-none-match': etag! } });
    expect(second.status).toBe(304);
  });

  test('media-originals 缓存在白名单内;hidden 工作区被拒', async () => {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-files-home2-'));
    const ws = await mkdtemp(join(tmpdir(), 'byf-files-ws2-'));
    await writeFile(join(ws, 'a.ts'), 'x', 'utf-8');
    const mediaDir = join(homeDir, 'sessions', 'wd_x', 'ses-1', 'media-originals');
    await mkdir(mediaDir, { recursive: true });
    await writeFile(join(mediaDir, 'abc.png'), Buffer.from([1, 2, 3]));

    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const { app } = await createTestApp({ manager, homeDir });

    const media = await app.request(
      `/api/files?path=${encodeURIComponent(join(mediaDir, 'abc.png'))}`,
    );
    expect(media.status).toBe(200);

    const hidden = await app.request(`/api/files?path=${encodeURIComponent(join(ws, 'a.ts'))}`);
    expect(hidden.status).toBe(403);
  });
});

// ---- LAN banner(PRD-0034 R-D1) -------------------------------------------------

describe('formatWebStartupBanner LAN URLs (PRD-0034)', () => {
  test('非回环绑定时列出各 LAN IP 完整 URL(含 token)+ 轮换提示;回环不列 LAN 行', async () => {
    const { formatWebStartupBanner } = await import('./startup-banner');
    // PRD-0038 F4:`authToken` 是必填项,因为 `resolveAuthToken` 保证每次启动都
    // 有生效 token。原来"不传 token → auth=disabled"那一支在运行时不可达,只是
    // 让同一行横幅说出假话,所以它连同这条断言一起被删掉。
    const loopback = formatWebStartupBanner({
      authToken: 'tok-loopback',
      host: '127.0.0.1',
      port: 4100,
      byfHome: '/home/u/.byf',
    });
    expect(loopback).toBe(
      '[web-server] listening on http://127.0.0.1:4100 ' +
        '(auth=required, token=tok-loopback, BYF_HOME=/home/u/.byf)\n',
    );
    expect(loopback).not.toContain('auth=disabled');

    const lan = formatWebStartupBanner({
      host: '0.0.0.0',
      port: 4100,
      byfHome: '/home/u/.byf',
      authToken: 'tok-123',
      lanIps: ['192.168.1.5', '10.0.0.3'],
    });
    expect(lan).toContain('listening on http://0.0.0.0:4100 (auth=required');
    expect(lan).toContain('http://192.168.1.5:4100/?token=tok-123');
    expect(lan).toContain('http://10.0.0.3:4100/?token=tok-123');
    expect(lan).toContain('轮换');
  });

  test('collectLanIps 排除回环与内网 IPv6,返回 IPv4 地址', async () => {
    const { collectLanIps } = await import('./startup-banner');
    const ips = collectLanIps([
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8',
        family: 'IPv4',
      },
      {
        address: '192.168.1.5',
        netmask: '255.255.255.0',
        mac: 'aa:bb:cc:dd:ee:ff',
        internal: false,
        cidr: '192.168.1.5/24',
        family: 'IPv4',
      },
      {
        address: 'fe80::1',
        netmask: 'ffff:ffff:ffff:ffff::',
        mac: 'aa:bb:cc:dd:ee:ff',
        internal: false,
        cidr: null,
        family: 'IPv6',
        scopeid: 5,
      },
    ]);
    expect(ips).toEqual(['192.168.1.5']);
  });
});

// ---- provider/models 配置管理(PRD-0034 R-D3) -----------------------------------

describe('config management routes (PRD-0034 R-D3)', () => {
  async function setup(): Promise<{
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }> {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager });
    return { app: result.app, harness };
  }

  const json = (): Record<string, string> => writeHeaders();

  test('POST /api/config/providers:slug 校验/查重/baseUrl 必填,合法时一次建全', async () => {
    const { app, harness } = await setup();
    const badSlug = await app.request('/api/config/providers', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        id: 'Bad_Slug',
        type: 'openai-completions',
        baseUrl: 'https://x/v1',
        models: [],
      }),
    });
    expect(badSlug.status).toBe(400);

    const noUrl = await app.request('/api/config/providers', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ id: 'good', type: 'openai-completions', models: [] }),
    });
    expect(noUrl.status).toBe(400);

    const noModels = await app.request('/api/config/providers', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        id: 'good',
        type: 'openai-completions',
        baseUrl: 'https://x/v1',
        models: [],
      }),
    });
    expect(noModels.status).toBe(400);

    harness.config = {
      providers: { existing: { type: 'openai-completions' } },
      models: {},
    };
    const dup = await app.request('/api/config/providers', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        id: 'existing',
        type: 'openai-completions',
        baseUrl: 'https://x/v1',
        models: [{ id: 'm', model: 'gpt', maxContextSize: 128000 }],
      }),
    });
    expect(dup.status).toBe(409);

    const ok = await app.request('/api/config/providers', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        id: 'myprov',
        type: 'openai-completions',
        baseUrl: 'https://x/v1',
        apiKey: 'sk-draft',
        models: [{ id: 'fast', model: 'gpt-4o-mini', maxContextSize: 128000 }],
      }),
    });
    expect(ok.status).toBe(201);
    const merged = harness.config as unknown as {
      providers: Record<string, unknown>;
      models: Record<string, unknown>;
    };
    expect(merged.providers['myprov']).toMatchObject({
      type: 'openai-completions',
      baseUrl: 'https://x/v1',
      apiKey: 'sk-draft',
    });
    expect(merged.models['fast']).toMatchObject({ provider: 'myprov', model: 'gpt-4o-mini' });
  });

  test('PATCH /api/config/providers/:id:apiKey 留空 = 不变;其余字段深合并', async () => {
    const { app, harness } = await setup();
    harness.config = {
      providers: {
        myprov: { type: 'openai-completions', baseUrl: 'https://old/v1', apiKey: 'sk-keep' },
      },
      models: {},
    };
    const res = await app.request('/api/config/providers/myprov', {
      method: 'PATCH',
      headers: json(),
      body: JSON.stringify({ baseUrl: 'https://new/v1' }),
    });
    expect(res.status).toBe(200);
    const provider = (
      harness.config as unknown as {
        providers: Record<string, { baseUrl?: string; apiKey?: string }>;
      }
    ).providers['myprov'];
    expect(provider?.baseUrl).toBe('https://new/v1');
    expect(provider?.apiKey).toBe('sk-keep');
  });

  test('POST/PATCH/DELETE /api/config/models:别名查重、更新、删除清理 defaultModel', async () => {
    const { app, harness } = await setup();
    harness.config = {
      providers: { p: { type: 'openai-completions' } },
      models: { existing: { provider: 'p', model: 'm1', maxContextSize: 1000 } },
      defaultModel: 'existing',
    };

    const dup = await app.request('/api/config/models', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ id: 'existing', provider: 'p', model: 'm2', maxContextSize: 1000 }),
    });
    expect(dup.status).toBe(409);

    const created = await app.request('/api/config/models', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ id: 'alias2', provider: 'p', model: 'm2', maxContextSize: 2000 }),
    });
    expect(created.status).toBe(201);

    const patched = await app.request('/api/config/models/alias2', {
      method: 'PATCH',
      headers: json(),
      body: JSON.stringify({ model: 'm2-new' }),
    });
    expect(patched.status).toBe(200);
    expect(
      (harness.config as unknown as { models: Record<string, { model?: string }> }).models['alias2']
        ?.model,
    ).toBe('m2-new');

    const removed = await app.request('/api/config/models/existing', {
      method: 'DELETE',
      headers: writeHeaders(),
    });
    expect(removed.status).toBe(200);
    expect(harness.removedModels).toEqual(['existing']);
  });

  test('POST /api/config/discover-models:草稿探测远端 /v1/models,不落盘', async () => {
    const { app, harness } = await setup();
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), {
        status: 200,
        headers: writeHeaders(),
      }),
    );
    const res = await app.request('/api/config/discover-models', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        type: 'openai-completions',
        baseUrl: 'https://draft.example/v1',
        apiKey: 'sk-draft',
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { models: { id: string }[] };
    expect(data.models.map((m) => m.id)).toEqual(['model-a', 'model-b']);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe('https://draft.example/v1/models');
    expect((calledInit?.headers as Record<string, string>)['authorization']).toBe(
      'Bearer sk-draft',
    );
    fetchMock.mockRestore();
    // 不落盘:config 未变
    expect(harness.metadataPatches).toEqual([]);
    expect(harness.config.providers).toEqual({});
  });
});

// ---- PRD-0035 Wave B：Inspector / 删除 / config raw 路由 --------------------

describe('Inspector & session delete routes (PRD-0035 R-B1)', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }

  async function setup(): Promise<Env> {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  const json = (): Record<string, string> => writeHeaders();

  it('GET /api/sessions without workDir returns the full inspectable projection', async () => {
    const { app, harness } = await setup();
    harness.inspectableSessions = [
      {
        sessionId: 'session_1',
        sessionDir: '/tmp/sessions/w/session_1',
        workDir: '/w',
        title: 't',
        lastPrompt: null,
        isCustomTitle: false,
        createdAt: 1,
        updatedAt: 2,
        agentCount: 1,
        mainAgentExists: true,
        mainWireRecordCount: 3,
        wireProtocolVersion: '1.1',
        health: 'ok',
      },
    ];
    const res = await app.request('/api/sessions');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { sessions: InspectorSessionSummary[] };
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions?.[0]?.health).toBe('ok');
  });

  it('DELETE /api/sessions/:id delegates to the harness', async () => {
    const { app, harness } = await setup();
    const res = await app.request('/api/sessions/session_x', {
      method: 'DELETE',
      headers: writeHeaders(),
    });
    expect(res.status).toBe(200);
    expect(harness.deletedSessions).toEqual(['session_x']);
  });

  it('DELETE of a live session returns 409 SESSION_BUSY without touching the harness', async () => {
    const { app, harness } = await setup();
    // live 会话须经 manager.createSession 创建（attach 进 manager.sessions 才判 busy）
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ workDir: '/w' }),
    });
    expect(created.status).toBe(201);
    const { session } = (await created.json()) as { session: { id: string } };
    const res = await app.request(`/api/sessions/${session.id}`, {
      method: 'DELETE',
      headers: writeHeaders(),
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('SESSION_BUSY');
    expect(harness.deletedSessions).toEqual([]);
  });

  it('GET /api/sessions/:id/wire returns the wire response with agent query', async () => {
    const { app, harness } = await setup();
    harness.wireResponses.set('session_a:main', {
      sessionId: 'session_a',
      agentId: 'main',
      protocolVersion: '1.1',
      metadata: { protocolVersion: '1.1', createdAt: 1 },
      records: [
        {
          lineNo: 1,
          data: { type: 'metadata', protocol_version: '1.1', created_at: 1 } as never,
          raw: {},
        },
      ],
      warnings: ['best-effort'],
    });
    const res = await app.request('/api/sessions/session_a/wire?agent=main');
    expect(res.status).toBe(200);
    const data = (await res.json()) as WireResponse;
    expect(data.agentId).toBe('main');
    expect(data.warnings).toEqual(['best-effort']);
  });

  it('GET /api/sessions/:id/wire rejects unsafe agent ids with 400', async () => {
    const { app } = await setup();
    const res = await app.request('/api/sessions/session_a/wire?agent=../etc');
    expect(res.status).toBe(400);
  });

  it('GET /api/sessions/:id/agents returns the agent tree', async () => {
    const { app, harness } = await setup();
    harness.agentTrees.set('session_a', {
      sessionId: 'session_a',
      tree: [
        {
          agentId: 'main',
          type: 'main',
          parentAgentId: null,
          homedir: '/x',
          wireExists: true,
          wireRecordCount: 1,
          wireProtocolVersion: '1.1',
          children: [],
        },
      ],
    });
    const res = await app.request('/api/sessions/session_a/agents');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { tree: unknown[] };
    expect(data.tree).toHaveLength(1);
  });

  it('GET /api/sessions/:id/state returns 404 when the session is unknown', async () => {
    const { app } = await setup();
    const res = await app.request('/api/sessions/session_nope/state');
    expect(res.status).toBe(404);
  });
});

describe('Config raw routes (PRD-0035 Wave E / ADR-0038)', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }

  async function setup(): Promise<Env> {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  const json = (): Record<string, string> => writeHeaders();

  it('GET /api/config/raw masks api_key values and returns revision', async () => {
    const { app, harness } = await setup();
    harness.configDocument = {
      path: '/tmp/config.toml',
      text: '[providers.d]\napi_key = "sk-top-secret"\n',
      revision: 'rev-abc',
      parsed: { providers: {}, models: {} },
    };
    const res = await app.request('/api/config/raw');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { text: string; revision: string };
    expect(data.revision).toBe('rev-abc');
    expect(data.text).not.toContain('sk-top-secret');
    expect(data.text).toContain('__BYF_KEEP_SECRET__');
  });

  it('GET /api/config/raw on corrupt file returns 200 + invalid (无细节泄漏)', async () => {
    const { app, harness } = await setup();
    harness.configDocumentError = new ByfError(ErrorCodes.CONFIG_INVALID, 'Invalid configuration');
    const res = await app.request('/api/config/raw');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { invalid?: boolean; parsed: unknown; text: string };
    expect(data.invalid).toBe(true);
    expect(data.parsed).toBeNull();
    expect(data.text).toBe('');
  });

  it('POST /api/config/validate forwards the text', async () => {
    const { app, harness } = await setup();
    const res = await app.request('/api/config/validate', {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ text: '# ok\n' }),
    });
    expect(res.status).toBe(200);
    expect(harness.configValidationTexts).toEqual(['# ok\n']);
  });

  it('PUT /api/config/raw restores masked secrets before writing', async () => {
    const { app, harness } = await setup();
    harness.configDocument = {
      path: '/tmp/config.toml',
      text: '[providers.d]\napi_key = "sk-top-secret"\n',
      revision: 'rev-abc',
      parsed: { providers: {}, models: {} },
    };
    const maskedText = '[providers.d]\napi_key = "__BYF_KEEP_SECRET__"\n';
    const res = await app.request('/api/config/raw', {
      method: 'PUT',
      headers: json(),
      body: JSON.stringify({ text: maskedText, expectedRevision: 'rev-abc' }),
    });
    expect(res.status).toBe(200);
    expect(harness.configWriteCalls).toHaveLength(1);
    // 占位符被还原为磁盘原值，写盘的是原文（不含占位符）
    expect(harness.configWriteCalls[0]?.text).toContain('sk-top-secret');
    expect(harness.configWriteCalls[0]?.text).not.toContain('__BYF_KEEP_SECRET__');
    expect(harness.configWriteCalls[0]?.expectedRevision).toBe('rev-abc');
  });

  it('PUT /api/config/raw maps revision conflict to 409', async () => {
    const { app, harness } = await setup();
    harness.configWriteError = new ByfError(
      ErrorCodes.CONFIG_REVISION_CONFLICT,
      'Config revision mismatch',
    );
    const res = await app.request('/api/config/raw', {
      method: 'PUT',
      headers: json(),
      body: JSON.stringify({ text: '# new\n', expectedRevision: 'stale' }),
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('CONFIG_REVISION_CONFLICT');
  });

  it('PUT /api/config/raw maps invalid config to 422', async () => {
    const { app, harness } = await setup();
    harness.configWriteError = new ByfError(ErrorCodes.CONFIG_INVALID, 'Invalid configuration');
    const res = await app.request('/api/config/raw', {
      method: 'PUT',
      headers: json(),
      body: JSON.stringify({ text: 'default_model = 123', expectedRevision: 'r' }),
    });
    expect(res.status).toBe(422);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('CONFIG_INVALID');
  });
});

describe('MCP config routes (PRD-0036 / ADR-0039)', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }

  async function setup(workDir = '/work/ws'): Promise<Env> {
    const harness = new FakeHarness();
    harness.workspaceList = [workDir];
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  it('GET /api/mcp/servers requires workDir', async () => {
    const { app } = await setup();
    const res = await app.request('/api/mcp/servers');
    expect(res.status).toBe(400);
  });

  it('GET /api/mcp/servers rejects unregistered workDir (R-C5)', async () => {
    const { app } = await setup('/work/ws');
    const res = await app.request(`/api/mcp/servers?workDir=${encodeURIComponent('/etc')}`);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('BAD_REQUEST');
  });

  it('GET /api/mcp/servers returns per-scope listing with overridden flags', async () => {
    const { app, harness } = await setup();
    harness.mcpListing = {
      user: {
        path: '/home/u/.byf/mcp.json',
        servers: [
          {
            name: 'shared',
            config: { transport: 'http', url: 'http://example.test/mcp' },
            overridden: true,
          },
        ],
      },
      project: {
        path: '/work/ws/.byf/mcp.json',
        servers: [{ name: 'shared', config: { transport: 'stdio', command: 'run' } }],
      },
    };
    const res = await app.request(`/api/mcp/servers?workDir=${encodeURIComponent('/work/ws')}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as McpConfigListing;
    expect(data.user?.servers[0]?.overridden).toBe(true);
    expect(data.project?.servers[0]?.name).toBe('shared');
    expect(harness.mcpListCalls).toEqual(['/work/ws']);
  });

  it('GET /api/mcp/servers masks env values in entries (D1)', async () => {
    const { app, harness } = await setup();
    harness.mcpListing = {
      user: {
        path: '/home/u/.byf/mcp.json',
        servers: [
          {
            name: 'gh',
            config: {
              transport: 'stdio',
              command: 'gh-mcp',
              env: { GITHUB_TOKEN: '__MCP_MASKED_1__' },
            },
          },
        ],
      },
      project: { path: '/work/ws/.byf/mcp.json', servers: [] },
    };
    const res = await app.request(`/api/mcp/servers?workDir=${encodeURIComponent('/work/ws')}`);
    const data = (await res.json()) as McpConfigListing;
    const text = JSON.stringify(data);
    expect(text).not.toContain('ghp-secret');
    expect(text).toContain('__MCP_MASKED_1__');
  });

  it('GET /api/mcp/raw/:scope validates scope and forwards workDir', async () => {
    const { app, harness } = await setup();
    const res = await app.request(`/api/mcp/raw/user?workDir=${encodeURIComponent('/work/ws')}`);
    expect(res.status).toBe(200);
    expect(harness.mcpRawCalls).toEqual([{ workDir: '/work/ws', scope: 'user' }]);

    const badScope = await app.request(
      `/api/mcp/raw/other?workDir=${encodeURIComponent('/work/ws')}`,
    );
    expect(badScope.status).toBe(400);
  });

  it('GET /api/mcp/raw/:scope returns disk original text for corrupt file (D3)', async () => {
    const { app, harness } = await setup();
    harness.mcpRawDocs.set('project', {
      path: '/work/ws/.byf/mcp.json',
      text: '{ "mcpServers": ',
      invalid: { message: 'Unexpected end of JSON input' },
    });
    const res = await app.request(`/api/mcp/raw/project?workDir=${encodeURIComponent('/work/ws')}`);
    const data = (await res.json()) as McpRawDocument;
    expect(data.text).toBe('{ "mcpServers": ');
    expect(data.invalid?.message).toContain('JSON');
  });
});

describe('MCP config write routes (PRD-0036 #313)', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }

  async function setup(workDir = '/work/ws'): Promise<Env> {
    const harness = new FakeHarness();
    harness.workspaceList = [workDir];
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  const json = (): Record<string, string> => writeHeaders();

  it('PUT /api/mcp/servers/:scope upserts with name + config', async () => {
    const { app, harness } = await setup();
    const res = await app.request(
      `/api/mcp/servers/project?workDir=${encodeURIComponent('/work/ws')}`,
      {
        method: 'PUT',
        headers: json(),
        body: JSON.stringify({
          name: 'github',
          config: { transport: 'stdio', command: 'gh', enabled: true },
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(harness.mcpUpsertCalls).toEqual([
      {
        workDir: '/work/ws',
        scope: 'project',
        name: 'github',
        config: { transport: 'stdio', command: 'gh', enabled: true },
      },
    ]);
  });

  it('PUT /api/mcp/servers/:scope rejects bad scope / missing name / unregistered workDir', async () => {
    const { app } = await setup();
    const badScope = await app.request(
      `/api/mcp/servers/global?workDir=${encodeURIComponent('/work/ws')}`,
      {
        method: 'PUT',
        headers: json(),
        body: JSON.stringify({ name: 'a', config: {} }),
      },
    );
    expect(badScope.status).toBe(400);

    const noName = await app.request(
      `/api/mcp/servers/user?workDir=${encodeURIComponent('/work/ws')}`,
      {
        method: 'PUT',
        headers: json(),
        body: JSON.stringify({ config: {} }),
      },
    );
    expect(noName.status).toBe(400);

    const badDir = await app.request(
      `/api/mcp/servers/user?workDir=${encodeURIComponent('/etc')}`,
      {
        method: 'PUT',
        headers: json(),
        body: JSON.stringify({ name: 'a', config: {} }),
      },
    );
    expect(badDir.status).toBe(400);
  });

  it('PUT /api/mcp/servers/:scope maps config.invalid to 422', async () => {
    const { app, harness } = await setup();
    harness.mcpWriteError = new ByfError(ErrorCodes.CONFIG_INVALID, 'Invalid MCP config');
    const res = await app.request(
      `/api/mcp/servers/user?workDir=${encodeURIComponent('/work/ws')}`,
      {
        method: 'PUT',
        headers: json(),
        body: JSON.stringify({ name: 'a', config: { transport: 'stdio' } }),
      },
    );
    expect(res.status).toBe(422);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('CONFIG_INVALID');
  });

  it('DELETE /api/mcp/servers/:scope/:name removes and maps not-found to 404', async () => {
    const { app, harness } = await setup();
    const ok = await app.request(
      `/api/mcp/servers/user/old?workDir=${encodeURIComponent('/work/ws')}`,
      { method: 'DELETE', headers: writeHeaders() },
    );
    expect(ok.status).toBe(200);
    expect(harness.mcpRemoveCalls).toEqual([{ workDir: '/work/ws', scope: 'user', name: 'old' }]);

    harness.mcpWriteError = new ByfError(
      ErrorCodes.MCP_SERVER_NOT_FOUND,
      'MCP server "old" not found',
    );
    const missing = await app.request(
      `/api/mcp/servers/user/old?workDir=${encodeURIComponent('/work/ws')}`,
      { method: 'DELETE', headers: writeHeaders() },
    );
    expect(missing.status).toBe(404);
  });

  it('PUT /api/mcp/raw/:scope writes raw text; invalid maps to 422', async () => {
    const { app, harness } = await setup();
    const ok = await app.request(`/api/mcp/raw/project?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'PUT',
      headers: json(),
      body: JSON.stringify({ text: '{\n  "mcpServers": {}\n}\n' }),
    });
    expect(ok.status).toBe(200);
    expect(harness.mcpRawWriteCalls).toHaveLength(1);

    harness.mcpWriteError = new ByfError(ErrorCodes.CONFIG_INVALID, 'Invalid JSON');
    const bad = await app.request(
      `/api/mcp/raw/project?workDir=${encodeURIComponent('/work/ws')}`,
      {
        method: 'PUT',
        headers: json(),
        body: JSON.stringify({ text: '{ broken' }),
      },
    );
    expect(bad.status).toBe(422);
  });

  it('POST /api/mcp/test probes a server without persisting', async () => {
    const { app, harness } = await setup();
    harness.mcpTestResult = { ok: false, toolCount: 0, error: 'spawn npx ENOENT' };
    // PRD-0038 AC-1.3:/api/mcp/test 的 stdio command 必须已在任一 scope 的已保存
    // 配置中出现(白名单),因此被测命令要先出现在 listing 里——测的正是"改过参数、
    // 保存前先测"这条真实体验。
    harness.mcpListing = {
      user: { path: '/home/u/.byf/mcp.json', servers: [] },
      project: {
        path: '/work/ws/.byf/mcp.json',
        servers: [{ name: 'github', config: { transport: 'stdio', command: 'gh' } }],
      },
    };
    const res = await app.request(`/api/mcp/test?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        scope: 'project',
        name: 'github',
        config: { transport: 'stdio', command: 'gh', enabled: true },
      }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as McpConnectionTestResult;
    expect(data).toEqual({ ok: false, toolCount: 0, error: 'spawn npx ENOENT' });
    expect(harness.mcpTestCalls).toEqual([
      {
        workDir: '/work/ws',
        scope: 'project',
        name: 'github',
        config: { transport: 'stdio', command: 'gh', enabled: true },
      },
    ]);
    expect(harness.mcpUpsertCalls).toEqual([]);
  });

  it('POST /api/mcp/test rejects bad scope / config / unregistered workDir', async () => {
    const { app } = await setup();
    const badScope = await app.request(`/api/mcp/test?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ scope: 'global', config: {} }),
    });
    expect(badScope.status).toBe(400);

    const noConfig = await app.request(`/api/mcp/test?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ scope: 'user' }),
    });
    expect(noConfig.status).toBe(400);

    const badDir = await app.request(`/api/mcp/test?workDir=${encodeURIComponent('/etc')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ scope: 'user', config: { transport: 'stdio' } }),
    });
    expect(badDir.status).toBe(400);
  });

  it('POST /api/mcp/test maps config.invalid to 422', async () => {
    const { app, harness } = await setup();
    harness.mcpTestError = new ByfError(ErrorCodes.CONFIG_INVALID, 'Invalid MCP config');
    const res = await app.request(`/api/mcp/test?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ scope: 'user', config: { transport: 'stdio' } }),
    });
    expect(res.status).toBe(422);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('CONFIG_INVALID');
  });
});

describe('Skill listing route (PRD-0036 #314)', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }

  async function setup(workDir = '/work/ws'): Promise<Env> {
    const harness = new FakeHarness();
    harness.workspaceList = [workDir];
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  it('GET /api/skills returns the grouped listing for a registered workDir', async () => {
    const { app, harness } = await setup();
    harness.skillListing = {
      userHomeDir: '/home/u',
      projectRoot: '/work/ws',
      groups: [
        {
          scope: 'project',
          roots: [{ path: '/work/ws/.byf/skills', source: 'project', writable: true }],
          skills: [
            {
              name: 'deploy',
              description: 'deploy it',
              path: '/work/ws/.byf/skills/deploy/SKILL.md',
              dir: '/work/ws/.byf/skills/deploy',
              source: 'project',
              writable: true,
            },
          ],
        },
        {
          scope: 'user',
          roots: [
            { path: '/home/u/.byf/skills', source: 'user', writable: true },
            { path: '/home/u/.agents/skills', source: 'user', writable: false },
          ],
          skills: [
            {
              name: 'deploy',
              description: 'shadowed global',
              path: '/home/u/.byf/skills/deploy/SKILL.md',
              dir: '/home/u/.byf/skills/deploy',
              source: 'user',
              shadowed: true,
              writable: true,
            },
          ],
        },
      ],
    };
    const res = await app.request(`/api/skills?workDir=${encodeURIComponent('/work/ws')}`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as WorkspaceSkillListing;
    expect(data.groups).toHaveLength(2);
    expect(data.groups[0]?.skills[0]?.name).toBe('deploy');
    expect(data.groups[1]?.skills[0]?.shadowed).toBe(true);
    expect(harness.skillListCalls).toEqual(['/work/ws']);
  });

  it('GET /api/skills requires a registered workDir (R-C5)', async () => {
    const { app } = await setup('/work/ws');
    const noDir = await app.request('/api/skills');
    expect(noDir.status).toBe(400);
    const badDir = await app.request(`/api/skills?workDir=${encodeURIComponent('/etc')}`);
    expect(badDir.status).toBe(400);
  });
});

describe('Skill write routes (PRD-0036 #315)', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
  }

  async function setup(workDir = '/work/ws'): Promise<Env> {
    const harness = new FakeHarness();
    harness.workspaceList = [workDir];
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  const json = (): Record<string, string> => writeHeaders();

  it('POST /api/skills creates and returns 201 with the template result', async () => {
    const { app, harness } = await setup();
    const res = await app.request(`/api/skills?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({
        scope: 'project',
        name: 'deploy-helper',
        description: 'Deploy the app',
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { skill: { name: string } };
    expect(data.skill.name).toBe('deploy-helper');
    expect(harness.skillCreateCalls).toHaveLength(1);
  });

  it('POST /api/skills maps same-scope duplicate to 409', async () => {
    const { app, harness } = await setup();
    harness.skillWriteError = new ByfError(
      ErrorCodes.SKILL_ALREADY_EXISTS,
      'Skill "x" already exists',
    );
    const res = await app.request(`/api/skills?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ scope: 'user', name: 'x', description: 'd' }),
    });
    expect(res.status).toBe(409);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('CONFLICT');
  });

  it('POST /api/skills validates scope/name/description', async () => {
    const { app } = await setup();
    const badScope = await app.request(`/api/skills?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ scope: 'global', name: 'x', description: 'd' }),
    });
    expect(badScope.status).toBe(400);
    const noName = await app.request(`/api/skills?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: json(),
      body: JSON.stringify({ scope: 'user', description: 'd' }),
    });
    expect(noName.status).toBe(400);
  });

  it('DELETE /api/skills removes by path; outside-root paths map to 403 (R-C5)', async () => {
    const { app, harness } = await setup();
    const ok = await app.request(
      `/api/skills?workDir=${encodeURIComponent('/work/ws')}&path=${encodeURIComponent('/work/ws/.byf/skills/gone/SKILL.md')}`,
      { method: 'DELETE', headers: writeHeaders() },
    );
    expect(ok.status).toBe(200);
    expect(harness.skillRemoveCalls).toEqual([
      { workDir: '/work/ws', skillPath: '/work/ws/.byf/skills/gone/SKILL.md' },
    ]);

    harness.skillWriteError = new ByfError(
      ErrorCodes.REQUEST_INVALID,
      'Refusing to delete skill outside .byf/skills roots',
    );
    const forbidden = await app.request(
      `/api/skills?workDir=${encodeURIComponent('/work/ws')}&path=${encodeURIComponent('/etc/hosts')}`,
      { method: 'DELETE', headers: writeHeaders() },
    );
    expect(forbidden.status).toBe(403);

    harness.skillWriteError = new ByfError(ErrorCodes.SKILL_NOT_FOUND, 'Skill path not found');
    const missing = await app.request(
      `/api/skills?workDir=${encodeURIComponent('/work/ws')}&path=${encodeURIComponent('/work/ws/.byf/skills/nope/SKILL.md')}`,
      { method: 'DELETE', headers: writeHeaders() },
    );
    expect(missing.status).toBe(404);
  });
});

// ---- PRD-0038 R1 本地服务安全边界 ---------------------------------------------
// AC-1.1 跨站简单请求门 / AC-1.2 回环写必须持 token / AC-1.3 mcp/test 命令白名单 /
// AC-1.4+AC-1.5 配置原文编辑器数据安全(真实磁盘)。全部只经 HTTP 公开面
// (createApp + app.request)与包导出函数断言。

/** PRD-0038 AC-1.1:Content-Type 门 + Origin/标记头门,拒绝且零副作用。 */
describe('PRD-0038 AC-1.1 cross-site simple-request gate', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
    token: string | undefined;
  }

  const GATE_TOKEN = 'a-gate-token-0123456789';

  async function setup(authToken: string | undefined = GATE_TOKEN): Promise<Env> {
    const harness = new FakeHarness();
    harness.workspaceList = ['/work/ws'];
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, authToken });
    const autoToken = (result as unknown as { authToken?: string }).authToken;
    return { app: result.app, harness, token: authToken ?? autoToken };
  }

  /** 满足除被测条件外的全部写门:JSON CT + 标记头 + Bearer。 */
  function writeHeaders(env: Env, extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [BYF_MARKER]: 'byf-web',
      ...extra,
    };
    if (env.token !== undefined) headers['authorization'] = `Bearer ${env.token}`;
    return headers;
  }

  function expect4xx(status: number): void {
    expect(status).toBeGreaterThanOrEqual(400);
    expect(status).toBeLessThan(500);
  }

  it('POST /api/sessions 携带 text/plain Content-Type 被拒 4xx 且未创建会话', async () => {
    const env = await setup();
    const res = await env.app.request('/api/sessions', {
      method: 'POST',
      // 表单式简单请求:无预检的 text/plain,body 内容是合法 JSON 文本
      headers: {
        'content-type': 'text/plain',
        [BYF_MARKER]: 'byf-web',
        ...(env.token !== undefined ? { authorization: `Bearer ${env.token}` } : {}),
      },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect4xx(res.status);
    expect(env.harness.sessions.size).toBe(0);
  });

  it('PUT /api/config/raw 携带 text/plain Content-Type 被拒 4xx 且零写盘', async () => {
    const env = await setup();
    env.harness.configDocument = {
      path: '/tmp/config.toml',
      text: '# keep\n',
      revision: 'rev-keep',
      parsed: { providers: {}, models: {} },
    };
    const res = await env.app.request('/api/config/raw', {
      method: 'PUT',
      headers: {
        'content-type': 'text/plain',
        [BYF_MARKER]: 'byf-web',
        ...(env.token !== undefined ? { authorization: `Bearer ${env.token}` } : {}),
      },
      body: JSON.stringify({ text: '# destroyed\n', expectedRevision: 'rev-keep' }),
    });
    expect4xx(res.status);
    expect(env.harness.configWriteCalls).toHaveLength(0);
  });

  it('携带跨源 Origin 的 JSON 写请求被拒 4xx 且未创建会话', async () => {
    const env = await setup();
    const res = await env.app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(env, { origin: 'http://evil.example' }),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect4xx(res.status);
    expect(env.harness.sessions.size).toBe(0);
  });

  it('跨源 Origin 的 DELETE 写请求被拒 4xx 且 provider 未被移除', async () => {
    const env = await setup();
    env.harness.config = { providers: { a: { type: 'anthropic' } }, models: {} };
    const res = await env.app.request('/api/config/providers/a', {
      method: 'DELETE',
      headers: writeHeaders(env, { origin: 'https://attacker.test' }),
    });
    expect4xx(res.status);
    expect(env.harness.config.providers['a']).toBeDefined();
    expect(env.harness.removedModels).toEqual([]);
  });

  it('无 Origin 且无 X-Byf-Requested-With 标记头的写请求被拒 4xx(Q1 条件 2)', async () => {
    const env = await setup();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (env.token !== undefined) headers['authorization'] = `Bearer ${env.token}`;
    const res = await env.app.request('/api/sessions', {
      method: 'POST',
      headers,
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect4xx(res.status);
    expect(env.harness.sessions.size).toBe(0);
  });

  it('同源 Origin 的写请求放行(门不得误杀 SPA 自身请求)', async () => {
    const env = await setup();
    const res = await env.app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(env, { origin: 'http://localhost' }),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect(res.status).toBe(201);
    expect(env.harness.sessions.size).toBe(1);
  });

  it('仅携带 X-Byf-Requested-With(无 Origin)的写请求放行', async () => {
    const env = await setup();
    const res = await env.app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(env),
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect(res.status).toBe(201);
  });

  it('回环默认(未配 token)只读 GET 免凭证仍 200(SPA 首屏不破坏)', async () => {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const { app } = await createTestApp({ manager });
    const res = await app.request('/api/sessions?workDir=/x');
    expect(res.status).toBe(200);
  });
});

/**
 * 真 socket 手写 HTTP/1.1 —— 唯一能伪造 `Host` 头的办法。`fetch` 里 `Host` 是
 * forbidden header name(浏览器与 Bun/node 都不允许设),而 DNS rebinding 到达本机
 * 时服务器看到的**就是这些字节**,所以这一层不是"绕开测试",而是把被测试的东西
 * 换成线上形态本身。
 */
async function rawHttpRequest(
  port: number,
  lines: readonly string[],
): Promise<{ status: number; head: string; body: string }> {
  const raw = await new Promise<string>((resolvePromise, reject) => {
    let data = '';
    const sock = connect(port, '127.0.0.1', () => {
      sock.write([...lines, '', ''].join('\r\n'));
    });
    sock.setEncoding('utf8');
    sock.on('data', (chunk: string) => {
      data += chunk;
      if (data.includes('\r\n\r\n')) {
        sock.destroy();
        resolvePromise(data);
      }
    });
    sock.on('error', reject);
    setTimeout(() => {
      sock.destroy();
      resolvePromise(data);
    }, 3000);
  });
  const split = raw.indexOf('\r\n\r\n');
  const head = split === -1 ? raw : raw.slice(0, split);
  const body = split === -1 ? '' : raw.slice(split + 4);
  return { status: Number(/^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1] ?? 0), head, body };
}

/**
 * PRD-0038 AC-1.1：DNS rebinding 的 `Host` 允许集合门（review F1）。
 *
 * 威胁形态：攻击者域名 TTL=0 解析到 127.0.0.1 之后，页面发出的每个请求同时带
 * `Host: evil.test:4100` 与 `Origin: http://evil.test:4100`。Bun 的 `c.req.url`
 * 主机部分正是从请求自带的 `Host` 头拼出来的（下面的 e2e 用例用真 socket 钉住这条
 * 事实），于是 `isSameOrigin` 退化为"攻击者写的 A 和他写的 A 相比"——必然相等。
 * 而只读 GET 在回环自动 token 下免凭证，`/api/files`（工作区内任意文件，含 `.env`）
 * 与 `/api/sessions/:id/wire` 因此完全敞开。
 *
 * 门在根中间件：写门之前、只读免 token 豁免之前、以及 SPA 静态回退之前。
 */
describe('PRD-0038 AC-1.1 Host allowlist blocks DNS rebinding', () => {
  const REBOUND_PORT = 4100;

  async function setup(options: {
    readonly bindHost?: string;
    readonly lanHosts?: readonly string[];
  }): Promise<{
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
    token: string;
  }> {
    const harness = new FakeHarness();
    const result = await createTestApp({
      manager: new WebSessionManager(harness),
      bindHost: options.bindHost ?? '127.0.0.1',
      lanHosts: options.lanHosts,
    });
    return { app: result.app, harness, token: result.authToken };
  }

  /** rebinding 的完整形态：Origin 与 Host 是同一个未绑定主机名。 */
  function reboundHeaders(host = 'evil.test'): Record<string, string> {
    const origin = `http://${host}:${String(REBOUND_PORT)}`;
    return { host: `${host}:${String(REBOUND_PORT)}`, origin };
  }

  function absoluteUrl(path: string, host = 'evil.test'): string {
    return `http://${host}:${String(REBOUND_PORT)}${path}`;
  }

  it('只读 GET 用同源 Host+Origin 伪装也不放行：工作区内 .env 读不到', async () => {
    const ws = await mkdtemp(join(tmpdir(), 'byf-rebind-ws-'));
    await writeFile(join(ws, '.env'), 'APP_SECRET=do-not-serve-to-evil\n', 'utf-8');
    const { app, harness } = await setup({});
    harness.workspaceList = [ws];

    // 修复前：Host 与 Origin 同源 ⇒ 过门；回环只读免 token ⇒ 直接 200 读出文件内容。
    const rejected = await app.request(
      absoluteUrl(`/api/files?path=${encodeURIComponent(join(ws, '.env'))}`),
      { headers: reboundHeaders() },
    );
    expect(rejected.status).toBe(403);
    const rejectedText = await rejected.text();
    expect(JSON.parse(rejectedText) as { code?: string }).toHaveProperty('code', 'FORBIDDEN');
    expect(rejectedText).not.toContain('do-not-serve-to-evil');

    // 同一台服务器、同一请求，只是 Host 回到本机绑定地址上 —— 用户自己的浏览器不受影响。
    // （`.env` 不在文本扩展名表里，命中 `application/octet-stream` 分支，所以按原始
    // 字节断言：这条路径**确实**能把工作区里的点文件内容发出去，正是该洞的危害所在。）
    const allowed = await app.request(
      `http://127.0.0.1:${String(REBOUND_PORT)}/api/files?path=${encodeURIComponent(join(ws, '.env'))}`,
      { headers: { host: `127.0.0.1:${String(REBOUND_PORT)}` } },
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toContain('APP_SECRET=');
  });

  it('Host 门跑在 token 门之前：带着正确 token 的 rebinding 写请求仍被拒且零副作用', async () => {
    const { app, harness, token } = await setup({});
    const res = await app.request(absoluteUrl('/api/sessions'), {
      method: 'POST',
      headers: {
        ...reboundHeaders(),
        'content-type': 'application/json',
        [BYF_MARKER]: 'byf-web',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect(res.status).toBe(403);
    expect(harness.sessions.size).toBe(0);
  });

  it('本机三种回环写法照常放行，端口不参与判定（dev 态 vite 代理保留 client 端口）', async () => {
    const { app } = await setup({});
    // 相对 URL + 显式 `Host` 头：门读的就是这个头（真实 Bun.serve 上 `c.req.url`
    // 的主机部分也由它决定，见下面的 e2e 用例）。裸 IPv6 不能拼进 URL
    // （`http://::1/` 不是合法 URL），所以走这条路反而是更准的测法。
    for (const host of [
      `localhost:${String(REBOUND_PORT)}`,
      'localhost',
      'localhost:4200',
      `127.0.0.2:${String(REBOUND_PORT)}`,
      '[::1]:4100',
      '::1',
      'LocalHost.',
    ]) {
      const res = await app.request('/api/sessions?workDir=/x', { headers: { host } });
      expect([res.status, host]).toEqual([200, host]);
    }
  });

  it('只是"以本机地址开头"的域名不算本机地址（127.0.0.1.attacker.test / localhost.attacker.test）', async () => {
    const { app } = await setup({});
    for (const host of [
      '127.0.0.1.attacker.test',
      'localhost.attacker.test',
      '127.0.0.1.nip.io',
      'evil-localhost',
    ]) {
      const res = await app.request(absoluteUrl('/api/sessions?workDir=/x', host), {
        headers: reboundHeaders(host),
      });
      expect([res.status, host]).toEqual([403, host]);
    }
  });

  it('格式不良的 Host 值一律拒绝：不做"取前段"式洗白（重复头拼接 / 路径 / 空白）', async () => {
    const { app } = await setup({});
    for (const host of [
      '127.0.0.1:4100, evil.test',
      'localhost, evil.test',
      'localhost evil',
      'localhost/evil',
      'evil.test\\@127.0.0.1',
      'localhost:not-a-port',
      ':4100',
      '',
    ]) {
      const res = await app.request('/api/sessions?workDir=/x', { headers: { host } });
      expect([res.status, host]).toEqual([403, host]);
    }
  });

  it('LAN 绑定接受 banner 交付的网卡地址，仍拒绝未绑定主机名', async () => {
    const lan = await setup({ bindHost: '0.0.0.0', lanHosts: ['192.168.1.10'] });
    const viaLanIp = await lan.app.request('http://192.168.1.10:4100/api/sessions?workDir=/x', {
      headers: { host: '192.168.1.10:4100' },
    });
    expect(viaLanIp.status).toBe(200);
    // 回环名在 LAN 绑定下仍然可用：本机浏览器是同一台机器上的合法调用者。
    const viaLoopback = await lan.app.request('http://localhost:4100/api/sessions?workDir=/x', {
      headers: { host: 'localhost:4100' },
    });
    expect(viaLoopback.status).toBe(200);
    const viaEvil = await lan.app.request('http://evil.test:4100/api/sessions?workDir=/x', {
      headers: { host: 'evil.test:4100', origin: 'http://evil.test:4100' },
    });
    expect(viaEvil.status).toBe(403);
    // 绑定到具体网卡地址时，同机其它网卡名也不太该被接受（未绑定 = 不可达）。
    const bound = await setup({ bindHost: '192.168.1.10' });
    const otherIface = await bound.app.request('http://10.0.0.9:4100/api/sessions?workDir=/x', {
      headers: { host: '10.0.0.9:4100' },
    });
    expect(otherIface.status).toBe(403);
  });

  it('SPA 静态路径同样受 Host 门约束（门在根中间件，不是只挡 /api）', async () => {
    const { app } = await setup({});
    const res = await app.request('http://evil.test:4100/', {
      headers: reboundHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it('e2e：真 Bun.serve 上的伪造 Host 头（rebinding 的线上形态）', async () => {
    const handle = await startWebServer({
      harness: new FakeHarness(),
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const port = handle.port;
      // 前提本身也要钉住：`c.req.url` 的主机来自请求自带的 Host，所以
      // "同源 Origin/Host" 在 rebinding 下总能成立——这正是修复前的洞。
      const forged = await rawHttpRequest(port, [
        'GET /api/sessions?workDir=/x HTTP/1.1',
        `Host: evil.test:${String(port)}`,
        `Origin: http://evil.test:${String(port)}`,
        'Connection: close',
      ]);
      expect(forged.status).toBe(403);
      expect(forged.body).not.toContain('"sessions"');

      const control = await rawHttpRequest(port, [
        'GET /api/sessions?workDir=/x HTTP/1.1',
        `Host: 127.0.0.1:${String(port)}`,
        'Connection: close',
      ]);
      expect(control.status).toBe(200);
      expect(control.body).toContain('"sessions"');

      // 重复 Host 头：Bun 会把两个值拼成一个（`a.test, 127.0.0.1:port`），而拼接结果
      // 不是任何本机主机名——等值比较（不是前缀比较）才能挡住这一类。
      const duplicated = await rawHttpRequest(port, [
        'GET /api/sessions?workDir=/x HTTP/1.1',
        `Host: 127.0.0.1:${String(port)}`,
        'Host: evil.test',
        'Connection: close',
      ]);
      expect(duplicated.status).toBe(403);
      expect(duplicated.body).not.toContain('"sessions"');

      // 缺 Host 的 HTTP/1.0：既不是 200，也不泄漏任何会话数据。
      const hostless = await rawHttpRequest(port, ['GET /api/sessions?workDir=/x HTTP/1.0']);
      expect(hostless.status).not.toBe(200);
      expect(hostless.body).not.toContain('"sessions"');
    } finally {
      handle.close();
    }
  });
});

/** PRD-0038 AC-1.2:回环写必须持 token;token 经 createApp 结果交付;比对失败路径一致。 */
describe('PRD-0038 AC-1.2 loopback writes require token', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
    token: string | undefined;
  }

  async function setup(authToken?: string): Promise<Env> {
    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, authToken });
    const autoToken = (result as unknown as { authToken?: string }).authToken;
    return { app: result.app, harness, token: authToken ?? autoToken };
  }

  function writeHeaders(token: string | undefined): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [BYF_MARKER]: 'byf-web',
      origin: 'http://localhost',
    };
    if (token !== undefined) headers['authorization'] = `Bearer ${token}`;
    return headers;
  }

  it('createApp 未显式配置 token 时自动生成回环 token,无凭证的合法 JSON 写返回 401 且零副作用', async () => {
    const env = await setup();
    expect(typeof env.token).toBe('string');
    expect((env.token ?? '').length).toBeGreaterThan(0);

    const res = await env.app.request('/api/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [BYF_MARKER]: 'byf-web',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    expect(res.status).toBe(401);
    expect(env.harness.sessions.size).toBe(0);
    // 响应体不泄漏内部状态:只有结构化 error/code,无堆栈/路径/token。
    const text = await res.text();
    const body = JSON.parse(text) as Record<string, unknown>;
    expect(body['code']).toBe('UNAUTHORIZED');
    expect(text).not.toContain('stack');
    expect(text).not.toContain('.ts');
    expect(text).not.toContain(env.token ?? '<<should-never-appear>>');
  });

  it('正确 token 经 Authorization Bearer 与 ?token= 两种携带方式均放行写请求', async () => {
    const env = await setup();
    expect(typeof env.token).toBe('string');
    const token = env.token as string;
    const viaBearer = await env.app.request('/api/sessions', {
      method: 'POST',
      headers: writeHeaders(token),
      body: JSON.stringify({ workDir: '/proj-a' }),
    });
    expect(viaBearer.status).toBe(201);
    const viaQuery = await env.app.request(`/api/sessions?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [BYF_MARKER]: 'byf-web',
        origin: 'http://localhost',
      },
      body: JSON.stringify({ workDir: '/proj-b' }),
    });
    expect(viaQuery.status).toBe(201);
    expect(env.harness.sessions.size).toBe(2);
  });

  it('token 失败路径一致:无凭证 / 错误 token(等长与不等长)/ 空 Bearer 均为 401 且响应一致', async () => {
    const env = await setup();
    const token = env.token ?? 'expected-token-value';
    const sameLengthWrong = 'x'.repeat(token.length);
    const attempts: Array<{ headers: Record<string, string>; query?: string }> = [
      { headers: writeHeaders(undefined) },
      { headers: writeHeaders('short-wrong') },
      { headers: writeHeaders(sameLengthWrong) },
      { headers: { ...writeHeaders(undefined), authorization: 'Bearer ' } },
      { headers: writeHeaders(undefined), query: 'wrong-query-token' },
    ];
    const bodies = new Set<string>();
    for (const attempt of attempts) {
      const url =
        attempt.query === undefined
          ? '/api/sessions'
          : `/api/sessions?token=${encodeURIComponent(attempt.query)}`;
      const res = await env.app.request(url, {
        method: 'POST',
        headers: attempt.headers,
        body: JSON.stringify({ workDir: '/proj' }),
      });
      // 长度不等/相等的错误 token 都不能触发 500(timingSafeEqual 长度守卫)。
      expect(res.status).toBe(401);
      bodies.add(await res.text());
    }
    expect(env.harness.sessions.size).toBe(0);
    expect(bodies.size).toBe(1);
  });

  it('显式配置 token(如 LAN 模式)时只读 GET 也需凭证(免 token 仅限回环自动 token)', async () => {
    const env = await setup('lan-mode-token-value');
    const anon = await env.app.request('/api/sessions?workDir=/x');
    expect(anon.status).toBe(401);
    const authed = await env.app.request('/api/sessions?workDir=/x', {
      headers: { authorization: 'Bearer lan-mode-token-value' },
    });
    expect(authed.status).toBe(200);
  });

  it('LAN 绑定仍强制 WEB_AUTH_TOKEN(config.resolveWebAuthToken)', async () => {
    const { resolveWebAuthToken } = await import('./config');
    const savedPrimary = process.env['WEB_AUTH_TOKEN'];
    const savedLegacy = process.env['BYF_WEB_AUTH_TOKEN'];
    try {
      delete process.env['WEB_AUTH_TOKEN'];
      delete process.env['BYF_WEB_AUTH_TOKEN'];
      expect(() => resolveWebAuthToken('0.0.0.0')).toThrow(/WEB_AUTH_TOKEN/);
      expect(resolveWebAuthToken('127.0.0.1')).toBeUndefined();
      process.env['WEB_AUTH_TOKEN'] = 'env-token-value';
      expect(resolveWebAuthToken('0.0.0.0')).toBe('env-token-value');
    } finally {
      if (savedPrimary === undefined) delete process.env['WEB_AUTH_TOKEN'];
      else process.env['WEB_AUTH_TOKEN'] = savedPrimary;
      if (savedLegacy === undefined) delete process.env['BYF_WEB_AUTH_TOKEN'];
      else process.env['BYF_WEB_AUTH_TOKEN'] = savedLegacy;
    }
  });

  it('回环 token 进入启动日志(banner 可交付 token)', async () => {
    const { formatWebStartupBanner } = await import('./startup-banner');
    const banner = formatWebStartupBanner({
      authToken: 'tok-loop-delivery',
      host: '127.0.0.1',
      port: 4100,
      byfHome: '/home/u/.byf',
    });
    expect(banner).toContain('tok-loop-delivery');
  });
});

/** PRD-0038 AC-1.3:/api/mcp/test 的 stdio command 必须已在任一 scope 保存配置中出现。 */
describe('PRD-0038 AC-1.3 /api/mcp/test command allowlist', () => {
  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: FakeHarness;
    token: string | undefined;
  }

  async function setup(listed: McpConfigListing | undefined): Promise<Env> {
    const harness = new FakeHarness();
    harness.workspaceList = ['/work/ws'];
    harness.mcpListing = listed;
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager });
    const token = (result as unknown as { authToken?: string }).authToken;
    return { app: result.app, harness, token };
  }

  function testHeaders(env: Env): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [BYF_MARKER]: 'byf-web',
      origin: 'http://localhost',
    };
    if (env.token !== undefined) headers['authorization'] = `Bearer ${env.token}`;
    return headers;
  }

  const LISTED: McpConfigListing = {
    user: {
      path: '/home/u/.byf/mcp.json',
      servers: [
        { name: 'fs', config: { transport: 'stdio', command: 'npx', args: ['-y', 'server-fs'] } },
      ],
    },
    project: {
      path: '/work/ws/.byf/mcp.json',
      servers: [{ name: 'db', config: { transport: 'stdio', command: 'uvx' } }],
    },
  };

  async function postTest(env: Env, config: Record<string, unknown>): Promise<Response> {
    return env.app.request(`/api/mcp/test?workDir=${encodeURIComponent('/work/ws')}`, {
      method: 'POST',
      headers: testHeaders(env),
      body: JSON.stringify({ scope: 'project', config }),
    });
  }

  it('未出现在任一 scope 已保存配置中的 stdio command 返回 403 且 probe 未被调用', async () => {
    const env = await setup(LISTED);
    const res = await postTest(env, { transport: 'stdio', command: 'rm', args: ['-rf', '/'] });
    expect(res.status).toBe(403);
    expect(env.harness.mcpTestCalls).toHaveLength(0);
    const body = (await res.json()) as { code?: string };
    expect(typeof body['code']).toBe('string');
  });

  it('空保存配置(两 scope 均无 server)时任意 stdio command 一律 403', async () => {
    const env = await setup(undefined);
    const res = await postTest(env, { transport: 'stdio', command: 'npx' });
    expect(res.status).toBe(403);
    expect(env.harness.mcpTestCalls).toHaveLength(0);
  });

  it('user scope 已列出的 command 仍可保存前测试(config 原样透传给 probe)', async () => {
    const env = await setup(LISTED);
    const config = { transport: 'stdio', command: 'npx', args: ['-y', 'server-fs'] };
    const res = await postTest(env, config);
    expect(res.status).toBe(200);
    expect(env.harness.mcpTestCalls).toHaveLength(1);
    expect(env.harness.mcpTestCalls[0]?.config).toEqual(config);
  });

  it('仅 project scope 列出的 command 也视为已列出(任一 scope 即可)', async () => {
    const env = await setup(LISTED);
    const res = await postTest(env, { transport: 'stdio', command: 'uvx' });
    expect(res.status).toBe(200);
    expect(env.harness.mcpTestCalls).toHaveLength(1);
  });

  it('无 command 字段的 http transport 不受 command 白名单约束(不过度封锁)', async () => {
    const env = await setup(LISTED);
    const res = await postTest(env, { transport: 'http', url: 'http://example.test/mcp' });
    expect(res.status).toBe(200);
    expect(env.harness.mcpTestCalls).toHaveLength(1);
  });

  /**
   * review F2:路由里的预检只是短路,**权威门在 core 的
   * `host-rpc.testMcpConnection`**。这条用例把命令写成"已列出"的 `npx`,让预检必然
   * 放行,然后让 harness 那一层抛出 core 的拒绝——断言它变成 403(而不是经 onError
   * 变 500),并且响应体带的是 core 那句话,证明服务端确实还有一层在名单之外兜着。
   */
  it('预检放行后 core 门的拒绝映射为 403(不是 500)', async () => {
    const env = await setup(LISTED);
    env.harness.mcpTestError = new ByfError(
      ErrorCodes.REQUEST_INVALID,
      'core-side allowlist deny',
      {
        details: { reason: 'stdio_command_not_allowlisted', command: 'npx' },
      },
    );
    const res = await postTest(env, { transport: 'stdio', command: 'npx' });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.error).toBe('core-side allowlist deny');
    expect(body.code).toBe('FORBIDDEN');
  });

  it('core 拒绝若不带 allowlist reason(如磁盘配置损坏)仍按原语义映射,不被吞成 403', async () => {
    const env = await setup(LISTED);
    env.harness.mcpTestError = new ByfError(ErrorCodes.REQUEST_INVALID, 'unrelated validation');
    const res = await postTest(env, { transport: 'stdio', command: 'npx' });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { code?: string }).code).toBe('INTERNAL');
  });
});

/**
 * PRD-0038 AC-1.4 / AC-1.5:配置原文编辑器数据安全。磁盘面用真实临时文件
 * (不 mock fs);harness 经 sanctioned 注入点模拟 core 的 ConfigDocument 语义
 * (revision=sha256(磁盘原文);损坏时抛 ByfError config.invalid;写盘=原文
 * 原子写),写盘后果直接断言磁盘字节。
 */
describe('PRD-0038 AC-1.4/AC-1.5 config raw disk safety', () => {
  const dirs: string[] = [];

  /** 镜像 core config/document.ts 的磁盘语义;损坏由测试显式声明。 */
  class DiskBackedConfigHarness extends FakeHarness {
    readonly configFile: string;
    corrupt = false;

    constructor(configFile: string) {
      super();
      this.configFile = configFile;
      this.configPath = configFile;
    }

    private diskText(): string {
      return readFileSync(this.configFile, 'utf-8');
    }

    private static revisionOf(text: string): string {
      return createHash('sha256').update(text, 'utf-8').digest('hex');
    }

    override async getConfigDocument(): Promise<ConfigDocumentResult> {
      const text = this.diskText();
      if (this.corrupt) {
        throw new ByfError(
          ErrorCodes.CONFIG_INVALID,
          `Invalid configuration in ${this.configFile}: TOML parse error`,
        );
      }
      return {
        path: this.configFile,
        text,
        revision: DiskBackedConfigHarness.revisionOf(text),
        parsed: this.config,
      };
    }

    override async writeConfigText(
      text: string,
      expectedRevision: string | null,
    ): Promise<ConfigWriteResult> {
      const current = this.diskText();
      const revision = DiskBackedConfigHarness.revisionOf(current);
      if (expectedRevision !== revision) {
        throw new ByfError(
          ErrorCodes.CONFIG_REVISION_CONFLICT,
          `Config revision mismatch: expected ${expectedRevision ?? 'null'}, disk has ${revision}`,
        );
      }
      // 与 core writeConfigDocument 一致:通过校验即原样写回(损坏/空文本判决
      // 是 PRD-0038 要新增的门,不属于 core 现有语义,不在 fake 中预演)。
      writeFileSync(this.configFile, text, 'utf-8');
      return { revision: DiskBackedConfigHarness.revisionOf(text) };
    }
  }

  interface Env {
    app: Awaited<ReturnType<typeof createApp>>['app'];
    harness: DiskBackedConfigHarness;
    configFile: string;
    token: string | undefined;
  }

  async function setupFile(contents: string, corrupt = false): Promise<Env> {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-cfg-raw-r1-'));
    dirs.push(homeDir);
    const configFile = join(homeDir, 'config.toml');
    await writeFile(configFile, contents, 'utf-8');
    const harness = new DiskBackedConfigHarness(configFile);
    harness.corrupt = corrupt;
    const manager = new WebSessionManager(harness);
    const result = await createTestApp({ manager, homeDir });
    const token = (result as unknown as { authToken?: string }).authToken;
    return { app: result.app, harness, configFile, token };
  }

  afterEach(async () => {
    while (dirs.length > 0) {
      await rm(dirs.pop()!, { recursive: true, force: true });
    }
  });

  function putHeaders(env: Env): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      [BYF_MARKER]: 'byf-web',
      origin: 'http://localhost',
    };
    if (env.token !== undefined) headers['authorization'] = `Bearer ${env.token}`;
    return headers;
  }

  async function getRaw(env: Env): Promise<{ text: string; revision: string | null }> {
    const res = await env.app.request('/api/config/raw');
    expect(res.status).toBe(200);
    return (await res.json()) as { text: string; revision: string | null };
  }

  // ── AC-1.4:配置损坏不销毁数据 ─────────────────────────────────────────────
  const CORRUPT = [
    '# 手工编辑损坏:表头未闭合',
    'default_model = "k2"',
    '[providers.a',
    'type = "anthropic"',
    '',
  ].join('\n');

  it('损坏的 config.toml:GET /api/config/raw 返回磁盘原文 + invalid: true(不再空串)', async () => {
    const env = await setupFile(CORRUPT, true);
    const res = await env.app.request('/api/config/raw');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { text: string; invalid?: boolean };
    expect(data.invalid).toBe(true);
    // 磁盘原文逐字节回显(修复前是 text:'' → 保存即清空全部配置)。
    expect(data.text).toBe(CORRUPT);
    expect(await readFile(env.configFile, 'utf-8')).toBe(CORRUPT);
  });

  it('损坏态下以空文本保存被拒(4xx)且磁盘字节不变', async () => {
    const env = await setupFile(CORRUPT, true);
    const { revision } = await getRaw(env);
    const res = await env.app.request('/api/config/raw', {
      method: 'PUT',
      headers: putHeaders(env),
      body: JSON.stringify({ text: '', expectedRevision: revision }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await readFile(env.configFile, 'utf-8')).toBe(CORRUPT);
  });

  it('非空原文以空文本保存被拒(4xx)——保存即清空的销毁路径必须关闭', async () => {
    const env = await setupFile(VALID_MIXED);
    const { revision } = await getRaw(env);
    expect(revision).not.toBeNull();
    const res = await env.app.request('/api/config/raw', {
      method: 'PUT',
      headers: putHeaders(env),
      body: JSON.stringify({ text: '', expectedRevision: revision }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    // 修复前:restoreMaskedSecrets('') → '' → 原样写回,整个 config 被清空。
    expect(await readFile(env.configFile, 'utf-8')).toBe(VALID_MIXED);
  });

  it('与非空原文 revision 不匹配的保存被拒 409 且磁盘不变', async () => {
    const env = await setupFile(VALID_MIXED);
    const res = await env.app.request('/api/config/raw', {
      method: 'PUT',
      headers: putHeaders(env),
      body: JSON.stringify({ text: '# replacement\n', expectedRevision: 'bogus-revision' }),
    });
    expect(res.status).toBe(409);
    expect(await readFile(env.configFile, 'utf-8')).toBe(VALID_MIXED);
  });

  // ── AC-1.5:密钥占位符与行序解耦 ───────────────────────────────────────────
  // 数组密钥块刻意排在标量 provider 之前:按行序 seq 的实现会为标量占位符
  // 计入数组元素序号,restore 时错位/丢键。
  const VALID_MIXED = [
    '# PRD-0038 R1 fixture',
    '[services.web_search.providers.brave]',
    'api_keys = ["brave-1", "brave-2"]',
    '',
    '[providers.a]',
    'type = "anthropic"',
    'api_key = "sk-aaa"',
    '',
    '[providers.b]',
    'type = "anthropic"',
    'api_key = "sk-bbb"',
    '',
    '[providers.c]',
    'type = "openai-completions"',
    'base_url = "https://c.example/v1"',
    'api_key = "sk-ccc"',
    '',
  ].join('\n');

  /** 把文本切为 [prefix, block1, block2, …];block 以 `^\[` 头行起始。 */
  function splitBlocks(text: string): { prefix: string; blocks: string[] } {
    const lines = text.split('\n');
    const blocks: string[] = [];
    const prefixLines: string[] = [];
    let current: string[] | undefined;
    for (const line of lines) {
      if (line.startsWith('[')) {
        if (current !== undefined) blocks.push(current.join('\n'));
        current = [line];
      } else if (current === undefined) {
        prefixLines.push(line);
      } else {
        current.push(line);
      }
    }
    if (current !== undefined) blocks.push(current.join('\n'));
    return { prefix: prefixLines.join('\n'), blocks };
  }

  function joinBlocks(prefix: string, blocks: string[]): string {
    return [prefix, ...blocks].join('\n');
  }

  /** 从磁盘文本提取每个 provider 块的 api_key 值(键→值)。 */
  function providerKeyValues(text: string): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    const { blocks } = splitBlocks(text);
    for (const block of blocks) {
      const header = block.split('\n')[0] ?? '';
      const match = /^\[providers\.([^\]]+)\]$/.exec(header);
      if (match === null) continue;
      const key = /^api_key = "(.*?)"\s*(?:#.*)?$/m.exec(block)?.[1];
      const section = match[1];
      if (section === undefined) continue;
      out[section] = key;
    }
    return out;
  }

  async function putMasked(
    env: Env,
    maskedText: string,
    revision: string | null,
  ): Promise<Response> {
    return env.app.request('/api/config/raw', {
      method: 'PUT',
      headers: putHeaders(env),
      body: JSON.stringify({ text: maskedText, expectedRevision: revision }),
    });
  }

  it('GET→PUT 往返不改一行:每个密钥原样保留(行序 seq 当前会错位/丢键)', async () => {
    const env = await setupFile(VALID_MIXED);
    const { text: masked, revision } = await getRaw(env);
    const res = await putMasked(env, masked, revision);
    expect(res.status).toBe(200);
    const disk = await readFile(env.configFile, 'utf-8');
    expect(providerKeyValues(disk)).toEqual({ a: 'sk-aaa', b: 'sk-bbb', c: 'sk-ccc' });
    expect(disk).toContain('"brave-1"');
    expect(disk).toContain('"brave-2"');
    expect(disk).not.toContain('__BYF_KEEP_SECRET__');
  });

  it('重排 provider 块后保存:每个密钥回到其所属 provider', async () => {
    const env = await setupFile(VALID_MIXED);
    const { text: masked, revision } = await getRaw(env);
    const { prefix, blocks } = splitBlocks(masked);
    const order = (b: string): string => b.split('\n')[0] ?? '';
    const byHeader = new Map(blocks.map((b) => [order(b), b]));
    // 重排:c → b → brave 数组块 → a(全部整块移动,不拆占位符行)。
    const reordered = [
      '[providers.c]',
      '[providers.b]',
      '[services.web_search.providers.brave]',
      '[providers.a]',
    ]
      .map((header) => byHeader.get(header))
      .filter((b): b is string => b !== undefined);
    expect(reordered).toHaveLength(4);
    const res = await putMasked(env, joinBlocks(prefix, reordered), revision);
    expect(res.status).toBe(200);
    const disk = await readFile(env.configFile, 'utf-8');
    expect(providerKeyValues(disk)).toEqual({ a: 'sk-aaa', b: 'sk-bbb', c: 'sk-ccc' });
    expect(disk).toContain('"brave-1"');
    expect(disk).not.toContain('__BYF_KEEP_SECRET__');
  });

  it('删除一个含占位符的 provider 块:只丢该块密钥,其余块不动', async () => {
    const env = await setupFile(VALID_MIXED);
    const { text: masked, revision } = await getRaw(env);
    const { prefix, blocks } = splitBlocks(masked);
    const kept = blocks.filter((b) => !(b.split('\n')[0] ?? '').startsWith('[providers.b]'));
    expect(kept.length).toBe(blocks.length - 1);
    const res = await putMasked(env, joinBlocks(prefix, kept), revision);
    expect(res.status).toBe(200);
    const disk = await readFile(env.configFile, 'utf-8');
    const values = providerKeyValues(disk);
    expect(values['a']).toBe('sk-aaa');
    expect(values['c']).toBe('sk-ccc');
    expect(values['b']).toBeUndefined();
    expect(disk).not.toContain('sk-bbb');
    expect(disk).toContain('"brave-2"');
    expect(disk).not.toContain('__BYF_KEEP_SECRET__');
  });

  it('占位符密钥总数变化(掩码块粘贴到新键路径)且未显式确认:写盘被拒且磁盘字节不变', async () => {
    const env = await setupFile(VALID_MIXED);
    const { text: masked, revision } = await getRaw(env);
    const { prefix, blocks } = splitBlocks(masked);
    const blockA = blocks.find((b) => (b.split('\n')[0] ?? '') === '[providers.a]');
    expect(blockA).toBeDefined();
    // 把 a 块(仍带掩码占位符)整体复制为新 provider d:磁盘上不存在 d 的
    // 密钥,占位符无法按所属键路径解析 → 必须拒绝而不是静默复制 a 的密钥。
    const duplicated = blockA!.replace('[providers.a]', '[providers.d]');
    const res = await putMasked(env, joinBlocks(prefix, [...blocks, duplicated]), revision);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await readFile(env.configFile, 'utf-8')).toBe(VALID_MIXED);
  });

  it('新增 provider 携带字面新密钥(显式新值):总数变化允许保存且不误伤既有密钥', async () => {
    const env = await setupFile(VALID_MIXED);
    const { text: masked, revision } = await getRaw(env);
    const appended = [
      masked,
      '[providers.d]',
      'type = "anthropic"',
      'api_key = "sk-new-d"',
      '',
    ].join('\n');
    const res = await putMasked(env, appended, revision);
    expect(res.status).toBe(200);
    const disk = await readFile(env.configFile, 'utf-8');
    expect(providerKeyValues(disk)).toEqual({
      a: 'sk-aaa',
      b: 'sk-bbb',
      c: 'sk-ccc',
      d: 'sk-new-d',
    });
    expect(disk).not.toContain('__BYF_KEEP_SECRET__');
  });

  // ── AC-1.8:非 table-header 形态的密钥也不得以明文过线 ─────────────────────
  // raw GET 的响应文本是"过线文本"。点号键写法能归一化成键路径身份 → 必须掩码;
  // 归一化不出身份的形态（内联表、跨行数组/字符串）→ 必须拒绝外发并给出可诊断错误,
  // 而不是把明文密钥送出进程。

  const DOTTED = `providers.deepseek.type = "openai-completions"
providers.deepseek.api_key = "sk-dotted-leak"
`;

  it('点号键密钥经 GET /api/config/raw 外发时被掩码(不再明文过线)', async () => {
    const env = await setupFile(DOTTED);
    const res = await env.app.request('/api/config/raw');
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain('sk-dotted-leak');
    expect(body).toContain(`${MASKED_SECRET_PLACEHOLDER}providers.deepseek.api_key`);
  });

  it('点号键掩码后 GET→PUT 恒等往返:磁盘原文一字不变', async () => {
    const env = await setupFile(DOTTED);
    const { text: masked, revision } = await getRaw(env);
    const put = await putMasked(env, masked, revision);
    expect(put.status).toBe(200);
    expect(await readFile(env.configFile, 'utf-8')).toBe(DOTTED);
  });

  it('无法归一化为键路径身份的密钥形态:拒绝外发且响应体不含任何明文', async () => {
    const multiLineArray = `[services.web_search.providers.brave]
api_keys = [
  "brave-leak-1",
  "brave-leak-2",
]
`;
    const env = await setupFile(multiLineArray);
    const res = await env.app.request('/api/config/raw');
    // 拒绝外发:不得是 200 + text。给出可诊断 4xx。
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.text();
    expect(body).not.toContain('brave-leak-1');
    expect(body).not.toContain('brave-leak-2');
    expect(body).toMatch(/line/i);
    // review F6：这条 422 是"编辑器为什么读不到东西"的唯一解释，而界面上只显示
    // `error` 这一个字符串（apps/web/client/src/api.ts）。策略不动，但文案必须回答
    // 用户此刻缺的三件事：哪一个文件、磁盘有没有被改动、行号指的是哪份文本。
    expect(body).toContain(env.configFile);
    expect(body).toMatch(/nothing was written to disk/i);
    expect(body).toContain('CONFIG_SECRET_NOT_MASKABLE');
    // 拒绝是只读端点的行为,磁盘不能被改动。
    expect(await readFile(env.configFile, 'utf-8')).toBe(multiLineArray);
  });

  it('内联表形态的密钥同样拒绝外发(而不是回显明文)', async () => {
    const inlineTable = `providers = { deepseek = { api_key = "sk-inline-leak" } }\n`;
    const env = await setupFile(inlineTable);
    const res = await env.app.request('/api/config/raw');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(await res.text()).not.toContain('sk-inline-leak');
  });

  it('损坏态且含未闭合引号密钥:仍回显磁盘原文结构,但该密钥值被掩码', async () => {
    // AC-1.7 的修复路径要真实可达:最常见的损坏就是密钥行引号未闭合。
    // 掩码器必须把它连同明文一起换成占位符,而不是拒绝整份文件或放行明文。
    const brokenKey = `[providers.a
api_key = "sk-broken-quote
`;
    const env = await setupFile(brokenKey, true);
    const res = await env.app.request('/api/config/raw');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { text: string; invalid?: boolean };
    // 注:未闭合的 `[providers.a` 不是合法表头,磁盘文本归不出该密钥的表路径,
    // 占位符标注因此只剩 `api_key` 一段。身份不完整不影响 AC-1.8 的判据——判据是
    // 明文不越线,且修复入口(原文结构)仍在。
    expect(data.invalid).toBe(true);
    expect(data.text).not.toContain('sk-broken-quote');
    expect(data.text).toContain(MASKED_SECRET_PLACEHOLDER);
    expect(data.text).toContain('[providers.a');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PRD-0038 AC-1.7:损坏配置下服务仍可启动并可修复
//
// 与 AC-1.4 的分工:AC-1.4 只保证 raw 读写端点不销毁数据;本组走**真实装配路径**
// （真 ByfHarness → core-impl → readConfigFile,不经 HarnessLike fake）,锁住
// "config.toml 解析失败不把进程带走"。否则"损坏后经 web 修复"这条旅程在启动层
// 就已断裂,AC-1.4 的修复路径不可达。
// ────────────────────────────────────────────────────────────────────────────

describe('PRD-0038 AC-1.7 service starts and self-heals on a corrupt config', () => {
  /** 损坏点选在表头（非密钥行），与 AC-1.4 同一手法:避免"原文回显 vs 掩码"歧义。 */
  const BROKEN = [
    '# 手工编辑损坏:表头未闭合',
    'default_model = "k2"',
    '[providers.a',
    'type = "anthropic"',
    '',
  ].join('\n');

  const REPAIRED = [
    '# repaired through the web raw editor',
    '[providers.a]',
    'type = "anthropic"',
    'api_key = "sk-repaired"',
    '',
  ].join('\n');

  const homes: string[] = [];
  let prevByfHome: string | undefined;

  beforeEach(() => {
    prevByfHome = process.env['BYF_HOME'];
  });

  async function homeWithBrokenConfig(): Promise<string> {
    const homeDir = await mkdtemp(join(tmpdir(), 'byf-ac17-'));
    homes.push(homeDir);
    await writeFile(join(homeDir, 'config.toml'), BROKEN, 'utf-8');
    // startWebServer 内部还会经 resolveByfHome() 取工作区注册表目录,一并指向临时
    // home,使"真实装配路径"这一验证不会读写调用方的 ~/.byf。
    process.env['BYF_HOME'] = homeDir;
    return homeDir;
  }

  afterEach(async () => {
    if (prevByfHome === undefined) delete process.env['BYF_HOME'];
    else process.env['BYF_HOME'] = prevByfHome;
    while (homes.length > 0) {
      await rm(homes.pop()!, { recursive: true, force: true });
    }
  });

  it('真实 ByfHarness 在 config.toml 解析失败时构造不抛错', async () => {
    const homeDir = await homeWithBrokenConfig();
    let harness: ByfHarness | undefined;
    expect(() => {
      harness = new ByfHarness({ homeDir });
    }).not.toThrow();
    // 装配后的配置读面仍然可用（损坏态降级为内置默认,不把进程带走）。
    const cfg = await harness!.getConfig();
    expect(cfg).toBeDefined();
  });

  it('损坏配置下 web server 仍能启动,raw 端点回显磁盘原文 + invalid: true', async () => {
    const homeDir = await homeWithBrokenConfig();
    const handle = await startWebServer({
      harness: new ByfHarness({ homeDir }),
      host: '127.0.0.1',
      port: 0,
    });
    try {
      const res = await fetch(`${handle.url}/api/config/raw`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { text: string; invalid?: boolean };
      expect(data.invalid).toBe(true);
      expect(data.text).toBe(BROKEN);
    } finally {
      handle.close();
    }
  });

  it('启动日志明确告知配置处于损坏态', async () => {
    const homeDir = await homeWithBrokenConfig();
    const handle = await startWebServer({
      harness: new ByfHarness({ homeDir }),
      host: '127.0.0.1',
      port: 0,
    });
    try {
      expect(handle.configInvalid).toBe(true);
      const { formatWebStartupBanner } = await import('./startup-banner');
      const banner = formatWebStartupBanner({
        authToken: 'tok',
        host: '127.0.0.1',
        port: 4100,
        byfHome: homeDir,
        configInvalid: true,
      });
      expect(banner).toContain('config.toml');
      expect(banner).toContain('invalid');
      // 未声明损坏时不得凭空警告。
      const clean = formatWebStartupBanner({
        authToken: 'tok',
        host: '127.0.0.1',
        port: 4100,
        byfHome: homeDir,
      });
      expect(clean).not.toContain('invalid');
    } finally {
      handle.close();
    }
  });

  it('经 raw PUT 修好后无需重启即可继续（同一进程读到新配置）', async () => {
    const homeDir = await homeWithBrokenConfig();
    const harness = new ByfHarness({ homeDir });
    const manager = new WebSessionManager(harness);
    const result = await createApp({ manager, homeDir });
    const headers = {
      'content-type': 'application/json',
      [BYF_MARKER]: 'byf-web',
      authorization: `Bearer ${result.authToken}`,
    };

    const before = (await (await result.app.request('/api/config/raw')).json()) as {
      revision: string | null;
      invalid?: boolean;
    };
    expect(before.invalid).toBe(true);
    expect(before.revision).not.toBeNull();

    const put = await result.app.request('/api/config/raw', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ text: REPAIRED, expectedRevision: before.revision }),
    });
    expect(put.status).toBe(200);

    // 无重启:同一 manager / 同一 harness 立刻读到合法内容,损坏标志消失,密钥仍被掩码。
    const after = (await (await result.app.request('/api/config/raw')).json()) as {
      text: string;
      invalid?: boolean;
    };
    expect(after.invalid).not.toBe(true);
    expect(after.text).not.toContain('sk-repaired');
    expect(after.text).toContain(MASKED_SECRET_PLACEHOLDER);
    const cfg = await harness.getConfig();
    expect(cfg.providers?.['a']).toBeDefined();
    expect(await readFile(join(homeDir, 'config.toml'), 'utf-8')).toBe(REPAIRED);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PRD-0038 dev 工作流:Vite 代理 + Origin 门必须共存
//
// dev 形态是 浏览器 → vite(client port) → 代理 → web-server(api port)。
// `changeOrigin: true` 只改写 Host(→ api port)而不改 Origin(仍是 client port),
// 于是 AC-1.1 的同源判定必然失败,开发态所有写请求 403。这里同时钉住配置侧
// （代理不得改写 Host）与服务侧（同源对必须放行、被改写对必须拒绝）。
// ────────────────────────────────────────────────────────────────────────────

describe('PRD-0038 dev flow: vite proxy keeps Origin and Host the same site', () => {
  test('apps/web/client/vite.config.ts 不再把 Host 改写到 api target', async () => {
    // 判据取解析后的代理配置,不取源文本:注释里出现 "changeOrigin: true" 是解释
    // 回归原因的,不该被当成回归本身。
    const config = (await import('../../client/vite.config')).default as {
      server?: { proxy?: Record<string, { changeOrigin?: boolean } | string> };
    };
    const api = config.server?.proxy?.['/api'];
    expect(typeof api === 'object' && api !== null).toBe(true);
    expect((api as { changeOrigin?: boolean }).changeOrigin).not.toBe(true);
  });

  it('代理后 Origin 与 Host 同源:写请求放行', async () => {
    const manager = new WebSessionManager(new FakeHarness());
    const result = await createTestApp({ manager });
    const res = await result.app.request('http://localhost:4200/api/sessions', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        authorization: `Bearer ${result.authToken}`,
      },
      body: JSON.stringify({ workDir: '/x' }),
    });
    expect(res.status).toBe(201);
  });

  it('代理改写 Host(Origin=client port / Host=api port) 时门会拒绝——回归的因', async () => {
    const manager = new WebSessionManager(new FakeHarness());
    const result = await createTestApp({ manager });
    const res = await result.app.request('http://localhost:4100/api/sessions', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:4200',
        'content-type': 'application/json',
        authorization: `Bearer ${result.authToken}`,
      },
      body: JSON.stringify({ workDir: '/x' }),
    });
    expect(res.status).toBe(403);
  });

  it('dev 交付面:?token= 查询参数经代理同样可完成写', async () => {
    const manager = new WebSessionManager(new FakeHarness());
    const result = await createTestApp({ manager });
    const res = await result.app.request(
      `http://localhost:4200/api/sessions?token=${encodeURIComponent(result.authToken)}`,
      {
        method: 'POST',
        headers: {
          origin: 'http://localhost:4200',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ workDir: '/x' }),
      },
    );
    expect(res.status).toBe(201);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// PRD-0038 R3 / AC-3.1：web 表面必须消费 SDK 契约层的同一张身份语义表
//
// 与 headless（apps/cli/test/cli/run-prompt.test.ts）、TUI
// （apps/cli/test/tui/byf-tui-message-flow.test.ts）断言同一份
// `SESSION_IDENTITY_CONTRACT`——期望值不写在本文件里，否则"三表面共用单一定义"
// 这句话就没有被测试。
// ────────────────────────────────────────────────────────────────────────────

describe('PRD-0038 AC-3.1 web surface honours the shared identity contract', () => {
  it('resume keeps the id, fork mints a new one, per the SDK table', async () => {
    const { SESSION_IDENTITY_CONTRACT } = await import('@byfriends/sdk');
    const contract = SESSION_IDENTITY_CONTRACT as
      | Record<
          'resume' | 'fork',
          {
            readonly sessionId: string;
            readonly history: string;
            readonly sourceSessionBytes: string;
            readonly contextWindow: string;
          }
        >
      | undefined;
    expect(contract, 'web 表面必须能从 @byfriends/sdk 查到身份表').toBeDefined();

    const harness = new FakeHarness();
    const manager = new WebSessionManager(harness);
    const created = await manager.createSession({ workDir: '/web-fork' });

    const resumed = await manager.resumeSession(created.id);
    expect(resumed.id, `契约 resume.sessionId = ${contract!.resume.sessionId}`).toBe(
      contract!.resume.sessionId === 'preserve' ? created.id : `${created.id}-other`,
    );

    const forkTarget = new FakeSession(`${created.id}-forked`, '/web-fork');
    harness.nextForkResult = forkTarget;
    const forked = await manager.forkSession(created.id);
    expect(forked.id, `契约 fork.sessionId = ${contract!.fork.sessionId}`).toBe(
      contract!.fork.sessionId === 'new' ? forkTarget.id : created.id,
    );
    expect(forked.id).not.toBe(created.id);
    // fork 必须走复制路径，不能靠"重新打开源会话"糊过去（那会往源历史追加）
    expect(harness.forks.map((entry) => entry.id)).toEqual([created.id]);
    expect(contract!.fork.sourceSessionBytes, '契约必须声明 fork 不得改动源会话字节').toBe(
      'must-not-change',
    );
    expect(contract!.resume.contextWindow).toBe('reconstructed-from-event-log');
    expect(contract!.fork.contextWindow).toBe('reconstructed-from-event-log');
  });
});
