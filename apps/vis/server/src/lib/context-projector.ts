import {
  buildPreview,
  DEFAULT_OFFLOADING_CONFIG,
  resetWireFoldState,
  foldAppendMessage,
  foldLoopEvent,
  shouldOffload,
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
 *  normalisation, output-offload previews) is delegated to agent-core's
 *  pure `wire-fold` module — the single source of truth shared with the live
 *  agent. Previously this file mirrored that logic by hand and silently
 *  diverged on empty/error tool outputs, partial compaction (it dropped
 *  post-summary messages), and deferred-message ordering.
 *
 *  vis-specific concerns stay here: attaching `lineNo` / `time` / `source`
 *  display metadata to each projected message, and aggregating usage /
 *  config / permission snapshots that the fold does not own. */
export async function projectContext(
  entries: ReadonlyArray<WireEntry>,
): Promise<ContextProjection> {
  const messages: ProjectedMessage[] = [];
  const state: WireFoldState = createWireFoldState();
  const usage: UsageTotals = {
    byScope: { session: { ...ZERO }, turn: { ...ZERO } },
    byModel: {},
  };
  const config: ConfigSnapshot = {};
  let permissionMode: 'manual' | 'yolo' | 'auto' | null = null;

  // Track the wire entry currently being folded so `onMessage` can attach
  // its lineNo/time as display metadata. Updated per-entry below.
  let currentEntry: WireEntry | undefined;

  // Keep a side index of step uuid → the projected message(s) it fills, so
  // we can stamp toolStepUuids for debugging. Mirrors how the fold tracks
  // openSteps but on the projected (metadata-bearing) side.
  const openProjected = new Map<string, ProjectedMessage>();

  const handlers = {
    onMessage: (message: ContextMessage) => {
      const entry = currentEntry!;
      const projected: ProjectedMessage = {
        lineNo: entry.lineNo,
        time: entry.data.time,
        source:
          entry.data.type === 'context.apply_compaction' ? 'compaction_summary' : 'append_message',
        message,
        toolStepUuids: [],
      };
      messages.push(projected);
      // If this message is an assistant message we just opened via step.begin,
      // remember it so subsequent tool.call/content.part on the same step can
      // stamp their stepUuid. The fold already mutated the message in place;
      // we only track the uuid here.
    },
    offloadToolOutput: (_id, toolName, result) => {
      // vis never writes a scratch file, but to keep the rendered timeline
      // faithful to what the model actually saw, synthesise the same preview
      // (first N chars + a placeholder reference) the live agent would have
      // produced. Callers that prefer the full output can read the raw
      // tool.result wire entry directly from the wire-list view.
      const output = result.output;
      if (typeof output !== 'string' || !shouldOffload(output, DEFAULT_OFFLOADING_CONFIG)) {
        return Promise.resolve(undefined);
      }
      const preview = buildPreview(
        output,
        toolName,
        `<vis-placeholder:${_id}>`,
        DEFAULT_OFFLOADING_CONFIG.previewChars,
      );
      return Promise.resolve({ output: preview });
    },
  };

  for (const entry of entries) {
    currentEntry = entry;
    const rec = entry.data;

    if (rec.type === 'context.append_message') {
      foldAppendMessage(state, rec.message, handlers);
    } else if (rec.type === 'context.append_loop_event') {
      // Track step / tool-call uuids on projected messages for debugging.
      // Fold first (it pushes the new message via onMessage), then stamp the
      // last projected message — which is the one just appended for step.begin
      // or the assistant message owning the tool call.
      const ev = rec.event;
      const before = messages.length;
      await foldLoopEvent(state, ev, handlers);
      if (ev.type === 'step.begin') {
        const opened = messages.at(-1);
        if (opened !== undefined && messages.length > before) {
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
      // Mirror agent-core's applyCompaction: prepend the summary as an
      // assistant message with origin.kind = 'compaction_summary' and KEEP
      // the remaining uncompacted tail (history.slice(compactedCount)). The
      // previous hand-written version reset messages to only the summary,
      // silently dropping post-compaction history.
      const summaryMessage: ContextMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: rec.summary }],
        toolCalls: [],
        origin: { kind: 'compaction_summary' },
      };
      state.history.splice(0, rec.compactedCount, summaryMessage);
      messages.splice(0, rec.compactedCount, {
        lineNo: entry.lineNo,
        time: rec.time,
        source: 'compaction_summary',
        message: summaryMessage,
        toolStepUuids: [],
      });
      state.openSteps.clear();
      openProjected.clear();
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
