import type { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

import type { KaosProcess } from '@byfriends/kaos';

import { ErrorCodes, ByfError } from '#/errors';
import type {
  ActivateSkillPayload,
  AgentAPI,
  AskSidePayload,
  BeginCompactionPayload,
  CancelPayload,
  CancelSideQueryPayload,
  CreateGoalPayload,
  DeleteCronTaskPayload,
  EmptyPayload,
  GetBackgroundOutputPathPayload,
  GetBackgroundOutputPayload,
  GetBackgroundPayload,
  McpServerInfo,
  McpStartupMetrics,
  PromptPayload,
  ReconnectMcpServerPayload,
  RenameSessionPayload,
  RegisterToolPayload,
  SessionAPI,
  SetActiveToolsPayload,
  SetModelPayload,
  SetPermissionPayload,
  ShellExecResult,
  SetThinkingPayload,
  SkillSummary,
  SteerPayload,
  StopBackgroundPayload,
  UnregisterToolPayload,
  UpdateSessionMetadataPayload,
} from '#/rpc';
import type { PromisableMethods } from '#/utils/types';

import type { Session, SessionMeta } from '.';
import {
  promptMetadataTextFromPayload,
  promptMetadataTextFromSkill,
  titleFromPromptMetadataText,
} from './prompt-metadata';

type AgentScopedPayload<T> = T & { agentId: string };

export class SessionAPIImpl implements PromisableMethods<SessionAPI> {
  constructor(protected readonly session: Session) {}

  async renameSession(payload: RenameSessionPayload): Promise<void> {
    const title = payload.title.trim();
    if (title.length === 0) {
      throw new ByfError(ErrorCodes.SESSION_TITLE_EMPTY, 'Session title cannot be empty');
    }
    this.session.metadata = {
      ...this.session.metadata,
      title,
      isCustomTitle: true,
      updatedAt: new Date().toISOString(),
    };
    await this.session.writeMetadata();
  }

  async updateSessionMetadata(payload: UpdateSessionMetadataPayload): Promise<void> {
    this.session.metadata = {
      ...this.session.metadata,
      ...payload.metadata,
      agents: this.session.metadata.agents,
    };
    await this.session.writeMetadata();
  }

  getSessionMetadata(_payload: EmptyPayload): SessionMeta {
    return this.session.metadata;
  }

  listSkills(_payload: EmptyPayload): Promise<readonly SkillSummary[]> {
    return this.session.listSkills();
  }

  listMcpServers(_payload: EmptyPayload): readonly McpServerInfo[] {
    return this.session.mcp.list();
  }

  async getMcpStartupMetrics(_payload: EmptyPayload): Promise<McpStartupMetrics> {
    await this.session.mcp.waitForInitialLoad();
    return { durationMs: this.session.mcp.initialLoadDurationMs() };
  }

  async reconnectMcpServer(payload: ReconnectMcpServerPayload): Promise<void> {
    await this.session.mcp.reconnect(payload.name);
  }

  generateAgentsMd(_payload: EmptyPayload): Promise<void> {
    return this.session.generateAgentsMd();
  }

  async shellExec(payload: {
    readonly command: string;
    readonly cwd?: string;
    readonly timeout?: number;
  }): Promise<ShellExecResult> {
    const normalizedCommand = payload.command.trim();
    if (normalizedCommand.length === 0) {
      throw new ByfError(ErrorCodes.REQUEST_INVALID, 'Shell command cannot be empty');
    }
    const environment = this.session.config.runtime.osEnv;
    const isWindowsBash = environment.osKind === 'Windows';
    const defaultCwd = this.session.config.cwd ?? process.cwd();
    const effectiveCwd = payload.cwd ?? defaultCwd;
    const shellCwd = isWindowsBash ? windowsPathToPosixPath(effectiveCwd) : effectiveCwd;
    const command = isWindowsBash
      ? rewriteWindowsNullRedirect(normalizedCommand)
      : normalizedCommand;
    const shellCommand = `cd ${shellQuote(shellCwd)} && ${command}`;
    const shellArgs = [environment.shellPath, '-c', shellCommand];
    const timeoutMs = normalizeShellTimeoutMs(payload.timeout);

    const noninteractiveEnv: Record<string, string> = {
      NO_COLOR: '1',
      TERM: 'dumb',
      GIT_TERMINAL_PROMPT: process.env['GIT_TERMINAL_PROMPT'] ?? '0',
      SHELL: environment.shellPath,
    };
    const mergedEnv: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...noninteractiveEnv,
    };
    const proc = await this.session.config.runtime.kaos.execWithEnv(shellArgs, mergedEnv);

    try {
      proc.stdin.end();
    } catch {
      // stdin may already be closed by process termination
    }

    return waitForShellExecution(proc, timeoutMs);
  }

  async prompt({ agentId, ...payload }: AgentScopedPayload<PromptPayload>) {
    if (agentId === 'main') {
      await this.updatePromptMetadata(promptMetadataTextFromPayload(payload));
    }
    return this.getAgent(agentId).prompt(payload);
  }

  steer({ agentId, ...payload }: AgentScopedPayload<SteerPayload>) {
    return this.getAgent(agentId).steer(payload);
  }

  askSide({ agentId, ...payload }: AgentScopedPayload<AskSidePayload>) {
    return this.getAgent(agentId).askSide(payload);
  }

  cancelSideQuery({ agentId, ...payload }: AgentScopedPayload<CancelSideQueryPayload>) {
    return this.getAgent(agentId).cancelSideQuery(payload);
  }

  cancel({ agentId, ...payload }: AgentScopedPayload<CancelPayload>) {
    return this.getAgent(agentId).cancel(payload);
  }

  setModel({ agentId, ...payload }: AgentScopedPayload<SetModelPayload>) {
    return this.getAgent(agentId).setModel(payload);
  }

  setThinking({ agentId, ...payload }: AgentScopedPayload<SetThinkingPayload>) {
    return this.getAgent(agentId).setThinking(payload);
  }

  setPermission({ agentId, ...payload }: AgentScopedPayload<SetPermissionPayload>) {
    return this.getAgent(agentId).setPermission(payload);
  }

  createGoal({ agentId, ...payload }: AgentScopedPayload<CreateGoalPayload>) {
    return this.getAgent(agentId).createGoal(payload);
  }

  getGoal({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getGoal(payload);
  }

  pauseGoal({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).pauseGoal(payload);
  }

  resumeGoal({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).resumeGoal(payload);
  }

  cancelGoal({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).cancelGoal(payload);
  }

  getCronTasks({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getCronTasks(payload);
  }

  deleteCronTask({ agentId, ...payload }: AgentScopedPayload<DeleteCronTaskPayload>) {
    return this.getAgent(agentId).deleteCronTask(payload);
  }

  getModel({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getModel(payload);
  }

  beginCompaction({ agentId, ...payload }: AgentScopedPayload<BeginCompactionPayload>) {
    return this.getAgent(agentId).beginCompaction(payload);
  }

  cancelCompaction({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).cancelCompaction(payload);
  }

  registerTool({ agentId, ...payload }: AgentScopedPayload<RegisterToolPayload>) {
    return this.getAgent(agentId).registerTool(payload);
  }

  unregisterTool({ agentId, ...payload }: AgentScopedPayload<UnregisterToolPayload>) {
    return this.getAgent(agentId).unregisterTool(payload);
  }

  setActiveTools({ agentId, ...payload }: AgentScopedPayload<SetActiveToolsPayload>) {
    return this.getAgent(agentId).setActiveTools(payload);
  }

  stopBackground({ agentId, ...payload }: AgentScopedPayload<StopBackgroundPayload>) {
    return this.getAgent(agentId).stopBackground(payload);
  }

  clearContext({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).clearContext(payload);
  }

  async activateSkill({ agentId, ...payload }: AgentScopedPayload<ActivateSkillPayload>) {
    await this.getAgent(agentId).activateSkill(payload);
    if (agentId === 'main') {
      await this.updatePromptMetadata(promptMetadataTextFromSkill(payload));
    }
  }

  getBackgroundOutput({ agentId, ...payload }: AgentScopedPayload<GetBackgroundOutputPayload>) {
    return this.getAgent(agentId).getBackgroundOutput(payload);
  }

  getBackgroundOutputPath({
    agentId,
    ...payload
  }: AgentScopedPayload<GetBackgroundOutputPathPayload>) {
    return this.getAgent(agentId).getBackgroundOutputPath(payload);
  }

  getContext({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getContext(payload);
  }

  getConfig({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getConfig(payload);
  }

  getPermission({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getPermission(payload);
  }

  getUsage({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getUsage(payload);
  }

  getTools({ agentId, ...payload }: AgentScopedPayload<EmptyPayload>) {
    return this.getAgent(agentId).getTools(payload);
  }

  getBackground({ agentId, ...payload }: AgentScopedPayload<GetBackgroundPayload>) {
    return this.getAgent(agentId).getBackground(payload);
  }

  private getAgent(agentId: string): PromisableMethods<AgentAPI> {
    const agent = this.session.agents.get(agentId);
    if (agent === undefined) {
      throw new ByfError(ErrorCodes.AGENT_NOT_FOUND, `Agent "${agentId}" was not found`);
    }
    return agent.rpcMethods;
  }

  private needUpdateEasyTitle(metadata: SessionMeta): boolean {
    if (hasCustomTitle(metadata)) return false;
    if (!isUntitled(metadata.title)) return false;
    return true;
  }

  private async updatePromptMetadata(lastPrompt: string | undefined): Promise<void> {
    if (lastPrompt === undefined) return;

    const title = this.needUpdateEasyTitle(this.session.metadata)
      ? titleFromPromptMetadataText(lastPrompt)
      : undefined;
    const now = new Date().toISOString();
    const nextMetadata = {
      ...this.session.metadata,
      lastPrompt,
      updatedAt: now,
    };
    if (title !== undefined) {
      nextMetadata.title = title;
      nextMetadata.isCustomTitle = false;
    }

    this.session.metadata = nextMetadata;
    await this.session.writeMetadata();
    await this.session.rpc.emitEvent({
      type: 'session.meta.updated',
      agentId: 'main',
      title,
      patch: {
        title,
        isCustomTitle: title === undefined ? undefined : false,
        lastPrompt,
      },
    });
  }
}

function isUntitled(title: unknown): boolean {
  return typeof title !== 'string' || title.trim().length === 0 || title === 'New Session';
}

function hasCustomTitle(metadata: SessionMeta): boolean {
  if (metadata.isCustomTitle) return true;
  return typeof (metadata as SessionMeta & { customTitle?: unknown }).customTitle === 'string';
}

const SHELL_DEFAULT_TIMEOUT_MS = 30_000;
const SHELL_SIGTERM_GRACE_MS = 5_000;
const WINDOWS_NUL_REDIRECT = /(\d?&?>+\s*)[Nn][Uu][Ll](?=\s|$|[|&;)\n])/g;

function normalizeShellTimeoutMs(timeout: number | undefined): number {
  if (timeout === undefined) return SHELL_DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new ByfError(ErrorCodes.REQUEST_INVALID, 'Shell timeout must be a positive number.');
  }
  return Math.floor(timeout);
}

async function waitForShellExecution(
  proc: KaosProcess,
  timeoutMs: number,
): Promise<ShellExecResult> {
  let timedOut = false;
  let killed = false;

  const killProc = async (): Promise<void> => {
    if (killed) return;
    killed = true;
    try {
      await proc.kill('SIGTERM');
    } catch {
      // process already gone
    }
    const exited = proc
      .wait()
      .then(() => true)
      .catch(() => true);
    const raced = await Promise.race([
      exited,
      new Promise<false>((resolve) => {
        setTimeout(() => {
          resolve(false);
        }, SHELL_SIGTERM_GRACE_MS);
      }),
    ]);
    if (!raced && proc.exitCode === null) {
      try {
        await proc.kill('SIGKILL');
      } catch {
        // ignore
      }
    }
  };

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    void killProc();
  }, timeoutMs);

  const stdoutPromise = readStreamText(proc.stdout);
  const stderrPromise = readStreamText(proc.stderr);
  let exitCode = 1;
  try {
    exitCode = await proc.wait();
  } finally {
    clearTimeout(timeoutHandle);
    if (timedOut) {
      await killProc();
    }
  }

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
  return {
    stdout,
    stderr,
    exitCode,
    timedOut,
  };
}

async function readStreamText(stream: Readable): Promise<string> {
  const decoder = new StringDecoder('utf8');
  let text = '';
  for await (const chunk of stream) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : (chunk as Buffer);
    text += decoder.write(buffer);
  }
  text += decoder.end();
  return text;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function windowsPathToPosixPath(path: string): string {
  if (path.startsWith('\\\\')) {
    return path.replaceAll('\\', '/');
  }
  const driveMatch = /^([A-Za-z]):(?:[\\/]|$)/.exec(path);
  if (driveMatch !== null) {
    const drive = driveMatch[1]!.toLowerCase();
    const rest = path.slice(2).replaceAll('\\', '/');
    return `/${drive}${rest.startsWith('/') ? rest : `/${rest}`}`;
  }
  return path.replaceAll('\\', '/');
}

function rewriteWindowsNullRedirect(command: string): string {
  return command.replace(WINDOWS_NUL_REDIRECT, '$1/dev/null');
}
