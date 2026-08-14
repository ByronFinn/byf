import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import type { ByfConfig, ByfConfigPatch } from '@byfriends/sdk';
import type {
  ActivateSkillBody,
  ApprovalDecisionBody,
  ConfigResponse,
  CreateSessionBody,
  CreateWorkspaceBody,
  FsEntry,
  FsListResponse,
  PromptBody,
  QuestionAnswerBody,
  ServerFrame,
  SetPermissionBody,
  SteerBody,
  ThinkingEffort,
  UpdateConfigBody,
  UpdateSessionModelBody,
  UpdateSessionThinkingBody,
  WorkspaceView,
} from '@byfriends/web-shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { AsyncQueue } from './async-queue';
import { pickDirectoryNative } from './native-directory-picker';
import type { WebSessionManager } from './session-manager';
import { WorkspaceRegistry, listIndexedWorkDirs, workspaceTitle } from './workspace-registry';

const VALID_DECISIONS: ReadonlySet<string> = new Set(['approved', 'rejected', 'cancelled']);
const VALID_PERMISSIONS: ReadonlySet<string> = new Set(['yolo', 'manual', 'auto']);
const VALID_THINKING_LEVELS: ReadonlySet<string> = new Set([
  'off',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
const VALID_THINKING_MODES: ReadonlySet<string> = new Set(['auto', 'on', 'off']);
const VALID_THINKING_EFFORTS: ReadonlySet<string> = new Set([
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);
const HEARTBEAT_MS = 20_000;

/** 构建挂载在 `/api` 下的路由树(无鉴权——鉴权由 `createApp` 包裹)。 */
export function createApiRouter(manager: WebSessionManager, homeDir: string): Hono {
  const r = new Hono();

  // ---- 工作区(侧边栏分组/添加;workDir 即工作区) ----
  r.get('/workspaces', async (c) => {
    const registry = new WorkspaceRegistry(homeDir);
    const registered = await registry.list();
    // 用户删除过的工作区从索引枚举中同样排除,否则会"删除后复活"
    const hidden = new Set(await registry.hidden());
    const indexed = (await listIndexedWorkDirs(homeDir)).filter((dir) => !hidden.has(dir));
    const ordered = [...registered, ...indexed.filter((dir) => !registered.includes(dir))];

    const views = new Map<string, WorkspaceView>();
    const sessionsList = await Promise.all(ordered.map((workDir) => manager.listSessions(workDir)));
    for (const [i, workDir] of ordered.entries()) {
      views.set(workDir, { workDir, title: workspaceTitle(workDir), sessions: sessionsList[i]! });
    }
    // 注册表顺序在前;仅索引出现的目录按最近会话更新时间倒序补入。
    const registeredViews = registered
      .map((dir) => views.get(dir))
      .filter((v): v is WorkspaceView => v !== undefined);
    const indexedOnly = [...views.values()]
      .filter((v) => !registered.includes(v.workDir))
      .toSorted(
        (a, b) =>
          maxSessionUpdatedAt(b) - maxSessionUpdatedAt(a) || (a.workDir < b.workDir ? -1 : 1),
      );
    return c.json({ workspaces: [...registeredViews, ...indexedOnly] });
  });

  r.post('/workspaces', async (c) => {
    const body = await c.req.json<CreateWorkspaceBody>();
    const path = (body.path ?? '').trim();
    if (path.length === 0) return badRequest(c, 'path is required');
    if (!isAbsolute(path)) return badRequest(c, 'path must be absolute');
    const resolved = resolve(path);
    let isDir = false;
    try {
      isDir = (await stat(resolved)).isDirectory();
    } catch {
      // 目录不存在 → 400
    }
    if (!isDir) return badRequest(c, `not a directory: ${resolved}`);

    const registry = new WorkspaceRegistry(homeDir);
    await registry.add(resolved);
    const sessions = await manager.listSessions(resolved);
    return c.json({ workspace: { workDir: resolved, title: workspaceTitle(resolved), sessions } });
  });

  r.delete('/workspaces', async (c) => {
    const workDir = c.req.query('workDir') ?? '';
    if (workDir.length === 0) return badRequest(c, 'workDir query is required');
    const registry = new WorkspaceRegistry(homeDir);
    const removed = await registry.remove(resolve(workDir));
    return c.json({ ok: true, removed });
  });

  r.post('/workspaces/pick', async (c) => {
    if (process.platform !== 'darwin') {
      return c.json(
        { error: 'native directory picker is only available on macOS', code: 'UNSUPPORTED' },
        501,
      );
    }
    const path = await pickDirectoryNative();
    return c.json({ path });
  });

  // ---- 会话集合 ----
  r.get('/sessions', async (c) => {
    const workDir = c.req.query('workDir') ?? '';
    if (workDir.length === 0) return badRequest(c, 'workDir query is required');
    const all = await manager.listSessions(workDir);
    // R17:可选 ?q= 在 title / lastPrompt 上做不区分大小写的子串过滤(SessionSummary 不变)。
    const q = c.req.query('q')?.trim().toLowerCase() ?? '';
    const sessions =
      q.length === 0
        ? all
        : all.filter(
            (s) =>
              (s.title ?? '').toLowerCase().includes(q) ||
              (s.lastPrompt ?? '').toLowerCase().includes(q),
          );
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

  r.patch('/sessions/:id/model', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<UpdateSessionModelBody>();
    const model = (body.model ?? '').trim();
    if (model.length === 0) return badRequest(c, 'model is required');
    await manager.setModel(id, model);
    return c.json({ ok: true });
  });

  r.patch('/sessions/:id/thinking', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<UpdateSessionThinkingBody>();
    if (!VALID_THINKING_LEVELS.has(body.level)) {
      return badRequest(c, 'level must be one of: off, low, medium, high, xhigh, max');
    }
    await manager.setThinking(id, body.level);
    return c.json({ ok: true });
  });

  r.post('/sessions/:id/activate-skill', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<ActivateSkillBody>();
    const name = (body.name ?? '').trim();
    if (name.length === 0) return badRequest(c, 'name is required');
    await manager.activateSkill(id, name, body.args);
    return c.json({ ok: true });
  });

  // 会话可用的 skill 列表(slash 面板 `skill:<name>` 命令的数据源;同 TUI 的
  // Session.listSkills 语义——用户可激活的类型由客户端过滤)。
  r.get('/sessions/:id/skills', async (c) => {
    const id = c.req.param('id');
    if (manager.getSession(id) === undefined) return notFound(c, 'session not found');
    return c.json({ skills: await manager.listSkills(id) });
  });

  r.post('/sessions/:id/compact', async (c) => {
    const id = c.req.param('id');
    await manager.compact(id);
    return c.json({ ok: true });
  });

  // ---- 配置(设置弹层:默认模型 / 默认权限 / 默认思考) -------------------------

  // ---- 目录浏览(@ 引用文件/文件夹;仅允许工作区根内,防任意文件系统暴露) ----
  r.get('/fs/list', async (c) => {
    const root = c.req.query('root') ?? '';
    const path = c.req.query('path') ?? '';
    if (root.length === 0) return badRequest(c, 'root query is required');
    const registry = new WorkspaceRegistry(homeDir);
    const allowed = new Set(
      [...(await registry.list()), ...(await listIndexedWorkDirs(homeDir))].map((d) => resolve(d)),
    );
    if (!allowed.has(resolve(root))) return badRequest(c, 'root must be a registered workspace');
    const base = resolve(root);
    const target = resolve(base, path);
    if (target !== base && !target.startsWith(`${base}${sep}`)) {
      return badRequest(c, 'path escapes the workspace root');
    }
    let entries: FsEntry[];
    try {
      const dirents = await readdir(target, { withFileTypes: true });
      entries = dirents
        .filter((d) => !d.name.startsWith('.'))
        .toSorted((a, b) =>
          a.isDirectory() === b.isDirectory()
            ? a.name.localeCompare(b.name)
            : a.isDirectory()
              ? -1
              : 1,
        )
        .map((d) => ({
          name: d.name,
          path: path.length === 0 ? d.name : `${path}/${d.name}`,
          isDir: d.isDirectory(),
        }));
    } catch {
      return notFound(c, `cannot read directory: ${target}`);
    }
    return c.json({ entries } satisfies FsListResponse);
  });

  r.get('/config', async (c) => {
    const cfg = await manager.getConfig();
    return c.json(toConfigResponse(cfg, manager.configPath));
  });

  r.patch('/config', async (c) => {
    const body = await c.req.json<UpdateConfigBody>();
    const patch: ByfConfigPatch = {};
    if (body.defaultModel !== undefined) patch.defaultModel = body.defaultModel;
    if (body.defaultPermissionMode !== undefined) {
      if (!VALID_PERMISSIONS.has(body.defaultPermissionMode)) {
        return badRequest(c, 'defaultPermissionMode must be one of: yolo, manual, auto');
      }
      patch.defaultPermissionMode = body.defaultPermissionMode;
    }
    if (body.defaultThinking !== undefined) patch.defaultThinking = body.defaultThinking;
    if (body.thinking !== undefined) {
      const thinking: NonNullable<ByfConfigPatch['thinking']> = {};
      if (body.thinking.mode !== undefined) {
        if (!VALID_THINKING_MODES.has(body.thinking.mode)) {
          return badRequest(c, 'thinking.mode must be one of: auto, on, off');
        }
        thinking.mode = body.thinking.mode;
      }
      if (body.thinking.effort !== undefined) {
        if (!VALID_THINKING_EFFORTS.has(body.thinking.effort)) {
          return badRequest(c, 'thinking.effort must be one of: low, medium, high, xhigh, max');
        }
        thinking.effort = body.thinking.effort as ThinkingEffort;
      }
      if (Object.keys(thinking).length > 0) patch.thinking = thinking;
    }
    if (Object.keys(patch).length === 0) return badRequest(c, 'no updatable fields provided');
    const cfg = await manager.setConfig(patch);
    return c.json(toConfigResponse(cfg, manager.configPath));
  });

  r.delete('/config/providers/:id', async (c) => {
    const id = c.req.param('id');
    if (id.length === 0) return badRequest(c, 'provider id is required');
    const cfg = await manager.removeProvider(id);
    return c.json(toConfigResponse(cfg, manager.configPath));
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

/** 工作区最近会话更新时间(无会话 → 0)。 */
function maxSessionUpdatedAt(workspace: WorkspaceView): number {
  let max = 0;
  for (const session of workspace.sessions) {
    if (session.updatedAt > max) max = session.updatedAt;
  }
  return max;
}

/** 把 ByfConfig 映射为脱敏线路视图(apiKey 不回线路,仅标记是否已配置)。 */
function toConfigResponse(cfg: ByfConfig, configPath: string): ConfigResponse {
  return {
    configPath,
    defaultModel: cfg.defaultModel,
    defaultPermissionMode: cfg.defaultPermissionMode,
    defaultThinking: cfg.defaultThinking,
    thinking: cfg.thinking === undefined ? undefined : { ...cfg.thinking },
    models: Object.entries(cfg.models ?? {}).map(([id, m]) => ({
      id,
      provider: m.provider,
      model: m.model,
      displayName: m.displayName,
    })),
    providers: Object.entries(cfg.providers ?? {}).map(([id, p]) => ({
      id,
      type: p.type,
      baseUrl: p.baseUrl,
      hasApiKey: p.apiKey !== undefined && p.apiKey.length > 0,
    })),
  };
}
