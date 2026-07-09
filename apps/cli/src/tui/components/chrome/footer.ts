/**
 * Footer/status bar — multi-line status display at the bottom of the TUI.
 *
 * Layout:
 *   Line 1: [yolo] [plan] <model> <cwd>  <git-badge>  <shortcut hints>
 *   Line 2: context: XX.X% (tokens/max)
 */

import type { GoalSnapshot } from '@byfriends/sdk';
import type { Component } from '@earendil-works/pi-tui';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import chalk from 'chalk';

import type { ColorPalette } from '#/tui/theme/colors';
import type { AppState } from '#/tui/types';
import {
  createGitStatusCache,
  formatGitBadgeBase,
  formatPullRequestBadge,
  type GitStatus,
  type GitStatusCache,
} from '#/utils/git/git-status';
import { formatCacheHitRate, formatTokenCount, safeUsageRatio } from '#/utils/usage/usage-format';

const MAX_CWD_SEGMENTS = 3;

// Goal badge wall-clock refresh interval (PRD-0019 / ADR-0027). While a goal
// is active the footer ticks every second so the elapsed value keeps moving
// even when no `goal.updated` event arrives mid-turn (counts/tokens are
// turn-level by design — N3). `unref`'d so it never keeps the process alive.
const GOAL_TIMER_INTERVAL_MS = 1000;

// Toolbar tips — rotates every 30s, shows 2 tips joined by " | " when
// space allows, falls back to 1.
const TIP_ROTATE_INTERVAL_MS = 30_000;
const TIP_SEPARATOR = ' | ';
const TOOLBAR_TIPS: readonly string[] = [
  '/yolo: toggle yolo',
  'ctrl+c: cancel',
  '/help: show commands',
  '/model: switch model',
  '@: mention files',
];

function currentTipIndex(): number {
  return Math.floor(Date.now() / TIP_ROTATE_INTERVAL_MS);
}

function twoRotatingTips(index: number): string {
  const n = TOOLBAR_TIPS.length;
  if (n === 0) return '';
  if (n === 1) return TOOLBAR_TIPS[0]!;
  const offset = ((index % n) + n) % n;
  return TOOLBAR_TIPS[offset]! + TIP_SEPARATOR + TOOLBAR_TIPS[(offset + 1) % n]!;
}

function oneRotatingTip(index: number): string {
  const n = TOOLBAR_TIPS.length;
  if (n === 0) return '';
  const offset = ((index % n) + n) % n;
  return TOOLBAR_TIPS[offset]!;
}

function shortenModel(model: string): string {
  if (!model) return model;
  const slash = model.lastIndexOf('/');
  return slash >= 0 ? model.slice(slash + 1) : model;
}

function modelDisplayName(state: AppState): string {
  const model = state.availableModels[state.model];
  return model?.displayName ?? model?.model ?? state.model;
}

function shortenCwd(path: string): string {
  if (!path) return path;
  const home = process.env['HOME'] ?? '';
  let work = path;
  if (home && path === home) {
    return '~';
  }
  if (home && path.startsWith(home + '/')) {
    work = '~' + path.slice(home.length);
  }

  const segments = work.split('/').filter((s) => s.length > 0);
  if (segments.length <= MAX_CWD_SEGMENTS) return work;
  const tail = segments.slice(-MAX_CWD_SEGMENTS).join('/');
  return `…/${tail}`;
}

function safeUsage(usage: number): number {
  return safeUsageRatio(usage);
}

export function formatContextStatus(usage: number, tokens?: number, maxTokens?: number): string {
  const pct = `${(safeUsage(usage) * 100).toFixed(1)}%`;
  if (maxTokens && maxTokens > 0 && tokens !== undefined) {
    return `context: ${pct} (${formatTokenCount(tokens)}/${formatTokenCount(maxTokens)})`;
  }
  return `context: ${pct}`;
}

const GOAL_STATUS_GLYPH: Record<GoalSnapshot['status'], string> = {
  active: '▶',
  paused: '⏸',
  blocked: '⚠',
  // `complete` is transient — the driver clears it at the turn boundary.
  // Render it as active if it ever reaches the footer.
  complete: '▶',
};

/** Compact one-line usage summary: `2 turns · 1.2k tokens · 18s`. */
function formatGoalUsageCompact(snapshot: GoalSnapshot, wallClockMs?: number): string {
  const { turns, tokens } = snapshot.usage;
  const elapsedMs = wallClockMs ?? snapshot.usage.wallClockMs;
  const elapsed = Math.max(0, Math.round(elapsedMs / 1000));
  return `${turns} turns · ${formatTokenCount(tokens)} tokens · ${elapsed}s`;
}

/**
 * Render the goal badge for the footer line 1 (PRD-0019 R13). Returns `null`
 * when there is no goal. The glyph encodes the status; the tail carries a
 * compact usage summary so the user can watch budget burn down at a glance.
 *
 * `wallClockMs` overrides the snapshot's `usage.wallClockMs` — used by the
 * footer's 1s local timer to extrapolate the elapsed value mid-turn (the
 * snapshot's value is only updated at turn boundaries / status changes per
 * N3; between events the footer advances it locally, ADR-0027).
 */
export function formatGoalBadge(
  snapshot: GoalSnapshot | null | undefined,
  colors: ColorPalette,
  wallClockMs?: number,
): string | null {
  if (snapshot === null || snapshot === undefined) return null;
  const glyph = GOAL_STATUS_GLYPH[snapshot.status] ?? '▶';
  const tone =
    snapshot.status === 'blocked'
      ? colors.warning
      : snapshot.status === 'paused'
        ? colors.textDim
        : colors.success;
  const usage = formatGoalUsageCompact(snapshot, wallClockMs);
  return chalk.hex(tone)(`${glyph} goal · ${usage}`);
}

/**
 * Identity fingerprint of the goal fields that affect footer rendering.
 * Used to detect whether a `setState` actually changed the goal snapshot, so
 * the wall-clock extrapolation anchor (`goalObservedAtMs`) is only reset when
 * the snapshot truly changed — not on every unrelated re-render (git status /
 * permission / cwd changes all flow through the same `setState`).
 * byf has no `goalId` (single current goal); objective+createdAt serves as identity.
 */
function goalSnapshotKey(snapshot: GoalSnapshot | null | undefined): string | null {
  if (snapshot === null || snapshot === undefined) return null;
  return [
    snapshot.objective,
    snapshot.status,
    snapshot.pausedReason ?? '',
    snapshot.blockedReason ?? '',
    String(snapshot.usage.turns),
    String(snapshot.usage.tokens),
    String(snapshot.usage.wallClockMs),
    String(snapshot.budget.turnBudget),
    String(snapshot.budget.tokenBudget),
    String(snapshot.budget.wallClockBudgetMs),
    String(snapshot.createdAt),
  ].join('\u0000');
}

export function formatFooterGitBadge(status: GitStatus, colors: ColorPalette): string {
  const base = chalk.hex(colors.status)(formatGitBadgeBase(status));
  if (status.pullRequest === null) return base;

  const pullRequest = chalk.hex(colors.primary)(
    formatPullRequestBadge(status.pullRequest, { linkPullRequest: true }),
  );
  return `${base} ${pullRequest}`;
}

export class FooterComponent implements Component {
  private state: AppState;
  private colors: ColorPalette;
  private readonly onGitStatusChange: () => void;
  private readonly onRefresh: () => void;
  private gitCache: GitStatusCache;
  private gitCacheWorkDir: string;
  private transientHint: string | null = null;
  /**
   * Non-terminal background-task counts split by kind so the footer can
   * render two distinct badges. `bashTasks` covers `bash-*` BPM tasks
   * spawned via `Shell run_in_background=true`; `agentTasks` covers
   * `agent-*` BPM tasks (background subagents). Either zero hides its
   * respective badge.
   */
  private backgroundBashTaskCount = 0;
  private backgroundAgentCount = 0;
  /**
   * Goal badge live wall-clock (ADR-0027). `goalTimer` ticks every second
   * while a goal is `active` so the elapsed value advances mid-turn;
   * `goalObservedAtMs` is the moment we last saw the snapshot change, used
   * to extrapolate `wallClockMs` forward locally. `goalSnapshotKey` tracks
   * the last-seen snapshot fingerprint so unrelated re-renders (git/permission
   * changes) don't reset the extrapolation anchor.
   */
  private goalTimer: ReturnType<typeof setInterval> | null = null;
  private goalObservedAtMs = 0;
  private goalSnapshotKey: string | null = null;

  constructor(
    state: AppState,
    colors: ColorPalette,
    onGitStatusChange: () => void = () => {},
    onRefresh: () => void = () => {},
  ) {
    this.state = state;
    this.colors = colors;
    this.onGitStatusChange = onGitStatusChange;
    this.onRefresh = onRefresh;
    this.gitCacheWorkDir = this.getDisplayedWorkDir(state);
    this.gitCache = createGitStatusCache(this.gitCacheWorkDir, {
      onChange: this.onGitStatusChange,
    });
    // Initialize the goal clock + timer against the initial state (same as
    // setState) so an active goal in the initial state starts ticking without
    // waiting for the first external setState call.
    this.syncGoalClock(state.goalSnapshot);
    this.syncGoalTimer(state.goalSnapshot);
  }

  setState(state: AppState): void {
    const displayedWorkDir = this.getDisplayedWorkDir(state);
    if (displayedWorkDir !== this.gitCacheWorkDir) {
      this.gitCacheWorkDir = displayedWorkDir;
      this.gitCache = createGitStatusCache(displayedWorkDir, { onChange: this.onGitStatusChange });
    }
    this.state = state;
    // Sync the goal clock + timer against the freshly received snapshot.
    // syncGoalClock must run before render so the extrapolation anchor is
    // correct for this render pass; syncGoalTimer starts/stops the 1s ticker.
    this.syncGoalClock(state.goalSnapshot);
    this.syncGoalTimer(state.goalSnapshot);
  }

  /**
   * Record the extrapolation anchor (`goalObservedAtMs`) only when the goal
   * snapshot's meaningful fields actually change. Unrelated `setState` calls
   * (git status / permission / cwd) flow through here too; without this
   * fingerprint check they'd reset the anchor on every render and the
   * extrapolated elapsed would never advance.
   */
  private syncGoalClock(snapshot: AppState['goalSnapshot']): void {
    const key = goalSnapshotKey(snapshot);
    if (key === this.goalSnapshotKey) return;
    this.goalSnapshotKey = key;
    this.goalObservedAtMs = Date.now();
  }

  /**
   * Start the 1s refresh ticker while a goal is `active`, stop it otherwise.
   * Idempotent: a no-op if a timer is already running. The interval is
   * `unref`'d so it never keeps the process alive on its own. Only `active`
   * ticks — `paused`/`blocked`/`complete`/null all freeze the elapsed value
   * (complete is transient and its wall-clock is already folded/final).
   */
  private syncGoalTimer(snapshot: AppState['goalSnapshot']): void {
    if (snapshot?.status === 'active') {
      if (this.goalTimer !== null) return;
      this.goalTimer = setInterval(() => {
        this.onRefresh();
      }, GOAL_TIMER_INTERVAL_MS);
      this.goalTimer.unref?.();
      return;
    }
    if (this.goalTimer !== null) {
      clearInterval(this.goalTimer);
      this.goalTimer = null;
    }
  }

  /**
   * Live wall-clock for the active goal: the snapshot's frozen `wallClockMs`
   * plus the time elapsed since we last observed the snapshot change. Only
   * extrapolated while `active` — other statuses show the snapshot's value
   * as-is (already final for complete; folded-but-paused for paused/blocked).
   */
  private goalWallClockMs(snapshot: AppState['goalSnapshot']): number | undefined {
    if (snapshot === null || snapshot === undefined) return undefined;
    if (snapshot.status !== 'active') return snapshot.usage.wallClockMs;
    return snapshot.usage.wallClockMs + Math.max(0, Date.now() - this.goalObservedAtMs);
  }

  /**
   * Tear down the goal refresh timer. Called from the TUI `stop()` teardown
   * sequence. The git cache needs no active disposal (lazy TTL + fire-and-
   * forget promise, no fs.watch/timer).
   */
  dispose(): void {
    if (this.goalTimer !== null) {
      clearInterval(this.goalTimer);
      this.goalTimer = null;
    }
  }

  private getDisplayedWorkDir(state: AppState): string {
    return state.shellWorkDir ?? state.workDir;
  }

  setColors(colors: ColorPalette): void {
    this.colors = colors;
  }

  /**
   * Short-lived hint that replaces the rotating toolbar tips on line 1.
   * Used by the exit-confirmation double-tap flow to show "Press Ctrl+C
   * again to exit" without requiring a toast/overlay subsystem.
   * Pass `null` to clear.
   */
  setTransientHint(hint: string | null): void {
    this.transientHint = hint;
  }

  /**
   * Sync both background-task badges with live counts. Each non-zero
   * count produces its own bracketed badge on line 1; zeros hide them
   * independently.
   */
  setBackgroundCounts(counts: { bashTasks: number; agentTasks: number }): void {
    this.backgroundBashTaskCount = Math.max(0, counts.bashTasks);
    this.backgroundAgentCount = Math.max(0, counts.agentTasks);
  }

  invalidate(): void {}

  render(width: number): string[] {
    const colors = this.colors;
    const state = this.state;

    // ── Line 1: mode badges + model + [N task(s) running] + [N agent(s) running] + cwd + git + hints ──
    const left: string[] = [];
    if (state.permissionMode === 'auto') left.push(chalk.hex(colors.warning).bold('auto'));
    if (state.permissionMode === 'yolo') left.push(chalk.hex(colors.warning).bold('yolo'));
    const model = shortenModel(modelDisplayName(state));
    if (model) {
      const effortLabel = state.thinkingEffort !== 'off' ? ` thinking:${state.thinkingEffort}` : '';
      left.push(chalk.hex(colors.text)(`${model}${effortLabel}`));
    }

    // Background-task badges sit immediately before cwd. `bash-*` tasks
    // (shell processes) and `agent-*` tasks (background subagents) get
    // separate badges so the user can distinguish them at a glance.
    if (this.backgroundBashTaskCount > 0) {
      const noun = this.backgroundBashTaskCount === 1 ? 'task' : 'tasks';
      left.push(
        chalk.hex(colors.primary)(`[${String(this.backgroundBashTaskCount)} ${noun} running]`),
      );
    }
    if (this.backgroundAgentCount > 0) {
      const noun = this.backgroundAgentCount === 1 ? 'agent' : 'agents';
      left.push(
        chalk.hex(colors.primary)(`[${String(this.backgroundAgentCount)} ${noun} running]`),
      );
    }

    // Goal badge (PRD-0019 R13) — shown only while a goal is active/paused/
    // blocked. Sits before cwd so the status glyph stays visually anchored to
    // the model line. The wall-clock is extrapolated locally while active
    // (ADR-0027) so the elapsed value keeps moving between `goal.updated`
    // events (counts/tokens are turn-level by N3).
    const goalWallClock = this.goalWallClockMs(state.goalSnapshot);
    const goalBadge = formatGoalBadge(state.goalSnapshot, colors, goalWallClock);
    if (goalBadge) left.push(goalBadge);

    const cwd = shortenCwd(this.getDisplayedWorkDir(state));
    if (cwd) left.push(chalk.hex(colors.status)(cwd));

    const git = this.gitCache.getStatus();
    if (git !== null) {
      left.push(formatFooterGitBadge(git, colors));
    }

    const leftLine = left.join('  ');
    const leftWidth = visibleWidth(leftLine);

    // Rotating hint tips, fill remaining space on line 1.
    const tipIndex = currentTipIndex();
    const tipTwo = twoRotatingTips(tipIndex);
    const tipOne = oneRotatingTip(tipIndex);
    const gap = 2;
    const remaining = Math.max(0, width - leftWidth - gap);
    let tipText = '';
    if (tipTwo && visibleWidth(tipTwo) <= remaining) {
      tipText = tipTwo;
    } else if (tipOne && visibleWidth(tipOne) <= remaining) {
      tipText = tipOne;
    }

    let line1: string;
    if (tipText) {
      const pad = width - leftWidth - visibleWidth(tipText);
      line1 = leftLine + ' '.repeat(Math.max(0, pad)) + chalk.hex(colors.textMuted)(tipText);
    } else if (leftWidth <= width) {
      line1 = leftLine;
    } else {
      line1 = truncateToWidth(leftLine, width, '…');
    }

    // ── Line 2: transient hint (bottom-left) + context + cache badge (right) ──
    const contextText = formatContextStatus(
      state.contextUsage,
      state.contextTokens,
      state.maxContextTokens,
    );
    const hitRateStr = formatCacheHitRate(state.cacheHitRate);
    const cacheBadge = hitRateStr ? `  cache: ${hitRateStr} (current)` : '';
    const contextWidth = visibleWidth(contextText) + visibleWidth(cacheBadge);
    const contextRight =
      chalk.hex(colors.text)(contextText) +
      (cacheBadge ? chalk.hex(colors.textDim)(cacheBadge) : '');
    let line2: string;
    if (this.transientHint) {
      const maxHintWidth = Math.max(0, width - contextWidth - 1);
      const shownHint =
        visibleWidth(this.transientHint) <= maxHintWidth
          ? this.transientHint
          : truncateToWidth(this.transientHint, maxHintWidth, '…');
      const hintWidth = visibleWidth(shownHint);
      const pad = Math.max(0, width - hintWidth - contextWidth);
      line2 = chalk.hex(colors.warning).bold(shownHint) + ' '.repeat(pad) + contextRight;
    } else {
      const leftPad = Math.max(0, width - contextWidth);
      line2 = ' '.repeat(leftPad) + contextRight;
    }

    return [truncateToWidth(line1, width), truncateToWidth(line2, width)];
  }
}
