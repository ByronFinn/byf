import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SubagentActivityStore,
  formatSubagentTokens,
} from '#/tui/components/messages/subagent-activity-store';
import type { SubagentTokenUsage, ToolResultBlockData } from '#/tui/types';

describe('SubagentActivityStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Empty / default state ───────────────────────────────────────────

  it('starts empty with no subagent state', () => {
    const store = new SubagentActivityStore();
    expect(store.hasSubagentState()).toBe(false);
    expect(store.agentId).toBeUndefined();
    expect(store.agentName).toBeUndefined();
    expect(store.subagentPhase).toBeUndefined();
    expect(store.getElapsedSeconds()).toBeUndefined();
    expect(store.formatAgentId()).toBe('');
  });

  it('isSingleSubagentView returns false when no state', () => {
    const store = new SubagentActivityStore();
    expect(store.isSingleSubagentView('Agent')).toBe(false);
    expect(store.isSingleSubagentView('Bash')).toBe(false);
  });

  // ── Full lifecycle ─────────────────────────────────────────────────

  it('tracks the full lifecycle: spawn → text → tool → delta → finish → complete', () => {
    const store = new SubagentActivityStore();
    const listener = vi.fn();
    store.addSnapshotListener(listener);
    listener.mockClear(); // discard immediate callback from registration

    // spawn
    store.onSubagentSpawned({
      agentId: 'sub_explore_001',
      agentName: 'explore',
      runInBackground: false,
    });
    expect(store.agentId).toBe('sub_explore_001');
    expect(store.agentName).toBe('explore');
    expect(store.subagentPhase).toBe('spawning');
    expect(store.agentStartedAtMs).toBe(10_000);
    expect(store.agentEndedAtMs).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);

    // text update — transitions to running
    store.appendSubagentText('Exploring the project...');
    expect(store.subagentPhase).toBe('running');
    expect(store.subagentText).toBe('Exploring the project...');
    expect(listener).toHaveBeenCalledTimes(2);

    // thinking text
    store.appendSubagentText('(thinking about strategy)', 'thinking');
    expect(store.subagentThinkingText).toBe('(thinking about strategy)');
    expect(store.getCombinedText()).toBe(
      '(thinking about strategy)\nExploring the project...',
    );
    expect(listener).toHaveBeenCalledTimes(3);

    // start a sub-tool call
    store.appendSubToolCall({
      id: 'tc_glob',
      name: 'Glob',
      args: { pattern: '*.ts' },
    });
    expect(store.ongoingSubCalls.has('tc_glob')).toBe(true);
    expect(store.ongoingSubCalls.size).toBe(1);
    expect(store.finishedSubCalls.length).toBe(0);
    expect(listener).toHaveBeenCalledTimes(4);

    // streaming delta — tool name arrives later
    store.appendSubToolCallDelta({
      id: 'tc_read',
      argumentsPart: '{"path":"src/main.ts"',
    });
    expect(store.ongoingSubCalls.has('tc_read')).toBe(true);
    expect(store.ongoingSubCalls.size).toBe(2);
    expect(listener).toHaveBeenCalledTimes(5);

    // finish the first tool
    store.finishSubToolCall({
      tool_call_id: 'tc_glob',
      output: '1 file',
      is_error: false,
    });
    expect(store.ongoingSubCalls.has('tc_glob')).toBe(false);
    expect(store.finishedSubCalls.length).toBe(1);
    expect(store.finishedSubCalls[0]!.name).toBe('Glob');
    expect(store.finishedSubCalls[0]!.output).toBe('1 file');
    expect(listener).toHaveBeenCalledTimes(6);

    // finish the second tool
    store.finishSubToolCall({
      tool_call_id: 'tc_read',
      output: 'content',
      is_error: false,
    });
    expect(store.finishedSubCalls.length).toBe(2);
    expect(listener).toHaveBeenCalledTimes(7);

    // complete
    vi.setSystemTime(25_000);
    store.onSubagentCompleted({
      usage: { inputOther: 500, inputCacheRead: 400, output: 200 },
      resultSummary: 'Found 3 files and read main.ts',
    });
    expect(store.subagentPhase).toBe('done');
    expect(store.agentEndedAtMs).toBe(25_000);
    expect(store.agentUsage).toEqual({ inputOther: 500, inputCacheRead: 400, output: 200 });
    expect(store.subagentResultSummary).toBe('Found 3 files and read main.ts');
    expect(listener).toHaveBeenCalledTimes(8);

    // elapsed time: 25s - 10s = 15s
    expect(store.getElapsedSeconds()).toBe(15);
  });

  // ── backgrounded phase ─────────────────────────────────────────────

  it('handles backgrounded subagent lifecycle', () => {
    const store = new SubagentActivityStore();

    store.onSubagentSpawned({
      agentId: 'sub_bg_001',
      agentName: 'background-worker',
      runInBackground: true,
    });
    expect(store.subagentPhase).toBe('backgrounded');
    expect(store.agentStartedAtMs).toBe(10_000);

    // backgrounded → completed
    vi.setSystemTime(20_000);
    store.onSubagentCompleted({
      usage: { inputOther: 100, output: 50 },
      resultSummary: 'Background task done',
    });
    expect(store.subagentPhase).toBe('done');
    expect(store.agentEndedAtMs).toBe(20_000);
  });

  it('handles backgrounded → failed transition', () => {
    const store = new SubagentActivityStore();

    store.onSubagentSpawned({
      agentId: 'sub_bg_fail',
      runInBackground: true,
    });
    expect(store.subagentPhase).toBe('backgrounded');

    store.onSubagentFailed({ error: 'Timeout after 30s' });
    expect(store.subagentPhase).toBe('failed');
    expect(store.subagentError).toBe('Timeout after 30s');
  });

  // ── Failure path ───────────────────────────────────────────────────

  it('handles subagent failure with error text', () => {
    const store = new SubagentActivityStore();

    store.onSubagentSpawned({
      agentId: 'sub_fail_001',
      runInBackground: false,
    });
    vi.setSystemTime(15_000);
    store.onSubagentFailed({ error: 'TypeError: cannot read properties of undefined' });

    expect(store.subagentPhase).toBe('failed');
    expect(store.subagentError).toBe('TypeError: cannot read properties of undefined');
    expect(store.agentEndedAtMs).toBe(15_000);

    // snapshot should reflect the failure
    const snap = store.getSubagentSnapshot('call_001', 'Agent', 'do something');
    expect(snap.phase).toBe('failed');
    expect(snap.isError).toBe(true);
    expect(snap.errorText).toBe('TypeError: cannot read properties of undefined');
  });

  // ── updateSubagentLiveUsage ────────────────────────────────────────

  it('ignores updateSubagentLiveUsage when phase is not spawning/running', () => {
    const store = new SubagentActivityStore();

    store.onSubagentSpawned({
      agentId: 'sub_live',
      runInBackground: false,
    });
    const listener = vi.fn();
    store.addSnapshotListener(listener);
    listener.mockClear(); // discard immediate callback from registration

    store.updateSubagentLiveUsage({ inputOther: 100, output: 50 });
    expect(store.usageTokens).toBe(150);
    expect(listener).toHaveBeenCalledTimes(1); // updateSubagentLiveUsage → notifySnapshotChange

    store.onSubagentCompleted({
      usage: { inputOther: 200, output: 100 },
      resultSummary: 'done',
    });
    expect(listener).toHaveBeenCalledTimes(2); // completed → notifySnapshotChange

    // After completed, further live updates should be ignored
    listener.mockClear();
    store.updateSubagentLiveUsage({ inputOther: 999, output: 999 });
    expect(store.usageTokens).toBe(300); // still the completed value (200 + 100)
    expect(listener).not.toHaveBeenCalled();
  });

  it('ignores undefined usage in updateSubagentLiveUsage', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({
      agentId: 'sub_live_2',
      runInBackground: false,
    });
    const listener = vi.fn();
    store.addSnapshotListener(listener);
    listener.mockClear();

    store.updateSubagentLiveUsage(undefined);
    expect(listener).not.toHaveBeenCalled();
  });

  // ── getSubagentActivityDetail ──────────────────────────────────────

  it('produces correct SubagentActivityDetail shape', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({
      agentId: 'sub_detail',
      agentName: 'detail-agent',
      runInBackground: false,
    });

    store.appendSubagentText('Processing...', 'text');
    store.appendSubToolCall({ id: 'tc_a', name: 'Read', args: { path: 'file.ts' } });
    store.appendSubToolCall({ id: 'tc_b', name: 'Bash', args: { command: 'echo hi' } });
    store.finishSubToolCall({ tool_call_id: 'tc_a', output: 'content', is_error: false });
    store.appendSubagentText('(thinking)', 'thinking');
    vi.setSystemTime(20_000);
    store.onSubagentCompleted({
      usage: { inputOther: 300, output: 100 },
      resultSummary: 'All done',
    });

    const detail = store.getSubagentActivityDetail('call_detail', 'explore code');

    expect(detail.toolCallId).toBe('call_detail');
    expect(detail.agentName).toBe('detail-agent');
    expect(detail.phase).toBe('done');
    expect(detail.text).toBe('Processing...');
    expect(detail.thinkingText).toBe('(thinking)');
    expect(detail.resultSummary).toBe('All done');
    expect(detail.toolCount).toBe(1); // 1 finished, 0 hidden
    expect(detail.tokens).toBeGreaterThan(0);

    // Activities array — sorted by orderSeq
    expect(detail.activities.length).toBe(2);
    expect(detail.activities[0]!.name).toBe('Read');
    expect(detail.activities[0]!.phase).toBe('done');
    expect(detail.activities[0]!.output).toBe('content');
    expect(detail.activities[0]!.isError).toBe(false);
    expect(detail.activities[1]!.name).toBe('Bash');
    expect(detail.activities[1]!.phase).toBe('ongoing');
    expect(detail.activities[1]!.output).toBeUndefined();

    // Elapsed seconds
    expect(detail.elapsedSeconds).toBe(10); // 20s - 10s
  });

  // ── getSubagentSnapshot ────────────────────────────────────────────

  it('produces correct ToolCallSubagentSnapshot shape', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_snap', runInBackground: false });

    const snap = store.getSubagentSnapshot('call_snap', 'Agent', 'do stuff');

    expect(snap.toolCallId).toBe('call_snap');
    expect(snap.toolName).toBe('Agent');
    expect(snap.toolCallDescription).toBe('do stuff');
    expect(snap.agentName).toBeUndefined();
    expect(snap.phase).toBe('spawning');
    expect(snap.isError).toBe(false);
    expect(snap.toolCount).toBe(0);
    expect(snap.tokens).toBe(0);
    expect(snap.elapsedSeconds).toBe(0);
  });

  it('snapshot derivedPhase uses tool result when available', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_snap2', runInBackground: false });

    // Without result, phase is 'spawning'
    const snapNoResult = store.getSubagentSnapshot('call_s2', 'Agent', '');
    expect(snapNoResult.phase).toBe('spawning');

    // With result, phase is derived from result
    const resultData: ToolResultBlockData = {
      tool_call_id: 'call_s2',
      output: 'success',
      is_error: false,
    };
    const snapWithResult = store.getSubagentSnapshot('call_s2', 'Agent', '', resultData);
    expect(snapWithResult.phase).toBe('done');
    expect(snapWithResult.isError).toBe(false);

    // Error result
    const errorResult: ToolResultBlockData = {
      tool_call_id: 'call_s2',
      output: 'error output',
      is_error: true,
    };
    const snapError = store.getSubagentSnapshot('call_s2', 'Agent', '', errorResult);
    expect(snapError.phase).toBe('failed');
    expect(snapError.isError).toBe(true);
    expect(snapError.errorText).toBe('error output');
  });

  // ── Snapshot listeners ─────────────────────────────────────────────

  it('addSnapshotListener fires immediately and on changes', () => {
    const store = new SubagentActivityStore();
    const listener = vi.fn();

    const unsub = store.addSnapshotListener(listener);
    expect(listener).toHaveBeenCalledTimes(1); // immediate call

    store.appendSubagentText('hello');
    expect(listener).toHaveBeenCalledTimes(2);

    store.appendSubToolCall({ id: 't1', name: 'Read', args: {} });
    expect(listener).toHaveBeenCalledTimes(3);

    unsub();
    store.appendSubagentText('world');
    expect(listener).toHaveBeenCalledTimes(3); // no more calls
  });

  it('setSnapshotListener clears existing listeners', () => {
    const store = new SubagentActivityStore();
    const a = vi.fn();
    const b = vi.fn();

    store.addSnapshotListener(a);
    a.mockClear();

    store.setSnapshotListener(b);
    expect(b).toHaveBeenCalledTimes(1); // immediate call

    store.appendSubagentText('test');
    expect(a).not.toHaveBeenCalled(); // cleared
    expect(b).toHaveBeenCalledTimes(2); // b still active
  });

  // ── Timer ──────────────────────────────────────────────────────────

  it('finalizeElapsedIfNeeded sets end time when result arrives without lifecycle event', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_timer', runInBackground: false });
    expect(store.agentEndedAtMs).toBeUndefined();

    vi.setSystemTime(30_000);
    const result: ToolResultBlockData = {
      tool_call_id: 'call_timer',
      output: 'done',
      is_error: false,
    };
    store.finalizeElapsedIfNeeded(result);
    expect(store.agentEndedAtMs).toBe(30_000);
  });

  it('finalizeElapsedIfNeeded is no-op when end time is already set', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_timer2', runInBackground: false });
    store.onSubagentCompleted({ resultSummary: 'done' }); // sets endedAtMs
    expect(store.agentEndedAtMs).toBe(10_000);

    vi.setSystemTime(99_000);
    store.finalizeElapsedIfNeeded({
      tool_call_id: 'call_timer2',
      output: 'done',
      is_error: false,
    });
    expect(store.agentEndedAtMs).toBe(10_000); // unchanged
  });

  it('finalizeElapsedIfNeeded is no-op when startedAtMs is undefined', () => {
    const store = new SubagentActivityStore();
    store.finalizeElapsedIfNeeded({
      tool_call_id: 'x',
      output: 'y',
      is_error: false,
    });
    // no crash — no-op
    expect(store.agentEndedAtMs).toBeUndefined();
  });

  // ── formatAgentId ──────────────────────────────────────────────────

  it('formatAgentId truncates long IDs', () => {
    const store = new SubagentActivityStore();
    store.setSubagentMeta('abcdefghijklmno');
    expect(store.formatAgentId()).toBe('abcdefghij…');
  });

  it('formatAgentId keeps short IDs intact', () => {
    const store = new SubagentActivityStore();
    store.setSubagentMeta('abc123');
    expect(store.formatAgentId()).toBe('abc123');
  });

  it('formatAgentId returns empty string when no agent ID', () => {
    const store = new SubagentActivityStore();
    expect(store.formatAgentId()).toBe('');
  });

  // ── Replay ─────────────────────────────────────────────────────────

  it('applies replay data from constructor', () => {
    const store = new SubagentActivityStore({
      id: 'sub_replay',
      name: 'replay-agent',
      text: 'Replayed text content',
      toolCalls: [
        { id: 't1', name: 'Glob', args: { pattern: '*.ts' }, result: { tool_call_id: 't1', output: 'matches', is_error: false } },
        { id: 't2', name: 'Read', args: { path: 'main.ts' } },
      ],
      usage: { inputOther: 1000, output: 500 },
    });

    expect(store.agentId).toBe('sub_replay');
    expect(store.agentName).toBe('replay-agent');
    expect(store.hasSubagentState()).toBe(true);
    expect(store.subagentText).toBe('Replayed text content');
    expect(store.finishedSubCalls.length).toBe(1);
    expect(store.finishedSubCalls[0]!.name).toBe('Glob');
    expect(store.ongoingSubCalls.has('t2')).toBe(true);
    expect(store.usageTokens).toBe(1500);
  });

  // ── sub-tool call overflow trimming ────────────────────────────────

  it('trims finished sub-tool calls to MAX_SUB_TOOL_CALLS_SHOWN and tracks hidden count', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_trim', runInBackground: false });

    for (let i = 0; i < 6; i++) {
      store.appendSubToolCall({ id: `tc_${String(i)}`, name: 'Read', args: { path: `f${String(i)}.ts` } });
      store.finishSubToolCall({ tool_call_id: `tc_${String(i)}`, output: 'ok', is_error: false });
    }

    // Only the last 4 should remain
    expect(store.finishedSubCalls.length).toBe(4);
    expect(store.finishedSubCalls[0]!.name).toBe('Read');
    expect(store.finishedSubCalls[0]!.args['path']).toBe('f2.ts'); // first 2 trimmed
    expect(store.hiddenSubCallCount).toBe(2);
  });

  // ── getSubagentSnapshot latestActivity ─────────────────────────────

  it('computes latestActivity from ongoing sub-tool calls', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_act', runInBackground: false });
    store.appendSubToolCall({ id: 't1', name: 'Read', args: { path: 'foo.ts' } });

    const snap = store.getSubagentSnapshot('c1', 'Agent', '');
    expect(snap.latestActivity).toBe('Using Read (foo.ts)');
  });

  it('computes latestActivity from finished calls when no ongoing', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_act2', runInBackground: false });
    store.appendSubToolCall({ id: 't1', name: 'Glob', args: { pattern: '*.ts' } });
    store.finishSubToolCall({ tool_call_id: 't1', output: 'match', is_error: false });

    const snap = store.getSubagentSnapshot('c2', 'Agent', '');
    expect(snap.latestActivity).toBe('Used Glob (*.ts)');
  });

  it('computes latestActivity from text when no tool calls', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_act3', runInBackground: false });
    store.appendSubagentText('  \n  \nFinal result: success');

    const snap = store.getSubagentSnapshot('c3', 'Agent', '');
    expect(snap.latestActivity).toBe('Final result: success');
  });

  // ── isSingleSubagentView ───────────────────────────────────────────

  it('isSingleSubagentView returns true for Agent tool call with state', () => {
    const store = new SubagentActivityStore();
    store.setSubagentMeta('sub_single');
    expect(store.isSingleSubagentView('Agent')).toBe(true);
    expect(store.isSingleSubagentView('Bash')).toBe(false);
  });

  // ── isRunning ──────────────────────────────────────────────────────

  it('isRunning returns true for spawning and running phases', () => {
    const store = new SubagentActivityStore();
    expect(store.isRunning()).toBe(false);

    store.onSubagentSpawned({ agentId: 's', runInBackground: false });
    expect(store.isRunning()).toBe(true);

    store.appendSubagentText('running');
    expect(store.isRunning()).toBe(true);

    store.onSubagentCompleted({ resultSummary: 'done' });
    expect(store.isRunning()).toBe(false);
  });

  // ── getRecentSubToolActivities ─────────────────────────────────────

  it('getRecentSubToolActivities returns latest MAX_SINGLE_SUBAGENT_TOOL_ROWS activities', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 'sub_recent', runInBackground: false });

    for (let i = 0; i < 6; i++) {
      store.appendSubToolCall({ id: `tc_${String(i)}`, name: 'Read', args: { path: `f${String(i)}.ts` } });
    }

    const recent = store.getRecentSubToolActivities();
    expect(recent.length).toBe(4); // MAX_SINGLE_SUBAGENT_TOOL_ROWS
    expect(recent[0]!.id).toBe('tc_2');
    expect(recent[3]!.id).toBe('tc_5');
  });

  // ── syncElapsedTimer / stopElapsedTimer ────────────────────────────

  it('syncElapsedTimer starts an interval that ticks onTick + requestRender every second', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 's', runInBackground: false });
    const requestRender = vi.fn();
    const onTick = vi.fn();

    store.syncElapsedTimer(undefined, { requestRender } as never, onTick);
    // No tick before the 1s interval fires.
    expect(onTick).not.toHaveBeenCalled();
    expect(requestRender).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(requestRender).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(onTick).toHaveBeenCalledTimes(2);
    expect(requestRender).toHaveBeenCalledTimes(2);

    store.stopElapsedTimer();
  });

  it('syncElapsedTimer is a no-op when ui is undefined', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 's', runInBackground: false });
    const onTick = vi.fn();

    store.syncElapsedTimer(undefined, undefined, onTick);
    vi.advanceTimersByTime(3000);
    expect(onTick).not.toHaveBeenCalled();
  });

  it('syncElapsedTimer does not start a second interval when already ticking', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 's', runInBackground: false });
    const ui = { requestRender: vi.fn() } as never;
    const onTick = vi.fn();

    store.syncElapsedTimer(undefined, ui, onTick);
    store.syncElapsedTimer(undefined, ui, onTick); // second call: already ticking

    vi.advanceTimersByTime(1000);
    // Only one tick despite two syncElapsedTimer calls.
    expect(onTick).toHaveBeenCalledTimes(1);
    store.stopElapsedTimer();
  });

  it('syncElapsedTimer stops the interval when phase is terminal', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 's', runInBackground: false });
    const ui = { requestRender: vi.fn() } as never;
    const onTick = vi.fn();

    store.syncElapsedTimer(undefined, ui, onTick);
    // Transition to a terminal phase, then re-sync: should stop, not start.
    store.onSubagentCompleted({ resultSummary: 'done' });
    store.syncElapsedTimer(undefined, ui, onTick);

    vi.advanceTimersByTime(3000);
    // The pre-existing interval was cleared by stopElapsedTimer; no further ticks.
    expect(onTick).not.toHaveBeenCalled();
  });

  it('stopElapsedTimer is a no-op when no timer is running', () => {
    const store = new SubagentActivityStore();
    // Calling stop before any sync should not throw.
    expect(() => store.stopElapsedTimer()).not.toThrow();
  });

  it('stopElapsedTimer is idempotent', () => {
    const store = new SubagentActivityStore();
    store.onSubagentSpawned({ agentId: 's', runInBackground: false });
    const ui = { requestRender: vi.fn() } as never;
    store.syncElapsedTimer(undefined, ui, vi.fn());

    store.stopElapsedTimer();
    expect(() => store.stopElapsedTimer()).not.toThrow();
  });
});