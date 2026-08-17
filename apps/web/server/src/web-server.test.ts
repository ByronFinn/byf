import { afterEach, describe, expect, it, spyOn, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  ByfError,
  ErrorCodes,
  type ByfConfig,
  type ByfConfigPatch,
  type PromptInput,
  type ResumedSessionSummary,
  type SkillSummary,
} from '@byfriends/sdk';
import type {
  ConfigDocumentResult,
  ConfigValidationResult,
  ConfigWriteResult,
  ContextProjection,
  InspectorSessionSummary,
  SessionDetail,
  WireResponse,
} from '@byfriends/sdk';
import type {
  ApprovalRequest,
  ApprovalResponse,
  Event,
  PermissionMode,
  QuestionRequest,
  QuestionResult,
  ServerFrame,
  SessionStatus,
  SessionSummary,
  WorkspaceView,
} from '@byfriends/web-shared';

import { createApp } from './app';
import { AsyncQueue } from './async-queue';
import { WebSessionManager, type HarnessLike, type SessionLike } from './session-manager';

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
    const main = (this.summary as Partial<ResumedSessionSummary>).agents?.main ?? {};
    this.summary = {
      ...this.summary,
      agents: {
        ...(this.summary as Partial<ResumedSessionSummary>).agents,
        main: { ...main, type: 'main', replay: [...this.replayRecords] },
      },
      updatedAt: Date.now(),
    };
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
    const resumed = (await manager.resumeSession(created.id)) as ResumedSessionSummary;
    const replay = resumed.agents?.main?.replay;
    expect(replay).toHaveLength(1);
    expect((replay![0] as { message: { text: string } }).message.text).toBe('hi');
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
    const result = await createApp({ manager, authToken });
    return { app: result.app, harness };
  }

  test('POST /api/sessions 创建;GET 列出', async () => {
    const { app } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
        headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const promptRes = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'hi' }),
    });
    expect(promptRes.status).toBe(202);

    const permRes = await app.request(`/api/sessions/${id}/permission`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const res = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const okRes = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: '', images: [{ dataUrl: TINY_PNG_DATA_URL }] }),
    });
    expect(okRes.status).toBe(202);
    const parts = session.lastPrompt as PromptInput;
    expect(parts.length).toBe(1);
    expect(parts[0]?.type).toBe('image_url');

    const badRes = await app.request(`/api/sessions/${id}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'x', images: [{ dataUrl: 'data:text/plain;base64,aGk=' }] }),
    });
    expect(badRes.status).toBe(400);
  });

  test('非法 permission mode 返回 400', async () => {
    const { app } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const res = await app.request(`/api/sessions/${id}/permission`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
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
    const result = await createApp({ manager, homeDir });
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir }),
    });
    return ((await res.json()) as { session: SessionSummary }).session;
  }

  test('POST 添加工作区;GET 枚举注册表工作区及其会话', async () => {
    const { app, homeDir, harness, projDir } = await setup();
    await createSession(app, projDir);

    const added = await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'relative/dir' }),
    });
    expect(rel.status).toBe(400);

    const missing = await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/definitely/not/here' }),
    });
    expect(missing.status).toBe(400);

    const first = await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: projDir }),
    });
    const second = await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: projDir }),
    });
    const del = await app.request(`/api/workspaces?workDir=${encodeURIComponent(projDir)}`, {
      method: 'DELETE',
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
    });
    expect(((await del.json()) as { removed: boolean }).removed).toBe(true);
    expect(await list()).toEqual([recentDir]);

    // 重新添加:从 hidden 移除,恢复原顺序位置(仍在 recentDir 前)
    await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: oldDir }),
    });
    expect(await list()).toEqual([oldDir, recentDir]);
  });

  test('GET /api/fs/list 列出工作区目录(隐藏过滤、目录优先);非工作区 root 与路径逃逸 400', async () => {
    const { app, projDir } = await setup();
    await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
    const result = await createApp({ manager, homeDir });
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
      providers: { id: string; type: string; baseUrl?: string; hasApiKey: boolean }[];
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ thinking: { mode: 'bogus' } }),
    });
    expect(badMode.status).toBe(400);

    const badEffort = await app.request('/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ thinking: { effort: 'insane' } }),
    });
    expect(badEffort.status).toBe(400);

    const bad = await app.request('/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ defaultPermissionMode: 'bogus' }),
    });
    expect(bad.status).toBe(400);

    const empty = await app.request('/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
  });

  test('DELETE /api/config/providers/:id 移除 provider', async () => {
    const { app, harness } = await setup();
    harness.config = { providers: { a: { type: 'anthropic' }, b: { type: 'anthropic' } } };
    const res = await app.request('/api/config/providers/a', { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { providers: { id: string }[] };
    expect(body.providers.map((p) => p.id)).toEqual(['b']);
    expect(harness.config.providers['a']).toBeUndefined();
  });

  test('PATCH /api/sessions/:id/model 透传;空 model 400', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const ok = await app.request(`/api/sessions/${id}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'local/qwen-3.6' }),
    });
    expect(ok.status).toBe(200);
    expect(session.model).toBe('local/qwen-3.6');

    const empty = await app.request(`/api/sessions/${id}/model`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: '  ' }),
    });
    expect(empty.status).toBe(400);
  });

  test('PATCH /api/sessions/:id/thinking 透传;非法档位 400', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    for (const level of ['off', 'low', 'medium', 'high', 'xhigh', 'max']) {
      const ok = await app.request(`/api/sessions/${id}/thinking`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ level }),
      });
      expect(ok.status).toBe(200);
      expect(session.thinking).toBe(level);
    }

    const bad = await app.request(`/api/sessions/${id}/thinking`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: 'insane' }),
    });
    expect(bad.status).toBe(400);
  });

  test('POST activate-skill 与 compact 透传;空 skill 名 400', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workDir: '/proj' }),
    });
    const id = ((await created.json()) as { session: SessionSummary }).session.id;
    const session = harness.sessions.get(id)!;

    const skill = await app.request(`/api/sessions/${id}/activate-skill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'init', args: 'src' }),
    });
    expect(skill.status).toBe(200);
    expect(session.activatedSkill).toEqual({ name: 'init', args: 'src' });

    const empty = await app.request(`/api/sessions/${id}/activate-skill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: '  ' }),
    });
    expect(empty.status).toBe(400);

    const compact = await app.request(`/api/sessions/${id}/compact`, { method: 'POST' });
    expect(compact.status).toBe(200);
    expect(session.compacted).toBe(true);
  });

  test('GET /sessions/:id/skills 返回会话 skill 列表;未加载会话 404', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

  test('POST /api/sessions/:id/resume 响应携带 agents.main.replay(转录恢复的线路契约)', async () => {
    const { app, harness } = await setup();
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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

    const res = await app.request(`/api/sessions/${id}/resume`, { method: 'POST' });
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
      await createApp({
        manager: new WebSessionManager(new FakeHarness()),
        publicDir: '/nonexistent-public-dir-xyz',
      });
      expect(
        stderrWrite.mock.calls.some((args) => String(args[0]).includes('publicDir not found')),
      ).toBe(true);

      stderrWrite.mockClear();
      stdoutWrite.mockClear();
      await createApp({ manager: new WebSessionManager(new FakeHarness()) });
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
    const result = await createApp({ manager, homeDir: dir });
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'a'.repeat(201) }),
    });
    expect(tooLong.status).toBe(400);

    const blank = await app.request('/api/sessions/ses_a', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    expect(blank.status).toBe(400);

    const empty = await app.request('/api/sessions/ses_a', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
    await app.request('/api/sessions/ses_busy/resume', { method: 'POST' });
    session.emit({
      type: 'turn.started',
      sessionId: 'ses_busy',
      agentId: 'main',
      turnId: 0,
      origin: { kind: 'user' },
    });

    const busy = await app.request('/api/sessions/ses_busy/fork', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(ok.status).toBe(201);
  });

  test('fork busy 只由主 agent turn 生命周期驱动,子 agent 事件不参与', async () => {
    const { app, harness } = await setup();
    const session = seed(harness, 'ses_nested', '/proj');
    await app.request('/api/sessions/ses_nested/resume', { method: 'POST' });

    const fork = () =>
      app.request('/api/sessions/ses_nested/fork', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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

    // 子 agent turn 开始不应把父会话标为 busy。
    harness.nextForkResult = seed(harness, 'ses_forked_sub', '/proj');
    childStarted();
    expect((await fork()).status).toBe(201);

    // 主 agent turn 期间,子 agent 结束不能清除 busy(否则撕裂窗口重新打开)。
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
    const result = await createApp({ manager, homeDir });
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
    const { app } = await createApp({ manager, homeDir });

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
  test('非回环绑定时列出各 LAN IP 完整 URL(含 token)+ 轮换提示;回环不变', async () => {
    const { formatWebStartupBanner } = await import('./startup-banner');
    const loopback = formatWebStartupBanner({
      host: '127.0.0.1',
      port: 4100,
      byfHome: '/home/u/.byf',
    });
    expect(loopback).toBe(
      '[web-server] listening on http://127.0.0.1:4100 (auth=disabled, BYF_HOME=/home/u/.byf)\n',
    );

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
      { address: '127.0.0.1', family: 'IPv4', internal: true, scopeid: undefined },
      { address: '192.168.1.5', family: 'IPv4', internal: false, scopeid: undefined },
      { address: 'fe80::1', family: 'IPv6', internal: false, scopeid: 5 },
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
    const result = await createApp({ manager });
    return { app: result.app, harness };
  }

  const json = { 'content-type': 'application/json' };

  test('POST /api/config/providers:slug 校验/查重/baseUrl 必填,合法时一次建全', async () => {
    const { app, harness } = await setup();
    const badSlug = await app.request('/api/config/providers', {
      method: 'POST',
      headers: json,
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
      headers: json,
      body: JSON.stringify({ id: 'good', type: 'openai-completions', models: [] }),
    });
    expect(noUrl.status).toBe(400);

    const noModels = await app.request('/api/config/providers', {
      method: 'POST',
      headers: json,
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
      headers: json,
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
      headers: json,
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
      headers: json,
      body: JSON.stringify({ baseUrl: 'https://new/v1' }),
    });
    expect(res.status).toBe(200);
    const provider = (
      harness.config as unknown as {
        providers: Record<string, { baseUrl?: string; apiKey?: string }>;
      }
    ).providers['myprov']!;
    expect(provider.baseUrl).toBe('https://new/v1');
    expect(provider.apiKey).toBe('sk-keep');
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
      headers: json,
      body: JSON.stringify({ id: 'existing', provider: 'p', model: 'm2', maxContextSize: 1000 }),
    });
    expect(dup.status).toBe(409);

    const created = await app.request('/api/config/models', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ id: 'alias2', provider: 'p', model: 'm2', maxContextSize: 2000 }),
    });
    expect(created.status).toBe(201);

    const patched = await app.request('/api/config/models/alias2', {
      method: 'PATCH',
      headers: json,
      body: JSON.stringify({ model: 'm2-new' }),
    });
    expect(patched.status).toBe(200);
    expect(
      (harness.config as unknown as { models: Record<string, { model?: string }> }).models['alias2']
        ?.model,
    ).toBe('m2-new');

    const removed = await app.request('/api/config/models/existing', { method: 'DELETE' });
    expect(removed.status).toBe(200);
    expect(harness.removedModels).toEqual(['existing']);
  });

  test('POST /api/config/discover-models:草稿探测远端 /v1/models,不落盘', async () => {
    const { app, harness } = await setup();
    const fetchMock = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const res = await app.request('/api/config/discover-models', {
      method: 'POST',
      headers: json,
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
    const result = await createApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  const json = { 'content-type': 'application/json' };

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
    expect(data.sessions[0]!.health).toBe('ok');
  });

  it('DELETE /api/sessions/:id delegates to the harness', async () => {
    const { app, harness } = await setup();
    const res = await app.request('/api/sessions/session_x', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(harness.deletedSessions).toEqual(['session_x']);
  });

  it('DELETE of a live session returns 409 SESSION_BUSY without touching the harness', async () => {
    const { app, harness } = await setup();
    // live 会话须经 manager.createSession 创建（attach 进 manager.sessions 才判 busy）
    const created = await app.request('/api/sessions', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ workDir: '/w' }),
    });
    expect(created.status).toBe(201);
    const { session } = (await created.json()) as { session: { id: string } };
    const res = await app.request(`/api/sessions/${session.id}`, { method: 'DELETE' });
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
    const result = await createApp({ manager, homeDir: '/tmp' });
    return { app: result.app, harness };
  }

  const json = { 'content-type': 'application/json' };

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
      headers: json,
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
      headers: json,
      body: JSON.stringify({ text: maskedText, expectedRevision: 'rev-abc' }),
    });
    expect(res.status).toBe(200);
    expect(harness.configWriteCalls).toHaveLength(1);
    // 占位符被还原为磁盘原值，写盘的是原文（不含占位符）
    expect(harness.configWriteCalls[0]!.text).toContain('sk-top-secret');
    expect(harness.configWriteCalls[0]!.text).not.toContain('__BYF_KEEP_SECRET__');
    expect(harness.configWriteCalls[0]!.expectedRevision).toBe('rev-abc');
  });

  it('PUT /api/config/raw maps revision conflict to 409', async () => {
    const { app, harness } = await setup();
    harness.configWriteError = new ByfError(
      ErrorCodes.CONFIG_REVISION_CONFLICT,
      'Config revision mismatch',
    );
    const res = await app.request('/api/config/raw', {
      method: 'PUT',
      headers: json,
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
      headers: json,
      body: JSON.stringify({ text: 'default_model = 123', expectedRevision: 'r' }),
    });
    expect(res.status).toBe(422);
    const data = (await res.json()) as { code: string };
    expect(data.code).toBe('CONFIG_INVALID');
  });
});
