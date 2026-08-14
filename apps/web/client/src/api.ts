import type {
  ApprovalDecisionBody,
  CreateSessionBody,
  CreateSessionResponse,
  ListSessionsResponse,
  PermissionMode,
  PromptBody,
  QuestionAnswerBody,
  SessionStatusResponse,
  SessionSummary,
  SetPermissionBody,
  SteerBody,
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

  resumeSession: (id: string) =>
    request<{ session: SessionSummary }>(`/api/sessions/${enc(id)}/resume`, 'POST'),

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
