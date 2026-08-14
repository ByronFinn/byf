import type {
  ApprovalRequest,
  Event,
  PermissionMode,
  QuestionRequest,
  ServerFrame,
  SessionStatus,
} from '#/types';

// ---- 单条消息的内部部件 -----------------------------------------------------

export interface TextPart {
  readonly kind: 'text';
  text: string;
}
export interface ThinkingPart {
  readonly kind: 'thinking';
  text: string;
}
export interface ToolPart {
  readonly kind: 'tool';
  readonly toolCallId: string;
  readonly name: string;
  readonly display?: unknown;
  readonly description?: string;
  readonly status: 'running' | 'done';
  readonly result?: unknown;
  readonly isError?: boolean;
}

export type AssistantPart = TextPart | ThinkingPart | ToolPart;

// ---- 对话条目 ---------------------------------------------------------------

export interface AssistantEntry {
  readonly kind: 'assistant';
  readonly id: string;
  readonly turnId: number;
  parts: AssistantPart[];
}
export interface UserEntry {
  readonly kind: 'user';
  readonly id: string;
  text: string;
}
export interface SystemEntry {
  readonly kind: 'system';
  readonly id: string;
  text: string;
  level: 'error' | 'info';
}

export type Entry = AssistantEntry | UserEntry | SystemEntry;

// ---- 状态栏视图(初始 GET 与 agent.status.updated 合并) -----------------------

export interface StatusView {
  model?: string;
  thinkingLevel?: string;
  permission?: PermissionMode;
  contextTokens?: number;
  maxContextTokens?: number;
  contextUsage?: number;
}

export interface ChatState {
  connected: boolean;
  busy: boolean;
  entries: Entry[];
  status: StatusView | null;
  pendingApprovals: Record<string, ApprovalRequest>;
  pendingQuestions: Record<string, QuestionRequest>;
  turnIndex: Map<number, number>;
  toolIndex: Map<string, { entry: number; part: number }>;
}

export function initialChatState(): ChatState {
  return {
    connected: false,
    busy: false,
    entries: [],
    status: null,
    pendingApprovals: {},
    pendingQuestions: {},
    turnIndex: new Map(),
    toolIndex: new Map(),
  };
}

export type ChatInput =
  | { type: 'reset' }
  | { type: 'user-message'; text: string }
  | { type: 'status-loaded'; status: SessionStatus }
  | { type: 'frame'; frame: ServerFrame };

export function chatReducer(state: ChatState, input: ChatInput): ChatState {
  switch (input.type) {
    case 'reset':
      return initialChatState();
    case 'user-message': {
      const entry: UserEntry = {
        kind: 'user',
        id: `u-${state.entries.length}-${Date.now()}`,
        text: input.text,
      };
      return { ...state, entries: [...state.entries, entry] };
    }
    case 'status-loaded': {
      const status: StatusView = {
        model: input.status.model,
        thinkingLevel: input.status.thinkingLevel,
        permission: input.status.permission,
        contextTokens: input.status.contextTokens,
        maxContextTokens: input.status.maxContextTokens,
        contextUsage: input.status.contextUsage,
      };
      return { ...state, status: { ...state.status, ...status } };
    }
    case 'frame':
      return applyFrame(state, input.frame);
  }
}

function applyFrame(state: ChatState, frame: ServerFrame): ChatState {
  switch (frame.type) {
    case 'sys.connected':
      return { ...state, connected: true };
    case 'sys.heartbeat':
      return state;
    case 'sys.error':
      return addSystem(state, frame.message, 'error');
    case 'agent.event':
      return applyEvent(state, frame.event);
    case 'approval.requested':
      return {
        ...state,
        pendingApprovals: { ...state.pendingApprovals, [frame.requestId]: frame.request },
      };
    case 'approval.settled': {
      const pendingApprovals = { ...state.pendingApprovals };
      delete pendingApprovals[frame.requestId];
      return { ...state, pendingApprovals };
    }
    case 'question.requested':
      return {
        ...state,
        pendingQuestions: { ...state.pendingQuestions, [frame.requestId]: frame.request },
      };
    case 'question.settled': {
      const pendingQuestions = { ...state.pendingQuestions };
      delete pendingQuestions[frame.requestId];
      return { ...state, pendingQuestions };
    }
  }
}

function applyEvent(state: ChatState, event: Event): ChatState {
  // v1 只处理影响主对话流的事件;其余(turn.step.* / tool.call.delta / tool.progress /
  // subagent.* / compaction.* / btw.* / background.* / goal.* / mcp.* /
  // session.meta.* / skill.* / warning 等)忽略。用 if 链而非 switch,显式表达
  // 「处理子集、其余默认不变」且不触发穷尽性检查。
  if (event.type === 'turn.started') {
    return ensureTurn(state, event.turnId, (s) => ({ ...s, busy: true }));
  }
  if (event.type === 'turn.ended') {
    return { ...state, busy: false };
  }
  if (event.type === 'assistant.delta') {
    return appendText(state, event.turnId, event.delta, 'text');
  }
  if (event.type === 'thinking.delta') {
    return appendText(state, event.turnId, event.delta, 'thinking');
  }
  if (event.type === 'tool.call.started') {
    return addTool(
      state,
      event.turnId,
      event.toolCallId,
      event.name,
      event.display,
      event.description,
    );
  }
  if (event.type === 'tool.result') {
    return finishTool(state, event.toolCallId, event.output, event.isError);
  }
  if (event.type === 'agent.status.updated') {
    return {
      ...state,
      status: {
        ...state.status,
        model: event.model,
        contextTokens: event.contextTokens,
        maxContextTokens: event.maxContextTokens,
        contextUsage: event.contextUsage,
        permission: event.permission,
      },
    };
  }
  if (event.type === 'error') {
    return addSystem(state, errorEventMessage(event), 'error');
  }
  return state;
}

/** 确保 turnId 对应的 assistant 条目存在,再以 `mutate` 更新状态。 */
function ensureTurn(
  state: ChatState,
  turnId: number,
  mutate: (s: ChatState) => ChatState,
): ChatState {
  let next = state;
  if (!state.turnIndex.has(turnId)) {
    const entry: AssistantEntry = { kind: 'assistant', id: `a-${turnId}`, turnId, parts: [] };
    const entries = [...state.entries, entry];
    const turnIndex = new Map([...state.turnIndex, [turnId, entries.length - 1] as const]);
    next = { ...state, entries, turnIndex };
  }
  return mutate(next);
}

function appendText(
  state: ChatState,
  turnId: number,
  delta: string,
  kind: 'text' | 'thinking',
): ChatState {
  return ensureTurn(state, turnId, (s) => {
    const idx = s.turnIndex.get(turnId);
    if (idx === undefined) return s;
    const entry = s.entries[idx];
    if (entry === undefined || entry.kind !== 'assistant') return s;
    const parts = [...entry.parts];
    const last = parts.at(-1);
    if (
      last !== undefined &&
      (last.kind === 'text' || last.kind === 'thinking') &&
      last.kind === kind
    ) {
      parts[parts.length - 1] = { kind: last.kind, text: last.text + delta };
    } else if (kind === 'text') {
      parts.push({ kind: 'text', text: delta });
    } else {
      parts.push({ kind: 'thinking', text: delta });
    }
    const entries = [...s.entries];
    entries[idx] = { ...entry, parts };
    return { ...s, entries };
  });
}

function addTool(
  state: ChatState,
  turnId: number,
  toolCallId: string,
  name: string,
  display: unknown,
  description: string | undefined,
): ChatState {
  return ensureTurn(state, turnId, (s) => {
    const idx = s.turnIndex.get(turnId);
    if (idx === undefined) return s;
    const entry = s.entries[idx];
    if (entry === undefined || entry.kind !== 'assistant') return s;
    const toolPart: ToolPart = {
      kind: 'tool',
      toolCallId,
      name,
      display,
      description,
      status: 'running',
    };
    const parts = [...entry.parts, toolPart];
    const entries = [...s.entries];
    entries[idx] = { ...entry, parts };
    const toolIndex = new Map([
      ...s.toolIndex,
      [toolCallId, { entry: idx, part: parts.length - 1 }] as const,
    ]);
    return { ...s, entries, toolIndex };
  });
}

function finishTool(
  state: ChatState,
  toolCallId: string,
  output: unknown,
  isError: boolean | undefined,
): ChatState {
  const loc = state.toolIndex.get(toolCallId);
  if (loc === undefined) return state;
  const entry = state.entries[loc.entry];
  if (entry === undefined || entry.kind !== 'assistant') return state;
  const part = entry.parts[loc.part];
  if (part === undefined || part.kind !== 'tool') return state;
  const newPart: ToolPart = { ...part, status: 'done', result: output, isError: isError ?? false };
  const parts = [...entry.parts];
  parts[loc.part] = newPart;
  const entries = [...state.entries];
  entries[loc.entry] = { ...entry, parts };
  return { ...state, entries };
}

function addSystem(state: ChatState, text: string, level: 'error' | 'info'): ChatState {
  const entry: SystemEntry = {
    kind: 'system',
    id: `s-${state.entries.length}-${Date.now()}`,
    text,
    level,
  };
  return { ...state, entries: [...state.entries, entry] };
}

function errorEventMessage(event: Event): string {
  if (event.type !== 'error') return 'unknown error';
  const message = (event as { message?: unknown }).message;
  return typeof message === 'string' && message.length > 0 ? message : 'agent reported an error';
}
