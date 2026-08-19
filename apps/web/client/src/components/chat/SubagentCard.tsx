import { Bot, Clock, PanelRightOpen } from 'lucide-react';

import { groupParts, type RenderPart, type SubagentState } from '#/lib/chat';
import { cn } from '#/lib/utils';

import { Markdown } from './Markdown';
import { ThinkingBlock } from './ThinkingBlock';
import { ToolCallView, ToolGroupView, formatDuration } from './ToolCallView';

function usageTokens(usage: SubagentState['usage']): number | undefined {
  if (usage === undefined) return undefined;
  return usage.inputOther + usage.output + usage.inputCacheRead + usage.inputCacheCreation;
}

/**
 * 子 Agent 信息卡片(PRD-0034 R-B3,have-a-try 裁决形态):主时间轴内呈现
 * 名称/分工/状态灯/耗时/usage/结果摘要;点击打开右侧 drawer 深度查看。
 */
export function SubagentCard(props: {
  subagent: SubagentState;
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const { subagent, onOpen } = props;
  const duration =
    subagent.endedAt !== undefined && subagent.startedAt > 0
      ? formatDuration(subagent.endedAt - subagent.startedAt)
      : null;
  const tokens = usageTokens(subagent.usage);

  return (
    <button
      type="button"
      onClick={() => {
        onOpen(subagent.id);
      }}
      aria-label={`在详情面板查看子代理 ${subagent.name}`}
      title="在详情面板查看轨迹"
      className="my-1 flex w-full items-center gap-2 rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm shadow-1 transition-colors hover:bg-hover"
    >
      <span
        className={cn(
          'inline-block h-2 w-2 shrink-0 rounded-full',
          subagent.status === 'running'
            ? 'animate-pulse bg-state-warning'
            : subagent.status === 'failed'
              ? 'bg-state-error'
              : 'bg-state-success',
        )}
        aria-hidden
      />
      <Bot className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      <span className="shrink-0 font-mono text-fg">{subagent.name}</span>
      {subagent.description !== undefined && (
        <span className="min-w-0 truncate text-xs text-fg-muted">{subagent.description}</span>
      )}
      {duration !== null && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5 font-mono text-xs text-fg-subtle">
          <Clock className="size-3" aria-hidden />
          {duration}
        </span>
      )}
      {tokens !== undefined && (
        <span className="shrink-0 font-mono text-xs text-fg-subtle">{tokens} tok</span>
      )}
      <PanelRightOpen className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
    </button>
  );
}

function DrawerPartView(props: { part: RenderPart; streaming: boolean }): React.JSX.Element {
  const { part, streaming } = props;
  if (part.kind === 'text') return <Markdown streaming={streaming}>{part.text}</Markdown>;
  if (part.kind === 'thinking') return <ThinkingBlock text={part.text} active={false} />;
  if (part.kind === 'tool-group') return <ToolGroupView group={part} />;
  return <ToolCallView part={part} />;
}

/**
 * 子 Agent 深度查看内容:展示该子 agent 的完整调用轨迹(与主时间轴同构:
 * thinking / 工具(含归组)/ 输出)。原独立模态 drawer(PRD-0034 R-B3)迁移
 * 为详情抽屉内容组件,外壳(滑入/关闭/Esc)由 DetailsDrawer 统一提供。
 */
export function SubagentDetail(props: { subagent: SubagentState }): React.JSX.Element {
  const { subagent } = props;
  const parts = groupParts(subagent.parts);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-surface-1 px-4 py-3">
        <span
          className={cn(
            'inline-block h-2 w-2 shrink-0 rounded-full',
            subagent.status === 'running'
              ? 'animate-pulse bg-state-warning'
              : subagent.status === 'failed'
                ? 'bg-state-error'
                : 'bg-state-success',
          )}
          aria-hidden
        />
        <Bot className="size-4 shrink-0 text-fg-subtle" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{subagent.name}</p>
          {subagent.description !== undefined && (
            <p className="truncate text-xs text-fg-muted">{subagent.description}</p>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {subagent.status === 'failed' && subagent.error !== undefined && (
          <p className="mb-2 rounded-md border border-state-error/40 bg-state-error/10 px-3 py-2 text-sm text-state-error">
            {subagent.error}
          </p>
        )}
        {subagent.resultSummary !== undefined && (
          <p className="mb-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-fg-muted">
            {subagent.resultSummary}
          </p>
        )}
        <div className="space-y-2.5">
          {parts.map((part, i) => (
            <DrawerPartView key={i} part={part} streaming={false} />
          ))}
        </div>
      </div>
    </div>
  );
}
