import { Bot, PanelRightOpen } from 'lucide-react';

import {
  DisclosureSection,
  ErrorBanner,
  MetaChips,
  type MetaItem,
} from '#/components/shared/disclosure';
import { groupParts, type RenderPart, type SubagentState } from '#/lib/chat';
import { cn } from '#/lib/utils';

import { Markdown } from './Markdown';
import { ThinkingBlock } from './ThinkingBlock';
import { formatDuration, ToolCallView, ToolGroupView } from './ToolCallView';

function usageTokens(usage: SubagentState['usage']): number | undefined {
  if (usage === undefined) return undefined;
  return usage.inputOther + usage.output + usage.inputCacheRead + usage.inputCacheCreation;
}

function statusMeta(sub: SubagentState): MetaItem {
  if (sub.status === 'running') return { label: '状态', value: '进行中' };
  if (sub.status === 'failed') return { label: '状态', value: '失败', tone: 'err' as const };
  return { label: '状态', value: '完成', tone: 'ok' as const };
}

/** 头部元数据:状态 / 耗时 / tokens(have-a-try D:元数据常驻头部)。 */
function subagentMeta(sub: SubagentState, withIdentity: boolean): MetaItem[] {
  const items: MetaItem[] = [statusMeta(sub)];
  if (sub.endedAt !== undefined && sub.startedAt > 0) {
    items.push({ label: '耗时', value: formatDuration(sub.endedAt - sub.startedAt) });
  }
  const tokens = usageTokens(sub.usage);
  if (tokens !== undefined) {
    items.push({ label: 'tokens', value: `${(tokens / 1000).toFixed(1)}k` });
  }
  if (withIdentity) {
    items.push({ label: '后台', value: sub.runInBackground ? '是' : '否' });
    items.push({ label: 'id', value: sub.id });
  }
  return items;
}

/** 状态灯(卡片与抽屉共用)。 */
function StatusDot({ status }: { status: SubagentState['status'] }): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-surface-1',
        status === 'running'
          ? 'animate-pulse bg-state-warning'
          : status === 'failed'
            ? 'bg-state-error'
            : 'bg-state-success',
      )}
      aria-hidden
    />
  );
}

/**
 * 子 Agent 信息卡片(PRD-0034 R-B3 / have-a-try D):主时间轴内呈现
 * 名称/分工/状态灯 + 常驻元数据 chips;点击打开右侧 drawer 深度查看。
 */
export function SubagentCard(props: {
  subagent: SubagentState;
  onOpen: (id: string) => void;
}): React.JSX.Element {
  const { subagent, onOpen } = props;
  return (
    <button
      type="button"
      onClick={() => {
        onOpen(subagent.id);
      }}
      aria-label={`在详情面板查看子代理 ${subagent.name}`}
      title="在详情面板查看轨迹"
      className="my-1 w-full overflow-hidden rounded-lg border border-border bg-surface-1 px-3 py-2 text-left text-sm shadow-1 transition-colors hover:bg-hover"
    >
      <span className="flex items-center gap-2">
        <StatusDot status={subagent.status} />
        <Bot className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span className="shrink-0 font-mono text-fg">{subagent.name}</span>
        {subagent.description !== undefined && (
          <span className="min-w-0 truncate text-xs text-fg-muted">{subagent.description}</span>
        )}
        <PanelRightOpen className="ml-auto size-3.5 shrink-0 text-fg-subtle" aria-hidden />
      </span>
      <MetaChips items={subagentMeta(subagent, false)} />
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
 * 子 Agent 深度查看内容(have-a-try D 形态):头部常驻元数据 chips;主体为
 * 输入·任务(分工描述)与 输出·结果与轨迹(错误横幅 + 结果摘要 + 完整轨迹,
 * 轨迹与主时间轴同构:thinking / 工具(含归组)/ 输出)。外壳(滑入/关闭/Esc)
 * 由 DetailsDrawer 统一提供。
 */
export function SubagentDetail(props: { subagent: SubagentState }): React.JSX.Element {
  const { subagent } = props;
  const parts = groupParts(subagent.parts);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex shrink-0 flex-col border-b border-border bg-surface-1 px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusDot status={subagent.status} />
          <Bot className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{subagent.name}</p>
            {subagent.description !== undefined && (
              <p className="truncate text-xs text-fg-muted">{subagent.description}</p>
            )}
          </div>
        </div>
        <MetaChips items={subagentMeta(subagent, true)} />
      </header>
      <div className="min-h-0 flex-1 space-y-2 bg-bg/30 px-2.5 py-2.5">
        {subagent.description !== undefined && (
          <DisclosureSection tint="in" label="输入 · 任务" note="任务描述">
            <pre className="font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-fg">
              {subagent.description}
            </pre>
          </DisclosureSection>
        )}
        <DisclosureSection tint="out" label="输出 · 结果与轨迹" note={`${parts.length} 步`}>
          <div className="space-y-2">
            {subagent.status === 'failed' && subagent.error !== undefined && (
              <ErrorBanner text={subagent.error} />
            )}
            {subagent.resultSummary !== undefined && (
              <p className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-fg-muted">
                {subagent.resultSummary}
              </p>
            )}
            <div className="space-y-2.5">
              {parts.map((part, i) => (
                <DrawerPartView key={i} part={part} streaming={false} />
              ))}
            </div>
          </div>
        </DisclosureSection>
      </div>
    </div>
  );
}
