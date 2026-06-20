/**
 * Session replay hydration.
 *
 * Core owns durable history as raw session records. The TUI projects those
 * records into the same transcript entries/components used by live events,
 * without mutating core session state or responding to replayed data.
 */

import type {
  AgentReplayRecord,
  BackgroundTaskInfo,
  ContentPart,
  ContextMessage,
  PromptOrigin,
  PermissionMode,
  ResumedAgentState,
  Session,
  ToolCall,
} from '@byfriends/sdk';

import { AgentGroupComponent } from '#/tui/components/messages/agent-group';
import type { TodoItem } from '#/tui/components/chrome/todo-panel';
import { ToolCallComponent } from '#/tui/components/messages/tool-call';
import type {
  AppState,
  BackgroundAgentMetadata,
  BackgroundAgentStatusData,
  SubagentReplayBlockData,
  SubagentReplayToolCallData,
  ToolCallBlockData,
  TranscriptEntry,
  TUIState,
} from '#/tui/types';
import { formatErrorMessage, isTodoItemShape } from '#/tui/utils/event-payload';
import { formatBackgroundAgentTranscript } from '#/tui/utils/background-agent-status';
import { mediaUrlPartToText } from '#/tui/utils/media-url';
import { nextTranscriptId } from '#/tui/utils/transcript-id';

export interface ReplayHydrationHooks {
  readonly setAppState: (patch: Partial<AppState>) => void;
  readonly appendEntry: (entry: TranscriptEntry) => void;
  readonly setTodoList: (todos: readonly TodoItem[]) => void;
  readonly emitError: (message: string) => void;
}

interface ReplayProjection {
  readonly entries: readonly TranscriptEntry[];
  /**
   * Background subagents still not completed or failed when replay ends,
   * keyed by agent_id. `hydrateTranscriptFromReplay` seeds
   * `state.backgroundAgents` from this so the footer badge starts accurate.
   */
  readonly backgroundAgents: ReadonlySet<string>;
  /**
   * Background agent metadata that remains needed after replay so live
   * terminal events can keep rendering transcript copy after resume.
   */
  readonly backgroundAgentMetadata: ReadonlyMap<string, BackgroundAgentMetadata>;
}

interface OpenAssistant {
  thinking: string[];
  text: string[];
}

interface ProjectionState {
  entries: TranscriptEntry[];
  toolCalls: Map<string, ToolCallBlockData>;
  assistant: OpenAssistant;
  skillActivationIds: Set<string>;
  permissionMode?: PermissionMode;
  backgroundAgents: Set<string>;
  backgroundAgentMetadata: Map<string, BackgroundAgentMetadata>;
  backgroundTasks: ReadonlyMap<string, BackgroundTaskInfo>;
  /**
   * Child-agent activity keyed by the parent's tool-call id, distilled from
   * each non-main agent's `ResumedAgentState`. When a main-agent `Agent`
   * tool-call's id matches a key, its activity is attached as
   * `ToolCallBlockData.subagent` so the resumed `/agent` card shows the child's
   * name, tool calls, text, and token count.
   */
  subagents: ReadonlyMap<string, SubagentReplayBlockData>;
  /** Monotonic user-turn counter, assigned to projected tool-call turnIds. */
  currentTurnId: number;
  /**
   * Monotonic assistant-step counter. One assistant message = one step, so
   * tool calls in the same message share a step and can group into an
   * AgentGroupComponent (matching the live provider step_uuid semantics).
   */
  currentStep: number;
}

type BackgroundTaskOrigin = Extract<PromptOrigin, { kind: 'background_task' }>;

const REPLAY_TURN_LIMIT = 10;

export async function hydrateTranscriptFromReplay(
  state: TUIState,
  hooks: ReplayHydrationHooks,
  session: Session,
): Promise<boolean> {
  hooks.setAppState({ isReplaying: true });
  try {
    const resumeState = session.getResumeState()?.agents;
    const main = resumeState?.['main'];
    if (main === undefined) {
      hooks.emitError('Session history is unavailable for this session.');
      return false;
    }

    const subagents = distillSubagents(resumeState ?? {});
    const projection = projectReplayRecords(main.replay, main.background, subagents);
    hydrateProjectedEntries(state, projection.entries, hooks.appendEntry);
    hydrateTodoPanelFromResume(main, hooks);
    state.backgroundAgents = new Set(projection.backgroundAgents);
    state.backgroundAgentMetadata = new Map(projection.backgroundAgentMetadata);

    // Seed the BPM-derived store from the resume snapshot. This is the
    // authoritative source for footer count + transcript dedupe; the
    // subagent-derived `backgroundAgents` set above is kept for legacy
    // metadata lookups (agent name / description) until removed.
    state.backgroundTasks = new Map<string, BackgroundTaskInfo>(
      main.background.map((info) => [info.taskId, info]),
    );
    state.backgroundTaskTranscriptedTerminal.clear();
    // Resumed terminal tasks should not re-emit transcript cards.
    for (const info of main.background) {
      if (
        info.status === 'completed' ||
        info.status === 'failed' ||
        info.status === 'killed' ||
        info.status === 'lost'
      ) {
        state.backgroundTaskTranscriptedTerminal.add(info.taskId);
      }
    }
    const counts = countActiveBackgroundTasks(state.backgroundTasks);
    state.footer.setBackgroundCounts(counts);
    hooks.setAppState(appStateFromResumeAgent(main));
    return true;
  } catch (error) {
    const message = formatErrorMessage(error);
    hooks.emitError(`Failed to replay session history: ${message}`);
    return false;
  } finally {
    hooks.setAppState({ isReplaying: false });
  }
}

function hydrateTodoPanelFromResume(
  agent: ResumedAgentState,
  hooks: ReplayHydrationHooks,
): void {
  const rawTodos = agent.toolStore?.['todo'];
  if (!Array.isArray(rawTodos)) {
    hooks.setTodoList([]);
    return;
  }
  const todos = rawTodos
    .filter((todo): todo is TodoItem => isTodoItemShape(todo))
    .map((todo) => ({ title: todo.title, status: todo.status }));
  if (todos.length > 0 && todos.every((t) => t.status === 'done')) {
    hooks.setTodoList([]);
    return;
  }
  hooks.setTodoList(todos);
}

function countActiveBackgroundTasks(tasks: ReadonlyMap<string, BackgroundTaskInfo>): {
  bashTasks: number;
  agentTasks: number;
} {
  let bashTasks = 0;
  let agentTasks = 0;
  for (const info of tasks.values()) {
    if (
      info.status === 'completed' ||
      info.status === 'failed' ||
      info.status === 'killed' ||
      info.status === 'lost'
    ) {
      continue;
    }
    if (info.taskId.startsWith('agent-')) {
      agentTasks += 1;
    } else {
      bashTasks += 1;
    }
  }
  return { bashTasks, agentTasks };
}

function appStateFromResumeAgent(agent: ResumedAgentState): Partial<AppState> {
  const maxContextTokens = agent.config.modelCapabilities?.max_context_tokens ?? 0;
  const contextTokens = agent.context.tokenCount;
  const contextUsage = maxContextTokens > 0 ? contextTokens / maxContextTokens : 0;
  return {
    // `?? ''` so a resumed session with no resolvable model yields a string,
    // not `undefined` — the editor's `appState.model.trim()` would otherwise
    // throw. An empty model surfaces the normal "LLM not set" state.
    model: agent.config.modelAlias ?? agent.config.provider?.model ?? '',
    contextTokens,
    maxContextTokens,
    contextUsage,
    yolo: agent.permission.mode === 'yolo',
    permissionMode: agent.permission.mode,
  };
}

export function projectReplayRecords(
  records: readonly AgentReplayRecord[],
  backgroundTasks: readonly BackgroundTaskInfo[] = [],
  subagents: ReadonlyMap<string, SubagentReplayBlockData> = new Map(),
): ReplayProjection {
  const state: ProjectionState = {
    entries: [],
    toolCalls: new Map(),
    assistant: { thinking: [], text: [] },
    skillActivationIds: new Set<string>(),
    backgroundAgents: new Set<string>(),
    backgroundAgentMetadata: new Map<string, BackgroundAgentMetadata>(),
    backgroundTasks: new Map(backgroundTasks.map((info) => [info.taskId, info])),
    subagents,
    currentTurnId: 0,
    currentStep: 0,
  };

  for (const record of limitReplayRecordsByTurn(records, REPLAY_TURN_LIMIT)) {
    projectReplayRecord(state, record);
  }
  flushAssistant(state);

  return {
    entries: state.entries,
    backgroundAgents: state.backgroundAgents,
    backgroundAgentMetadata: state.backgroundAgentMetadata,
  };
}

/**
 * Distills each non-main agent's resumed state into a `SubagentReplayBlockData`
 * keyed by its `parentToolCallId`. The child's own replay is projected to
 * recover its assistant text and its tool calls (paired with their results),
 * and its `profileName` and total usage are attached. The resulting map lets
 * `projectReplayRecords` attach child activity onto the matching main-agent
 * `Agent` tool-call card so a resumed `/agent` view shows the child's work.
 *
 * Children without a `parentToolCallId` (main agent, or sessions persisted
 * before the field existed) are skipped — their cards degrade to the existing
 * result-derived rendering.
 */
export function distillSubagents(
  agents: Readonly<Record<string, ResumedAgentState>>,
): ReadonlyMap<string, SubagentReplayBlockData> {
  const subagents = new Map<string, SubagentReplayBlockData>();
  for (const [agentId, agent] of Object.entries(agents)) {
    if (agent.type === 'main') continue;
    const parentToolCallId = agent.parentToolCallId;
    if (parentToolCallId === undefined) continue;

    const child = projectReplayRecords(agent.replay);
    const text = child.entries
      .filter((entry) => entry.kind === 'assistant')
      .map((entry) => entry.content)
      .join('\n');
    const toolCalls: SubagentReplayToolCallData[] = [];
    for (const entry of child.entries) {
      if (entry.kind !== 'tool_call') continue;
      const data = entry.toolCallData;
      if (data === undefined) continue;
      toolCalls.push({
        id: data.id,
        name: data.name,
        args: data.args,
        result: data.result,
      });
    }
    subagents.set(parentToolCallId, {
      id: agentId,
      name: agent.config.profileName,
      text: text.length > 0 ? text : undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: agent.usage.total,
    });
  }
  return subagents;
}

function limitReplayRecordsByTurn(
  records: readonly AgentReplayRecord[],
  maxTurns: number,
): readonly AgentReplayRecord[] {
  if (maxTurns <= 0) return [];

  const turnStarts = records.flatMap((record, index) =>
    isReplayUserTurnRecord(record) ? [index] : [],
  );
  if (turnStarts.length <= maxTurns) return records;

  return records.slice(turnStarts[turnStarts.length - maxTurns]);
}

function isReplayUserTurnRecord(record: AgentReplayRecord): boolean {
  if (record.type !== 'message') return false;
  const { message } = record;
  if (message.role !== 'user') return false;
  switch (message.origin?.kind) {
    case undefined:
    case 'user':
      return true;
    case 'skill_activation':
      return message.origin.trigger === 'user-slash';
    case 'background_task':
    case 'compaction_summary':
    case 'hook_result':
    case 'injection':
    case 'system_trigger':
      return false;
  }
}

function projectReplayRecord(state: ProjectionState, record: AgentReplayRecord): void {
  switch (record.type) {
    case 'message':
      projectContextMessage(state, record.message);
      return;
    case 'permission_updated':
      flushAssistant(state);
      projectPermissionUpdate(state, record.mode);
      return;
    case 'approval_result':
      return;
    case 'config_updated':
      return;
  }
}

function projectPermissionUpdate(state: ProjectionState, mode: PermissionMode): void {
  if (mode === 'yolo') {
    state.entries.push(
      entry('status', 'YOLO mode: ON', 'notice', {
        detail: 'All actions will be approved automatically. Use with caution.',
      }),
    );
    state.permissionMode = mode;
    return;
  }
  if (state.permissionMode === 'yolo' && mode === 'manual') {
    state.entries.push(entry('status', 'YOLO mode: OFF', 'notice'));
    state.permissionMode = mode;
    return;
  }
  state.entries.push(entry('status', `Permission mode: ${mode}`, 'notice'));
  state.permissionMode = mode;
}

interface SkillActivationProjection {
  readonly activationId: string;
  readonly skillName: string;
  readonly skillArgs?: string;
}

function projectSkillActivation(
  state: ProjectionState,
  skill: SkillActivationProjection | undefined,
): void {
  if (skill === undefined) return;
  if (state.skillActivationIds.has(skill.activationId)) return;
  state.skillActivationIds.add(skill.activationId);
  state.entries.push(
    entry('skill_activation', `Activated skill: ${skill.skillName}`, 'plain', {
      skillActivationId: skill.activationId,
      skillName: skill.skillName,
      skillArgs: skill.skillArgs,
    }),
  );
}

function projectContextMessage(state: ProjectionState, message: ContextMessage): void {
  switch (message.role) {
    case 'user': {
      const origin = backgroundOrigin(message);
      if (origin !== undefined) {
        flushAssistant(state);
        projectBackgroundTaskNotification(state, origin);
        return;
      }
      if (message.origin?.kind === 'hook_result') {
        projectHookResultMessage(state, message);
        return;
      }
      if (message.origin?.kind === 'injection') {
        return;
      }
      flushAssistant(state);
      const skill = skillActivationFromOrigin(message.origin);
      if (skill !== undefined) {
        projectSkillActivation(state, skill);
        return;
      }
      state.currentTurnId += 1;
      state.entries.push(
        entry('user', contentPartsToText(message.content), 'plain', {
          turnId: String(state.currentTurnId),
        }),
      );
      return;
    }
    case 'assistant':
      if (message.origin?.kind === 'hook_result') {
        projectHookResultMessage(state, message);
        projectMessageToolCalls(state, message.toolCalls);
        return;
      }
      collectMessageContent(state.assistant, message.content);
      flushAssistant(state);
      if (message.toolCalls.length > 0) {
        state.currentStep += 1;
      }
      projectMessageToolCalls(state, message.toolCalls);
      return;
    case 'tool':
      flushAssistant(state);
      projectMessageToolResult(state, message);
      return;
    case 'system':
      return;
    default:
      return;
  }
}

function projectMessageToolCalls(state: ProjectionState, toolCalls: readonly ToolCall[]): void {
  const step = state.currentStep;
  const turnId = String(state.currentTurnId);
  for (const rawToolCall of toolCalls) {
    const toolCall = toolCallFromMessage(rawToolCall);
    if (toolCall === undefined) continue;
    // step/turnId let hydrateProjectedEntries group adjacent Agent calls
    // (same step + turnId) into an AgentGroupComponent, matching live behavior.
    toolCall.step = step;
    toolCall.turnId = turnId;
    // Attach the child agent's distilled activity when this is an `Agent`
    // tool-call whose id (the parent tool-call id) maps to a resumed child.
    // Gated on `name === 'Agent'` so a colliding id on another tool never
    // receives a subagent block.
    if (toolCall.name === 'Agent') {
      const subagent = state.subagents.get(toolCall.id);
      if (subagent !== undefined) {
        toolCall.subagent = subagent;
      }
    }
    state.toolCalls.set(toolCall.id, toolCall);
    state.entries.push(
      entry('tool_call', '', 'plain', {
        toolCallData: toolCall,
        turnId,
      }),
    );
  }
}

function projectMessageToolResult(state: ProjectionState, message: ContextMessage): void {
  const toolCallId = message.toolCallId;
  if (toolCallId === undefined) return;
  const call = state.toolCalls.get(toolCallId);
  if (call === undefined) return;
  call.result = {
    tool_call_id: toolCallId,
    output: toolResultOutput(message.content),
    is_error: message.isError,
  };
}

function projectBackgroundTaskNotification(
  state: ProjectionState,
  origin: BackgroundTaskOrigin,
): void {
  const task = state.backgroundTasks.get(origin.taskId);
  const meta: BackgroundAgentMetadata = {
    agentId: origin.taskId,
    parentToolCallId: origin.taskId,
    description: task?.description,
  };
  let status = formatBackgroundAgentTranscript(
    origin.status === 'completed' ? 'completed' : 'failed',
    meta,
  );
  if (origin.status === 'lost') {
    status = {
      ...status,
      headline: status.headline.replace(' failed in background', ' lost in background'),
    };
  } else if (origin.status === 'killed') {
    status = {
      ...status,
      headline: status.headline.replace(' failed in background', ' stopped'),
    };
  }
  state.entries.push(
    entry('status', status.headline, 'plain', {
      detail: status.detail,
      backgroundAgentStatus: status,
    }),
  );
  state.backgroundAgents.delete(meta.agentId);
  state.backgroundAgentMetadata.delete(meta.agentId);
}

function toolResultOutput(content: readonly ContentPart[]): string {
  if (content.some((part) => part.type !== 'text')) {
    return JSON.stringify(content);
  }
  return contentPartsToText(content);
}

function flushAssistant(state: ProjectionState): void {
  const thinking = state.assistant.thinking.join('');
  const text = state.assistant.text.join('');
  state.assistant = { thinking: [], text: [] };
  if (thinking.length > 0) {
    state.entries.push(entry('thinking', thinking, 'plain'));
  }
  if (text.length > 0) {
    state.entries.push(entry('assistant', text, 'markdown'));
  }
}

function projectHookResultMessage(state: ProjectionState, message: ContextMessage): void {
  if (message.origin?.kind !== 'hook_result') return;
  flushAssistant(state);
  state.entries.push(
    entry(
      'assistant',
      formatHookResultMessageForTranscript(
        contentPartsToText(message.content),
        message.origin.event,
        message.origin.blocked === true,
      ),
      'markdown',
    ),
  );
}

const HOOK_RESULT_RE =
  /<hook_result\s+hook_event="([^"]+)">\n?([\s\S]*?)\n?<\/hook_result>/g;

function formatHookResultMessageForTranscript(
  text: string,
  fallbackEvent: string,
  blocked: boolean,
): string {
  const results: Array<{ event: string; body: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(HOOK_RESULT_RE)) {
    if (text.slice(lastIndex, match.index).trim().length > 0) {
      return formatHookResultBlock(fallbackEvent, text, blocked);
    }
    const event = match[1];
    const body = match[2];
    if (event === undefined || body === undefined) {
      return formatHookResultBlock(fallbackEvent, text, blocked);
    }
    results.push({ event, body });
    lastIndex = match.index + match[0].length;
  }

  if (results.length === 0 || text.slice(lastIndex).trim().length > 0) {
    return formatHookResultBlock(fallbackEvent, text, blocked);
  }

  return results.map(({ event, body }) => formatHookResultBlock(event, body, blocked)).join('\n\n');
}

function formatHookResultBlock(event: string, body: string, blocked: boolean): string {
  return `*${event} hook${blocked ? ' blocked' : ''}*\n\n${body.trim() || '(empty)'}`;
}

function collectMessageContent(target: OpenAssistant, content: readonly ContentPart[]): void {
  for (const part of content) {
    switch (part.type) {
      case 'think':
        target.thinking.push(part.think);
        break;
      case 'text':
        target.text.push(part.text);
        break;
      case 'audio_url':
      case 'image_url':
      case 'video_url':
        break;
    }
  }
}

function toolCallFromMessage(rawToolCall: ToolCall): ToolCallBlockData | undefined {
  const id = rawToolCall.id;
  const name = rawToolCall.name;
  if (id.length === 0 || name.length === 0) return undefined;
  return {
    id,
    name,
    args: parseToolArguments(rawToolCall.arguments),
  };
}

function parseToolArguments(value: string | null): Record<string, unknown> {
  if (value === null || value.length === 0) return {};
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function entry(
  kind: TranscriptEntry['kind'],
  content: string,
  renderMode: TranscriptEntry['renderMode'],
  extras?: {
    turnId?: string;
    toolCallData?: ToolCallBlockData;
    detail?: string;
    color?: string;
    backgroundAgentStatus?: BackgroundAgentStatusData;
    skillActivationId?: string;
    skillName?: string;
    skillArgs?: string;
  },
): TranscriptEntry {
  return {
    id: nextTranscriptId(),
    kind,
    renderMode,
    content,
    turnId: extras?.turnId,
    detail: extras?.detail,
    color: extras?.color,
    toolCallData: extras?.toolCallData,
    backgroundAgentStatus: extras?.backgroundAgentStatus,
    skillActivationId: extras?.skillActivationId,
    skillName: extras?.skillName,
    skillArgs: extras?.skillArgs,
  };
}

function contentPartsToText(content: readonly ContentPart[]): string {
  return content.map(userPartToText).join('');
}

function backgroundOrigin(message: ContextMessage): BackgroundTaskOrigin | undefined {
  return message.origin?.kind === 'background_task' ? message.origin : undefined;
}

function userPartToText(part: ContentPart): string {
  switch (part.type) {
    case 'text':
      return part.text;
    case 'think':
      return part.think;
    case 'image_url':
      return mediaUrlPartToText('image', part.imageUrl.url);
    case 'video_url':
      return mediaUrlPartToText('video', part.videoUrl.url);
    case 'audio_url':
      return mediaUrlPartToText('audio', part.audioUrl.url);
  }
}

function skillActivationFromOrigin(
  origin: PromptOrigin | undefined,
): SkillActivationProjection | undefined {
  if (origin?.kind !== 'skill_activation') return undefined;
  return {
    activationId: origin.activationId,
    skillName: origin.skillName,
    skillArgs: origin.skillArgs,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Inject projected flat entries into live state. Adjacent Agent tool_call
 * entries sharing `(turnId, step)` are grouped into an AgentGroupComponent so
 * replay matches live behavior. Other entries use the original append path.
 *
 * Unlike `tryAttachAgentToolCall`, this does not write
 * `state.pendingAgentGroup`; after replay, live events must take over from a
 * clean pending group state.
 */
export function hydrateProjectedEntries(
  state: TUIState,
  entries: readonly TranscriptEntry[],
  appendEntry: (entry: TranscriptEntry) => void,
): void {
  let i = 0;
  while (i < entries.length) {
    const cur = entries[i];
    if (cur === undefined) {
      i += 1;
      continue;
    }
    if (cur.kind === 'skill_activation' && cur.skillActivationId !== undefined) {
      if (state.renderedSkillActivationIds.has(cur.skillActivationId)) {
        i += 1;
        continue;
      }
      state.renderedSkillActivationIds.add(cur.skillActivationId);
    }
    const tc = cur.toolCallData;
    if (
      cur.kind === 'tool_call' &&
      tc !== undefined &&
      tc.name === 'Agent' &&
      tc.step !== undefined
    ) {
      // Collect all adjacent Agent calls with the same step and turn id.
      const batch: TranscriptEntry[] = [cur];
      let j = i + 1;
      while (j < entries.length) {
        const next = entries[j];
        if (next === undefined) break;
        const nextTc = next.toolCallData;
        if (
          next.kind === 'tool_call' &&
          nextTc !== undefined &&
          nextTc.name === 'Agent' &&
          nextTc.step === tc.step &&
          nextTc.turnId === tc.turnId
        ) {
          batch.push(next);
          j++;
          continue;
        }
        break;
      }
      if (batch.length >= 2) {
        attachAgentBatchAsGroup(state, batch);
        i = j;
        continue;
      }
      // A single Agent stays on the standalone card path.
    }
    appendEntry(cur);
    i++;
  }
}

function attachAgentBatchAsGroup(state: TUIState, batch: readonly TranscriptEntry[]): void {
  const group = new AgentGroupComponent(state.theme.colors, state.ui);
  state.transcriptContainer.addChild(group);
  for (const item of batch) {
    const tc = item.toolCallData;
    if (tc === undefined) continue;
    state.transcriptEntries.push(item);
    const component = new ToolCallComponent(
      tc,
      tc.result,
      state.theme.colors,
      state.ui,
      state.theme.markdownTheme,
      state.appState.workDir,
    );
    if (state.toolOutputExpanded) component.setExpanded(true);
    state.pendingToolComponents.set(tc.id, component);
    group.attach(tc.id, component);
  }
  state.ui.requestRender();
}
