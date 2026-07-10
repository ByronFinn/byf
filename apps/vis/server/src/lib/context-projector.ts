// Context-projection DTOs — canonical definitions live in @byfriends/vis-shared
import type {
  ProjectedMessage,
  UsageTotals,
  ConfigSnapshot,
  ContextProjection,
} from '@byfriends/vis-shared';

import type { ContentPart, ContextMessage, TokenUsage, WireEntry } from './agent-record-types';

export type { ProjectedMessage, UsageTotals, ConfigSnapshot, ContextProjection };

const ZERO: TokenUsage = { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 };

/** Build a conversation timeline + derived state from a sequence of
 *  wire entries. The reconstruction mirrors agent-core's own
 *  `appendLoopEvent` logic, so:
 *
 *  - `context.append_message` records become messages as-is (the
 *    user / tool messages and any explicit assistant injections).
 *  - `step.begin` pushes a fresh assistant message; later
 *    `content.part` and `tool.call` events on the same step **mutate
 *    that same message** to grow its content / toolCalls. `step.end`
 *    just closes the step.
 *  - `tool.result` events emit an independent `role: 'tool'` message,
 *    matching how agent-core surfaces tool exchanges to the model.
 *
 *  Without this loop-event reconstruction the timeline would only
 *  show user prompts — agent-core does not emit a synthetic
 *  `context.append_message` for assistant turns. */
export function projectContext(entries: ReadonlyArray<WireEntry>): ContextProjection {
  let messages: ProjectedMessage[] = [];
  const usage: UsageTotals = {
    byScope: { session: { ...ZERO }, turn: { ...ZERO } },
    byModel: {},
  };
  const config: ConfigSnapshot = {};
  let permissionMode: 'manual' | 'yolo' | 'auto' | null = null;
  // Maps step.uuid → the assistant ProjectedMessage that step is filling in.
  // Cleared on context.clear / context.apply_compaction.
  let openSteps = new Map<string, ProjectedMessage>();

  for (const entry of entries) {
    const rec = entry.data;
    // We only project record types that affect the conversation timeline
    // or derived state. Lifecycle records (background.*, goal.*, tools.*,
    // turn.*, metadata, full_compaction.*, permission.record_* etc.) are
    // intentionally ignored — see the loop-event reconstruction note above.
    if (rec.type === 'context.append_message') {
      messages.push({
        lineNo: entry.lineNo,
        time: rec.time,
        source: 'append_message',
        message: rec.message,
        toolStepUuids: [],
      });
    } else if (rec.type === 'context.append_loop_event') {
      const ev = rec.event;
      if (ev.type === 'step.begin') {
        const message: ContextMessage = {
          role: 'assistant',
          content: [],
          toolCalls: [],
        };
        const projected: ProjectedMessage = {
          lineNo: entry.lineNo,
          time: rec.time,
          source: 'append_message',
          message,
          toolStepUuids: [ev.uuid],
        };
        messages.push(projected);
        openSteps.set(ev.uuid, projected);
      } else if (ev.type === 'content.part') {
        const projected = openSteps.get(ev.stepUuid);
        if (projected !== undefined) {
          projected.message.content.push(ev.part);
        }
      } else if (ev.type === 'tool.call') {
        const projected = openSteps.get(ev.stepUuid);
        if (projected !== undefined) {
          const args =
            typeof ev.args === 'string'
              ? ev.args
              : ev.args === undefined
                ? null
                : JSON.stringify(ev.args);
          projected.message.toolCalls.push({
            type: 'function',
            id: ev.toolCallId,
            name: ev.name,
            arguments: args,
          });
        }
      } else if (ev.type === 'step.end') {
        openSteps.delete(ev.uuid);
      } else if (ev.type === 'tool.result') {
        const output = ev.result.output;
        const content: ContentPart[] =
          typeof output === 'string' ? [{ type: 'text', text: output }] : (output as ContentPart[]);
        const toolMsg: ContextMessage = {
          role: 'tool',
          content,
          toolCalls: [],
          toolCallId: ev.toolCallId,
          isError: ev.result.isError === true || undefined,
        };
        messages.push({
          lineNo: entry.lineNo,
          time: rec.time,
          source: 'append_message',
          message: toolMsg,
          toolStepUuids: [],
        });
      }
    } else if (rec.type === 'context.clear') {
      messages = [];
      openSteps = new Map();
    } else if (rec.type === 'context.apply_compaction') {
      openSteps = new Map();
      // Mirror agent-core's actual `applyCompaction` behaviour: the
      // summary is inserted as an *assistant* message tagged with
      // `origin.kind = 'compaction_summary'` (see
      // `packages/agent-core/src/agent/context/index.ts`). Using
      // 'system' here would skew role counts and any downstream tool
      // that diffs the projected timeline against agent-core history.
      messages = [
        {
          lineNo: entry.lineNo,
          time: rec.time,
          source: 'compaction_summary',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: rec.summary }],
            toolCalls: [],
            origin: { kind: 'compaction_summary' },
          } as ContextMessage,
          toolStepUuids: [],
        },
      ];
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
