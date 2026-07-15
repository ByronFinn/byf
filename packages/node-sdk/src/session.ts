import { randomUUID } from 'node:crypto';

import { ErrorCodes, ByfError, type ByfErrorCode } from '@byfriends/agent-core';

import { type ApprovalHandler, type Event, type QuestionHandler } from '#/events';
import type { SDKRpcClient } from '#/rpc';
import type {
  BackgroundTaskInfo,
  CompactOptions,
  CronTaskSnapshot,
  GoalBudgetLimits,
  GoalSnapshot,
  McpServerInfo,
  McpStartupMetrics,
  PermissionMode,
  PromptInput,
  ResumedSessionState,
  ShellExecResult,
  SessionStatus,
  SessionSummary,
  SessionUsage,
  SkillSummary,
  Unsubscribe,
} from '#/types';

const MAIN_AGENT_ID = 'main';

export interface SessionOptions {
  readonly id: string;
  readonly workDir: string;
  readonly summary?: SessionSummary;
  readonly resumeState?: ResumedSessionState;
  readonly rpc: SDKRpcClient;
  readonly onClose?: () => void | Promise<void>;
}

export class Session {
  readonly id: string;
  readonly workDir: string;
  readonly summary?: SessionSummary;
  private readonly resumeState: ResumedSessionState | undefined;

  private readonly rpc: SDKRpcClient;
  private readonly onClose?: () => void | Promise<void>;
  private closed = false;

  constructor(options: SessionOptions) {
    this.id = options.id;
    this.workDir = options.workDir;
    this.summary = options.summary;
    this.resumeState = options.resumeState ?? resumeStateFromSummary(options.summary);
    this.rpc = options.rpc;
    this.onClose = options.onClose;
  }

  getResumeState(): ResumedSessionState | undefined {
    this.ensureOpen();
    return this.resumeState;
  }

  onEvent(listener: (event: Event) => void): Unsubscribe {
    this.ensureOpen();
    return this.rpc.onEvent((event) => {
      if (event.sessionId === this.id) {
        listener(event);
      }
    });
  }

  setApprovalHandler(handler: ApprovalHandler | undefined): void {
    this.ensureOpen();
    this.rpc.setApprovalHandler(this.id, handler);
  }

  setQuestionHandler(handler: QuestionHandler | undefined): void {
    this.ensureOpen();
    this.rpc.setQuestionHandler(this.id, handler);
  }

  async prompt(input: string | PromptInput): Promise<void> {
    this.ensureOpen();
    await this.rpc.prompt({
      sessionId: this.id,
      input: normalizePromptInput(input),
    });
  }

  async shellExec(
    command: string,
    options: { cwd?: string; timeout?: number } = {},
  ): Promise<ShellExecResult> {
    this.ensureOpen();
    const normalizedCommand = normalizeRequiredString(
      command,
      'Shell command cannot be empty',
      ErrorCodes.REQUEST_INVALID,
    );
    return this.rpc.shellExec({
      sessionId: this.id,
      command: normalizedCommand,
      cwd: options.cwd,
      timeout: options.timeout,
    });
  }

  async steer(input: string | PromptInput): Promise<void> {
    this.ensureOpen();
    await this.rpc.steer({
      sessionId: this.id,
      input: normalizePromptInput(input),
    });
  }

  /**
   * Ask a read-only side question answered from a snapshot of the current
   * conversation context, without entering the main turn flow. The answer
   * is streamed as `btw.*` events (carrying a `queryId` distinct from the
   * main transcript's turnId) and never written to conversation history.
   * Pass a `signal` to abort an in-flight side query (e.g. when the user
   * closes the overlay).
   */
  async askSide(
    query: string,
    options: {
      readonly signal?: AbortSignal;
      readonly queryId?: string;
    } = {},
  ): Promise<{ readonly queryId: string }> {
    this.ensureOpen();
    const normalized = normalizeRequiredString(
      query,
      'Side query cannot be empty',
      ErrorCodes.REQUEST_INVALID,
    );
    const queryId = options.queryId ?? `sdk-btw-${randomUUID()}`;
    await this.rpc.askSide(
      { sessionId: this.id, query: normalized, queryId },
      ...(options.signal !== undefined ? [{ signal: options.signal }] : []),
    );
    return { queryId };
  }

  async cancelSideQuery(queryId: string): Promise<void> {
    this.ensureOpen();
    await this.rpc.cancelSideQuery({ sessionId: this.id, queryId });
  }

  async init(): Promise<void> {
    this.ensureOpen();
    await this.rpc.generateAgentsMd({ sessionId: this.id });
  }

  async cancel(): Promise<void> {
    this.ensureOpen();
    await this.rpc.cancel({ sessionId: this.id });
  }

  async setModel(model: string): Promise<void> {
    this.ensureOpen();
    const normalized = normalizeRequiredString(
      model,
      'Session model cannot be empty',
      ErrorCodes.SESSION_MODEL_EMPTY,
    );
    await this.rpc.setModel({ sessionId: this.id, model: normalized });
  }

  async setThinking(level: string): Promise<void> {
    this.ensureOpen();
    const normalized = normalizeRequiredString(
      level,
      'Session thinking level cannot be empty',
      ErrorCodes.SESSION_THINKING_EMPTY,
    );
    await this.rpc.setThinking({ sessionId: this.id, level: normalized });
  }

  async setPermission(mode: PermissionMode): Promise<void> {
    this.ensureOpen();
    if (!isPermissionMode(mode)) {
      throw new ByfError(
        ErrorCodes.SESSION_PERMISSION_MODE_INVALID,
        'Session permission mode must be yolo, manual, or auto',
      );
    }
    await this.rpc.setPermission({ sessionId: this.id, mode });
  }

  /**
   * Create a new autonomous goal for this session's interactive agent.
   *
   * The goal enters the `active` state and the driver takes over at the end
   * of the current turn. Throws `goal.already_exists` if a goal is already
   * present unless `options.replace` is true.
   *
   * Returns the resulting snapshot (or null if the goal was immediately
   * cleared, which is not the case for create but keeps the type honest).
   */
  async createGoal(
    objective: string,
    options: { replace?: boolean; budget?: GoalBudgetLimits } = {},
  ): Promise<GoalSnapshot | null> {
    this.ensureOpen();
    return this.rpc.createGoal({
      sessionId: this.id,
      objective,
      replace: options.replace,
      budget: options.budget,
    });
  }

  /** Read the current goal snapshot, or null if no goal is present. */
  async getGoal(): Promise<GoalSnapshot | null> {
    this.ensureOpen();
    return this.rpc.getGoal({ sessionId: this.id });
  }

  /** Pause the current goal (soft stop — current turn finishes, then halts). */
  async pauseGoal(): Promise<GoalSnapshot | null> {
    this.ensureOpen();
    return this.rpc.pauseGoal({ sessionId: this.id });
  }

  /** Resume a paused/blocked goal back to active. */
  async resumeGoal(): Promise<GoalSnapshot | null> {
    this.ensureOpen();
    return this.rpc.resumeGoal({ sessionId: this.id });
  }

  /**
   * Cancel the current goal. The driver will abort the active turn at the next
   * boundary and clear goal state; this method returns null once cleared.
   */
  async cancelGoal(): Promise<GoalSnapshot | null> {
    this.ensureOpen();
    return this.rpc.cancelGoal({ sessionId: this.id });
  }

  /**
   * List session-scoped cron tasks with post-jitter nextFireAt (PRD-0023).
   * Used by headless keep-alive to decide whether to hold the event loop.
   * Snapshots include `prompt` and `humanSchedule` for host UIs (PRD-0024).
   */
  async getCronTasks(): Promise<{ tasks: readonly CronTaskSnapshot[] }> {
    this.ensureOpen();
    return this.rpc.getCronTasks({ sessionId: this.id });
  }

  /**
   * Host-privilege delete of a session cron task (PRD-0024 / ADR-0030).
   * Does not go through CronDelete tool permission.
   */
  async deleteCronTask(id: string): Promise<{ deleted: boolean }> {
    this.ensureOpen();
    return this.rpc.deleteCronTask({ sessionId: this.id, id });
  }

  async compact(options: CompactOptions = {}): Promise<void> {
    this.ensureOpen();
    const instruction = normalizeOptionalString(options.instruction);
    await this.rpc.compact({
      sessionId: this.id,
      instruction,
    });
  }

  async cancelCompaction(): Promise<void> {
    this.ensureOpen();
    await this.rpc.cancelCompaction({ sessionId: this.id });
  }

  async getUsage(): Promise<SessionUsage> {
    this.ensureOpen();
    return this.rpc.getUsage({ sessionId: this.id });
  }

  async getStatus(): Promise<SessionStatus> {
    this.ensureOpen();
    return this.rpc.getStatus({ sessionId: this.id });
  }

  async listSkills(): Promise<readonly SkillSummary[]> {
    this.ensureOpen();
    return this.rpc.listSkills({ sessionId: this.id });
  }

  /**
   * List background tasks for this session's interactive agent.
   *
   * Defaults to all tasks (including terminal/lost). Pass
   * `{ activeOnly: true }` to filter to non-terminal entries.
   */
  async listBackgroundTasks(
    options: { activeOnly?: boolean; limit?: number } = {},
  ): Promise<readonly BackgroundTaskInfo[]> {
    this.ensureOpen();
    return this.rpc.listBackgroundTasks({
      sessionId: this.id,
      activeOnly: options.activeOnly,
      limit: options.limit,
    });
  }

  /**
   * Read a background task's captured output. Returns the in-memory
   * ring buffer if available, otherwise falls back to the persisted
   * `<sessionDir>/tasks/<taskId>/output.log`. `tail` caps the returned
   * string to that many trailing characters.
   */
  async getBackgroundTaskOutput(taskId: string, options: { tail?: number } = {}): Promise<string> {
    this.ensureOpen();
    const trimmedTaskId = normalizeRequiredString(
      taskId,
      'Task id cannot be empty',
      ErrorCodes.BACKGROUND_TASK_ID_EMPTY,
    );
    return this.rpc.getBackgroundTaskOutput({
      sessionId: this.id,
      taskId: trimmedTaskId,
      tail: options.tail,
    });
  }

  /**
   * Request a running background task to stop. Sends SIGTERM with a
   * grace period (handled by the core BPM); subscribers receive a
   * `background.task.terminated` event when the kill settles. Calls
   * for unknown or already-terminal task ids are no-ops at the core
   * level — this method does not throw in those cases.
   */
  async stopBackgroundTask(taskId: string, options: { reason?: string } = {}): Promise<void> {
    this.ensureOpen();
    const trimmedTaskId = normalizeRequiredString(
      taskId,
      'Task id cannot be empty',
      ErrorCodes.BACKGROUND_TASK_ID_EMPTY,
    );
    await this.rpc.stopBackgroundTask({
      sessionId: this.id,
      taskId: trimmedTaskId,
      reason: options.reason,
    });
  }

  /**
   * Return the absolute path to the task's `output.log` on disk, or
   * `undefined` when the task is unknown or has no persisted output.
   * Callers can hand the path to an external pager.
   */
  async getBackgroundTaskOutputPath(taskId: string): Promise<string | undefined> {
    this.ensureOpen();
    const trimmedTaskId = normalizeRequiredString(
      taskId,
      'Task id cannot be empty',
      ErrorCodes.BACKGROUND_TASK_ID_EMPTY,
    );
    return this.rpc.getBackgroundTaskOutputPath({
      sessionId: this.id,
      taskId: trimmedTaskId,
    });
  }

  async listMcpServers(): Promise<readonly McpServerInfo[]> {
    this.ensureOpen();
    return this.rpc.listMcpServers({ sessionId: this.id });
  }

  async getMcpStartupMetrics(): Promise<McpStartupMetrics> {
    this.ensureOpen();
    return this.rpc.getMcpStartupMetrics({ sessionId: this.id });
  }

  async reconnectMcpServer(name: string): Promise<void> {
    this.ensureOpen();
    await this.rpc.reconnectMcpServer({ sessionId: this.id, name });
  }

  async activateSkill(name: string, args?: string): Promise<void> {
    this.ensureOpen();
    const skillName = normalizeRequiredString(
      name,
      'Skill name cannot be empty',
      ErrorCodes.SKILL_NAME_EMPTY,
    );
    const skillArgs = normalizeOptionalString(args);
    await this.rpc.activateSkill({
      sessionId: this.id,
      name: skillName,
      args: skillArgs,
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.rpc.closeSession({ sessionId: this.id });
    } finally {
      this.rpc.clearSessionHandlers(this.id);
      await this.onClose?.();
    }
  }

  /**
   * Wait for background tasks to settle before the print/headless run exits
   * (ADR-0029). Unconditional in print mode — does NOT gate on
   * `keepAliveOnExit`. Bounded by `printWaitCeilingS` (default 3600s).
   */
  async waitForBackgroundTasksOnPrint(): Promise<void> {
    if (this.closed) return;
    await this.rpc.waitForBackgroundTasksOnPrint({ sessionId: this.id });
  }

  /**
   * Append an additional workspace root (PRD-0023 `/add-dir`). When
   * `persist` is true, also write project `.byf/local.toml`.
   */
  async addWorkspaceDir(
    dir: string,
    options: { persist?: boolean } = {},
  ): Promise<{
    workspaceDir: string;
    additionalDirs: readonly string[];
    configPath?: string;
  }> {
    this.ensureOpen();
    return this.rpc.addWorkspaceDir({
      sessionId: this.id,
      dir,
      persist: options.persist,
    });
  }

  /** List the main workspace root and additional allowed roots. */
  async getWorkspaceRoots(): Promise<{
    workspaceDir: string;
    additionalDirs: readonly string[];
  }> {
    this.ensureOpen();
    return this.rpc.getWorkspaceRoots({ sessionId: this.id });
  }

  /** @internal */
  emitMetaUpdated(patch: { readonly title?: string }): void {
    this.emit({
      type: 'session.meta.updated',
      sessionId: this.id,
      agentId: MAIN_AGENT_ID,
      title: patch.title,
      patch,
    });
  }

  private emit(event: Event): void {
    this.rpc.receiveEvent(event);
  }

  private ensureOpen(): void {
    if (this.closed) {
      throw new ByfError(ErrorCodes.SESSION_CLOSED, 'Session is closed');
    }
  }
}

function normalizePromptInput(input: string | PromptInput): PromptInput {
  if (typeof input === 'string') {
    if (input.trim().length === 0) {
      throw new ByfError(ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY, 'Prompt input cannot be empty');
    }
    return [{ type: 'text', text: input }];
  }

  if (input.length === 0) {
    throw new ByfError(ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY, 'Prompt input cannot be empty');
  }

  for (const part of input) {
    switch (part.type) {
      case 'text':
        if (part.text.trim().length === 0) {
          throw new ByfError(
            ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY,
            'Prompt input cannot contain empty text parts',
          );
        }
        break;
      case 'image_url':
        if (part.imageUrl.url.trim().length === 0) {
          throw new ByfError(
            ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY,
            'Prompt input cannot contain empty image URLs',
          );
        }
        break;
      case 'video_url':
        if (part.videoUrl.url.trim().length === 0) {
          throw new ByfError(
            ErrorCodes.REQUEST_PROMPT_INPUT_EMPTY,
            'Prompt input cannot contain empty video URLs',
          );
        }
        break;
    }
  }
  return input;
}

function normalizeRequiredString(value: string, message: string, code: ByfErrorCode): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ByfError(code, message);
  }
  return normalized;
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return value === 'yolo' || value === 'manual' || value === 'auto';
}

function resumeStateFromSummary(
  summary: SessionSummary | undefined,
): ResumedSessionState | undefined {
  if (!hasResumeState(summary)) return undefined;
  return {
    sessionMetadata: summary.sessionMetadata,
    agents: summary.agents,
    warning: summary.warning,
  };
}

function hasResumeState(
  summary: SessionSummary | undefined,
): summary is SessionSummary & ResumedSessionState {
  return (
    summary !== undefined &&
    typeof (summary as { readonly sessionMetadata?: unknown }).sessionMetadata === 'object' &&
    (summary as { readonly sessionMetadata?: unknown }).sessionMetadata !== null &&
    typeof (summary as { readonly agents?: unknown }).agents === 'object' &&
    (summary as { readonly agents?: unknown }).agents !== null
  );
}
