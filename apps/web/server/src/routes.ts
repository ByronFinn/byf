import { readdir, stat } from 'node:fs/promises';
import { isAbsolute, resolve, sep } from 'node:path';

import type { ByfConfig, ByfConfigPatch, PromptInput } from '@byfriends/sdk';
import { isByfError, maskConfigSecrets, restoreMaskedSecrets } from '@byfriends/sdk';
import { workspaceTitle } from '@byfriends/sdk';
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
  CreateSkillBody,
  McpConnectionTestBody,
  McpRawWriteBody,
  McpServerUpsertBody,
  PromptBody,
  QuestionAnswerBody,
  ResolvedCapabilities,
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
import { PromptImageError, promptImagesToParts } from './prompt-images';
import { revealInOs } from './reveal';
import type { WebSessionManager } from './session-manager';

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
    // PRD-0035 R-A6 / ADR-0037 D3：workspaces.json 由 core 单源管理
    // （SDK 透出）；索引枚举从全量 inspectable 投影推导，不再本地读文件。
    const registered = await manager.listWorkspaces();
    const hidden = new Set(await manager.hiddenWorkspaces());
    const indexedWorkDirs = new Set(
      (await manager.listInspectableSessions()).map((s) => s.workDir),
    );
    const indexed = [...indexedWorkDirs].filter((dir) => !hidden.has(dir));
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

    await manager.addWorkspace(resolved);
    const sessions = await manager.listSessions(resolved);
    return c.json({ workspace: { workDir: resolved, title: workspaceTitle(resolved), sessions } });
  });

  r.delete('/workspaces', async (c) => {
    const workDir = c.req.query('workDir') ?? '';
    if (workDir.length === 0) return badRequest(c, 'workDir query is required');
    const removed = await manager.removeWorkspace(resolve(workDir));
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
    // PRD-0035 R-B1：workDir 可选；缺省返回全量会话（原 vis 全量列表语义）。
    if (workDir.length === 0) {
      const sessions = await manager.listInspectableSessions();
      return c.json({ sessions });
    }
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
    const workDirs = new Set([
      ...(await manager.listWorkspaces()),
      ...(await manager.listInspectableSessions()).map((s) => s.workDir),
    ]);
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

  // ---- Inspector 路由（PRD-0035 R-B1；wire/context/agents/state 走 core 单源）----
  r.get('/sessions/:id/wire', async (c) => {
    const id = c.req.param('id');
    const agentId = c.req.query('agent') ?? 'main';
    if (!isSafeAgentId(agentId)) return badRequest(c, 'invalid agent id');
    try {
      return c.json(await manager.readAgentWire(id, agentId));
    } catch (error) {
      return inspectorError(c, error, 'READ_ERROR');
    }
  });

  r.get('/sessions/:id/context', async (c) => {
    const id = c.req.param('id');
    const agentId = c.req.query('agent') ?? 'main';
    if (!isSafeAgentId(agentId)) return badRequest(c, 'invalid agent id');
    try {
      return c.json(await manager.readContextProjection(id, agentId));
    } catch (error) {
      return inspectorError(c, error, 'READ_ERROR');
    }
  });

  r.get('/sessions/:id/agents', async (c) => {
    const id = c.req.param('id');
    try {
      return c.json(await manager.readAgentTree(id));
    } catch (error) {
      return inspectorError(c, error, 'READ_ERROR');
    }
  });

  r.get('/sessions/:id/state', async (c) => {
    const id = c.req.param('id');
    const detail = await manager.readSessionInspection(id);
    if (detail === null) return notFound(c, 'session not found');
    return c.json(detail);
  });

  r.delete('/sessions/:id', async (c) => {
    const id = c.req.param('id');
    try {
      await manager.deleteSession(id);
      return c.json({ sessionId: id, deleted: true });
    } catch (error) {
      if ((error as Error & { code?: string }).code === 'SESSION_BUSY') {
        return c.json({ error: (error as Error).message, code: 'SESSION_BUSY' }, 409);
      }
      return inspectorError(c, error, 'DELETE_ERROR');
    }
  });

  r.post('/sessions/:id/reveal', async (c) => {
    const id = c.req.param('id');
    const session = manager.getSession(id);
    const sessionDir =
      session?.summary?.sessionDir ?? (await manager.readSessionInspection(id))?.sessionDir;
    if (sessionDir === undefined) return notFound(c, 'session not found');
    try {
      await revealInOs(sessionDir);
      return c.json({ sessionId: id, opened: sessionDir });
    } catch (error) {
      return c.json(
        { error: `failed to open: ${(error as Error).message}`, code: 'READ_ERROR' },
        500,
      );
    }
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
      const sessions = await manager.listInspectableSessions();
      const workDir = sessions.find((s) => s.sessionId === id)?.workDir;
      if (workDir !== undefined && (await manager.hiddenWorkspaces()).includes(workDir)) {
        await manager.addWorkspace(workDir);
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

  // 关闭会话（PRD-0034）。注意：不用 DELETE——DELETE /sessions/:id 已是
  // PRD-0035 的删除会话路由（Hono 同路径同方法二次注册会被静默遮蔽）。
  r.post('/sessions/:id/close', async (c) => {
    const id = c.req.param('id');
    const closed = await manager.closeSession(id);
    if (!closed) return notFound(c, 'session not found');
    return c.json({ sessionId: id, closed: true });
  });

  r.post('/sessions/:id/prompt', async (c) => {
    const id = c.req.param('id');
    if (manager.getSession(id) === undefined) return notFound(c, 'session not found');
    const body = await c.req.json<PromptBody>();
    const input = await promptBodyToInput(c, manager, body, 'input is required');
    if (input instanceof Response) return input;
    manager.prompt(id, input); // fire-and-forget;事件经 SSE 推送
    return c.json({ ok: true }, 202);
  });

  r.post('/sessions/:id/steer', async (c) => {
    const id = c.req.param('id');
    if (manager.getSession(id) === undefined) return notFound(c, 'session not found');
    const body = await c.req.json<SteerBody>();
    const input = await promptBodyToInput(c, manager, body, 'input is required');
    if (input instanceof Response) return input;
    manager.steer(id, input);
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

  // 后台任务捕获输出(Tasks tab 右侧详情数据源)。tail 限制返回尾字符数,
  // 缺省返回完整输出;未知任务返回空串。会话不存在由全局 onError 映射 404。
  r.get('/sessions/:id/background/tasks/:taskId/output', async (c) => {
    const id = c.req.param('id');
    const taskId = c.req.param('taskId');
    const rawTail = c.req.query('tail');
    const tail = rawTail !== undefined ? Number.parseInt(rawTail, 10) : Number.NaN;
    const output = await manager.backgroundTaskOutput(
      id,
      taskId,
      Number.isFinite(tail) && tail > 0 ? tail : undefined,
    );
    return c.json({ taskId, output });
  });

  // ---- 配置(设置弹层:默认模型 / 默认权限 / 默认思考) -------------------------

  // ---- 目录浏览(@ 引用文件/文件夹;仅允许工作区根内,防任意文件系统暴露) ----
  // ---- 作用域白名单文件端点(PRD-0034 R-C2 / ADR-0036 D2) ----------------------
  r.get('/files', async (c) => {
    const roots = [
      ...(await manager.listWorkspaces()),
      ...(await manager.listInspectableSessions()).map((s) => s.workDir),
    ];
    return serveScopedFile(c, homeDir, c.req.query('path') ?? '', roots);
  });

  r.get('/fs/list', async (c) => {
    const root = c.req.query('root') ?? '';
    const path = c.req.query('path') ?? '';
    if (root.length === 0) return badRequest(c, 'root query is required');
    const allowed = new Set(
      [
        ...(await manager.listWorkspaces()),
        ...(await manager.listInspectableSessions()).map((s) => s.workDir),
      ].map((d) => resolve(d)),
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
    return c.json(await toConfigResponse(cfg, manager.configPath, manager));
  });

  // ---- 配置文件 raw（PRD-0035 Wave E / ADR-0038）----------------------------
  // 密钥值服务端掩码后过线（无明文回显）；revision = sha256(磁盘原文)。

  r.get('/config/raw', async (c) => {
    try {
      const doc = await manager.getConfigDocument();
      const cfg = await manager.getConfig();
      return c.json({
        path: doc.path,
        text: maskConfigSecrets(doc.text),
        revision: doc.revision,
        parsed: await toConfigResponse(cfg, manager.configPath, manager),
      });
    } catch (error) {
      // 磁盘 config.toml 损坏：不返回 500 也不回显解析细节（zod 片段可能
      // 含密钥样文本）——200 + invalid 标志，编辑器仍可编辑/校验（M3）。
      if (isByfError(error) && error.code === 'config.invalid') {
        return c.json({
          path: manager.configPath,
          text: '',
          revision: null,
          parsed: null,
          invalid: true,
        });
      }
      throw error;
    }
  });

  r.post('/config/validate', async (c) => {
    const body = await c.req.json<{ text?: string }>();
    const text = body.text ?? '';
    return c.json(await manager.validateConfigText(text));
  });

  r.post('/config/reveal', async (c) => {
    try {
      await revealInOs(manager.configPath);
      return c.json({ opened: manager.configPath });
    } catch (error) {
      return c.json(
        { error: `failed to open: ${(error as Error).message}`, code: 'READ_ERROR' },
        500,
      );
    }
  });

  r.put('/config/raw', async (c) => {
    const body = await c.req.json<{ text?: string; expectedRevision?: string | null }>();
    if (typeof body.text !== 'string') return badRequest(c, 'text is required');
    try {
      // 掩码占位符还原为磁盘原值（ADR-0038 D4），再以原文写盘。
      const disk = await manager.getConfigDocument();
      const restored = restoreMaskedSecrets(body.text, disk.text);
      const { revision } = await manager.writeConfigText(restored, body.expectedRevision ?? null);
      const cfg = await manager.getConfig();
      return c.json({ config: await toConfigResponse(cfg, manager.configPath, manager), revision });
    } catch (error) {
      if (isByfError(error) && error.code === 'config.revision_conflict') {
        return c.json({ error: error.message, code: 'CONFIG_REVISION_CONFLICT' }, 409);
      }
      if (isByfError(error) && error.code === 'config.invalid') {
        return c.json({ error: error.message, code: 'CONFIG_INVALID' }, 422);
      }
      return c.json({ error: (error as Error).message, code: 'CONFIG_ERROR' }, 500);
    }
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
    return c.json(await toConfigResponse(cfg, manager.configPath, manager));
  });

  r.delete('/config/providers/:id', async (c) => {
    const id = c.req.param('id');
    if (id.length === 0) return badRequest(c, 'provider id is required');
    const cfg = await manager.removeProvider(id);
    return c.json(await toConfigResponse(cfg, manager.configPath, manager));
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
    return c.json(await toConfigResponse(cfg, manager.configPath, manager), 201);
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
    return c.json(await toConfigResponse(cfg, manager.configPath, manager));
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
    return c.json(await toConfigResponse(cfg, manager.configPath, manager), 201);
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
    return c.json(await toConfigResponse(cfg, manager.configPath, manager));
  });

  r.delete('/config/models/:id', async (c) => {
    const id = c.req.param('id');
    const cfg = await manager.removeModel(id);
    return c.json(await toConfigResponse(cfg, manager.configPath, manager));
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

  // ---- MCP 配置页签(PRD-0036 / ADR-0039)-------------------------------------
  // workDir 硬约束(R-C5):必须 ∈ 已注册工作区(与 /files、/fs/list 同一动态
  // 集合:注册表 ∪ session_index 出现过的 workDir);env/headers 值已在 core
  // 掩码,明文不跨线。

  r.get('/mcp/servers', async (c) => {
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    return c.json(await manager.listMcpServerConfigs(workDir));
  });

  r.post('/mcp/test', async (c) => {
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    const body = await c.req.json<McpConnectionTestBody>();
    if (body.scope !== 'user' && body.scope !== 'project') {
      return badRequest(c, 'scope must be one of: user, project');
    }
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      return badRequest(c, 'config must be an object');
    }
    if (
      body.name !== undefined &&
      (typeof body.name !== 'string' || body.name.trim().length === 0)
    ) {
      return badRequest(c, 'name must be a non-empty string');
    }
    try {
      const result = await manager.testMcpConnection({
        workDir,
        scope: body.scope,
        name: body.name?.trim(),
        config: body.config,
      });
      return c.json(result);
    } catch (error) {
      if (isByfError(error) && error.code === 'config.invalid') {
        return c.json({ error: error.message, code: 'CONFIG_INVALID' }, 422);
      }
      throw error;
    }
  });

  r.get('/mcp/raw/:scope', async (c) => {
    const scope = mcpScopeParam(c);
    if (scope === null) return badRequest(c, 'scope must be one of: user, project');
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    return c.json(await manager.readMcpConfigRaw(workDir, scope));
  });

  r.put('/mcp/servers/:scope', async (c) => {
    const scope = mcpScopeParam(c);
    if (scope === null) return badRequest(c, 'scope must be one of: user, project');
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    const body = await c.req.json<McpServerUpsertBody>();
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return badRequest(c, 'name is required');
    }
    if (typeof body.config !== 'object' || body.config === null || Array.isArray(body.config)) {
      return badRequest(c, 'config must be an object');
    }
    try {
      const state = await manager.upsertMcpServerConfig(
        workDir,
        scope,
        body.name.trim(),
        body.config,
      );
      return c.json(state);
    } catch (error) {
      if (isByfError(error) && error.code === 'config.invalid') {
        return c.json({ error: error.message, code: 'CONFIG_INVALID' }, 422);
      }
      throw error;
    }
  });

  r.delete('/mcp/servers/:scope/:name', async (c) => {
    const scope = mcpScopeParam(c);
    if (scope === null) return badRequest(c, 'scope must be one of: user, project');
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    const name = c.req.param('name');
    if (name.length === 0) return badRequest(c, 'name is required');
    try {
      const state = await manager.removeMcpServerConfig(workDir, scope, name);
      return c.json(state);
    } catch (error) {
      if (isByfError(error) && error.code === 'mcp.server_not_found') {
        return c.json({ error: error.message, code: 'NOT_FOUND' }, 404);
      }
      if (isByfError(error) && error.code === 'config.invalid') {
        return c.json({ error: error.message, code: 'CONFIG_INVALID' }, 422);
      }
      throw error;
    }
  });

  // ---- Skill 配置页签(PRD-0036)----------------------------------------------

  r.get('/skills', async (c) => {
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    return c.json(await manager.listWorkspaceSkills(workDir));
  });

  r.post('/skills', async (c) => {
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    const body = await c.req.json<CreateSkillBody>();
    if (body.scope !== 'user' && body.scope !== 'project') {
      return badRequest(c, 'scope must be one of: user, project');
    }
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      return badRequest(c, 'name is required');
    }
    if (typeof body.description !== 'string' || body.description.trim().length === 0) {
      return badRequest(c, 'description is required');
    }
    try {
      const result = await manager.createWorkspaceSkill({
        workDir,
        scope: body.scope,
        name: body.name,
        description: body.description,
      });
      return c.json(result, 201);
    } catch (error) {
      if (isByfError(error) && error.code === 'skill.already_exists') {
        return c.json({ error: error.message, code: 'CONFLICT' }, 409);
      }
      if (isByfError(error) && error.code === 'request.invalid') {
        return c.json({ error: error.message, code: 'BAD_REQUEST' }, 400);
      }
      throw error;
    }
  });

  r.delete('/skills', async (c) => {
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    const skillPath = c.req.query('path') ?? '';
    if (skillPath.length === 0) return badRequest(c, 'path query is required');
    try {
      await manager.removeWorkspaceSkill(workDir, skillPath);
      return c.json({ ok: true });
    } catch (error) {
      if (isByfError(error) && error.code === 'skill.not_found') {
        return c.json({ error: error.message, code: 'NOT_FOUND' }, 404);
      }
      if (isByfError(error) && error.code === 'request.invalid') {
        // 允许根之外(realpath 前缀校验失败)→ 403,防路径穿越被静默忽略。
        return c.json({ error: error.message, code: 'FORBIDDEN' }, 403);
      }
      throw error;
    }
  });

  r.put('/mcp/raw/:scope', async (c) => {
    const scope = mcpScopeParam(c);
    if (scope === null) return badRequest(c, 'scope must be one of: user, project');
    const workDir = await requireRegisteredWorkDir(c, manager);
    if (workDir instanceof Response) return workDir;
    const body = await c.req.json<McpRawWriteBody>();
    if (typeof body.text !== 'string') return badRequest(c, 'text is required');
    try {
      return c.json(await manager.writeMcpConfigRaw(workDir, scope, body.text));
    } catch (error) {
      if (isByfError(error) && error.code === 'config.invalid') {
        return c.json({ error: error.message, code: 'CONFIG_INVALID' }, 422);
      }
      throw error;
    }
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

/**
 * 组装 prompt/steer 的 SDK 输入:纯文本走 string(零改动兼容),带图时在
 * 服务端压缩并展开为 `PromptPart[]`(文本 part 在前,图片 part 按序随后)。
 * 返回 Response 表示校验失败(直接作为路由响应)。
 */
async function promptBodyToInput(
  c: Context,
  manager: WebSessionManager,
  body: PromptBody | SteerBody,
  emptyError: string,
): Promise<string | PromptInput | Response> {
  const text = (body.input ?? '').trim();
  const images = body.images ?? [];
  if (text.length === 0 && images.length === 0) return badRequest(c, emptyError);
  if (images.length === 0) return body.input ?? '';
  try {
    const parts = await promptImagesToParts(images, await manager.getConfig());
    if (text.length > 0) return [{ type: 'text', text: body.input ?? '' }, ...parts];
    return parts;
  } catch (error) {
    if (error instanceof PromptImageError) return badRequest(c, error.message);
    throw error;
  }
}

function badRequest(c: Context, error: string): Response {
  return c.json({ error, code: 'BAD_REQUEST' }, 400);
}

/**
 * R-C5:提取并校验 workDir 查询参数——必须 ∈ 已注册工作区(注册表 ∪
 * session_index 出现过的 workDir,与 /files、/fs/list 同一动态集合),防
 * 任意路径访问。返回 Response 表示校验失败(直接作为路由响应)。
 */
async function requireRegisteredWorkDir(
  c: Context,
  manager: WebSessionManager,
): Promise<string | Response> {
  const workDir = c.req.query('workDir') ?? '';
  if (workDir.length === 0) return badRequest(c, 'workDir query is required');
  const resolved = resolve(workDir);
  const allowed = new Set(
    [
      ...(await manager.listWorkspaces()),
      ...(await manager.listInspectableSessions()).map((s) => s.workDir),
    ].map((dir) => resolve(dir)),
  );
  if (!allowed.has(resolved)) {
    return badRequest(c, 'workDir must be a registered workspace');
  }
  return resolved;
}

/** MCP scope 路径参数(user=全局 / project=本地);非法返回 null。 */
function mcpScopeParam(c: Context): 'user' | 'project' | null {
  const scope = c.req.param('scope');
  return scope === 'user' || scope === 'project' ? scope : null;
}

function notFound(c: Context, error: string): Response {
  return c.json({ error, code: 'NOT_FOUND' }, 404);
}

const AGENT_ID_RE = /^[A-Za-z0-9._-]+$/;

/** 拒绝可能经路径拼接逃出会话目录的 agent id（与 core Inspector 同规则）。 */
function isSafeAgentId(id: string): boolean {
  return AGENT_ID_RE.test(id) && id !== '.' && id !== '..';
}

/** Inspector 路由错误归一化：SESSION_NOT_FOUND → 404，其余 → 500（code 传参）。 */
function inspectorError(c: Context, error: unknown, code: string): Response {
  if (isByfError(error) && error.code === 'session.not_found') {
    return notFound(c, error.message);
  }
  return c.json({ error: (error as Error).message, code }, 500);
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
async function toConfigResponse(
  cfg: ByfConfig,
  configPath: string,
  manager: WebSessionManager,
): Promise<ConfigResponse> {
  const models = await Promise.all(
    Object.entries(cfg.models ?? {}).map(async ([id, m]) => {
      // 别名无法解析(如 provider 缺失/别名悬空)时保留原有编辑视图,仅不提供
      // 合并能力预填——配置编辑不应被能力解析失败阻塞。
      let resolvedCapabilities: ResolvedCapabilities | undefined;
      try {
        resolvedCapabilities = await manager.resolveModelCapabilities(id);
      } catch {
        resolvedCapabilities = undefined;
      }
      return {
        id,
        provider: m.provider,
        model: m.model,
        displayName: m.displayName,
        maxContextSize: m.maxContextSize,
        capabilities: m.capabilities !== undefined ? [...m.capabilities] : undefined,
        resolvedCapabilities,
      };
    }),
  );
  return {
    configPath,
    defaultModel: cfg.defaultModel,
    defaultPermissionMode: cfg.defaultPermissionMode,
    defaultThinking: cfg.defaultThinking,
    thinking: cfg.thinking === undefined ? undefined : { ...cfg.thinking },
    models,
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
