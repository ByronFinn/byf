import {
  ByfHarness,
  log,
  type Event,
  type GoalSnapshot,
  type HookResultEvent,
  type Session,
  type SessionStatus,
} from '@byfriends/sdk';

import { isDeadTerminalError } from '#/tui/utils/dead-terminal';

import {
  formatGoalSummaryText,
  goalExitCode,
  goalSummaryJson,
  parseHeadlessGoalCreate,
  type HeadlessGoalCreate,
} from './goal-prompt';
import { finalizeHeadlessRun } from './headless-exit';
import type { CLIOptions, PromptOutputFormat } from './options';
import { createByfHostIdentity } from './version';

interface PromptOutput {
  readonly columns?: number;
  write(chunk: string): boolean;
}

interface PromptRunIO {
  readonly stdout?: PromptOutput;
  readonly stderr?: PromptOutput;
  readonly process?: PromptProcess;
}

interface PromptProcess {
  once(signal: NodeJS.Signals, listener: () => Promise<void>): unknown;
  off(signal: NodeJS.Signals, listener: () => Promise<void>): unknown;
  exit(code?: number): never | void;
}

const PROMPT_UI_MODE = 'print';
const PROMPT_MAIN_AGENT_ID = 'main';
const PROMPT_BLOCK_BULLET = '• ';
const PROMPT_BLOCK_INDENT = '  ';

export async function runPrompt(
  opts: CLIOptions,
  version: string,
  io: PromptRunIO = {},
): Promise<void> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const promptProcess = io.process ?? process;
  const workDir = process.cwd();
  const harness = new ByfHarness({
    identity: createByfHostIdentity(version),
    uiMode: PROMPT_UI_MODE,
    skillDirs: opts.skillsDirs,
  });
  log.info('byf starting', {
    version,
    uiMode: PROMPT_UI_MODE,
    nodeVersion: process.version,
    platform: `${process.platform}/${process.arch}`,
    workDir,
  });
  let restorePromptSessionPermission = async (): Promise<void> => {};
  let removeTerminationCleanup: (() => void) | undefined;
  let cleanupPromise: Promise<void> | undefined;
  const cleanupPromptRun = async (): Promise<void> => {
    cleanupPromise ??= (async () => {
      removeTerminationCleanup?.();
      try {
        await restorePromptSessionPermission();
      } finally {
        await harness.close();
      }
    })();
    await cleanupPromise;
  };
  removeTerminationCleanup = installPromptTerminationCleanup(promptProcess, cleanupPromptRun);

  try {
    await harness.ensureConfigFile();
    const config = await harness.getConfig();
    const { session, restorePermission } = await resolvePromptSession(
      harness,
      opts,
      workDir,
      config.defaultModel,
      stderr,
      (restorePermission) => {
        restorePromptSessionPermission = restorePermission;
      },
    );
    restorePromptSessionPermission = restorePermission;

    const outputFormat = opts.outputFormat ?? 'text';
    // Headless goal mode: `byf -p "/goal <objective>"`.
    const goalCreate = parseHeadlessGoalCreate(opts.prompt!);
    if (goalCreate !== undefined) {
      await runHeadlessGoal(session, goalCreate, outputFormat, stdout, stderr);
    } else {
      await runPromptTurn(session, opts.prompt!, outputFormat, stdout, stderr);
    }
    writeResumeHint(session.id, outputFormat, stdout, stderr);
  } finally {
    await cleanupPromptRun();
    // Drain stdio + arm unref'd force-exit so a leaked handle cannot hang `-p`.
    await finalizeHeadlessRun(promptProcess, [process.stdout, process.stderr], () =>
      typeof process.exitCode === 'number' ? process.exitCode : 0,
    );
  }
}

async function runHeadlessGoal(
  session: Session,
  goal: HeadlessGoalCreate,
  outputFormat: PromptOutputFormat,
  stdout: PromptOutput,
  stderr: PromptOutput,
): Promise<void> {
  await session.createGoal(goal.objective, { replace: goal.replace });
  let completedSnapshot: GoalSnapshot | null = null;
  const unsubscribeGoalEvents = session.onEvent((event) => {
    if (
      event.type === 'goal.updated' &&
      event.agentId === 'main' &&
      event.change?.kind === 'completion' &&
      event.snapshot !== null
    ) {
      completedSnapshot = event.snapshot;
    }
  });
  try {
    await runPromptTurn(session, goal.objective, outputFormat, stdout, stderr);
  } finally {
    unsubscribeGoalEvents();
    const snapshot = completedSnapshot ?? (await session.getGoal());
    if (outputFormat === 'stream-json') {
      stdout.write(`${JSON.stringify(goalSummaryJson(snapshot))}\n`);
    } else {
      stderr.write(`${formatGoalSummaryText(snapshot)}\n`);
    }
    if (snapshot !== null && snapshot.status !== 'complete') {
      process.exitCode = goalExitCode(snapshot.status);
    }
  }
}

interface ResolvedPromptSession {
  readonly session: Session;
  readonly resumed: boolean;
  readonly restorePermission: () => Promise<void>;
}

async function resolvePromptSession(
  harness: ByfHarness,
  opts: CLIOptions,
  workDir: string,
  defaultModel: string | undefined,
  stderr: PromptOutput,
  setRestorePermission: (restorePermission: () => Promise<void>) => void,
): Promise<ResolvedPromptSession> {
  const resumeId =
    opts.session ??
    (opts.continue ? await mostRecentSessionId(harness, workDir, stderr) : undefined);

  if (resumeId !== undefined) {
    return resumePromptSession(harness, resumeId, opts, setRestorePermission);
  }

  const model = requireConfiguredModel(opts.model, defaultModel);
  const session = await harness.createSession({
    workDir,
    model,
    permission: 'auto',
    ...(opts.addDirs.length > 0 ? { additionalDirs: opts.addDirs } : {}),
  });
  installHeadlessHandlers(session);
  return { session, resumed: false, restorePermission: async () => {} };
}

async function mostRecentSessionId(
  harness: ByfHarness,
  workDir: string,
  stderr: PromptOutput,
): Promise<string | undefined> {
  const sessions = await harness.listSessions({ workDir });
  const previous = sessions[0];
  if (previous === undefined) {
    stderr.write(`No sessions to continue under "${workDir}"; starting a fresh session.\n`);
    return undefined;
  }
  return previous.id;
}

async function resumePromptSession(
  harness: ByfHarness,
  sessionId: string,
  opts: CLIOptions,
  setRestorePermission: (restorePermission: () => Promise<void>) => void,
): Promise<ResolvedPromptSession> {
  const session = await harness.resumeSession({ id: sessionId });
  const status = await session.getStatus();
  const restorePermission = await forcePromptPermission(
    session,
    status.permission,
    setRestorePermission,
  );
  if (opts.model !== undefined) {
    await session.setModel(opts.model);
  }
  installHeadlessHandlers(session);
  return { session, resumed: true, restorePermission };
}

async function forcePromptPermission(
  session: Session,
  previousPermission: SessionStatus['permission'],
  setRestorePermission: (restorePermission: () => Promise<void>) => void,
): Promise<() => Promise<void>> {
  let overridePermission: Promise<void> | undefined;
  const restorePermission = async () => {
    await overridePermission?.catch(() => {});
    if (previousPermission !== 'auto') {
      await session.setPermission(previousPermission);
    }
  };
  setRestorePermission(restorePermission);
  if (previousPermission !== 'auto') {
    overridePermission = session.setPermission('auto');
    await overridePermission;
  }
  return restorePermission;
}

function requireConfiguredModel(...models: readonly (string | undefined)[]): string {
  const model = configuredModel(...models);
  if (model === undefined) {
    throw new Error(
      'No model configured. Run `byf` and use /login or /connect to configure a provider, then retry; or set default_model in config.toml.',
    );
  }
  return model;
}

function configuredModel(...models: readonly (string | undefined)[]): string | undefined {
  return models.find((model) => model !== undefined && model.trim().length > 0);
}

function installHeadlessHandlers(session: Session): void {
  session.setApprovalHandler(() => ({ decision: 'approved' }));
  session.setQuestionHandler(() => null);
}

function installPromptTerminationCleanup(
  promptProcess: PromptProcess,
  cleanup: () => Promise<void>,
): () => void {
  let terminating = false;

  const emergencyExit = (): void => {
    promptProcess.exit(129);
  };

  const exitAfterCleanup = async (signal: NodeJS.Signals): Promise<void> => {
    if (terminating) return;
    terminating = true;
    try {
      await cleanup();
    } finally {
      promptProcess.exit(signalExitCode(signal));
    }
  };
  const onSigint = () => exitAfterCleanup('SIGINT');
  const onSigterm = () => exitAfterCleanup('SIGTERM');
  promptProcess.once('SIGINT', onSigint);
  promptProcess.once('SIGTERM', onSigterm);

  let onSighup: (() => void) | undefined;
  if (process.platform !== 'win32') {
    onSighup = () => {
      emergencyExit();
    };
    process.prependListener('SIGHUP', onSighup);
  }

  const terminalErrorHandler = (error: Error): void => {
    if (isDeadTerminalError(error)) {
      emergencyExit();
    }
  };
  process.stdout.on('error', terminalErrorHandler);
  process.stderr.on('error', terminalErrorHandler);

  return () => {
    promptProcess.off('SIGINT', onSigint);
    promptProcess.off('SIGTERM', onSigterm);
    if (onSighup !== undefined) {
      process.off('SIGHUP', onSighup);
    }
    process.stdout.off('error', terminalErrorHandler);
    process.stderr.off('error', terminalErrorHandler);
  };
}

function signalExitCode(signal: NodeJS.Signals): number {
  return signal === 'SIGINT' ? 130 : 143;
}

function runPromptTurn(
  session: Session,
  prompt: string,
  outputFormat: PromptOutputFormat,
  stdout: PromptOutput,
  stderr: PromptOutput,
): Promise<void> {
  let activeTurnId: number | undefined;
  let activeAgentId: string | undefined;
  const outputWriter =
    outputFormat === 'stream-json'
      ? new PromptJsonWriter(stdout)
      : new PromptTranscriptWriter(stdout, stderr);
  let settled = false;
  let unsubscribe: (() => void) | undefined;
  // Hold the event loop while goal is active or cron has a future fire.
  // Cron scheduler ticks are unref'd; without a ref'd handle the process
  // would drain and exit before the next turn is steered.
  let keepAliveTimer: ReturnType<typeof setInterval> | undefined;
  const holdEventLoop = (): void => {
    keepAliveTimer ??= setInterval(() => {}, 60_000);
  };
  const releaseEventLoop = (): void => {
    if (keepAliveTimer === undefined) return;
    clearInterval(keepAliveTimer);
    keepAliveTimer = undefined;
  };

  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      releaseEventLoop();
      unsubscribe?.();
      outputWriter.finish();
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    };

    // Dual-trigger completion (ADR-0029): turn.ended and terminal goal.updated.
    // Order: active goal → cron nextFireAt → wait background → settle.
    const evaluateRunCompletion = async (): Promise<void> => {
      try {
        const goal = await session.getGoal();
        if (settled || activeTurnId !== undefined) return;
        if (goal?.status === 'active') {
          holdEventLoop();
          return;
        }
        const { tasks } = await session.getCronTasks();
        if (settled || activeTurnId !== undefined) return;
        if (tasks.some((task) => task.nextFireAt !== null)) {
          holdEventLoop();
          return;
        }
        await finishCompletedTurn();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };

    unsubscribe = session.onEvent((event) => {
      if (event.type === 'error') {
        if (event.agentId !== PROMPT_MAIN_AGENT_ID) {
          return;
        }
        finish(new Error(`${event.code}: ${event.message}`));
        return;
      }
      if (event.type === 'turn.started' && activeTurnId === undefined) {
        if (event.agentId !== PROMPT_MAIN_AGENT_ID) {
          return;
        }
        activeTurnId = event.turnId;
        activeAgentId = event.agentId;
        return;
      }
      if (
        event.type === 'goal.updated' &&
        event.agentId === PROMPT_MAIN_AGENT_ID &&
        activeTurnId === undefined &&
        event.snapshot !== null &&
        event.snapshot.status !== 'active'
      ) {
        void evaluateRunCompletion();
        return;
      }
      if (
        activeTurnId === undefined ||
        activeAgentId === undefined ||
        !hasTurnId(event) ||
        event.turnId !== activeTurnId ||
        event.agentId !== activeAgentId
      ) {
        return;
      }
      switch (event.type) {
        case 'turn.step.started':
        case 'turn.step.interrupted':
          outputWriter.flushAssistant();
          return;
        case 'turn.step.retrying':
          outputWriter.discardAssistant();
          return;
        case 'assistant.delta':
          outputWriter.writeAssistantDelta(event.delta);
          return;
        case 'hook.result':
          outputWriter.writeHookResult(event);
          return;
        case 'thinking.delta':
          outputWriter.writeThinkingDelta(event.delta);
          return;
        case 'tool.call.started':
          outputWriter.writeToolCall(event.toolCallId, event.name, event.args);
          return;
        case 'tool.call.delta':
          outputWriter.writeToolCallDelta(event.toolCallId, event.name, event.argumentsPart);
          return;
        case 'tool.result':
          outputWriter.writeToolResult(event.toolCallId, event.output);
          return;
        case 'tool.progress':
          if (event.update.text !== undefined && event.update.text.length > 0) {
            stderr.write(
              event.update.text.endsWith('\n') ? event.update.text : `${event.update.text}\n`,
            );
          }
          return;
        case 'turn.ended':
          if (event.reason === 'completed') {
            outputWriter.flushAssistant();
            activeTurnId = undefined;
            activeAgentId = undefined;
            void evaluateRunCompletion();
            return;
          }
          finish(new Error(formatTurnEndedFailure(event)));
          return;
        case 'agent.status.updated':
        case 'background.task.started':
        case 'background.task.terminated':
        case 'background.task.updated':
        case 'btw.completed':
        case 'btw.delta':
        case 'btw.failed':
        case 'btw.started':
        case 'compaction.blocked':
        case 'compaction.cancelled':
        case 'compaction.completed':
        case 'compaction.started':
        case 'cron.fired':
        case 'goal.updated':
        case 'mcp.server.status':
        case 'observation_masking.applied':
        case 'pruning.applied':
        case 'session.meta.updated':
        case 'skill.activated':
        case 'subagent.completed':
        case 'subagent.failed':
        case 'subagent.spawned':
        case 'tool.list.updated':
        case 'turn.started':
        case 'turn.step.completed':
        case 'warning':
          return;
      }
    });

    session.prompt(prompt).catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });

    async function finishCompletedTurn(): Promise<void> {
      outputWriter.flushAssistant();
      try {
        await session.waitForBackgroundTasksOnPrint();
      } catch (error) {
        log.warn('waitForBackgroundTasksOnPrint failed', { error });
      }
      // Non-zero exit when background tasks remain after ceiling (AC-H1).
      try {
        const remaining = await session.listBackgroundTasks({ activeOnly: true });
        if (remaining.length > 0) {
          process.exitCode =
            process.exitCode === undefined || process.exitCode === 0 ? 1 : process.exitCode;
        }
      } catch {
        // list may not exist on older paths — ignore
      }
      finish();
    }
  });
}

interface PromptTurnWriter {
  writeAssistantDelta(delta: string): void;
  writeHookResult(event: HookResultEvent): void;
  writeThinkingDelta(delta: string): void;
  writeToolCall(toolCallId: string, name: string, args: unknown): void;
  writeToolCallDelta(
    toolCallId: string,
    name: string | undefined,
    argumentsPart: string | undefined,
  ): void;
  writeToolResult(toolCallId: string, output: unknown): void;
  flushAssistant(): void;
  discardAssistant(): void;
  finish(): void;
}

class PromptTranscriptWriter implements PromptTurnWriter {
  private readonly assistantWriter: PromptBlockWriter;
  private readonly thinkingWriter: PromptBlockWriter;

  constructor(stdout: PromptOutput, stderr: PromptOutput) {
    this.assistantWriter = new PromptBlockWriter(stdout);
    this.thinkingWriter = new PromptBlockWriter(stderr);
  }

  writeAssistantDelta(delta: string): void {
    this.thinkingWriter.finish();
    this.assistantWriter.write(delta);
  }

  writeHookResult(event: HookResultEvent): void {
    this.thinkingWriter.finish();
    this.assistantWriter.finish();
    this.assistantWriter.write(formatHookResultPlain(event));
    this.assistantWriter.finish();
  }

  writeThinkingDelta(delta: string): void {
    this.thinkingWriter.write(delta);
  }

  writeToolCall(): void {}

  writeToolCallDelta(): void {}

  writeToolResult(): void {}

  flushAssistant(): void {}

  discardAssistant(): void {}

  finish(): void {
    this.thinkingWriter.finish();
    this.assistantWriter.finish();
  }
}

interface PromptJsonToolCall {
  type: 'function';
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface PromptJsonAssistantMessage {
  role: 'assistant';
  content?: string;
  tool_calls?: PromptJsonToolCall[];
}

interface PromptJsonToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

interface PromptJsonResumeMetaMessage {
  role: 'meta';
  type: 'session.resume_hint';
  session_id: string;
  command: string;
  content: string;
}

function writeResumeHint(
  sessionId: string,
  outputFormat: PromptOutputFormat,
  stdout: PromptOutput,
  stderr: PromptOutput,
): void {
  const command = `byf -r ${sessionId}`;
  const content = `To resume this session: ${command}`;
  if (outputFormat === 'stream-json') {
    const message: PromptJsonResumeMetaMessage = {
      role: 'meta',
      type: 'session.resume_hint',
      session_id: sessionId,
      command,
      content,
    };
    stdout.write(`${JSON.stringify(message)}\n`);
    return;
  }
  stderr.write(`${content}\n`);
}

class PromptJsonWriter implements PromptTurnWriter {
  private assistantText = '';
  private readonly toolCalls: PromptJsonToolCall[] = [];

  constructor(private readonly stdout: PromptOutput) {}

  writeAssistantDelta(delta: string): void {
    this.assistantText += delta;
  }

  writeHookResult(event: HookResultEvent): void {
    this.flushAssistant();
    this.writeJsonLine({
      role: 'assistant',
      content: formatHookResultPlain(event),
    });
  }

  writeThinkingDelta(): void {}

  writeToolCall(toolCallId: string, name: string, args: unknown): void {
    const existing = this.toolCalls.find((toolCall) => toolCall.id === toolCallId);
    if (existing !== undefined) {
      existing.function.name = name;
      existing.function.arguments = stringifyJsonValue(args);
      return;
    }
    this.toolCalls.push({
      type: 'function',
      id: toolCallId,
      function: {
        name,
        arguments: stringifyJsonValue(args),
      },
    });
  }

  writeToolCallDelta(
    toolCallId: string,
    name: string | undefined,
    argumentsPart: string | undefined,
  ): void {
    const toolCall = this.findOrCreateToolCall(toolCallId, name ?? '');
    if (name !== undefined) {
      toolCall.function.name = name;
    }
    if (argumentsPart !== undefined) {
      toolCall.function.arguments += argumentsPart;
    }
  }

  writeToolResult(toolCallId: string, output: unknown): void {
    this.flushAssistant();
    this.writeJsonLine({
      role: 'tool',
      tool_call_id: toolCallId,
      content: stringifyToolOutput(output),
    });
  }

  flushAssistant(): void {
    if (this.assistantText.length === 0 && this.toolCalls.length === 0) return;
    const message: PromptJsonAssistantMessage = {
      role: 'assistant',
      content: this.assistantText.length > 0 ? this.assistantText : undefined,
      tool_calls: this.toolCalls.length > 0 ? [...this.toolCalls] : undefined,
    };
    this.writeJsonLine(message);
    this.discardAssistant();
  }

  discardAssistant(): void {
    this.assistantText = '';
    this.toolCalls.length = 0;
  }

  finish(): void {
    this.flushAssistant();
  }

  private findOrCreateToolCall(toolCallId: string, name: string): PromptJsonToolCall {
    const existing = this.toolCalls.find((toolCall) => toolCall.id === toolCallId);
    if (existing !== undefined) return existing;
    const toolCall: PromptJsonToolCall = {
      type: 'function',
      id: toolCallId,
      function: {
        name,
        arguments: '',
      },
    };
    this.toolCalls.push(toolCall);
    return toolCall;
  }

  private writeJsonLine(message: PromptJsonAssistantMessage | PromptJsonToolMessage): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

class PromptBlockWriter {
  private started = false;
  private atLineStart = false;
  private lineWidth = 0;
  private readonly wrapWidth: number | undefined;

  constructor(private readonly output: PromptOutput) {
    this.wrapWidth =
      typeof output.columns === 'number' && output.columns > PROMPT_BLOCK_INDENT.length + 1
        ? output.columns
        : undefined;
  }

  write(chunk: string): void {
    if (chunk.length === 0) return;
    let rendered = this.start();
    for (const char of chunk) {
      if (this.atLineStart && char !== '\n') {
        rendered += PROMPT_BLOCK_INDENT;
        this.atLineStart = false;
        this.lineWidth = PROMPT_BLOCK_INDENT.length;
      }
      const charWidth = visibleCharWidth(char);
      if (
        this.wrapWidth !== undefined &&
        !this.atLineStart &&
        char !== '\n' &&
        this.lineWidth + charWidth > this.wrapWidth
      ) {
        rendered += `\n${PROMPT_BLOCK_INDENT}`;
        this.lineWidth = PROMPT_BLOCK_INDENT.length;
      }
      rendered += char;
      if (char === '\n') {
        this.atLineStart = true;
        this.lineWidth = 0;
      } else {
        this.lineWidth += charWidth;
      }
    }
    this.output.write(rendered);
  }

  finish(): void {
    if (!this.started) return;
    this.output.write(this.atLineStart ? '\n' : '\n\n');
    this.started = false;
    this.atLineStart = false;
    this.lineWidth = 0;
  }

  private start(): string {
    if (this.started) return '';
    this.started = true;
    this.atLineStart = false;
    this.lineWidth = PROMPT_BLOCK_BULLET.length;
    return PROMPT_BLOCK_BULLET;
  }
}

function visibleCharWidth(char: string): number {
  return char === '\t' ? 4 : 1;
}

function formatHookResultPlain(event: HookResultEvent): string {
  return `${formatHookResultTitle(event)}\n\n${formatHookResultBody(event)}`;
}

function formatHookResultTitle(event: HookResultEvent): string {
  return `${event.hookEvent} hook${event.blocked === true ? ' blocked' : ''}`;
}

function formatHookResultBody(event: HookResultEvent): string {
  const content = event.content.trim();
  return content.length === 0 ? '(empty)' : content;
}

function stringifyJsonValue(value: unknown): string {
  if (typeof value === 'string') return value;
  const json = JSON.stringify(value);
  return json ?? '';
}

function stringifyToolOutput(output: unknown): string {
  if (typeof output === 'string') return output;
  const json = JSON.stringify(output);
  return json ?? String(output);
}

function hasTurnId(event: Event): event is Event & { readonly turnId: number } {
  return 'turnId' in event;
}

function formatTurnEndedFailure(event: Extract<Event, { type: 'turn.ended' }>): string {
  if (event.error !== undefined) return `${event.error.code}: ${event.error.message}`;
  return `Prompt turn ended with reason: ${event.reason}`;
}
