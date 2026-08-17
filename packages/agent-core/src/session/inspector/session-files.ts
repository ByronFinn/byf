/**
 * 只读会话发现 / 健康检查 / inventory（Inspector 的目录与状态层）。
 *
 * 由 `apps/vis/server/src/lib/session-store.ts` 上移（PRD-0035 R-A1）：
 * 原身份是 app 层的私有投影逻辑，现归 agent-core 所有，web/TUI/headless
 * 经 SDK 复用同一实现。会话 index 复用 `session/store/session-index` 的
 * 安全读取（路径包含校验 + basename 校验），不再保留 vis 的重复实现。
 */

import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';

import { readSessionIndex } from '#/session/store/session-index';

import type { AgentInfo, InspectorSessionSummary, SessionDetail, SessionHealth } from './types';

const SESSION_ID_RE = /^session_[A-Za-z0-9._-]+$/;
const AGENT_ID_RE = /^[A-Za-z0-9._-]+$/;

/** 拒绝可能经路径拼接逃出会话目录的 agent id。纵深防御：这些 id 的磁盘
 *  来源是 agent-core（只生成 main / agent-N），但损坏或手工编辑的
 *  `state.json.agents` 键可能把它变成本地文件读取原语。 */
export function isSafeAgentId(id: string): boolean {
  return AGENT_ID_RE.test(id) && id !== '.' && id !== '..';
}

export interface StateJson {
  createdAt?: string;
  updatedAt?: string;
  title?: string;
  isCustomTitle?: boolean;
  lastPrompt?: string;
  agents?: Record<
    string,
    { homedir: string; type: 'main' | 'sub' | 'independent'; parentAgentId: string | null }
  >;
  custom?: Record<string, unknown>;
}

/** 全量会话投影：遍历 `sessions/**` 目录 + index 补充 workDir，合并健康
 *  检查与 wire 计数（原 vis 全量列表语义，PRD-0035 R-A2 的
 *  `listInspectableSessions`）。 */
export async function listInspectableSessions(home: string): Promise<InspectorSessionSummary[]> {
  const sessionsDir = join(home, 'sessions');
  const buckets = await readdir(sessionsDir, { withFileTypes: true }).catch(() => []);
  const index = await readSessionIndex(home, sessionsDir);
  const out: InspectorSessionSummary[] = [];
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const bucketDir = join(sessionsDir, bucket.name);
    const sessionDirs = await readdir(bucketDir, { withFileTypes: true }).catch(() => []);
    for (const entry of sessionDirs) {
      if (!entry.isDirectory() || !SESSION_ID_RE.test(entry.name)) continue;
      const sessionDir = join(bucketDir, entry.name);
      const workDir = index.get(entry.name)?.workDir ?? '';
      const summary = await tryReadSummary(sessionDir, entry.name, workDir);
      if (summary !== null) out.push(summary);
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export async function readSessionDetail(
  home: string,
  sessionId: string,
): Promise<SessionDetail | null> {
  const sessionDir = await findSessionDir(home, sessionId);
  if (sessionDir === null) return null;
  const index = await readSessionIndex(home, join(home, 'sessions'));
  const workDir = index.get(sessionId)?.workDir ?? '';
  const state = await readState(sessionDir);
  // state.json 不可读时仍返回 SessionDetail 让 UI 渲染损坏诊断。agent
  // inventory 无法从 state 推导，但磁盘上的 `agents/<id>/wire.jsonl`
  // 独立于 state——直接探测，让用户仍能检查 wire/context。
  if (state === null) {
    const agents = await discoverAgentsFromDisk(sessionDir);
    return { sessionId, sessionDir, workDir, state: null, agents };
  }
  if (state.custom?.['imported_from_byf_cli'] === true) return null;
  const agents = await inventoryAgents(sessionDir, state);
  return { sessionId, sessionDir, workDir, state, agents };
}

/** Fallback inventory（state.json 不可读时）：遍历 `<sessionDir>/agents/*`
 *  并为含 `wire.jsonl` 的目录合成最小 AgentInfo。父链与 type 未知，标为
 *  `independent` + null parent——路由只需要 `agentId` + `wireExists`。 */
async function discoverAgentsFromDisk(sessionDir: string): Promise<AgentInfo[]> {
  const agentsDir = join(sessionDir, 'agents');
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(agentsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: AgentInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    if (!isSafeAgentId(id)) continue;
    const wirePath = join(agentsDir, id, 'wire.jsonl');
    const exists = await pathExists(wirePath);
    let readable = exists;
    let info: { count: number; protocolVersion: string | null } = {
      count: 0,
      protocolVersion: null,
    };
    if (exists) {
      try {
        info = await scanWire(wirePath);
      } catch {
        readable = false;
      }
    }
    out.push({
      agentId: id,
      type: id === 'main' ? 'main' : 'independent',
      parentAgentId: null,
      homedir: join(agentsDir, id),
      wireExists: readable,
      wireRecordCount: info.count,
      wireProtocolVersion: info.protocolVersion,
    });
  }
  return sortAgentInfo(out);
}

async function tryReadSummary(
  sessionDir: string,
  sessionId: string,
  workDir: string,
): Promise<InspectorSessionSummary | null> {
  const state = await readState(sessionDir);
  if (state === null) {
    return brokenStateSummary(sessionDir, sessionId, workDir);
  }
  if (state.custom?.['imported_from_byf_cli'] === true) return null;

  const mainWirePath = join(sessionDir, 'agents', 'main', 'wire.jsonl');
  const mainExists = await pathExists(mainWirePath);
  let mainCount = 0;
  let protocolVersion: string | null = null;
  let health: SessionHealth = 'ok';
  if (!mainExists) {
    health = 'missing_main_wire';
  } else {
    try {
      const info = await scanWire(mainWirePath);
      mainCount = info.count;
      protocolVersion = info.protocolVersion;
    } catch {
      health = 'broken_main_wire';
    }
  }

  return {
    sessionId,
    sessionDir,
    workDir,
    title: state.title ?? null,
    lastPrompt: state.lastPrompt ?? null,
    isCustomTitle: state.isCustomTitle ?? false,
    createdAt: parseTs(state.createdAt),
    updatedAt: parseTs(state.updatedAt),
    agentCount: Object.keys(state.agents ?? {}).length,
    mainAgentExists: mainExists,
    mainWireRecordCount: mainCount,
    wireProtocolVersion: protocolVersion,
    health,
  };
}

function brokenStateSummary(
  sessionDir: string,
  sessionId: string,
  workDir: string,
): InspectorSessionSummary {
  return {
    sessionId,
    sessionDir,
    workDir,
    title: null,
    lastPrompt: null,
    isCustomTitle: false,
    createdAt: 0,
    updatedAt: 0,
    agentCount: 0,
    mainAgentExists: false,
    mainWireRecordCount: 0,
    wireProtocolVersion: null,
    health: 'broken_state',
  };
}

async function inventoryAgents(sessionDir: string, state: StateJson): Promise<AgentInfo[]> {
  const result: AgentInfo[] = [];
  for (const [id, meta] of Object.entries(state.agents ?? {})) {
    if (!isSafeAgentId(id)) continue;
    const wirePath = join(sessionDir, 'agents', id, 'wire.jsonl');
    const exists = await pathExists(wirePath);
    let readable = exists;
    let info: { count: number; protocolVersion: string | null } = {
      count: 0,
      protocolVersion: null,
    };
    if (exists) {
      try {
        info = await scanWire(wirePath);
      } catch {
        readable = false;
      }
    }
    result.push({
      agentId: id,
      type: meta.type,
      parentAgentId: meta.parentAgentId,
      homedir: meta.homedir,
      wireExists: readable,
      wireRecordCount: info.count,
      wireProtocolVersion: info.protocolVersion,
    });
  }
  return sortAgentInfo(result);
}

function sortAgentInfo(list: AgentInfo[]): AgentInfo[] {
  return list.toSorted((a, b) => {
    if (a.agentId === 'main') return -1;
    if (b.agentId === 'main') return 1;
    return a.agentId.localeCompare(b.agentId);
  });
}

async function readState(sessionDir: string): Promise<StateJson | null> {
  try {
    return JSON.parse(await readFile(join(sessionDir, 'state.json'), 'utf8')) as StateJson;
  } catch {
    return null;
  }
}

async function findSessionDir(home: string, sessionId: string): Promise<string | null> {
  if (!SESSION_ID_RE.test(sessionId)) return null;
  const sessionsRoot = resolve(join(home, 'sessions'));
  const sessionsRootPrefix = sessionsRoot + sep;
  // 先查 index——只信任指向 `<home>/sessions/` 下且 basename 匹配的条目
  // （readSessionIndex 已做 isPathInside + basename 校验，挡住 stale/poisoned
  // index 行把读取重定向到无关目录）。
  try {
    const index = await readSessionIndex(home, sessionsRoot);
    const entry = index.get(sessionId);
    if (entry !== undefined) {
      const candidate = resolve(entry.sessionDir);
      if (candidate.startsWith(sessionsRootPrefix) && (await pathExists(candidate))) {
        return candidate;
      }
    }
  } catch {
    /* no index */
  }
  // Fall back to scanning buckets
  const buckets = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
  for (const bucket of buckets) {
    if (!bucket.isDirectory()) continue;
    const candidate = join(sessionsRoot, bucket.name, sessionId);
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

export async function scanWire(path: string): Promise<{ count: number; protocolVersion: string }> {
  const stream = createReadStream(path, { encoding: 'utf8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;
  let protocolVersion: string | null = null;
  for await (const line of rl) {
    if (line.length === 0) continue;
    if (protocolVersion === null) {
      // 严格：首行必须是良构 `metadata` 记录，否则列表视图的 health 会在
      // wire-reader 打开文件时报错之后才显示异常。
      let parsed: { type?: unknown; protocol_version?: unknown };
      try {
        parsed = JSON.parse(line) as typeof parsed;
      } catch {
        throw new Error('wire metadata is not valid JSON at line 1');
      }
      if (parsed.type !== 'metadata' || typeof parsed.protocol_version !== 'string') {
        throw new Error('wire is missing a metadata header on line 1');
      }
      protocolVersion = parsed.protocol_version;
    }
    count += 1;
  }
  if (protocolVersion === null) {
    throw new Error('wire file is empty');
  }
  return { count, protocolVersion };
}

function parseTs(input: string | undefined): number {
  if (!input) return 0;
  const n = Date.parse(input);
  return Number.isFinite(n) ? n : 0;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}
