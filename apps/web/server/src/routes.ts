import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import type { ByfConfig, ByfConfigPatch } from '@byfriends/sdk';
import type {
  ActivateSkillBody,
  ApprovalDecisionBody,
  ArchivedSessionsResponse,
  ConfigResponse,
  CreateSessionBody,
  CreateWorkspaceBody,
  DiscoverModelsBody,
  DiscoverModelsResponse,
  ForkSessionBody,
  ForkSessionResponse,
  FsEntry,
  FsListResponse,
  PromptBody,
  QuestionAnswerBody,
  ServerFrame,
  SetPermissionBody,
  SteerBody,
  ThinkingEffort,
  UpdateConfigBody,
  ModelUpdateBody,
  ModelUpsertBody,
  ProviderCreateBody,
  ProviderUpdateBody,
  UpdateSessionMetaBody,
  UpdateSessionModelBody,
  UpdateSessionThinkingBody,
  WorkspaceView,
} from '@byfriends/web-shared';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { AsyncQueue } from './async-queue';
import { serveScopedFile } from './files';
import { pickDirectoryNative } from './native-directory-picker';
import type { WebSessionManager } from './session-manager';
import {
  WorkspaceRegistry,
  findSessionWorkDir,
  listIndexedWorkDirs,
  workspaceTitle,
} from './workspace-registry';

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

const PROVIDER_TYPES: ReadonlySet<string> = new Set([
  'anthropic',
  'openai-completions',
  'google-genai',
  'openai_responses',
  'vertexai',
]);

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
    const sessionsList = await Promise.all(
      ordered.map((workDir) =>
        manager.listSessions(workDir).then((sessions) => sessions.filter((s) => !s.archived)),
      ),
    );
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
    // PRD-0034 R-A5:默认仅未归档;?archived=true 仅返回归档(归档管理数据源)。
    const archivedOnly = c.req.query('archived') === 'true';
    const byArchive = archivedOnly
      ? all.filter((s) => s.archived === true)
      : all.filter((s) => !s.archived);
    const sessions =
      q.length === 0
        ? byArchive
        : byArchive.filter(
            (s) =>
              (s.title ?? '').toLowerCase().includes(q) ||
              (s.lastPrompt ?? '').toLowerCase().includes(q),
          );
    return c.json({ sessions });
  });

  // ---- 归档管理(PRD-0034 R-A3):session_index 聚合,不依赖工作区注册表,hidden
  // 工作区的归档会话也可见 ------------------------------------------------------
  r.get('/archived-sessions', async (c) => {
    const registry = new WorkspaceRegistry(homeDir);
    const workDirs = new Set([...(await registry.list()), ...(await listIndexedWorkDirs(homeDir))]);
    const lists = await Promise.all([...workDirs].map((workDir) => manager.listSessions(workDir)));
    const sessions = lists
      .flat()
      .filter((s) => s.archived === true)
      .toSorted((a, b) => b.updatedAt - a.updatedAt);
    const response: ArchivedSessionsResponse = { sessions };
    return c.json(response);
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

  // ---- 会话组织(PRD-0034 R-A1/R-A4) -----------------------------------------

  /** 统一元数据端点:一次可改 title/pinned/archived。 */
  r.patch('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<UpdateSessionMetaBody>();
    const title = body.title?.trim();
    if (title !== undefined && title.length === 0) {
      return badRequest(c, 'title cannot be empty');
    }
    if (title !== undefined && title.length > 200) {
      return badRequest(c, 'title must be at most 200 characters');
    }
    if (title === undefined && body.pinned === undefined && body.archived === undefined) {
      return badRequest(c, 'at least one of title/pinned/archived is required');
    }

    if (title !== undefined) {
      await manager.renameSession(id, title);
    }
    const metaPatch: { pinned?: boolean; archived?: boolean } = {};
    if (body.pinned !== undefined) metaPatch.pinned = body.pinned;
    if (body.archived !== undefined) metaPatch.archived = body.archived;
    if (Object.keys(metaPatch).length > 0) {
      await manager.updateSessionMetadata(id, metaPatch);
    }

    // 恢复归档时,若其工作区被隐藏(删除过),自动重新登记,使其回到侧栏。
    if (body.archived === false) {
      const workDir = await findSessionWorkDir(homeDir, id);
      if (workDir !== undefined) {
        const registry = new WorkspaceRegistry(homeDir);
        if ((await registry.hidden()).includes(workDir)) {
          await registry.add(workDir);
        }
      }
    }
    return c.json({ ok: true });
  });

  r.post('/sessions/:id/fork', async (c) => {
    const id = c.req.param('id');
    if (manager.isSessionBusy(id)) {
      return c.json({ error: 'session is busy', code: 'SESSION_BUSY' }, 409);
    }
    const body = await c.req.json<ForkSessionBody>().catch(() => ({}) as ForkSessionBody);
    const session = await manager.forkSession(id, body.upToMessage);
    const response: ForkSessionResponse = { session };
    return c.json(response, 201);
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
  // ---- 作用域白名单文件端点(PRD-0034 R-C2 / ADR-0036 D2) ----------------------
  r.get('/files', async (c) => {
    return serveScopedFile(c, homeDir, c.req.query('path') ?? '');
  });

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

  // ---- provider / models 增改(PRD-0034 R-D3;apiKey 只写不读) ----------------

  r.post('/config/providers', async (c) => {
    const body = await c.req.json<ProviderCreateBody>();
    const id = body.id.trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      return badRequest(c, 'provider id must be a lowercase slug (a-z, 0-9, -)');
    }
    if (!PROVIDER_TYPES.has(body.type)) {
      return badRequest(
        c,
        'type must be one of: anthropic, openai-completions, google-genai, openai_responses, vertexai',
      );
    }
    if (body.baseUrl === undefined || body.baseUrl.trim().length === 0) {
      return badRequest(c, 'baseUrl is required');
    }
    if (!Array.isArray(body.models) || body.models.length === 0) {
      return badRequest(c, 'at least one model alias is required');
    }
    const current = await manager.getConfig();
    if (current.providers !== undefined && id in current.providers) {
      return c.json({ error: `provider id already exists: ${id}`, code: 'CONFLICT' }, 409);
    }
    for (const model of body.models) {
      if (current.models !== undefined && model.id in current.models) {
        return c.json({ error: `model alias already exists: ${model.id}`, code: 'CONFLICT' }, 409);
      }
    }

    const models: ByfConfigPatch['models'] = {};
    for (const model of body.models) models[model.id] = modelAliasFromUpsert(id, model);
    const cfg = await manager.setConfig({
      providers: {
        [id]: {
          type: body.type,
          baseUrl: body.baseUrl.trim(),
          apiKey: body.apiKey,
          customHeaders: body.customHeaders,
          extraBody: body.extraBody,
        },
      },
      models,
    });
    return c.json(toConfigResponse(cfg, manager.configPath), 201);
  });

  r.patch('/config/providers/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<ProviderUpdateBody>();
    const current = await manager.getConfig();
    if (current.providers === undefined || !(id in current.providers)) {
      return notFound(c, `provider not found: ${id}`);
    }
    if (body.type !== undefined && !PROVIDER_TYPES.has(body.type)) {
      return badRequest(c, 'invalid provider type');
    }
    const provider: Record<string, unknown> = {};
    if (body.apiKey !== undefined && body.apiKey.length > 0) provider['apiKey'] = body.apiKey;
    if (body.baseUrl !== undefined) provider['baseUrl'] = body.baseUrl.trim();
    if (body.type !== undefined) provider['type'] = body.type;
    if (body.customHeaders !== undefined) provider['customHeaders'] = body.customHeaders;
    if (body.extraBody !== undefined) provider['extraBody'] = body.extraBody;
    if (Object.keys(provider).length === 0) return badRequest(c, 'no updatable fields provided');
    const cfg = await manager.setConfig({ providers: { [id]: provider } });
    return c.json(toConfigResponse(cfg, manager.configPath));
  });

  r.post('/config/models', async (c) => {
    const body = await c.req.json<ModelUpsertBody>();
    const current = await manager.getConfig();
    if (current.models !== undefined && body.id in current.models) {
      return c.json({ error: `model alias already exists: ${body.id}`, code: 'CONFLICT' }, 409);
    }
    const cfg = await manager.setConfig({
      models: { [body.id]: modelAliasFromUpsert(body.provider, body) },
    });
    return c.json(toConfigResponse(cfg, manager.configPath), 201);
  });

  r.patch('/config/models/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<ModelUpdateBody>();
    const current = await manager.getConfig();
    if (current.models === undefined || !(id in current.models)) {
      return notFound(c, `model alias not found: ${id}`);
    }
    const existing = current.models[id]!;
    const cfg = await manager.setConfig({
      models: {
        [id]: modelAliasFromUpsert(body.provider ?? existing.provider, {
          ...body,
          id,
          model: body.model ?? existing.model,
          maxContextSize: body.maxContextSize ?? existing.maxContextSize,
        }),
      },
    });
    return c.json(toConfigResponse(cfg, manager.configPath));
  });

  r.delete('/config/models/:id', async (c) => {
    const id = c.req.param('id');
    const cfg = await manager.removeModel(id);
    return c.json(toConfigResponse(cfg, manager.configPath));
  });

  // fetch available models(R-D3 端点发现):用表单草稿探测远端 /v1/models,
  // 不落盘;仅 openai 兼容类型。
  r.post('/config/discover-models', async (c) => {
    const body = await c.req.json<DiscoverModelsBody>();
    if (body.type !== 'openai-completions' && body.type !== 'openai_responses') {
      return badRequest(c, 'discover-models supports openai-completions / openai_responses types');
    }
    if (body.baseUrl === undefined || body.baseUrl.trim().length === 0) {
      return badRequest(c, 'baseUrl is required');
    }
    const base = body.baseUrl.trim().replace(/\/+$/, '');
    const url = /\/v\d+$/.test(base) ? `${base}/models` : `${base}/v1/models`;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (body.apiKey !== undefined && body.apiKey.length > 0) {
      headers['authorization'] = `Bearer ${body.apiKey}`;
    }
    let res: Response;
    try {
      res = await fetch(url, { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return c.json({ error: `failed to reach ${url}: ${message}`, code: 'BAD_GATEWAY' }, 502);
    }
    if (!res.ok) {
      return c.json(
        { error: `${url} responded ${String(res.status)} ${res.statusText}`, code: 'BAD_GATEWAY' },
        502,
      );
    }
    const payload = (await res.json().catch(() => null)) as {
      data?: Array<{ id?: unknown }>;
    } | null;
    const models = (payload?.data ?? [])
      .map((entry) => entry.id)
      .filter((entryId): entryId is string => typeof entryId === 'string')
      .toSorted((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const response: DiscoverModelsResponse = { models: models.map((entryId) => ({ id: entryId })) };
    return c.json(response);
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

/** provider.env 中的类型级 API key 兜底(与 runtime-provider providerApiKey 同名约定)。 */
const PROVIDER_ENV_KEY: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  'openai-completions': 'BYF_API_KEY',
  openai_responses: 'OPENAI_API_KEY',
  'google-genai': 'GOOGLE_API_KEY',
  vertexai: 'VERTEXAI_API_KEY',
};

function providerEnvHasKey(type: string, env: Record<string, string> | undefined): boolean {
  const key = PROVIDER_ENV_KEY[type];
  if (key === undefined || env === undefined) return false;
  const value = env[key];
  return value !== undefined && value.length > 0;
}

/** ModelUpsertBody → ModelAliasConfig(与 config/schema.ts 字段对齐)。 */
function modelAliasFromUpsert(
  provider: string,
  model: ModelUpsertBody | (ModelUpdateBody & { id: string }),
): ByfConfigPatch['models'] extends Record<string, infer T> ? T : never {
  return {
    provider,
    model: model.model ?? '',
    maxContextSize: model.maxContextSize ?? 128_000,
    maxOutputSize: model.maxOutputSize,
    capabilities: model.capabilities !== undefined ? [...model.capabilities] : ['tool_use'],
    displayName: model.displayName,
  } as ByfConfigPatch['models'] extends Record<string, infer T> ? T : never;
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
      maxContextSize: m.maxContextSize,
      capabilities: m.capabilities !== undefined ? [...m.capabilities] : undefined,
    })),
    providers: Object.entries(cfg.providers ?? {}).map(([id, p]) => ({
      id,
      type: p.type,
      baseUrl: p.baseUrl,
      hasApiKey:
        (p.apiKey !== undefined && p.apiKey.length > 0) || providerEnvHasKey(p.type, p.env),
      keyFromEnv:
        (p.apiKey === undefined || p.apiKey.length === 0) && providerEnvHasKey(p.type, p.env),
      oauth: p.oauth !== undefined,
    })),
  };
}
