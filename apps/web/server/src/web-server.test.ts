import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type {
  ByfConfig,
  ByfConfigPatch,
  ResumedSessionSummary,
  SkillSummary,
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
import { WorkspaceRegistry } from './workspace-registry';

// ---- Fake harness / session (实现 SessionLike / HarnessLike 契约) ------------

class FakeSession implements SessionLike {
  readonly id: string;
  readonly workDir: string;
  readonly summary: SessionSummary;
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

  lastPrompt: string | undefined;
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

  async prompt(input: string): Promise<void> {
    this.lastPrompt = input;
  }

  async steer(input: string): Promise<void> {
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
    if (existing !== undefined) return existing;
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

  async setConfig(patch: ByfConfigPatch): Promise<ByfConfig> {
    this.config = { ...this.config, ...patch } as ByfConfig;
    return this.config;
  }

  async removeProvider(providerId: string): Promise<ByfConfig> {
    const providers = { ...this.config.providers };
    delete providers[providerId];
    this.config = { ...this.config, providers };
    return this.config;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
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

  test('缺 workDir 查询返回 400', async () => {
    const { app } = await setup();
    const res = await app.request('/api/sessions');
    expect(res.status).toBe(400);
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
    const { app, homeDir, projDir } = await setup();
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

    // 注册表落盘(新格式:order + hidden)
    const registryRaw = await Bun.file(join(homeDir, 'workspaces.json')).text();
    expect(JSON.parse(registryRaw)).toEqual({ order: [projDir], hidden: [] });
  });

  test('GET 合并会话索引中未注册的 workDir(按最近更新时间倒序)', async () => {
    const { app, homeDir, harness } = await setup();
    // 会话索引直接写入(模拟其他来源的会话)
    await writeFile(
      join(homeDir, 'session_index.jsonl'),
      '{"sessionId":"s1","sessionDir":"/x/s1","workDir":"/old-dir"}\n' +
        '{"sessionId":"s2","sessionDir":"/x/s2","workDir":"/recent-dir"}\n',
      'utf-8',
    );
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

  test('损坏的注册表视为空表,可恢复写入', async () => {
    const { app, homeDir, projDir } = await setup();
    await writeFile(join(homeDir, 'workspaces.json'), '{not json', 'utf-8');
    const listed = await app.request('/api/workspaces');
    expect(listed.status).toBe(200);
    expect(((await listed.json()) as { workspaces: WorkspaceView[] }).workspaces).toEqual([]);

    await app.request('/api/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: projDir }),
    });
    const registryRaw = await Bun.file(join(homeDir, 'workspaces.json')).text();
    expect(JSON.parse(registryRaw)).toEqual({ order: [projDir], hidden: [] });
  });

  test('DELETE 后即使会话索引仍含该目录也不再出现;重新添加恢复原位置', async () => {
    const { app, homeDir } = await setup();
    // 两个真实存在的目录(注册校验需要目录存在)
    const oldDir = await mkdtemp(join(tmpdir(), 'byf-ws-old-'));
    const recentDir = await mkdtemp(join(tmpdir(), 'byf-ws-recent-'));
    dirs.push(oldDir, recentDir);
    await writeFile(
      join(homeDir, 'session_index.jsonl'),
      `{"sessionId":"s1","sessionDir":"/x/s1","workDir":"${oldDir}"}\n` +
        `{"sessionId":"s2","sessionDir":"/x/s2","workDir":"${recentDir}"}\n`,
      'utf-8',
    );
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
      },
      { id: 'bare', type: 'anthropic', baseUrl: undefined, hasApiKey: false },
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
    patchSummary(session, {
      agents: {
        main: {
          type: 'main',
          config: {},
          context: { messages: [] },
          replay: [
            {
              type: 'message',
              message: {
                role: 'user',
                content: [{ type: 'text', text: 'hi' }],
                toolCalls: [],
              },
            },
            {
              type: 'message',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'hello' }],
                toolCalls: [],
              },
            },
          ],
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
    const { app, harness, homeDir } = await setup();
    const workDir = await mkdtemp(join(tmpdir(), 'wd-'));
    seed(harness, 'ses_unarchive', workDir);
    // registry: add 后 remove = hidden;session_index 记录 sessionId → workDir
    const registry = new WorkspaceRegistry(homeDir);
    await registry.add(workDir);
    await registry.remove(workDir);
    await writeFile(
      join(homeDir, 'session_index.jsonl'),
      `${JSON.stringify({ sessionId: 'ses_unarchive', sessionDir: '/tmp/ses_unarchive', workDir })}\n`,
      'utf-8',
    );

    const res = await app.request('/api/sessions/ses_unarchive', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
    expect(res.status).toBe(200);

    const registryAfter = new WorkspaceRegistry(homeDir);
    expect(await registryAfter.list()).toContain(workDir);
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
    await writeFile(
      join(homeDir, 'session_index.jsonl'),
      `${JSON.stringify({ sessionId: 'ses_normal', sessionDir: '/tmp/ses_normal', workDir })}\n${JSON.stringify({ sessionId: 'ses_arch', sessionDir: '/tmp/ses_arch', workDir })}\n`,
      'utf-8',
    );

    const res = await app.request('/api/workspaces');
    const data = (await res.json()) as {
      workspaces: { workDir: string; sessions: SessionSummary[] }[];
    };
    const view = data.workspaces.find((w) => w.workDir === workDir);
    expect(view?.sessions.map((s) => s.id)).toEqual(['ses_normal']);
  });

  test('GET /api/archived-sessions 聚合所有工作目录(含 hidden)按 updatedAt 倒序', async () => {
    const { app, harness, homeDir } = await setup();
    const wd1 = await mkdtemp(join(tmpdir(), 'wd1-'));
    const wd2 = await mkdtemp(join(tmpdir(), 'wd2-'));
    seed(harness, 'ses_a1', wd1, { archived: true, updatedAt: 10 });
    seed(harness, 'ses_a2', wd2, { archived: true, updatedAt: 30 });
    seed(harness, 'ses_n', wd1, { updatedAt: 99 });
    await writeFile(
      join(homeDir, 'session_index.jsonl'),
      `${JSON.stringify({ sessionId: 'ses_a1', sessionDir: '/tmp/ses_a1', workDir: wd1 })}\n${JSON.stringify({ sessionId: 'ses_a2', sessionDir: '/tmp/ses_a2', workDir: wd2 })}\n${JSON.stringify({ sessionId: 'ses_n', sessionDir: '/tmp/ses_n', workDir: wd1 })}\n`,
      'utf-8',
    );

    const res = await app.request('/api/archived-sessions');
    expect(res.status).toBe(200);
    const data = (await res.json()) as { sessions: SessionSummary[] };
    expect(data.sessions.map((s) => s.id)).toEqual(['ses_a2', 'ses_a1']);
    expect(data.sessions.every((s) => s.archived === true)).toBe(true);
  });
});
