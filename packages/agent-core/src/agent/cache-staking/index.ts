import type { CacheHint, Message } from '@byfriends/kosong';

export interface StakingContext {
  readonly previousTurnMessageCount: number;
  readonly sizeThreshold?: number;
}

const DEFAULT_SIZE_THRESHOLD = 2000;

/**
 * Apply cache staking hints to a message array based on turn boundaries.
 *
 * - **Stake 3**: Tags the last assistant message of the previous turn with
 *   `cacheHint.isLastTurnEnd = true`.
 * - **Stake 4** (conditional): Tags the largest content block in the current
 *   turn that exceeds `sizeThreshold` with `cacheHint.isSuddenLargeContext = true`.
 *
 * Returns a new array with shallow-copied messages (original messages are
 * not mutated).
 */
export function applyCacheStaking(messages: Message[], context: StakingContext): Message[] {
  const { previousTurnMessageCount, sizeThreshold = DEFAULT_SIZE_THRESHOLD } = context;

  // Edge case: no history or single turn
  if (previousTurnMessageCount <= 0 || messages.length === 0) {
    return messages;
  }

  const result = messages.map((msg) => ({ ...msg }));

  // Stake 3: Tag previous turn's last message with isLastTurnEnd
  const lastTurnIndex = previousTurnMessageCount - 1;
  if (lastTurnIndex < result.length) {
    const lastTurnMsg = result[lastTurnIndex]!;
    if (lastTurnMsg.role === 'assistant') {
      const existingHint: CacheHint = lastTurnMsg.cacheHint ?? {};
      result[lastTurnIndex] = {
        ...lastTurnMsg,
        cacheHint: { ...existingHint, isLastTurnEnd: true },
      };
    }
  }

  // Stake 4: Tag the largest content block in the current turn above threshold
  let largestIndex = -1;
  let largestSize = 0;
  for (let i = previousTurnMessageCount; i < result.length; i++) {
    const msg = result[i]!;
    const contentLength = msg.content
      .filter((p) => p.type === 'text')
      .reduce((sum, p) => sum + (p as { text: string }).text.length, 0);
    if (contentLength >= sizeThreshold && contentLength > largestSize) {
      largestSize = contentLength;
      largestIndex = i;
    }
  }

  if (largestIndex >= 0) {
    const target = result[largestIndex]!;
    const existingHint: CacheHint = target.cacheHint ?? {};
    result[largestIndex] = {
      ...target,
      cacheHint: { ...existingHint, isSuddenLargeContext: true },
    };
  }

  return result;
}
