import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

import { z } from 'zod';

import { ErrorCodes, ByfError } from '#/errors';
import type { JsonObject, ListSessionsPayload, SessionSummary } from '#/rpc/core-api';
import type { SessionIndexEntry } from '#/session/store/session-index';
import { appendSessionIndexEntry, readSessionIndex } from '#/session/store/session-index';
import { encodeWorkDirKey, normalizeWorkDir } from '#/session/store/workdir-key';

const SessionSummaryStateSchema = z.object({
  customTitle: z.string().optional(),
  isCustomTitle: z.boolean().optional(),
  lastPrompt: z.string().optional(),
  title: z.string().optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});

type SessionSummaryState = z.infer<typeof SessionSummaryStateSchema>;

export interface CreateSessionRecordInput {
  readonly id: string;
  readonly workDir: string;
}

export interface ForkSessionRecordInput {
  readonly sourceId: string;
  readonly targetId: string;
  readonly title?: string;
  readonly metadata?: JsonObject;
  /**
   * 1-based ordinal of a user-origin message (`turn.prompt`/`turn.steer` with
   * `origin.kind === 'user'`). When set, the forked session's main agent
   * wire.jsonl is truncated before that record (edit-message semantics — see
   * ADR-0020). Omitted → full copy (backwards compatible).
   */
  readonly upToMessage?: number;
}

export type SessionStoreOptions = Record<string, never>;

export class SessionStore {
  readonly sessionsDir: string;

  constructor(
    readonly homeDir: string,
    _options: SessionStoreOptions = {},
  ) {
    this.sessionsDir = join(homeDir, 'sessions');
  }

  sessionDirFor(input: { readonly id: string; readonly workDir: string }): string {
    assertSafeSessionId(input.id);
    return join(this.sessionsDir, encodeWorkDirKey(normalizeWorkDir(input.workDir)), input.id);
  }

  async create(input: CreateSessionRecordInput): Promise<SessionSummary> {
    assertSafeSessionId(input.id);
    const workDir = normalizeWorkDir(input.workDir);
    const indexed = await this.findSessionEntry(input.id);
    if (indexed !== undefined) {
      throw new ByfError(ErrorCodes.SESSION_ALREADY_EXISTS, `Session "${input.id}" already exists`);
    }

    const dir = this.sessionDirFor({ id: input.id, workDir });
    if (await isDirectory(dir)) {
      throw new ByfError(ErrorCodes.SESSION_ALREADY_EXISTS, `Session "${input.id}" already exists`);
    }

    await mkdir(dir, { recursive: true, mode: 0o700 });
    await appendSessionIndexEntry(this.homeDir, {
      sessionId: input.id,
      sessionDir: dir,
      workDir,
    });
    return this.summaryFromDir(input.id, dir, workDir);
  }

  async fork(input: ForkSessionRecordInput): Promise<SessionSummary> {
    const source = await this.findExistingSessionEntry(input.sourceId);
    assertSafeSessionId(input.targetId);
    const indexed = await this.findSessionEntry(input.targetId);
    if (indexed !== undefined) {
      throw new ByfError(
        ErrorCodes.SESSION_ALREADY_EXISTS,
        `Session "${input.targetId}" already exists`,
      );
    }

    const targetDir = this.sessionDirFor({ id: input.targetId, workDir: source.workDir });
    if (await isDirectory(targetDir)) {
      throw new ByfError(
        ErrorCodes.SESSION_ALREADY_EXISTS,
        `Session "${input.targetId}" already exists`,
      );
    }

    await mkdir(dirname(targetDir), { recursive: true, mode: 0o700 });
    try {
      await cp(source.sessionDir, targetDir, {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
      await this.writeForkedState(input, source.sessionDir, targetDir);
      if (input.upToMessage !== undefined) {
        await truncateMainWireUpToMessage(targetDir, input.upToMessage);
        await cleanupOrphanedAgents(targetDir);
      }
      // PRD-0019 R10 / ADR-0023：fork 总是清空 goal。扫描截断后的新会话 main wire，
      // 若存在未清空的 goal.create（net 状态非 absent），追加一条 goal.clear record。
      await appendGoalClearIfPresent(targetDir);
      const summary = await this.summaryFromDir(input.targetId, targetDir, source.workDir);
      await appendSessionIndexEntry(this.homeDir, {
        sessionId: input.targetId,
        sessionDir: targetDir,
        workDir: source.workDir,
      });
      return summary;
    } catch (error) {
      await rm(targetDir, { recursive: true, force: true }).catch(() => {});
      throw error;
    }
  }

  async get(id: string): Promise<SessionSummary> {
    const entry = await this.findExistingSessionEntry(id);
    return this.summaryFromDir(id, entry.sessionDir, entry.workDir);
  }

  async rename(id: string, title: string): Promise<void> {
    const normalized = title.trim();
    if (normalized.length === 0) {
      throw new ByfError(ErrorCodes.SESSION_TITLE_EMPTY, 'Session title cannot be empty');
    }
    const entry = await this.findExistingSessionEntry(id);
    const statePath = join(entry.sessionDir, 'state.json');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(statePath, 'utf-8')) as unknown;
    } catch (error) {
      throw new ByfError(
        ErrorCodes.SESSION_STATE_NOT_FOUND,
        `Session "${id}" state.json was not found`,
        {
          cause: error,
        },
      );
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new ByfError(ErrorCodes.SESSION_STATE_INVALID, `Session "${id}" state.json is invalid`);
    }
    const next: Record<string, unknown> = {
      ...(parsed as Record<string, unknown>),
      title: normalized,
      isCustomTitle: true,
    };
    await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  }

  async list(options: ListSessionsPayload): Promise<readonly SessionSummary[]> {
    const workDir = normalizeWorkDir(options.workDir);
    const bucketDir = join(this.sessionsDir, encodeWorkDirKey(workDir));
    let entries;
    try {
      entries = await readdir(bucketDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const sessions: SessionSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const id = entry.name;
      if (!isSafeSessionId(id)) continue;
      const dir = join(bucketDir, id);
      sessions.push(await this.summaryFromDir(id, dir, workDir));
    }
    sessions.sort(compareSessionSummary);
    return sessions;
  }

  async assertDirectory(id: string): Promise<string> {
    return (await this.findExistingSessionEntry(id)).sessionDir;
  }

  private async findSessionEntry(id: string): Promise<SessionIndexEntry | undefined> {
    if (!isSafeSessionId(id)) return undefined;
    const index = await readSessionIndex(this.homeDir, this.sessionsDir);
    return index.get(id);
  }

  private async findExistingSessionEntry(id: string): Promise<SessionIndexEntry> {
    const entry = await this.findSessionEntry(id);
    if (entry !== undefined && (await isDirectory(entry.sessionDir))) return entry;
    throw new ByfError(ErrorCodes.SESSION_NOT_FOUND, `Session "${id}" was not found`, {
      details: { sessionId: id },
    });
  }

  private async writeForkedState(
    input: ForkSessionRecordInput,
    sourceDir: string,
    targetDir: string,
  ): Promise<void> {
    const statePath = join(targetDir, 'state.json');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(statePath, 'utf-8')) as unknown;
    } catch (error) {
      throw new ByfError(
        ErrorCodes.SESSION_STATE_NOT_FOUND,
        `Session "${input.sourceId}" state.json was not found`,
        {
          cause: error,
        },
      );
    }
    if (!isRecord(parsed)) {
      throw new ByfError(
        ErrorCodes.SESSION_STATE_INVALID,
        `Session "${input.sourceId}" state.json is invalid`,
      );
    }

    const title = normalizeForkTitle(input.title, parsed['title']);
    const now = new Date().toISOString();
    const next: Record<string, unknown> = {
      ...parsed,
      createdAt: now,
      updatedAt: now,
      title,
      isCustomTitle: input.title === undefined ? parsed['isCustomTitle'] === true : true,
      forkedFrom: input.sourceId,
      forkedFromMessage: input.upToMessage,
      agents: rewriteAgentHomedirs(parsed['agents'], sourceDir, targetDir),
      custom: Object.assign({}, isRecord(parsed['custom']) ? parsed['custom'] : {}, input.metadata),
    };
    await writeFile(statePath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');
  }

  private async summaryFromDir(
    id: string,
    sessionDir: string,
    workDir: string,
  ): Promise<SessionSummary> {
    const dirStat = await stat(sessionDir);
    const state = await readOptionalState(sessionDir);
    const [stateInfo, wireInfo, agentsWireMtime] = await Promise.all([
      statIfExists(join(sessionDir, 'state.json')),
      statIfExists(join(sessionDir, 'wire.jsonl')),
      latestAgentWireMtime(sessionDir),
    ]);
    return {
      id,
      workDir,
      sessionDir,
      createdAt: timestampOrFallback(dirStat.birthtimeMs, dirStat.ctimeMs),
      updatedAt: Math.max(
        dirStat.mtimeMs,
        stateInfo?.mtimeMs ?? 0,
        wireInfo?.mtimeMs ?? 0,
        agentsWireMtime ?? 0,
      ),
      title: titleFromState(state),
      lastPrompt: state?.lastPrompt,
      metadata: metadataFromState(state),
    };
  }
}

function metadataFromState(state: SessionSummaryState | undefined): JsonObject | undefined {
  if (state === undefined || state.custom === undefined) return undefined;
  return state.custom as JsonObject;
}

async function latestAgentWireMtime(sessionDir: string): Promise<number | undefined> {
  const agentsDir = join(sessionDir, 'agents');
  let entries;
  try {
    entries = await readdir(agentsDir, { withFileTypes: true });
  } catch {
    return undefined;
  }

  let latest = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const wireInfo = await statIfExists(join(agentsDir, entry.name, 'wire.jsonl'));
    latest = Math.max(latest, wireInfo?.mtimeMs ?? 0);
  }
  return latest > 0 ? latest : undefined;
}

function titleFromState(state: SessionSummaryState | undefined): string | undefined {
  if (state === undefined) return undefined;
  if (typeof state.isCustomTitle === 'boolean' && typeof state.title === 'string') {
    return state.title;
  }
  if (typeof state.customTitle === 'string') return state.customTitle;
  return typeof state.title === 'string' ? state.title : undefined;
}

async function readOptionalState(sessionDir: string): Promise<SessionSummaryState | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf-8')) as unknown;
    const result = SessionSummaryStateSchema.safeParse(parsed);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function normalizeForkTitle(title: string | undefined, fallback: unknown): string {
  if (title !== undefined) {
    const normalized = title.trim();
    if (normalized.length === 0) {
      throw new ByfError(ErrorCodes.SESSION_TITLE_EMPTY, 'Session title cannot be empty');
    }
    return normalized;
  }
  return typeof fallback === 'string' && fallback.trim().length > 0 ? fallback : 'New Session';
}

function rewriteAgentHomedirs(value: unknown, sourceDir: string, targetDir: string): unknown {
  if (!isRecord(value)) return {};

  const agents: Record<string, unknown> = {};
  for (const [agentId, agentMeta] of Object.entries(value)) {
    if (!isRecord(agentMeta)) {
      agents[agentId] = agentMeta;
      continue;
    }
    const homedir = agentMeta['homedir'];
    agents[agentId] = {
      ...agentMeta,
      homedir:
        typeof homedir === 'string' ? remapSessionPath(homedir, sourceDir, targetDir) : homedir,
    };
  }
  return agents;
}

function remapSessionPath(value: string, sourceDir: string, targetDir: string): string {
  const rel = relative(sourceDir, value);
  if (rel === '') return targetDir;
  if (rel.startsWith('..') || isAbsolute(rel)) return value;
  return join(targetDir, rel);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function statIfExists(path: string): Promise<{ readonly mtimeMs: number } | undefined> {
  try {
    return await stat(path);
  } catch {
    return undefined;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function timestampOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function assertSafeSessionId(id: string): void {
  if (isSafeSessionId(id)) return;
  throw new ByfError(
    ErrorCodes.SESSION_ID_INVALID,
    'Session id contains unsupported path characters',
  );
}

function isSafeSessionId(id: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(id) && id !== '.' && id !== '..';
}

function compareSessionSummary(a: SessionSummary, b: SessionSummary): number {
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

/**
 * Truncates the forked session's main agent wire.jsonl at the Nth user-origin
 * message (edit-message semantics — see ADR-0020). Keeps every record BEFORE
 * the Nth `turn.prompt`/`turn.steer` whose `origin.kind === 'user'`, and drops
 * that record + everything after it. Non-user-origin turns (background_task,
 * skill_activation, hook_result) are not counted toward the ordinal.
 */
async function truncateMainWireUpToMessage(sessionDir: string, upToMessage: number): Promise<void> {
  const mainWirePath = join(sessionDir, 'agents', 'main', 'wire.jsonl');
  let content: string;
  try {
    content = await readFile(mainWirePath, 'utf-8');
  } catch {
    // No main wire (e.g. an empty session). Nothing to truncate.
    return;
  }

  const lines = content.split('\n');
  // Preserve a possible trailing newline split into an empty last element,
  // but operate only on non-empty lines when counting user messages.
  let userMessageCount = 0;
  let truncateAtIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.trim().length === 0) continue;

    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      // Skip unparseable lines without affecting the ordinal.
      continue;
    }
    if (!isUserTurnBoundary(record)) continue;

    userMessageCount += 1;
    if (userMessageCount === upToMessage) {
      // Truncate at this line: keep everything before index i.
      truncateAtIndex = i;
      break;
    }
  }

  if (truncateAtIndex === -1) {
    throw new ByfError(
      ErrorCodes.SESSION_FORK_UPTO_MESSAGE_OUT_OF_RANGE,
      `upToMessage ${upToMessage} exceeds the number of user messages (${userMessageCount}) in the session`,
    );
  }

  // Keep lines [0, truncateAtIndex) and drop [truncateAtIndex, end). Preserve
  // the trailing newline so the file stays well-formed JSONL.
  const kept = lines.slice(0, truncateAtIndex);
  const truncated = kept.join('\n') + (kept.length > 0 ? '\n' : '');
  await writeFile(mainWirePath, truncated, 'utf-8');
}

function isUserTurnBoundary(record: unknown): boolean {
  if (!isRecord(record)) return false;
  const type = record['type'];
  if (type !== 'turn.prompt' && type !== 'turn.steer') return false;
  const origin = record['origin'];
  return isRecord(origin) && origin['kind'] === 'user';
}

/**
 * Removes sub-agents spawned by dropped turns after a truncation fork.
 *
 * A sub-agent is "referenced" when its `parentToolCallId` appears as a
 * `tool.call` event in the retained main wire prefix. Orphans (whose
 * parentToolCallId is absent from the prefix) are removed from state.json's
 * `agents` map and their `agents/<id>/` directory is deleted. The main agent
 * and any sub-agent without a parentToolCallId are always retained.
 *
 * See PRD-0015 R7 / Issue #185.
 */
async function cleanupOrphanedAgents(sessionDir: string): Promise<void> {
  const mainWirePath = join(sessionDir, 'agents', 'main', 'wire.jsonl');
  let mainContent = '';
  try {
    mainContent = await readFile(mainWirePath, 'utf-8');
  } catch {
    return;
  }

  const retainedToolCallIds = collectToolCallIds(mainContent);

  const statePath = join(sessionDir, 'state.json');
  const parsed = JSON.parse(await readFile(statePath, 'utf-8')) as Record<string, unknown>;
  const agents = isRecord(parsed['agents']) ? parsed['agents'] : {};
  if (!isRecord(agents)) return;

  const survivors: Record<string, unknown> = {};
  const orphans: string[] = [];
  for (const [agentId, meta] of Object.entries(agents)) {
    if (!isRecord(meta)) {
      survivors[agentId] = meta;
      continue;
    }
    const parentToolCallId = meta['parentToolCallId'];
    // main agent + legacy agents without parentToolCallId are always kept.
    if (typeof parentToolCallId !== 'string') {
      survivors[agentId] = meta;
      continue;
    }
    // Sentinel parentToolCallIds (e.g. the /init-spawned agent uses
    // 'generate-agents-md') are never recorded as wire tool.call events, so
    // they must be exempt from orphan detection regardless of truncation.
    if (SENTINEL_PARENT_TOOL_CALL_IDS.has(parentToolCallId)) {
      survivors[agentId] = meta;
      continue;
    }
    if (retainedToolCallIds.has(parentToolCallId)) {
      survivors[agentId] = meta;
    } else {
      orphans.push(agentId);
    }
  }

  if (orphans.length === 0) return;

  parsed['agents'] = survivors;
  await writeFile(statePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');

  for (const agentId of orphans) {
    await rm(join(sessionDir, 'agents', agentId), { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Collects every `tool.call` toolCallId from a wire.jsonl content string by
 * scanning `context.append_loop_event` records whose embedded event is a
 * tool.call. Returns the set of retained ids (used for orphan detection).
 */
function collectToolCallIds(mainWireContent: string): Set<string> {
  const ids = new Set<string>();
  for (const line of mainWireContent.split('\n')) {
    if (line.trim().length === 0) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(record) || record['type'] !== 'context.append_loop_event') continue;
    const event = record['event'];
    if (!isRecord(event) || event['type'] !== 'tool.call') continue;
    const toolCallId = event['toolCallId'];
    if (typeof toolCallId === 'string') ids.add(toolCallId);
  }
  return ids;
}

/**
 * parentToolCallId values that are programmatic sentinels rather than real
 * model-emitted tool-call ids. Such agents (e.g. the `/init`-spawned
 * generate-agents-md agent) are never recorded as wire `tool.call` events, so
 * they would be wrongly classified as orphans after a truncation fork. They
 * are always retained.
 */
const SENTINEL_PARENT_TOOL_CALL_IDS: ReadonlySet<string> = new Set(['generate-agents-md']);

/**
 * PRD-0019 R10 / ADR-0023：fork 总是清空 goal。
 *
 * 扫描 fork 目标会话的 main wire.jsonl，统计 goal.create/goal.clear 的净状态（goal.update 不改变 absent 边界，故忽略）。若存在未被清空的 goal.create（即 fork 截断点处仍有 goal），
 * 追加一条 `goal.clear` record，使 fork 后的会话无 goal。
 *
 * 无 goal.create 或已被 goal.clear 覆盖时不追加。
 */
async function appendGoalClearIfPresent(sessionDir: string): Promise<void> {
  const mainWirePath = join(sessionDir, 'agents', 'main', 'wire.jsonl');
  let content: string;
  try {
    content = await readFile(mainWirePath, 'utf-8');
  } catch {
    return; // 无 main wire，无需处理。
  }

  let hasActiveGoal = false;
  for (const line of content.split('\n')) {
    if (line.trim().length === 0) continue;
    let record: { type?: string };
    try {
      record = JSON.parse(line) as { type?: string };
    } catch {
      continue;
    }
    if (record.type === 'goal.create') {
      hasActiveGoal = true;
    } else if (record.type === 'goal.clear') {
      hasActiveGoal = false;
    }
  }

  if (!hasActiveGoal) return;

  const clearRecord = { type: 'goal.clear', time: Date.now() };
  const suffix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
  await writeFile(mainWirePath, content + suffix + JSON.stringify(clearRecord) + '\n', 'utf-8');
}
