import type { CacheHint, Message } from '@byfriends/kosong';

export interface StakingContext {
  readonly previousTurnMessageCount: number;
  readonly sizeThreshold?: number;
  /**
   * `true` 表示基线自建立以来对话历史已被重写（PRD-0038 AC-6.2：turn 中途压缩
   * 或清空）。此时 `previousTurnMessageCount` 不再指向上一轮的末尾，依赖消息
   * 序号的桩 3/4 定位必须整体不应用——打错位置不仅拿不到缓存收益，还会把缓存
   * 前缀边界落在仍在增长的当前轮消息上，使下一轮必然 miss（静默多付 token）。
   */
  readonly baselineInvalid?: boolean;
}

/**
 * 桩落点的可断言观测（PRD-0038 AC-6.2）。索引为 `null` 即"该桩未应用"。
 */
export interface CacheStakingPlan {
  readonly turnEndStakeIndex: number | null;
  readonly largeContextStakeIndex: number | null;
  readonly baselineInvalid: boolean;
}

const DEFAULT_SIZE_THRESHOLD = 2000;

/**
 * 计算本轮的缓存桩落点，不做任何写入。ADR-0011 的 3+1 模型中本模块只负责
 * 桩 3（上一轮末尾）与桩 4（当前轮最大内容块）。
 */
export function planCacheStaking(
  messages: readonly Message[],
  context: StakingContext,
): CacheStakingPlan {
  const { previousTurnMessageCount, sizeThreshold = DEFAULT_SIZE_THRESHOLD } = context;
  // 基线落在历史之外同样是失效信号（压缩把历史削到比基线还短）。
  const baselineInvalid =
    context.baselineInvalid === true || previousTurnMessageCount > messages.length;

  if (previousTurnMessageCount <= 0 || messages.length === 0 || baselineInvalid) {
    return { turnEndStakeIndex: null, largeContextStakeIndex: null, baselineInvalid };
  }

  // Stake 3: Tag previous turn's last message with isLastTurnEnd
  const lastTurnIndex = previousTurnMessageCount - 1;
  const turnEndStakeIndex =
    lastTurnIndex < messages.length && messages[lastTurnIndex]?.role === 'assistant'
      ? lastTurnIndex
      : null;

  // Stake 4: Tag the largest content block in the current turn above threshold
  let largeContextStakeIndex: number | null = null;
  let largestSize = 0;
  for (let i = previousTurnMessageCount; i < messages.length; i++) {
    const msg = messages[i]!;
    const contentLength = msg.content
      .filter((p) => p.type === 'text')
      .reduce((sum, p) => sum + (p as { text: string }).text.length, 0);
    if (contentLength >= sizeThreshold && contentLength > largestSize) {
      largestSize = contentLength;
      largeContextStakeIndex = i;
    }
  }

  return { turnEndStakeIndex, largeContextStakeIndex, baselineInvalid: false };
}

/**
 * Apply cache staking hints to a message array based on turn boundaries.
 *
 * - **Stake 3**: Tags the last assistant message of the previous turn with
 *   `cacheHint.isLastTurnEnd = true`.
 * - **Stake 4** (conditional): Tags the largest content block in the current
 *   turn that exceeds `sizeThreshold` with `cacheHint.isSuddenLargeContext = true`.
 *
 * Returns a new array with shallow-copied messages (original messages are
 * not mutated). When the baseline is invalid (mid-turn compaction), no stake
 * is applied at all.
 */
export function applyCacheStaking(messages: Message[], context: StakingContext): Message[] {
  const plan = planCacheStaking(messages, context);
  if (plan.turnEndStakeIndex === null && plan.largeContextStakeIndex === null) {
    return messages;
  }

  const result = messages.map((msg) => ({ ...msg }));

  if (plan.turnEndStakeIndex !== null) {
    const lastTurnMsg = result[plan.turnEndStakeIndex]!;
    const existingHint: CacheHint = lastTurnMsg.cacheHint ?? {};
    result[plan.turnEndStakeIndex] = {
      ...lastTurnMsg,
      cacheHint: { ...existingHint, isLastTurnEnd: true },
    };
  }

  if (plan.largeContextStakeIndex !== null) {
    const target = result[plan.largeContextStakeIndex]!;
    const existingHint: CacheHint = target.cacheHint ?? {};
    result[plan.largeContextStakeIndex] = {
      ...target,
      cacheHint: { ...existingHint, isSuddenLargeContext: true },
    };
  }

  return result;
}
