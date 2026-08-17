import type {
  AgentReplayRecord,
  ApprovalRequest,
  ContentPart,
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
  /** Epoch ms,工具执行边界(PRD-0034 R-B1/R-B2);live 来自事件,replay 来自 tool_timing。 */
  readonly startedAt?: number;
  readonly endedAt?: number;
}

/**
 * 相邻同 kind 工具调用的归组摘要(PRD-0034 R-B2)。**纯视图投影**:`groupParts`
 * 在渲染层把扁平 parts 折叠,不进入 reducer 状态(toolIndex 定位保持扁平语义)。
 */
export interface ToolGroupPart {
  readonly kind: 'tool-group';
  /** 组内统一的 ToolInputDisplay.kind(如 file_io/command)。 */
  readonly toolKind: string;
  readonly tools: readonly ToolPart[];
  /** span 总耗时 = max(endedAt) - min(startedAt)(并行工具按墙钟段,不按累加)。 */
  readonly spanMs: number | undefined;
  readonly hasRunning: boolean;
}

/** 渲染项:扁平 part 或归组摘要。 */
export type RenderPart = AssistantPart | ToolGroupPart;

export type AssistantPart = TextPart | ThinkingPart | ToolPart;

// ---- 子 Agent 看板(PRD-0034 R-B3) --------------------------------------------

export interface SubagentUsage {
  readonly inputOther: number;
  readonly output: number;
  readonly inputCacheRead: number;
  readonly inputCacheCreation: number;
}

/** 一个子 agent 的卡片状态 + 其自己的调用轨迹(与主时间轴同构的扁平 parts)。 */
export interface SubagentState {
  readonly id: string;
  readonly parentAgentId: string;
  readonly parentToolCallId: string;
  readonly name: string;
  readonly description: string | undefined;
  readonly runInBackground: boolean;
  status: 'running' | 'completed' | 'failed';
  resultSummary: string | undefined;
  error: string | undefined;
  usage: SubagentUsage | undefined;
  startedAt: number;
  endedAt: number | undefined;
  parts: AssistantPart[];
  toolIndex: Map<string, number>;
}

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
  /** 待渲染的图片附件 data-URL(粘贴图片;replay 时来自消息的 image part)。 */
  readonly images?: readonly string[];
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
  /** 子 agent 看板:subagentId → 卡片状态(R-B3)。 */
  subagents: Record<string, SubagentState>;
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
    subagents: {},
  };
}

export type ChatInput =
  | { type: 'reset' }
  | { type: 'user-message'; text: string; images?: readonly string[] }
  | { type: 'status-loaded'; status: SessionStatus }
  | {
      type: 'transcript-loaded';
      entries: Entry[];
      toolIndex: Map<string, { entry: number; part: number }>;
      subagents?: Record<string, SubagentState>;
    }
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
        images: input.images,
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
    case 'transcript-loaded':
      return {
        ...state,
        entries: input.entries,
        toolIndex: input.toolIndex,
        subagents: input.subagents ?? state.subagents,
      };
    case 'frame':
      return applyFrame(state, input.frame);
  }
}

/** 文本 part 提取(工具结果 / 用户消息只展示文本)。 */
function textOf(parts: readonly ContentPart[]): string {
  return parts
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

/**
 * 把 resume 响应中的 `agents.main.replay`(agent-core 从磁盘 wire 重建的历史)
 * 映射为对话条目,使历史会话恢复转录。映射规则与 live 渲染一致:
 * - user 消息 → UserEntry(仅文本);
 * - assistant 消息 → AssistantEntry(text/think part + 每条 toolCall 一个 ToolPart,
 *   挂起等待对应 tool 结果);
 * - tool 角色消息 → 按 toolCallId 把 ToolPart 置为 done 并附结果文本;
 * - system 消息与 config/permission/approval 记录不渲染(live 同样不渲染)。
 * 返回的 toolIndex 供后续 live 事件继续对账(中断 turn 续流时工具结果落位)。
 * 合成 turnId 不写入 turnIndex:replay 之后的 live turn 一律新建条目,避免与
 * 历史条目的 id 空间撞车。
 */
export function replayToEntries(replay: readonly AgentReplayRecord[]): {
  entries: Entry[];
  toolIndex: Map<string, { entry: number; part: number }>;
} {
  const entries: Entry[] = [];
  const toolIndex = new Map<string, { entry: number; part: number }>();
  // tool_timing 记录与消息记录的先后顺序不保证(取决于 wire 落盘顺序),
  // 先全量收集再按 toolCallId 落位。
  const timing = new Map<string, { startedAt?: number; endedAt?: number }>();
  for (const record of replay) {
    if (record.type === 'tool_timing') {
      timing.set(record.toolCallId, {
        startedAt: record.startedAt,
        endedAt: record.endedAt,
      });
    }
  }
  let userSeq = 0;
  let turnSeq = 0;
  for (const record of replay) {
    if (record.type !== 'message') continue;
    const { message } = record;
    if (message.role === 'user') {
      const text = textOf(message.content);
      if (text.trim().length === 0) continue;
      // 历史用户消息里的图片 part(data-URL)一并恢复——TUI 粘贴的图片
      // 会话在 Web 中打开时同样可见。
      const images = message.content
        .filter((p): p is Extract<ContentPart, { type: 'image_url' }> => p.type === 'image_url')
        .map((p) => p.imageUrl.url)
        .filter((url) => url.startsWith('data:'));
      entries.push({
        kind: 'user',
        id: `r-u-${userSeq++}`,
        text,
        images: images.length > 0 ? images : undefined,
      });
    } else if (message.role === 'assistant') {
      const parts: AssistantPart[] = [];
      for (const part of message.content) {
        if (part.type === 'text') parts.push({ kind: 'text', text: part.text });
        else if (part.type === 'think') parts.push({ kind: 'thinking', text: part.think });
        // image/audio/video 在 web 客户端不渲染,跳过
      }
      for (const call of message.toolCalls) {
        const loc = { entry: entries.length, part: parts.length };
        const t = timing.get(call.id);
        parts.push({
          kind: 'tool',
          toolCallId: call.id,
          name: call.name,
          status: 'running',
          startedAt: t?.startedAt,
          endedAt: t?.endedAt,
        });
        toolIndex.set(call.id, loc);
      }
      if (parts.length === 0) continue;
      entries.push({ kind: 'assistant', id: `r-a-${turnSeq}`, turnId: turnSeq, parts });
      turnSeq += 1;
    } else if (message.role === 'tool') {
      const loc = toolIndex.get(message.toolCallId ?? '');
      if (loc === undefined) continue;
      const entry = entries[loc.entry];
      if (entry === undefined || entry.kind !== 'assistant') continue;
      const part = entry.parts[loc.part];
      if (part === undefined || part.kind !== 'tool') continue;
      const parts = [...entry.parts];
      // R-C1:image ContentPart 原样保留(data-URL 由渲染层合成),与 live
      // tool.result 的 output 同构;纯文本结果保持字符串。
      const hasMedia = message.content.some(
        (p) => p.type === 'image_url' || p.type === 'audio_url' || p.type === 'video_url',
      );
      parts[loc.part] = {
        ...part,
        status: 'done',
        result: hasMedia ? message.content : textOf(message.content),
        isError: message.isError ?? false,
      };
      entries[loc.entry] = { ...entry, parts };
    }
    // role === 'system'(注入/压缩摘要等)不渲染
  }
  return { entries, toolIndex };
}

/** ToolPart.display 的 ToolInputDisplay.kind(未知 display 归入 generic 桶)。 */
function toolDisplayKind(part: ToolPart): string {
  const kind = (part.display as { kind?: unknown } | undefined)?.kind;
  return typeof kind === 'string' ? kind : 'generic';
}

/**
 * 工具归组视图投影(PRD-0034 R-B2):同 turn 内时间相邻、同 ToolInputDisplay.kind
 * 的工具调用(≥2)折叠为摘要行;text/thinking step 打断分组;被打断则各自成组。
 * 流式期间未完结组照常产生(hasRunning=true),随事件实时更新。
 */
export function groupParts(parts: readonly AssistantPart[]): RenderPart[] {
  const result: RenderPart[] = [];
  let group: { toolKind: string; tools: ToolPart[] } | null = null;
  const flush = (): void => {
    if (group === null) return;
    if (group.tools.length === 1) {
      result.push(group.tools[0]!);
    } else {
      const starts = group.tools
        .map((t) => t.startedAt)
        .filter((v): v is number => v !== undefined);
      const ends = group.tools.map((t) => t.endedAt).filter((v): v is number => v !== undefined);
      const spanMs =
        starts.length > 0 && ends.length > 0 ? Math.max(...ends) - Math.min(...starts) : undefined;
      result.push({
        kind: 'tool-group',
        toolKind: group.toolKind,
        tools: group.tools,
        spanMs,
        hasRunning: group.tools.some((t) => t.status === 'running'),
      });
    }
    group = null;
  };
  for (const part of parts) {
    if (part.kind === 'tool') {
      const kind = toolDisplayKind(part);
      if (group !== null && group.toolKind !== kind) flush();
      if (group === null) group = { toolKind: kind, tools: [] };
      group.tools.push(part);
    } else {
      flush();
      result.push(part);
    }
  }
  flush();
  return result;
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
  // 子 agent 看板(R-B3):subagent.* 生命周期事件建立/结算卡片;子 agent 自己的
  // 事件(agentId ≠ main)路由进其 transcript。其余事件照旧只处理主对话流
  // (turn.step.* / tool.call.delta / tool.progress / compaction.* / btw.* /
  // background.* / goal.* / mcp.* / session.meta.* / skill.* / warning 等忽略)。
  if (event.type === 'subagent.spawned') {
    return spawnSubagent(state, event);
  }
  if (event.type === 'subagent.completed' || event.type === 'subagent.failed') {
    return settleSubagent(state, event);
  }
  if (event.agentId !== undefined && event.agentId !== 'main') {
    return applySubagentEvent(state, event);
  }
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
      event.startedAt,
    );
  }
  if (event.type === 'tool.result') {
    return finishTool(
      state,
      event.toolCallId,
      event.output,
      event.isError,
      event.startedAt,
      event.endedAt,
    );
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
  startedAt: number | undefined,
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
      startedAt,
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
  startedAt: number | undefined,
  endedAt: number | undefined,
): ChatState {
  const loc = state.toolIndex.get(toolCallId);
  if (loc === undefined) return state;
  const entry = state.entries[loc.entry];
  if (entry === undefined || entry.kind !== 'assistant') return state;
  const part = entry.parts[loc.part];
  if (part === undefined || part.kind !== 'tool') return state;
  // result 事件自包含耗时(R-B1);startedAt 缺省时沿用 part 上已有的值。
  const newPart: ToolPart = {
    ...part,
    status: 'done',
    result: output,
    isError: isError ?? false,
    startedAt: part.startedAt ?? startedAt,
    endedAt,
  };
  const parts = [...entry.parts];
  parts[loc.part] = newPart;
  const entries = [...state.entries];
  entries[loc.entry] = { ...entry, parts };
  return { ...state, entries };
}

// ---- 子 Agent 看板事件处理(R-B3) ----------------------------------------------

function spawnSubagent(
  state: ChatState,
  event: Extract<Event, { type: 'subagent.spawned' }>,
): ChatState {
  const existing = state.subagents[event.subagentId];
  if (existing !== undefined) return state;
  const subagent: SubagentState = {
    id: event.subagentId,
    parentAgentId: event.agentId,
    parentToolCallId: event.parentToolCallId,
    name: event.subagentName,
    description: event.description,
    runInBackground: event.runInBackground,
    status: 'running',
    resultSummary: undefined,
    error: undefined,
    usage: undefined,
    startedAt: Date.now(),
    endedAt: undefined,
    parts: [],
    toolIndex: new Map(),
  };
  return { ...state, subagents: { ...state.subagents, [event.subagentId]: subagent } };
}

function settleSubagent(
  state: ChatState,
  event: Extract<Event, { type: 'subagent.completed' | 'subagent.failed' }>,
): ChatState {
  const existing = state.subagents[event.subagentId];
  if (existing === undefined || existing.status !== 'running') return state;
  const settled: SubagentState =
    event.type === 'subagent.completed'
      ? {
          ...existing,
          status: 'completed',
          resultSummary: event.resultSummary,
          usage: event.usage,
          endedAt: Date.now(),
        }
      : {
          ...existing,
          status: 'failed',
          error: event.error,
          endedAt: Date.now(),
        };
  return { ...state, subagents: { ...state.subagents, [event.subagentId]: settled } };
}

/** 子 agent 自己的事件(agentId ≠ main)→ 其 transcript;未知 agent 忽略。 */
function applySubagentEvent(state: ChatState, event: Event): ChatState {
  const sub = state.subagents[event.agentId];
  if (sub === undefined) return state;
  let parts = sub.parts;
  if (event.type === 'assistant.delta' || event.type === 'thinking.delta') {
    const kind = event.type === 'assistant.delta' ? 'text' : 'thinking';
    const delta = event.type === 'assistant.delta' ? event.delta : event.delta;
    const last = parts.at(-1);
    if (last !== undefined && last.kind === kind) {
      parts = [...parts.slice(0, -1), { kind: last.kind, text: last.text + delta }];
    } else {
      parts = [...parts, kind === 'text' ? { kind, text: delta } : { kind, text: delta }];
    }
  } else if (event.type === 'tool.call.started') {
    parts = [
      ...parts,
      {
        kind: 'tool',
        toolCallId: event.toolCallId,
        name: event.name,
        display: event.display,
        description: event.description,
        status: 'running',
        startedAt: event.startedAt,
      },
    ];
  } else if (event.type === 'tool.result') {
    const idx = sub.toolIndex.get(event.toolCallId);
    const target = idx !== undefined ? parts[idx] : undefined;
    if (target !== undefined && target.kind === 'tool') {
      parts = parts.map((p, i) =>
        i === idx && p.kind === 'tool'
          ? {
              ...p,
              status: 'done' as const,
              result: event.output,
              isError: event.isError ?? false,
              startedAt: p.startedAt ?? event.startedAt,
              endedAt: event.endedAt,
            }
          : p,
      );
    }
  } else {
    return state;
  }
  // 重算 toolIndex(parts 数组位置即索引)。
  const toolIndex = new Map<string, number>();
  parts.forEach((p, i) => {
    if (p.kind === 'tool') toolIndex.set(p.toolCallId, i);
  });
  return { ...state, subagents: { ...state.subagents, [sub.id]: { ...sub, parts, toolIndex } } };
}

/**
 * resume 重建(R-B3):用 resume 响应的 `agents` map(排除 main)重建子 agent
 * 卡片——历史子 agent 一律视为已完成,轨迹从其各自 replay 映射(与主时间轴
 * 同构);drawer 可打开任意(含已完成)子 agent。
 */
export function subagentsFromResume(
  agents: NonNullable<
    Record<string, { replay?: readonly AgentReplayRecord[]; parentToolCallId?: string }>
  >,
): Record<string, SubagentState> {
  const result: Record<string, SubagentState> = {};
  for (const [id, agent] of Object.entries(agents)) {
    if (id === 'main' || agent === undefined) continue;
    const { entries } = replayToEntries(agent.replay ?? []);
    const parts: AssistantPart[] = [];
    for (const entry of entries) {
      if (entry.kind === 'assistant') parts.push(...entry.parts);
    }
    result[id] = {
      id,
      parentAgentId: 'main',
      parentToolCallId: agent.parentToolCallId ?? '',
      name: id,
      description: undefined,
      runInBackground: false,
      status: 'completed',
      resultSummary: undefined,
      error: undefined,
      usage: undefined,
      startedAt: 0,
      endedAt: undefined,
      parts,
      toolIndex: new Map(),
    };
  }
  return result;
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
