import type {
  ActivateSkillBody,
  ApprovalDecisionBody,
  ArchivedSessionsResponse,
  ConfigResponse,
  CreateSessionBody,
  CreateSessionResponse,
  CreateWorkspaceBody,
  DiscoverModelsBody,
  DiscoverModelsResponse,
  ForkSessionResponse,
  FsEntry,
  FsListResponse,
  ListSessionsResponse,
  PermissionMode,
  PickDirectoryResponse,
  PromptBody,
  QuestionAnswerBody,
  ResumeSessionResponse,
  SessionStatusResponse,
  SessionSummary,
  SetPermissionBody,
  SkillSummary,
  SteerBody,
  ModelUpdateBody,
  ModelUpsertBody,
  ProviderCreateBody,
  ProviderUpdateBody,
  UpdateConfigBody,
  UpdateSessionMetaBody,
  UpdateSessionModelBody,
  UpdateSessionThinkingBody,
  WorkspaceListResponse,
  WorkspaceResponse,
  WorkspaceView,
} from '#/types';

const TOKEN_STORAGE_KEY = 'byf-web-auth-token';

function readTokenParam(raw: string): string | null {
  const trimmed = raw.replace(/^[#?]/, '');
  if (trimmed.length === 0) return null;
  const params = new URLSearchParams(trimmed);
  return params.get('token') ?? params.get('web_token');
}

function deleteTokenParams(params: URLSearchParams): boolean {
  const hadToken = params.has('token') || params.has('web_token');
  params.delete('token');
  params.delete('web_token');
  return hadToken;
}

function scrubTokenFromUrl(): void {
  const url = new URL(window.location.href);
  const changedSearch = deleteTokenParams(url.searchParams);
  const hash = url.hash.replace(/^#/, '');
  let changedHash = false;
  if (hash.length > 0) {
    const hashParams = new URLSearchParams(hash);
    changedHash = deleteTokenParams(hashParams);
    if (changedHash) {
      const nextHash = hashParams.toString();
      url.hash = nextHash.length > 0 ? nextHash : '';
    }
  }
  if (changedSearch || changedHash) {
    window.history.replaceState(null, '', url.toString());
  }
}

function authToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromHash = readTokenParam(window.location.hash);
  const fromSearch = readTokenParam(window.location.search);
  const token = fromHash ?? fromSearch;
  if (token !== null && token.length > 0) {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    scrubTokenFromUrl();
    return token;
  }
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const token = authToken();
  if (token !== null && token.length > 0) {
    headers['authorization'] = `Bearer ${token}`;
  }
  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  if (!res.ok) {
    let err: { error?: string } | null = null;
    try {
      err = (await res.json()) as { error?: string };
    } catch {
      /* ignore */
    }
    throw new Error(err?.error ?? `HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

/** 原始 fetch 包装(R-C3 文件端点):不解析 JSON,保留 headers 供内容类型探测。 */
async function requestRaw(path: string, method: 'GET' | 'HEAD'): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = authToken();
  if (token !== null && token.length > 0) {
    headers['authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, { method, headers });
  if (!res.ok) {
    let err: { error?: string } | null = null;
    try {
      err = (await res.json()) as { error?: string };
    } catch {
      /* ignore */
    }
    throw new Error(err?.error ?? `HTTP ${res.status} ${res.statusText}`);
  }
  return res;
}

export const api = {
  listSessions: async (workDir: string, q?: string): Promise<SessionSummary[]> => {
    const params = new URLSearchParams({ workDir });
    if (q !== undefined && q.trim().length > 0) params.set('q', q.trim());
    const r = await request<ListSessionsResponse>(`/api/sessions?${params.toString()}`, 'GET');
    return [...r.sessions];
  },

  createSession: (body: CreateSessionBody) =>
    request<CreateSessionResponse>('/api/sessions', 'POST', body),

  getSession: (id: string) => request<SessionStatusResponse>(`/api/sessions/${enc(id)}`, 'GET'),

  patchSession: (id: string, body: UpdateSessionMetaBody) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}`, 'PATCH', body),

  forkSession: (id: string, upToMessage?: number) =>
    request<ForkSessionResponse>(`/api/sessions/${enc(id)}/fork`, 'POST', { upToMessage }),

  listArchivedSessions: async (): Promise<SessionSummary[]> => {
    const r = await request<ArchivedSessionsResponse>('/api/archived-sessions', 'GET');
    return [...r.sessions];
  },

  /** 文件端点探测(R-C3):文本端点返回 JSON 视图,媒体返回二进制 + content-type。 */
  fetchFileHead: (path: string) => requestRaw(`/api/files?path=${enc(path)}`, 'GET'),

  /** 文件端点 URL(图片/视频 src 直用;token 经 ?token= 附带)。 */
  fileUrl: (path: string): string =>
    `/api/files?path=${enc(path)}${authToken() !== null ? `&token=${enc(authToken() ?? '')}` : ''}`,

  resumeSession: (id: string) =>
    request<ResumeSessionResponse>(`/api/sessions/${enc(id)}/resume`, 'POST'),

  setSessionModel: (id: string, model: string) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/model`, 'PATCH', {
      model,
    } satisfies UpdateSessionModelBody),

  setSessionThinking: (id: string, level: UpdateSessionThinkingBody['level']) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/thinking`, 'PATCH', {
      level,
    } satisfies UpdateSessionThinkingBody),

  activateSkill: (id: string, name: string, args?: string) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/activate-skill`, 'POST', {
      name,
      args,
    } satisfies ActivateSkillBody),

  /** 会话可激活的 skill 列表(slash 面板 skill 命令的数据源)。 */
  listSkills: async (id: string): Promise<SkillSummary[]> => {
    const r = await request<{ skills: SkillSummary[] }>(`/api/sessions/${enc(id)}/skills`, 'GET');
    return [...r.skills];
  },

  compactSession: (id: string) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/compact`, 'POST'),

  /** 列工作区目录(@ 引用);root 必须是已注册工作区,path 相对 root。 */
  listFs: async (root: string, path: string): Promise<FsEntry[]> => {
    const params = new URLSearchParams({ root, path });
    const r = await request<FsListResponse>(`/api/fs/list?${params.toString()}`, 'GET');
    return [...r.entries];
  },

  getConfig: () => request<ConfigResponse>('/api/config', 'GET'),

  setConfig: (body: UpdateConfigBody) => request<ConfigResponse>('/api/config', 'PATCH', body),

  removeProvider: (providerId: string) =>
    request<ConfigResponse>(`/api/config/providers/${enc(providerId)}`, 'DELETE'),

  createProvider: (body: ProviderCreateBody) =>
    request<ConfigResponse>('/api/config/providers', 'POST', body),

  updateProvider: (id: string, body: ProviderUpdateBody) =>
    request<ConfigResponse>(`/api/config/providers/${enc(id)}`, 'PATCH', body),

  createModel: (body: ModelUpsertBody) =>
    request<ConfigResponse>('/api/config/models', 'POST', body),

  updateModel: (id: string, body: ModelUpdateBody) =>
    request<ConfigResponse>(`/api/config/models/${enc(id)}`, 'PATCH', body),

  removeModel: (id: string) => request<ConfigResponse>(`/api/config/models/${enc(id)}`, 'DELETE'),

  discoverModels: (body: DiscoverModelsBody) =>
    request<DiscoverModelsResponse>('/api/config/discover-models', 'POST', body),

  closeSession: (id: string) =>
    request<{ sessionId: string; closed: boolean }>(`/api/sessions/${enc(id)}`, 'DELETE'),

  prompt: (id: string, input: string) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/prompt`, 'POST', {
      input,
    } satisfies PromptBody),

  steer: (id: string, input: string) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/steer`, 'POST', {
      input,
    } satisfies SteerBody),

  cancel: (id: string) => request<{ ok: boolean }>(`/api/sessions/${enc(id)}/cancel`, 'POST'),

  setPermission: (id: string, mode: PermissionMode) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/permission`, 'PATCH', {
      mode,
    } satisfies SetPermissionBody),

  listWorkspaces: async (): Promise<WorkspaceView[]> => {
    const r = await request<WorkspaceListResponse>('/api/workspaces', 'GET');
    return [...r.workspaces];
  },

  addWorkspace: (path: string) =>
    request<WorkspaceResponse>('/api/workspaces', 'POST', { path } satisfies CreateWorkspaceBody),

  removeWorkspace: (workDir: string) =>
    request<{ ok: boolean; removed: boolean }>(`/api/workspaces?workDir=${enc(workDir)}`, 'DELETE'),

  /** 弹服务端原生目录选择器;取消 → null;平台不支持抛错(客户端 fallback)。 */
  pickWorkspaceDirectory: () => request<PickDirectoryResponse>('/api/workspaces/pick', 'POST'),

  resolveApproval: (id: string, requestId: string, body: ApprovalDecisionBody) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/approvals/${enc(requestId)}`, 'POST', body),

  resolveQuestion: (id: string, requestId: string, body: QuestionAnswerBody) =>
    request<{ ok: boolean }>(`/api/sessions/${enc(id)}/questions/${enc(requestId)}`, 'POST', body),

  /** EventSource 无法设置 Authorization 头,token 走 `?token=` 查询。 */
  eventStreamUrl: (id: string): string => {
    const token = authToken();
    const base = `/api/sessions/${enc(id)}/events`;
    return token !== null && token.length > 0 ? `${base}?token=${enc(token)}` : base;
  },
};
