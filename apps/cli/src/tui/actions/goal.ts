/**
 * /goal 命令动作处理器(PRD-0019 #204)。
 *
 * 把解析后的 `GoalCommand` 纯分发到 Session。UI 渲染(页脚徽章 / 完成
 * 卡片 / transcript 标记)位于 #205——本模块只变更会话状态,并发出
 * transcript 与 UI 层共享的用户可见状态行。
 */

import type { GoalSnapshot, Session } from '@byfriends/sdk';
import { renderStatusLine } from '@byfriends/sdk';

import type { GoalCommand } from '#/tui/commands/goal';

export type GoalSession = Pick<
  Session,
  'createGoal' | 'getGoal' | 'pauseGoal' | 'resumeGoal' | 'cancelGoal'
>;

export interface GoalActionCallbacks {
  /** Show a transient status line (auto-dismisses). */
  showStatus(message: string): void;
  /** Show an error line. */
  showError(message: string): void;
  /** Append a persistent transcript line (e.g. /goal status snapshot). */
  appendTranscriptLine(message: string): void;
  /**
   * Hard-abort the in-flight turn (equivalent to Esc). Wired by ByfTUI to
   * `cancelCurrentStream` (→ `session.cancel()` → `AbortSignal`). The `cancel`
   * sub-command uses this to honor ADR-0025's hard-stop semantics; other
   * sub-commands do not call it.
   */
  abortActiveTurn(): void;
}

/**
 * 对会话执行解析后的 /goal 命令。返回适合瞬时 toast 的短状态字符串;
 * transcript 持久化是调用方的责任(经 `appendTranscriptLine` 处理
 * `status` 子命令,按 PRD R13 写入单行快照)。
 */
export async function handleGoalCommand(
  session: GoalSession,
  command: GoalCommand,
  callbacks: GoalActionCallbacks,
): Promise<void> {
  switch (command.kind) {
    case 'status': {
      const snapshot = await session.getGoal();
      if (snapshot === null) {
        callbacks.showStatus('No active goal.');
        return;
      }
      // /goal status always writes a transcript line per PRD R13 — same
      // information channel as the footer badge, never a floating panel.
      callbacks.appendTranscriptLine(renderStatusLine(snapshot));
      return;
    }
    case 'pause': {
      await session.pauseGoal();
      callbacks.showStatus('Goal paused — current turn finishes, then halts.');
      return;
    }
    case 'resume': {
      await session.resumeGoal();
      callbacks.showStatus('Goal resumed.');
      return;
    }
    case 'cancel': {
      // Cancel is a hard stop: clear goal state AND abort the in-flight turn's
      // AbortSignal (ADR-0025). `pause` only flips state and lets the turn
      // finish; `cancel` is equivalent to pressing Esc — the current turn ends
      // with reason 'cancelled' immediately. Half-finished tool calls are the
      // user's responsibility (cancel is a discard action).
      await session.cancelGoal();
      callbacks.abortActiveTurn();
      callbacks.showStatus('Goal cancelled.');
      return;
    }
    case 'create': {
      await session.createGoal(command.objective, {
        replace: command.replace,
        budget: command.budget,
      });
      callbacks.showStatus(
        command.replace ? 'Goal replaced.' : `Goal created: ${command.objective}`,
      );
      return;
    }
    case 'error': {
      if (command.severity === 'warn') callbacks.showStatus(command.message);
      else callbacks.showError(command.message);
      return;
    }
    default: {
      const _exhaustive: never = command;
      callbacks.showError(`Unknown /goal command: ${String(_exhaustive)}`);
    }
  }
}

/** 为 UI 表面(页脚徽章)渲染快照的单行摘要。 */
export function summarizeGoalSnapshot(snapshot: GoalSnapshot | null): string | null {
  if (snapshot === null) return null;
  return renderStatusLine(snapshot);
}
