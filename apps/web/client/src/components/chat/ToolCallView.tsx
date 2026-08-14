import {
  Bot,
  ChevronRight,
  ClipboardCheck,
  FileDiff,
  FileText,
  Globe,
  Layers,
  ListChecks,
  Search,
  Square,
  Terminal,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import type { ToolGroupPart, ToolPart } from '#/lib/chat';
import { summarizeDisplay } from '#/lib/tool-display';

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 毫秒 → 人读时长(ms / s / m)。 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
}

/** 工具类型中文标签(归组摘要行用)。 */
const TOOL_KIND_LABELS: Record<string, string> = {
  command: '命令',
  file_io: '文件读写',
  diff: '差异',
  search: '搜索',
  url_fetch: '网络请求',
  agent_call: '子 Agent',
  skill_call: '技能调用',
  todo_list: '待办清单',
  background_task: '后台任务',
  task_stop: '任务停止',
  plan_review: '方案评审',
  generic: '工具调用',
};

/** 按工具 display 类型分发图标(kimi ToolRenderers 思路)。 */
function toolIcon(display: unknown): LucideIcon {
  if (display !== null && typeof display === 'object') {
    const d = display as Record<string, unknown>;
    switch (d['kind']) {
      case 'command':
        return Terminal;
      case 'file_io':
        return typeof d['operation'] === 'string' && d['operation'] === 'write'
          ? FileDiff
          : FileText;
      case 'diff':
        return FileDiff;
      case 'search':
        return Search;
      case 'url_fetch':
        return Globe;
      case 'agent_call':
        return Bot;
      case 'skill_call':
        return Zap;
      case 'todo_list':
        return ListChecks;
      case 'background_task':
        return Layers;
      case 'task_stop':
        return Square;
      case 'plan_review':
        return ClipboardCheck;
      default:
        break;
    }
  }
  return Wrench;
}

function isDiffDisplay(display: unknown): boolean {
  return (
    display !== null &&
    typeof display === 'object' &&
    (display as Record<string, unknown>)['kind'] === 'diff'
  );
}

/** diff 结果按 +/- 行着色的轻量渲染器;其余类型纯文本。 */
function ResultBody(props: { part: ToolPart }): React.JSX.Element | null {
  const { part } = props;
  if (part.result === undefined) return null;
  const resultText =
    typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2);
  const text = truncate(resultText, 4000);
  if (!isDiffDisplay(part.display)) {
    return (
      <pre className="max-h-80 overflow-auto border-t border-border bg-bg px-3 py-2 font-mono text-xs text-fg">
        {text}
      </pre>
    );
  }
  return (
    <pre className="max-h-80 overflow-auto border-t border-border bg-bg px-3 py-2 font-mono text-xs">
      {text.split('\n').map((line, i) => (
        <span
          key={i}
          className={
            line.startsWith('+')
              ? 'text-state-success'
              : line.startsWith('-')
                ? 'text-state-error'
                : 'text-fg-muted'
          }
        >
          {line}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

/**
 * 工具卡片(R11):状态灯(pending 脉冲 / success 绿 / error 红)+ 按类型分发的
 * 工具图标 + 摘要 + 可折叠结果(diff 结果 +/- 着色)。
 */
export function ToolCallView({ part }: { part: ToolPart }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const summary = summarizeDisplay(part.display) ?? part.description ?? null;
  const done = part.status === 'done';
  const Icon = toolIcon(part.display);
  const duration =
    part.startedAt !== undefined && part.endedAt !== undefined
      ? formatDuration(part.endedAt - part.startedAt)
      : null;

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-border bg-surface-1 text-sm shadow-1">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-hover"
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            done
              ? part.isError
                ? 'bg-state-error'
                : 'bg-state-success'
              : 'animate-pulse bg-state-warning'
          }`}
          aria-hidden
        />
        <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span className="shrink-0 font-mono text-fg">{part.name}</span>
        {summary !== null && (
          <span className="min-w-0 truncate font-mono text-xs text-fg-muted">{summary}</span>
        )}
        {duration !== null && (
          <span className="ml-auto shrink-0 font-mono text-xs text-fg-subtle">{duration}</span>
        )}
        <ChevronRight
          className={`${duration === null ? 'ml-auto' : ''} size-3.5 shrink-0 text-fg-subtle transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>
      {open && <ResultBody part={part} />}
    </div>
  );
}

/**
 * 工具归组摘要行(PRD-0034 R-B2):相邻同 kind 工具折叠为「类型 + 数量 + 总耗时」,
 * 展开可见逐条调用与单次耗时;流式期间未完结组实时更新。
 */
export function ToolGroupView({ group }: { group: ToolGroupPart }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const Icon = toolIcon(group.tools[0]?.display);
  const label = TOOL_KIND_LABELS[group.toolKind] ?? '工具调用';
  const errorCount = group.tools.filter((t) => t.isError).length;

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-border bg-surface-1 text-sm shadow-1">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-hover"
      >
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            group.hasRunning ? 'animate-pulse bg-state-warning' : 'bg-state-success'
          }`}
          aria-hidden
        />
        <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
        <span className="shrink-0 text-fg">{label}</span>
        <span className="shrink-0 text-fg-muted">× {group.tools.length}</span>
        {errorCount > 0 && (
          <span className="shrink-0 text-xs text-state-error">{errorCount} 失败</span>
        )}
        {group.spanMs !== undefined && (
          <span className="ml-auto shrink-0 font-mono text-xs text-fg-subtle">
            {formatDuration(group.spanMs)}
          </span>
        )}
        <ChevronRight
          className={`${group.spanMs === undefined ? 'ml-auto' : ''} size-3.5 shrink-0 text-fg-subtle transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-1 border-t border-border bg-surface-2/40 px-2 py-2">
          {group.tools.map((tool) => (
            <ToolCallView key={tool.toolCallId} part={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
