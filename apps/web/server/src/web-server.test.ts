import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';

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
} from '@byfriends/web-shared';

import { createApp } from './app';
import { AsyncQueue } from './async-queue';
import { WebSessionManager, type HarnessLike, type SessionLike } from './session-manager';

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

  async createSession(options: {
    readonly workDir: string;
    readonly model?: string;
  }): Promise<SessionLike> {
    const id = randomUUID();
    const session = new FakeSession(id, options.workDir);
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
