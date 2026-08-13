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

/** 从一串 wire 条目构建会话时间线 + 派生状态。
 *
 *  fold 逻辑(step.begin/content.part/tool.call/tool.result/step.end、
 *  工具交换期间的延迟消息刷出、工具输出归一化)委托给 agent-core 的
 *  `wire-fold` 模块(纯函数;与 live agent 共享的单一事实源)。每次 fold
 *  调用返回其提交的消息,因此 vis 把展示元数据(`lineNo` / `time` /
 *  `source`)附加到返回值,而非 `onMessage` effect 端口(Phase 5 签名
 *  适配——共享 fold 中的 effect 端口已消失)。
 *
 *  vis 特定关注点留在此处:为每条投影消息附加 `lineNo` / `time` /
 *  `source` 展示元数据,并聚合 fold 不拥有的 usage / config /
 *  permission 快照。 */
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
