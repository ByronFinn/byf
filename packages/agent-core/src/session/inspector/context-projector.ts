/**
 * Context 投影：从 wire 条目构建会话时间线 + 派生状态（usage/config/permission）。
 *
 * 由 `apps/vis/server/src/lib/context-projector.ts` 上移（PRD-0035 R-A1）。
 * fold 逻辑委托 `agent/context/wire-fold`（纯函数；与 live agent 共享的单一
 * 事实源）；Inspector 只负责附加展示元数据（lineNo / time / source）并聚合
 * fold 不拥有的 usage / config / permission 快照。
 */

import {
  foldAppendMessage,
  foldApplyCompaction,
  foldLoopEvent,
  resetWireFoldState,
  createWireFoldState,
  type WireFoldState,
} from '#/agent/context/wire-fold';

import type {
  ContextMessage,
  ContextProjection,
  ConfigSnapshot,
  ProjectedMessage,
  TokenUsage,
  UsageTotals,
  WireEntry,
} from './types';

export type { ContextProjection, ProjectedMessage, UsageTotals, ConfigSnapshot };

const ZERO: TokenUsage = { inputOther: 0, output: 0, inputCacheRead: 0, inputCacheCreation: 0 };

/** 从一串 wire 条目构建会话时间线 + 派生状态。 */
export function projectContext(entries: ReadonlyArray<WireEntry>): ContextProjection {
  const messages: ProjectedMessage[] = [];
  const state: WireFoldState = createWireFoldState();
  const usage: UsageTotals = {
    byScope: { session: { ...ZERO }, turn: { ...ZERO } },
    byModel: {},
  };
  const config: ConfigSnapshot = {};
  let permissionMode: 'manual' | 'yolo' | 'auto' | null = null;

  // step uuid → 其填充的投影消息侧索引，用于在投影侧打 toolStepUuids。
  const openProjected = new Map<string, ProjectedMessage>();

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
      const ev = rec.event;
      const committed = foldLoopEvent(state, ev);
      pushProjected(committed, entry);
      if (ev.type === 'step.begin') {
        // step.begin 恒提交 assistant 消息——投影列表最后一条即其归属。
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
      // 破坏侧归因（PRD-0029 R3）：静态前缀块在 turn 间变化。纯展示元数据，
      // 不改变 fold（op 自身 apply 是 identity）。与 compaction ribbon 平行渲染。
      messages.push({
        lineNo: entry.lineNo,
        time: rec.time,
        source: 'cache_churn',
        message: {
          role: 'system',
          content: [{ type: 'text', text: `${rec.blockName} · ${rec.cacheScope}` }],
          toolCalls: [],
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
  (into as { inputOther: number }).inputOther += src.inputOther;
  (into as { output: number }).output += src.output;
  (into as { inputCacheRead: number }).inputCacheRead += src.inputCacheRead;
  (into as { inputCacheCreation: number }).inputCacheCreation += src.inputCacheCreation;
}
