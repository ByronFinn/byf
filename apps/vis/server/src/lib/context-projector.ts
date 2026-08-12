import {
  foldAppendMessage,
  foldApplyCompaction,
  foldLoopEvent,
  resetWireFoldState,
  createWireFoldState,
  type WireFoldState,
} from '@byfriends/agent-core';
// Context-projection DTOs — canonical definitions live in @byfriends/vis-shared
import type {
  ProjectedMessage,
  UsageTotals,
  ConfigSnapshot,
  ContextProjection,
} from '@byfriends/vis-shared';

import type { ContextMessage, TokenUsage, WireEntry } from './agent-record-types';

export type { ProjectedMessage, UsageTotals, ConfigSnapshot, ContextProjection };

const ZERO: TokenUsage = { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 };

/** Build a conversation timeline + derived state from a sequence of
 *  wire entries.
 *
 *  The fold logic (step.begin/content.part/tool.call/tool.result/step.end,
 *  deferred-message flushing during tool exchanges, tool-output
 *  normalisation) is delegated to agent-core's `wire-fold` module (pure
 *  functions; single source of truth shared with the live agent). Each fold
 *  call returns the messages it committed, so vis attaches its display
 *  metadata (`lineNo` / `time` / `source`) to the return values instead of an
 *  `onMessage` effect port (Phase 5 signature adaptation — the effect ports
 *  are gone from the shared fold).
 *
 *  vis-specific concerns stay here: attaching `lineNo` / `time` / `source`
 *  display metadata to each projected message, and aggregating usage /
 *  config / permission snapshots that the fold does not own. */
export function projectContext(entries: ReadonlyArray<WireEntry>): ContextProjection {
  const messages: ProjectedMessage[] = [];
  const state: WireFoldState = createWireFoldState();
  const usage: UsageTotals = {
    byScope: { session: { ...ZERO }, turn: { ...ZERO } },
    byModel: {},
  };
  const config: ConfigSnapshot = {};
  let permissionMode: 'manual' | 'yolo' | 'auto' | null = null;

  // Keep a side index of step uuid → the projected message(s) it fills, so
  // we can stamp toolStepUuids for debugging. Mirrors how the fold tracks
  // openSteps but on the projected (metadata-bearing) side.
  const openProjected = new Map<string, ProjectedMessage>();

  // Attach display metadata to every message a fold committed.
  const pushProjected = (committed: readonly ContextMessage[], entry: WireEntry): void => {
    for (const message of committed) {
      messages.push({
        lineNo: entry.lineNo,
        time: entry.data.time,
        source: 'append_message',
        message,
        toolStepUuids: [],
      });
    }
  };

  for (const entry of entries) {
    const rec = entry.data;

    if (rec.type === 'context.append_message') {
      pushProjected(foldAppendMessage(state, rec.message), entry);
    } else if (rec.type === 'context.append_loop_event') {
      // Track step / tool-call uuids on projected messages for debugging.
      // Fold first (it returns the newly committed messages), then stamp the
      // last committed one — which is the assistant message just appended for
      // step.begin or the assistant message owning the tool call.
      const ev = rec.event;
      const committed = foldLoopEvent(state, ev);
      pushProjected(committed, entry);
      if (ev.type === 'step.begin') {
        // step.begin 恒提交 assistant 消息（不 defer），pushProjected 后它就是
        // 投影列表的最后一条 —— 在投影侧（带 toolStepUuids 元数据）打 step uuid。
        const opened = messages.at(-1);
        if (opened !== undefined) {
          opened.toolStepUuids.push(ev.uuid);
          openProjected.set(ev.uuid, opened);
        }
      } else if (ev.type === 'step.end') {
        openProjected.delete(ev.uuid);
      }
    } else if (rec.type === 'context.clear') {
      resetWireFoldState(state);
      messages.length = 0;
      openProjected.clear();
    } else if (rec.type === 'context.apply_compaction') {
      // Shared with ContextMemory via foldApplyCompaction: summary + uncompacted
      // tail (history.slice(compactedCount)). Display metadata is vis-only.
      const { summary: summaryMessage } = foldApplyCompaction(state, {
        summary: rec.summary,
        compactedCount: rec.compactedCount,
      });
      messages.splice(0, rec.compactedCount, {
        lineNo: entry.lineNo,
        time: rec.time,
        source: 'compaction_summary',
        message: summaryMessage,
        toolStepUuids: [],
      });
      openProjected.clear();
    } else if (rec.type === 'context.cache_churn') {
      // Break-side attribution (PRD-0029 R3): a static-prefix block changed between
      // turns. Pure display metadata — does not mutate the fold (the op's own apply is
      // identity). Rendered as a ribbon aligned with the compaction ribbon paradigm.
      messages.push({
        lineNo: entry.lineNo,
        time: rec.time,
        source: 'cache_churn',
        message: {
          role: 'system',
          content: [{ type: 'text', text: `${rec.blockName} · ${rec.cacheScope}` }],
        },
        toolStepUuids: [],
      });
    } else if (rec.type === 'usage.record') {
      const scope: keyof UsageTotals['byScope'] = rec.usageScope === 'turn' ? 'turn' : 'session';
      addUsage(usage.byScope[scope], rec.usage);
      const byModel = (usage.byModel[rec.model] ??= { ...ZERO });
      addUsage(byModel, rec.usage);
    } else if (rec.type === 'config.update') {
      const typeChecked = rec as {
        type: 'config.update';
        cwd?: string;
        modelAlias?: string;
        profileName?: string;
        thinkingLevel?: string;
        systemPrompt?: string;
      };
      if (typeChecked.cwd !== undefined) config.cwd = typeChecked.cwd;
      if (typeChecked.modelAlias !== undefined) config.modelAlias = typeChecked.modelAlias;
      if (typeChecked.profileName !== undefined) config.profileName = typeChecked.profileName;
      if (typeChecked.thinkingLevel !== undefined) config.thinkingLevel = typeChecked.thinkingLevel;
      if (typeChecked.systemPrompt !== undefined) config.systemPrompt = typeChecked.systemPrompt;
    } else if (rec.type === 'permission.set_mode') {
      permissionMode = rec.mode;
    }
  }

  return {
    messages,
    usage,
    config,
    permission: { mode: permissionMode },
  };
}

function addUsage(into: TokenUsage, src: TokenUsage): void {
  (into as any).inputOther += src.inputOther;
  (into as any).output += src.output;
  (into as any).inputCacheRead += src.inputCacheRead;
  (into as any).inputCacheCreation += src.inputCacheCreation;
}
