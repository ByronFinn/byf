/**
 * goal 状态。`active`/`paused`/`blocked` 是持久化态；
 * `complete` 是瞬态（driver 边界立即 clear 回 absent，不长期驻留），
 * 仅在 markComplete 后、clearInternal 前短暂出现，用于让下游（reminder 注入器、UI）
 * 知道当前处于 completion 瞬态。
 */
export type GoalStatus = 'active' | 'paused' | 'blocked' | 'complete';

/** goal 的完整快照（持久化 + 瞬态都可表示）。null = absent。 */
export interface GoalSnapshot {
  readonly objective: string;
  readonly status: GoalStatus;
  /** blocked 状态下的原因（仅 status='blocked' 时有意义）。 */
  readonly blockedReason?: string;
  /** paused 状态下的原因。 */
  readonly pausedReason?: string;
  readonly budget: GoalBudgetLimits;
  readonly usage: GoalUsage;
  /** 创建时的墙钟时间戳（ms）。 */
  readonly createdAt: number;
}

/** 三类硬预算上限，全部可选——未设置即无该维度上限。 */
export interface GoalBudgetLimits {
  readonly turnBudget?: number;
  readonly tokenBudget?: number;
  readonly wallClockBudgetMs?: number;
}

/** goal 已消耗的用量（driver 每轮累加，paused 期间不计）。 */
export interface GoalUsage {
  /** driver 跑过的轮数。 */
  readonly turns: number;
  /** driver 每轮累加的本轮 turn token（input+output）。 */
  readonly tokens: number;
  /** active 区间累加的墙钟（ms）。 */
  readonly wallClockMs: number;
}

export interface GoalBudgetReport {
  readonly limits: GoalBudgetLimits;
  readonly usage: GoalUsage;
  readonly overBudget: boolean;
  /** 哪个维度超了（无则空数组）。 */
  readonly exceededDimensions: ReadonlyArray<'turns' | 'tokens' | 'wallClockMs'>;
}

/**
 * goal 生命周期变化类型，附在 `goal.updated` 事件上。
 * - `completion`：模型 markComplete 触发（仅此渲染 completion 卡片）。
 * - `blocked`：markBlocked 触发。
 * - 其它迁移不带 change（snapshot 本身的变化足够）。
 */
export type GoalChange =
  | { readonly kind: 'completion'; readonly reason?: string }
  | { readonly kind: 'blocked'; readonly reason: string };

/** 用于 addTokenUsage 的单轮 turn token。 */
export interface GoalTurnTokens {
  readonly input: number;
  readonly output: number;
}
