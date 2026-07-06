import type { Agent } from '..';
import { ByfError, ErrorCodes } from '../../errors';
import type { AgentRecord } from '../records/types';
import type { RecordRestoreHandler } from '../restore-handler';
import { MAX_GOAL_OBJECTIVE_LENGTH } from './constants';
import type {
  GoalBudgetLimits,
  GoalBudgetReport,
  GoalChange,
  GoalSnapshot,
  GoalStatus,
  GoalTurnTokens,
  GoalUsage,
} from './types';

export * from './constants';
export * from './types';

/**
 * goal 模式的持久化状态机子系统（PRD-0019）。
 *
 * 持有 active/paused/blocked 持久化状态 + complete 瞬态。每个变更操作：
 * - logRecord 一条 wire record（replay 时 AgentRecords._restoring 抑制写入）。
 * - emit `goal.updated` 事件（replay 时 Agent.emitEvent 自带 _restoring 抑制）。
 *
 * complete 是瞬态：markComplete 只置瞬态 + emit completion change；
 * clear 由 driver 在 turn 边界调 clearInternal 完成（关键技术发现 #7 / ADR-0024）。
 *
 * 本类只管状态；续跑驱动（#201）、工具（#202）、注入（#201）在别处。
 */
export class GoalMode implements RecordRestoreHandler {
  /** 当前持久化快照；absent 时为 null。complete 瞬态另存。 */
  private snapshot: GoalSnapshot | null = null;
  /** complete 瞬态（markComplete 后、clearInternal 前）。否则 undefined。 */
  private completeReason: string | undefined;
  /**
   * wall-clock 计时锚点（ms 时间戳）。goal 处于 active 时为 Date.now()，
   * 离开 active（pause/blocked/complete/clear）时折叠进 wallClockMs 并置 undefined。
   * replay 后清零（旧锚点无意义），由 normalizeAfterReplay 处理。
   */
  private wallClockResumedAt: number | undefined;

  constructor(private readonly agent: Agent) {}

  // —— 查询 ——

  /** 当前快照。complete 瞬态期间返回 status='complete' 的派生快照。 */
  getSnapshot(): GoalSnapshot | null {
    if (this.snapshot === null) return null;
    if (this.completeReason !== undefined) {
      return { ...this.snapshot, status: 'complete' };
    }
    return this.snapshot;
  }

  // —— 变更操作 ——

  /** absent → active（含 replace 语义）。 */
  createGoal(
    objective: string,
    options: { replace?: boolean; budget?: GoalBudgetLimits } = {},
  ): void {
    validateObjective(objective);
    validateBudget(options.budget);
    const trimmed = objective.trim();

    if (this.snapshot !== null) {
      if (!options.replace) {
        throw new ByfError(
          ErrorCodes.GOAL_ALREADY_EXISTS,
          'A goal already exists; use replace to overwrite or cancel first.',
        );
      }
      // replace = 原子 cancel 旧 + create 新。
      // 旧 goal 不走 completion 路径（不发 completion change）。
      this.clearToAbsent();
    }

    const now = Date.now();
    const next: GoalSnapshot = {
      objective: trimmed,
      status: 'active',
      budget: options.budget ?? {},
      usage: { turns: 0, tokens: 0, wallClockMs: 0 },
      createdAt: now,
    };
    this.snapshot = next;
    this.completeReason = undefined;
    // 进 active 锚定 wall-clock。
    this.wallClockResumedAt = now;
    // goal.create 含 objective + budget + createdAt（见 restoreRecord 重建），
    // 不再额外发 goal.update——初始 snapshot 由 goal.create 携带。
    this.agent.records.logRecord({
      type: 'goal.create',
      objective: trimmed,
      budget: options.budget,
      createdAt: now,
    });
    this.emitGoalUpdated(next);
  }

  /** active → paused（软停，置状态）。 */
  pause(): void {
    this.requireGoal();
    this.transitionTo('paused', { pausedReason: 'paused by user' });
  }

  /** paused/blocked → active。 */
  resume(): void {
    const current = this.requireGoal();
    if (current.status !== 'paused' && current.status !== 'blocked') {
      throw new ByfError(
        ErrorCodes.GOAL_NOT_RESUMABLE,
        `Goal status is ${current.status}; resume is only valid for paused/blocked.`,
      );
    }
    this.transitionTo('active', {});
  }

  /** 任意持久化态 → absent（cancel 硬停由 driver 调 abort，本方法只 clear 状态）。 */
  cancel(): void {
    this.requireGoal();
    this.clearToAbsent();
  }

  /** active → complete 瞬态；emit completion change。clear 由 driver 边界调 clearInternal。 */
  markComplete(reason?: string): void {
    const current = this.requireGoal();
    if (current.status !== 'active') {
      throw new ByfError(
        ErrorCodes.GOAL_STATUS_INVALID,
        `Cannot complete a goal in status ${current.status}.`,
      );
    }
    this.completeReason = reason;
    // 离开 active 折叠 wall-clock，落盘反映真实累积。
    const usage = this.foldWallClockIfLeavingActive(current);
    this.snapshot = { ...current, usage };
    this.agent.records.logRecord({ type: 'goal.update', snapshot: this.snapshot });
    // emit completion change，status 反映 complete 瞬态档。
    this.emitGoalUpdated(this.getSnapshot(), { kind: 'completion', reason });
  }

  /** → blocked。 */
  markBlocked(reason: string): void {
    this.transitionTo('blocked', { blockedReason: reason }, { kind: 'blocked', reason });
  }

  /** → paused（driver 用于 interrupt/replay 降级，区别于用户 pause）。 */
  markPaused(reason: string): void {
    this.transitionTo('paused', { pausedReason: reason });
  }

  /** complete → absent（driver 边界调）。 */
  clearInternal(): void {
    if (this.snapshot === null) return;
    this.clearToAbsent();
    this.completeReason = undefined;
  }

  /**
   * 部分更新 budget（PRD-0019 #202 SetGoalBudget 工具用）。
   * 未传字段保留原值（不清零）。校验同 createGoal。
   * 不改 status / objective / usage，写 goal.update + emit。
   */
  setBudget(patch: GoalBudgetLimits): void {
    const current = this.requireGoal();
    validateBudget(patch);
    const merged: GoalBudgetLimits = {
      turnBudget: patch.turnBudget ?? current.budget.turnBudget,
      tokenBudget: patch.tokenBudget ?? current.budget.tokenBudget,
      wallClockBudgetMs: patch.wallClockBudgetMs ?? current.budget.wallClockBudgetMs,
    };
    const next: GoalSnapshot = { ...current, budget: merged };
    this.snapshot = next;
    this.agent.records.logRecord({ type: 'goal.update', snapshot: next });
    this.emitGoalUpdated(next);
  }

  // —— 预算（#200 仅占位计数；详细计算在 AC-5 完善） ——

  incrementTurn(): void {
    if (this.snapshot === null) return;
    const next: GoalSnapshot = {
      ...this.snapshot,
      usage: { ...this.snapshot.usage, turns: this.snapshot.usage.turns + 1 },
    };
    this.snapshot = next;
    // PRD N3：计步 silent（不 emit 事件），但仍写 record 保证 replay 一致。
    this.agent.records.logRecord({ type: 'goal.update', snapshot: next });
  }

  addTokenUsage(turn: GoalTurnTokens): void {
    if (this.snapshot === null) return;
    const tokens = turn.input + turn.output;
    const next: GoalSnapshot = {
      ...this.snapshot,
      usage: { ...this.snapshot.usage, tokens: this.snapshot.usage.tokens + tokens },
    };
    this.snapshot = next;
    // PRD N3：计步 silent（不 emit 事件），但仍写 record 保证 replay 一致。
    this.agent.records.logRecord({ type: 'goal.update', snapshot: next });
  }

  /**
   * 显式 emit 一次当前 snapshot 的用量更新（PRD R12：计步默认 silent，driver 想更新 UI 时调）。
   * 不带 change（纯用量更新，非生命周期变化）。无 goal 时 no-op。
   *
   * active 期间 snapshot.usage.wallClockMs 只在离开 active 时折叠（foldWallClockIfLeavingActive），
   * 故 steady-state 下读出来恒为 0。这里 emit 时把 live wall-clock 叠进 snapshot，使 footer
   * 的 elapsed 能实时增长——口径与 computeBudgetReport 一致。落盘 record 仍写折叠后的累积值
   * （replay 一致性靠 record，不靠事件）。
   */
  emitUsageUpdate(): void {
    if (this.snapshot === null) return;
    const snapshot =
      this.snapshot.status === 'active' && this.wallClockResumedAt !== undefined
        ? {
            ...this.snapshot,
            usage: {
              ...this.snapshot.usage,
              wallClockMs: this.getLiveWallClockMs(),
            },
          }
        : this.snapshot;
    this.emitGoalUpdated(snapshot);
  }

  /**
   * active 期间的实时墙钟（ms）：累积 wallClockMs + 当前未折叠区间。
   * 非 active（或无 goal）时返回已折叠的累积 wallClockMs。
   * driver mid-turn 据此判断是否超 wall-clock budget。
   */
  getLiveWallClockMs(): number {
    const snapshot = this.snapshot;
    if (snapshot === null) return 0;
    const accumulated = snapshot.usage.wallClockMs;
    if (this.wallClockResumedAt === undefined) return accumulated;
    return accumulated + (Date.now() - this.wallClockResumedAt);
  }

  /** 计算预算报告：wall-clock 用 live 值（mid-turn 实时判断超限）。 */
  computeBudgetReport(): GoalBudgetReport {
    const snapshot = this.snapshot;
    if (snapshot === null) {
      return {
        limits: {},
        usage: { turns: 0, tokens: 0, wallClockMs: 0 },
        overBudget: false,
        exceededDimensions: [],
      };
    }
    const liveUsage: GoalUsage = { ...snapshot.usage, wallClockMs: this.getLiveWallClockMs() };
    return computeReport(snapshot.budget, liveUsage);
  }

  // —— replay ——

  restoreRecord(record: AgentRecord): void {
    // oxlint-disable-next-line typescript(switch-exhaustiveness-check) -- restoreRecord only restores goal.* records
    switch (record.type) {
      case 'goal.create':
        // goal.create 含 objective/budget/createdAt——重建初始 active snapshot。
        this.snapshot = {
          objective: record.objective,
          status: 'active',
          budget: record.budget ?? {},
          usage: { turns: 0, tokens: 0, wallClockMs: 0 },
          createdAt: record.createdAt,
        };
        this.completeReason = undefined;
        break;
      case 'goal.update':
        // goal.update 携带完整 snapshot——直接覆盖（含 usage/budget 演进）。
        this.snapshot = record.snapshot;
        break;
      case 'goal.clear':
        this.snapshot = null;
        this.completeReason = undefined;
        break;
    }
  }

  /**
   * replay 完成后的状态修正（PRD R9）。
   * - wall-clock 锚点清零：进程重启后旧 wallClockResumedAt 时间戳无意义，
   *   但保留 snapshot.usage.wallClockMs 累积值（budget 不因重启赠送）。
   * - active → paused（reason `Paused after agent resume`）：进程中断后无法
   *   确认是否真的在推进，保守降级，等用户显式 resume。
   *
   * 注意：此方法在 `records.replay()` 返回后调用（见 Agent.resume），此时
   * `AgentRecords._restoring` 已为 false，故降级 record 会真正写 wire——
   * 这是预期行为，保证后续 fork/replay 看到一致的 paused 状态。
   * - complete → 清空（瞬态本就该 clear，进程重启时兜底）。
   * - paused/blocked 保留。
   * - absent 保留。
   */
  normalizeAfterReplay(): void {
    this.wallClockResumedAt = undefined;
    if (this.snapshot === null) return;
    if (this.completeReason !== undefined) {
      // complete 瞬态残留——清空。
      this.snapshot = null;
      this.completeReason = undefined;
      return;
    }
    if (this.snapshot.status === 'active') {
      const next: GoalSnapshot = {
        ...this.snapshot,
        status: 'paused',
        pausedReason: 'Paused after agent resume',
      };
      this.snapshot = next;
      // 落盘降级 record，使 wire 与内存一致（resume 后的后续 fork/replay 据此）。
      this.agent.records.logRecord({ type: 'goal.update', snapshot: next });
    }
  }

  // —— 内部 ——

  private transitionTo(
    status: GoalStatus,
    patch: { pausedReason?: string; blockedReason?: string },
    change?: GoalChange,
  ): void {
    const current = this.requireGoal();
    const usage = this.foldWallClockIfLeavingActive(current);
    const next: GoalSnapshot = {
      ...current,
      usage,
      status,
      pausedReason: patch.pausedReason,
      blockedReason: patch.blockedReason,
    };
    this.snapshot = next;
    // 进入 active 重新锚定 wall-clock。
    if (status === 'active') {
      this.wallClockResumedAt = Date.now();
    }
    this.agent.records.logRecord({ type: 'goal.update', snapshot: next });
    this.emitGoalUpdated(next, change);
  }

  /** 写 goal.clear record 并清空 snapshot；emit null。 */
  private clearToAbsent(): void {
    if (this.snapshot !== null) {
      // 离开 active 折叠 wall-clock（落盘的 usage 反映真实累积）。
      this.snapshot = { ...this.snapshot, usage: this.foldWallClockIfLeavingActive(this.snapshot) };
    }
    this.wallClockResumedAt = undefined;
    this.snapshot = null;
    this.agent.records.logRecord({ type: 'goal.clear' });
    this.emitGoalUpdated(null);
  }

  private requireGoal(): GoalSnapshot {
    if (this.snapshot === null) {
      throw new ByfError(ErrorCodes.GOAL_NOT_FOUND, 'No active goal.');
    }
    return this.snapshot;
  }

  /**
   * 若当前处于 active（有锚点），把 now-锚点 折叠进 wallClockMs 并清锚点，返回更新后的 usage。
   * 非 active 时返回原 usage 不变。调用方据此构造落盘 snapshot。
   */
  private foldWallClockIfLeavingActive(current: GoalSnapshot): GoalUsage {
    if (this.wallClockResumedAt === undefined) return current.usage;
    const elapsed = Date.now() - this.wallClockResumedAt;
    this.wallClockResumedAt = undefined;
    return { ...current.usage, wallClockMs: current.usage.wallClockMs + elapsed };
  }

  protected emitGoalUpdated(snapshot: GoalSnapshot | null, change?: GoalChange): void {
    this.agent.emitEvent({ type: 'goal.updated', snapshot, change });
  }
}

function validateObjective(objective: string): void {
  if (typeof objective !== 'string' || objective.trim().length === 0) {
    throw new ByfError(ErrorCodes.GOAL_OBJECTIVE_EMPTY, 'Goal objective must not be empty.');
  }
  if (objective.length > MAX_GOAL_OBJECTIVE_LENGTH) {
    throw new ByfError(
      ErrorCodes.GOAL_OBJECTIVE_TOO_LONG,
      `Goal objective exceeds ${MAX_GOAL_OBJECTIVE_LENGTH} characters.`,
    );
  }
}

function validateBudget(budget: GoalBudgetLimits | undefined): void {
  if (budget === undefined) return;
  const { turnBudget, tokenBudget, wallClockBudgetMs } = budget;
  if (turnBudget !== undefined && (!Number.isInteger(turnBudget) || turnBudget < 0)) {
    throw new ByfError(
      ErrorCodes.GOAL_BUDGET_INVALID,
      'turnBudget must be a non-negative integer.',
    );
  }
  if (tokenBudget !== undefined && (!Number.isInteger(tokenBudget) || tokenBudget < 0)) {
    throw new ByfError(
      ErrorCodes.GOAL_BUDGET_INVALID,
      'tokenBudget must be a non-negative integer.',
    );
  }
  if (
    wallClockBudgetMs !== undefined &&
    (!Number.isInteger(wallClockBudgetMs) || wallClockBudgetMs <= 0)
  ) {
    throw new ByfError(
      ErrorCodes.GOAL_BUDGET_INVALID,
      'wallClockBudgetMs must be a positive integer (milliseconds).',
    );
  }
}

function computeReport(limits: GoalBudgetLimits, usage: GoalUsage): GoalBudgetReport {
  const exceeded: Array<'turns' | 'tokens' | 'wallClockMs'> = [];
  if (limits.turnBudget !== undefined && usage.turns >= limits.turnBudget) {
    exceeded.push('turns');
  }
  if (limits.tokenBudget !== undefined && usage.tokens >= limits.tokenBudget) {
    exceeded.push('tokens');
  }
  if (limits.wallClockBudgetMs !== undefined && usage.wallClockMs >= limits.wallClockBudgetMs) {
    exceeded.push('wallClockMs');
  }
  return { limits, usage, overBudget: exceeded.length > 0, exceededDimensions: exceeded };
}
