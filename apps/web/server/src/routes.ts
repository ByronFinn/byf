import type {
  ApprovalDecisionBody,
  CreateSessionBody,
  PromptBody,
  QuestionAnswerBody,
  ServerFrame,
  SetPermissionBody,
  SteerBody,
} from '@byfriends/web-shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { AsyncQueue } from './async-queue';
import type { WebSessionManager } from './session-manager';

const VALID_DECISIONS: ReadonlySet<string> = new Set(['approved', 'rejected', 'cancelled']);
const VALID_PERMISSIONS: ReadonlySet<string> = new Set(['yolo', 'manual', 'auto']);
const HEARTBEAT_MS = 20_000;

/** 构建挂载在 `/api` 下的路由树(无鉴权——鉴权由 `createApp` 包裹)。 */
export function createApiRouter(manager: WebSessionManager): Hono {
  const r = new Hono();

  // ---- 会话集合 ----
  r.get('/sessions', async (c) => {
    const workDir = c.req.query('workDir') ?? '';
    if (workDir.length === 0) return badRequest(c, 'workDir query is required');
    const sessions = await manager.listSessions(workDir);
    return c.json({ sessions });
  });

  r.post('/sessions', async (c) => {
    const body = await c.req.json<CreateSessionBody>();
    const workDir = (body.workDir ?? '').trim();
    if (workDir.length === 0) return badRequest(c, 'workDir is required');
    const session = await manager.createSession({
      workDir,
      model: body.model,
      thinking: body.thinking,
      permission: body.permission,
    });
    return c.json({ session }, 201);
  });

  // ---- 单会话 ----
  r.get('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const status = await manager.getStatus(id);
    const summary = manager.getSession(id)?.summary ?? null;
    return c.json({ session: summary, status });
  });

  r.post('/sessions/:id/resume', async (c) => {
    const id = c.req.param('id');
    const session = await manager.resumeSession(id);
    return c.json({ session });
  });

  r.delete('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const closed = await manager.closeSession(id);
    if (!closed) return notFound(c, 'session not found');
    return c.json({ sessionId: id, closed: true });
  });

  r.post('/sessions/:id/prompt', async (c) => {
    const id = c.req.param('id');
    if (manager.getSession(id) === undefined) return notFound(c, 'session not found');
    const body = await c.req.json<PromptBody>();
    if ((body.input ?? '').trim().length === 0) return badRequest(c, 'input is required');
    manager.prompt(id, body.input); // fire-and-forget;事件经 SSE 推送
    return c.json({ ok: true }, 202);
  });

  r.post('/sessions/:id/steer', async (c) => {
    const id = c.req.param('id');
    if (manager.getSession(id) === undefined) return notFound(c, 'session not found');
    const body = await c.req.json<SteerBody>();
    if ((body.input ?? '').trim().length === 0) return badRequest(c, 'input is required');
    manager.steer(id, body.input);
    return c.json({ ok: true }, 202);
  });

  r.post('/sessions/:id/cancel', async (c) => {
    const id = c.req.param('id');
    await manager.cancel(id);
    return c.json({ ok: true });
  });

  r.patch('/sessions/:id/permission', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<SetPermissionBody>();
    if (!VALID_PERMISSIONS.has(body.mode)) {
      return badRequest(c, 'mode must be one of: yolo, manual, auto');
    }
    await manager.setPermission(id, body.mode);
    return c.json({ ok: true });
  });

  // ---- 反向 RPC 裁决 ----
  r.post('/sessions/:id/approvals/:requestId', async (c) => {
    const requestId = c.req.param('requestId');
    const body = await c.req.json<ApprovalDecisionBody>();
    if (!VALID_DECISIONS.has(body.decision)) {
      return badRequest(c, 'decision must be one of: approved, rejected, cancelled');
    }
    const ok = manager.resolveApproval(requestId, {
      decision: body.decision,
      scope: body.scope,
      feedback: body.feedback,
      selectedLabel: body.selectedLabel,
    });
    if (!ok) return notFound(c, 'approval not found (already settled or expired)');
    return c.json({ ok: true });
  });

  r.post('/sessions/:id/questions/:requestId', async (c) => {
    const requestId = c.req.param('requestId');
    const body = await c.req.json<QuestionAnswerBody>();
    const ok = manager.resolveQuestion(requestId, { answers: body.answers });
    if (!ok) return notFound(c, 'question not found (already settled or expired)');
    return c.json({ ok: true });
  });

  // ---- SSE 事件流 ----
  r.get('/sessions/:id/events', (c) => {
    const id = c.req.param('id');
    if (manager.getSession(id) === undefined) return notFound(c, 'session not found');
    return streamSSE(c, async (stream) => {
      const queue = new AsyncQueue<ServerFrame>();
      const subscriber = manager.subscribe(id, queue);
      // 首帧 + 重放 pending,再进入读循环。JS 单线程保证此同步段内无 onEvent 交错。
      queue.push({ type: 'sys.connected', sessionId: id });
      manager.replayPending(subscriber);
      const hb = setInterval(() => {
        queue.push({ type: 'sys.heartbeat' });
      }, HEARTBEAT_MS);
      stream.onAbort(() => {
        clearInterval(hb);
        manager.unsubscribe(subscriber);
      });
      while (!stream.aborted) {
        const frame = await queue.next();
        if (frame === null) break;
        try {
          await stream.writeSSE({ event: frame.type, data: JSON.stringify(frame) });
        } catch {
          break; // 写失败(客户端已断),退出循环
        }
      }
      clearInterval(hb);
      manager.unsubscribe(subscriber);
    });
  });

  return r;
}

function badRequest(c: Context, error: string): Response {
  return c.json({ error, code: 'BAD_REQUEST' }, 400);
}

function notFound(c: Context, error: string): Response {
  return c.json({ error, code: 'NOT_FOUND' }, 404);
}
