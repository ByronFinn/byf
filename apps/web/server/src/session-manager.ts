import { randomUUID } from 'node:crypto';

import type {
  ApprovalHandler,
  ApprovalRequest,
  ApprovalResponse,
  ByfConfig,
  ByfConfigPatch,
  CreateSessionOptions,
  Event,
  PermissionMode,
  QuestionHandler,
  QuestionRequest,
  QuestionResult,
  ResumedSessionSummary,
  Unsubscribe,
} from '@byfriends/sdk';
import type {
  CreateSessionBody,
  ServerFrame,
  SessionStatus,
  SessionSummary,
} from '@byfriends/web-shared';

import type { AsyncQueue } from './async-queue';

// ---- 注入契约 ---------------------------------------------------------------
// SessionLike / HarnessLike 是 ByfHarness / Session 的最小结构化投影,使测试可
// 注入 fake。真实的 ByfHarness / Session 满足这些契约(方法简写式双变)。

export interface SessionLike {
  readonly id: string;
  readonly workDir: string;
  readonly summary?: SessionSummary;
  onEvent(listener: (event: Event) => void): Unsubscribe;
  setApprovalHandler(handler: ApprovalHandler | undefined): void;
  setQuestionHandler(handler: QuestionHandler | undefined): void;
  prompt(input: string): Promise<void>;
  steer(input: string): Promise<void>;
  cancel(): Promise<void>;
  setPermission(mode: PermissionMode): Promise<void>;
  setModel(model: string): Promise<void>;
  getStatus(): Promise<SessionStatus>;
  close(): Promise<void>;
}

export interface HarnessLike {
  createSession(options: CreateSessionOptions): Promise<SessionLike>;
  resumeSession(input: { readonly id: string }): Promise<SessionLike>;
  listSessions(options: { readonly workDir: string }): Promise<readonly SessionSummary[]>;
  getConfig(): Promise<ByfConfig>;
  setConfig(patch: ByfConfigPatch): Promise<ByfConfig>;
  removeProvider(providerId: string): Promise<ByfConfig>;
  readonly configPath: string;
  close(): Promise<void>;
}

/** SSE 订阅者:每帧推入其私有队列,由 SSE 路由单消费者写出。 */
export interface Subscriber {
  readonly sessionId: string;
  readonly queue: AsyncQueue<ServerFrame>;
}

interface PendingApproval {
  readonly session: SessionLike;
  readonly request: ApprovalRequest;
  readonly resolve: (response: ApprovalResponse) => void;
  readonly reject: (error: Error) => void;
}

interface PendingQuestion {
  readonly session: SessionLike;
  readonly request: QuestionRequest;
  readonly resolve: (result: QuestionResult) => void;
  readonly reject: (error: Error) => void;
}

/**
 * WebSessionManager —— web-server 的会话与事件中枢。
 *
 * - 持有一个注入的 {@link HarnessLike}(生产为 ByfHarness,测试为 fake)。
 * - 创建/恢复会话时挂 `onEvent`(广播 agent 事件)与审批/问答 handler(发起反向 RPC)。
 * - 维护每会话订阅者集合与待裁决反向 RPC 表;SSE 重连时重放 pending,使刷新页面
 *   能恢复一个被阻塞的 turn。
 */
export class WebSessionManager {
  private readonly sessions = new Map<string, SessionLike>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly unsubscribers = new Map<string, Unsubscribe>();
  private readonly pendingApprovals = new Map<string, PendingApproval>();
  private readonly pendingQuestions = new Map<string, PendingQuestion>();
  /** 进行中的 resume(id → promise),并发 resume 去重,防止重复 attach 双份 onEvent。 */
  private readonly resuming = new Map<string, Promise<SessionLike>>();

  constructor(private readonly harness: HarnessLike) {}

  async createSession(body: CreateSessionBody): Promise<SessionSummary> {
    const options: CreateSessionOptions = {
      workDir: body.workDir,
      model: body.model,
      thinking: body.thinking,
      permission: body.permission,
    };
    const session = await this.harness.createSession(options);
    this.attach(session);
    this.sessions.set(session.id, session);
    return session.summary ?? toSummary(session);
  }

  async resumeSession(id: string): Promise<ResumedSessionSummary> {
    const session = await this.resumeSessionOnce(id);
    // 真实 harness 的 Session.summary 即完整 ResumeSessionResult(含
    // agents.main.replay);fake 无 resume 状态时退化为普通摘要。
    return (session.summary ?? toSummary(session)) as ResumedSessionSummary;
  }

  /**
   * 并发安全 resume:React StrictMode 等客户端可能对同一 id 同时发两次
   * resume;若各自走 harness.resumeSession 会 attach 两份 onEvent 监听,
   * 导致每个 agent 事件广播两次(every delta 翻倍)。同 id 的并发请求共享
   * 同一个进行中的 promise。
   */
  private resumeSessionOnce(id: string): Promise<SessionLike> {
    const existing = this.sessions.get(id);
    if (existing !== undefined) return Promise.resolve(existing);
    const pending = this.resuming.get(id);
    if (pending !== undefined) return pending;
    const loading = this.harness
      .resumeSession({ id })
      .then((session) => {
        // 二次防御:并发期间可能已被另一路径 attach
        const again = this.sessions.get(session.id);
        if (again !== undefined) return again;
        this.attach(session);
        this.sessions.set(session.id, session);
        return session;
      })
      .finally(() => {
        this.resuming.delete(id);
      });
    this.resuming.set(id, loading);
    return loading;
  }

  async listSessions(workDir: string): Promise<readonly SessionSummary[]> {
    return this.harness.listSessions({ workDir });
  }

  getSession(id: string): SessionLike | undefined {
    return this.sessions.get(id);
  }

  async getStatus(id: string): Promise<SessionStatus> {
    return this.requireSession(id).getStatus();
  }

  /**
   * 触发一个 turn。**fire-and-forget**:不等待 turn 结束——事件经 SSE 流式推送,
   * 错误转为 `sys.error` 帧。调用方应以 `void` 启动。
   */
  prompt(id: string, input: string): void {
    void this.runTurn(id, async (s) => s.prompt(input));
  }

  steer(id: string, input: string): void {
    void this.runTurn(id, async (s) => s.steer(input));
  }

  private async runTurn(id: string, fn: (session: SessionLike) => Promise<void>): Promise<void> {
    const session = this.sessions.get(id);
    if (session === undefined) return;
    try {
      await fn(session);
    } catch (error) {
      this.broadcast(id, { type: 'sys.error', message: errMsg(error) });
    }
  }

  async cancel(id: string): Promise<void> {
    await this.requireSession(id).cancel();
  }

  async setPermission(id: string, mode: PermissionMode): Promise<void> {
    await this.requireSession(id).setPermission(mode);
  }

  async setModel(id: string, model: string): Promise<void> {
    await this.requireSession(id).setModel(model);
  }

  // ---- 配置(直通 harness;设置页读写 byf 配置) --------------------------------

  get configPath(): string {
    return this.harness.configPath;
  }

  getConfig(): Promise<ByfConfig> {
    return this.harness.getConfig();
  }

  setConfig(patch: ByfConfigPatch): Promise<ByfConfig> {
    return this.harness.setConfig(patch);
  }

  removeProvider(providerId: string): Promise<ByfConfig> {
    return this.harness.removeProvider(providerId);
  }

  // ---- 反向 RPC 裁决 ---------------------------------------------------------

  resolveApproval(requestId: string, response: ApprovalResponse): boolean {
    const pending = this.pendingApprovals.get(requestId);
    if (pending === undefined) return false;
    this.pendingApprovals.delete(requestId);
    pending.resolve(response);
    this.broadcast(pending.session.id, {
      type: 'approval.settled',
      requestId,
      decision: response.decision,
    });
    return true;
  }

  resolveQuestion(requestId: string, result: QuestionResult): boolean {
    const pending = this.pendingQuestions.get(requestId);
    if (pending === undefined) return false;
    this.pendingQuestions.delete(requestId);
    pending.resolve(result);
    this.broadcast(pending.session.id, { type: 'question.settled', requestId });
    return true;
  }

  // ---- SSE 订阅 --------------------------------------------------------------

  subscribe(sessionId: string, queue: AsyncQueue<ServerFrame>): Subscriber {
    const subscriber: Subscriber = { sessionId, queue };
    let set = this.subscribers.get(sessionId);
    if (set === undefined) {
      set = new Set();
      this.subscribers.set(sessionId, set);
    }
    set.add(subscriber);
    return subscriber;
  }

  /** 重放当前待裁决的审批/问答(使 SSE 重连恢复被阻塞的 turn)。 */
  replayPending(subscriber: Subscriber): void {
    for (const [requestId, pending] of this.pendingApprovals) {
      if (pending.session.id === subscriber.sessionId) {
        subscriber.queue.push({ type: 'approval.requested', requestId, request: pending.request });
      }
    }
    for (const [requestId, pending] of this.pendingQuestions) {
      if (pending.session.id === subscriber.sessionId) {
        subscriber.queue.push({ type: 'question.requested', requestId, request: pending.request });
      }
    }
  }

  unsubscribe(subscriber: Subscriber): void {
    const set = this.subscribers.get(subscriber.sessionId);
    if (set === undefined) return;
    set.delete(subscriber);
    subscriber.queue.close();
    if (set.size === 0) this.subscribers.delete(subscriber.sessionId);
  }

  // ---- 生命周期 --------------------------------------------------------------

  async closeSession(id: string): Promise<boolean> {
    // 该 id 的 resume 仍在进行时先等它落地:否则 resume 会在 close 之后完成
    // attach,把已请求关闭的会话留在内存里(需二次 DELETE 才能真正关闭)。
    const pending = this.resuming.get(id);
    if (pending !== undefined) {
      try {
        await pending;
      } catch {
        /* resume 失败则无会话可关,走下面的 not found 路径 */
      }
    }
    const session = this.sessions.get(id);
    if (session === undefined) return false;
    this.detach(id);
    this.rejectPendingForSession(id, new Error('session closed'));
    this.sessions.delete(id);
    await session.close();
    return true;
  }

  async dispose(): Promise<void> {
    // 快照键集合:closeSession 会在迭代中删除条目。
    for (const id of Array.from(this.sessions.keys())) {
      await this.closeSession(id);
    }
    await this.harness.close();
  }

  // ---- 内部 ------------------------------------------------------------------

  private attach(session: SessionLike): void {
    const unsub = session.onEvent((event) => {
      this.broadcast(session.id, { type: 'agent.event', event });
    });
    this.unsubscribers.set(session.id, unsub);
    session.setApprovalHandler((request) => this.requestApproval(session, request));
    session.setQuestionHandler((request) => this.requestQuestion(session, request));
  }

  private detach(id: string): void {
    this.unsubscribers.get(id)?.();
    this.unsubscribers.delete(id);
  }

  private requestApproval(
    session: SessionLike,
    request: ApprovalRequest,
  ): Promise<ApprovalResponse> {
    const requestId = randomUUID();
    return new Promise<ApprovalResponse>((resolve, reject) => {
      this.pendingApprovals.set(requestId, { session, request, resolve, reject });
      this.broadcast(session.id, { type: 'approval.requested', requestId, request });
    });
  }

  private requestQuestion(session: SessionLike, request: QuestionRequest): Promise<QuestionResult> {
    const requestId = randomUUID();
    return new Promise<QuestionResult>((resolve, reject) => {
      this.pendingQuestions.set(requestId, { session, request, resolve, reject });
      this.broadcast(session.id, { type: 'question.requested', requestId, request });
    });
  }

  private rejectPendingForSession(id: string, error: Error): void {
    for (const [requestId, pending] of this.pendingApprovals) {
      if (pending.session.id === id) {
        this.pendingApprovals.delete(requestId);
        pending.reject(error);
      }
    }
    for (const [requestId, pending] of this.pendingQuestions) {
      if (pending.session.id === id) {
        this.pendingQuestions.delete(requestId);
        pending.reject(error);
      }
    }
  }

  private requireSession(id: string): SessionLike {
    const session = this.sessions.get(id);
    if (session === undefined) {
      throw new SessionNotFoundError(`session not found: ${id}`);
    }
    return session;
  }

  private broadcast(sessionId: string, frame: ServerFrame): void {
    const set = this.subscribers.get(sessionId);
    if (set === undefined) return;
    for (const subscriber of set) {
      subscriber.queue.push(frame);
    }
  }
}

/** 找不到会话(路由映射为 404)。 */
export class SessionNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionNotFoundError';
  }
}

function toSummary(session: SessionLike): SessionSummary {
  return {
    id: session.id,
    workDir: session.workDir,
    sessionDir: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
