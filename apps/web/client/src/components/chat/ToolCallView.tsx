import {
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
  Bot,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';

import {
  DisclosureSection,
  ErrorBanner,
  MetaChips,
  type MetaItem,
} from '#/components/shared/disclosure';
import type { ToolGroupPart, ToolPart } from '#/lib/chat';
import { displayCommand, summarizeDisplay } from '#/lib/tool-display';
import { cn } from '#/lib/utils';
import { formatWallClock } from '#/lib/vis-time';

import { CodeBlock } from './CodeBlock';

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

/** file_io/diff display 携带的可查看路径(R-C3;无 path 的 display 返回 null)。 */
function displayFilePath(display: unknown): string | null {
  if (display === null || typeof display !== 'object') return null;
  const d = display as Record<string, unknown>;
  if (d['kind'] !== 'file_io' && d['kind'] !== 'diff') return null;
  return typeof d['path'] === 'string' && d['path'].length > 0 ? d['path'] : null;
}

/** 打开文件查看 drawer(全局事件,ChatPage 挂载监听;与 openSettingsDialog 同款)。 */
export const OPEN_FILE_EVENT = 'byf:open-file';

export function openFileDrawer(path: string): void {
  window.dispatchEvent(new CustomEvent<string>(OPEN_FILE_EVENT, { detail: path }));
}

function isDiffDisplay(display: unknown): boolean {
  return (
    display !== null &&
    typeof display === 'object' &&
    (display as Record<string, unknown>)['kind'] === 'diff'
  );
}

/** ContentPart 形态的工具结果:提取图片 data-URL 内联渲染(PRD-0034 R-C1)。 */
function mediaParts(result: unknown): {
  images: string[];
  text: string;
} {
  if (!Array.isArray(result)) return { images: [], text: '' };
  const images: string[] = [];
  const texts: string[] = [];
  for (const item of result) {
    if (
      item !== null &&
      typeof item === 'object' &&
      (item as { type?: unknown }).type === 'image_url'
    ) {
      const url = (item as { imageUrl?: { url?: unknown } }).imageUrl?.url;
      if (typeof url === 'string' && url.startsWith('data:')) {
        images.push(url);
      }
    } else if (
      item !== null &&
      typeof item === 'object' &&
      (item as { type?: unknown }).type === 'text'
    ) {
      const t = (item as { text?: unknown }).text;
      if (typeof t === 'string') texts.push(t);
    }
  }
  return { images, text: texts.join('') };
}

/** 头部元数据 chips:耗时/起止/call id/状态(have-a-try D:元数据常驻头部)。 */
function toolMeta(part: ToolPart): MetaItem[] {
  const items: MetaItem[] = [];
  if (part.startedAt !== undefined && part.endedAt !== undefined) {
    items.push({ label: '耗时', value: formatDuration(part.endedAt - part.startedAt) });
  }
  if (part.startedAt !== undefined) {
    items.push({ label: '开始', value: formatWallClock(part.startedAt) });
  }
  if (part.endedAt !== undefined) {
    items.push({ label: '结束', value: formatWallClock(part.endedAt) });
  }
  items.push({ label: 'call', value: `#${part.toolCallId.slice(0, 10)}` });
  items.push({
    label: '状态',
    value: part.status === 'running' ? '进行中' : part.isError ? '失败' : '成功',
    tone: part.status === 'running' ? undefined : part.isError ? 'err' : 'ok',
  });
  return items;
}

/** 输出区:error 横幅置顶,其后是结果文本(diff +/- 着色)或内联图片。 */
function ToolOutputBody({ part }: { part: ToolPart }): React.JSX.Element {
  const media = mediaParts(part.result);
  const resultText =
    typeof part.result === 'string' ? part.result : JSON.stringify(part.result, null, 2);
  return (
    <div className="space-y-1.5">
      {part.isError === true && <ErrorBanner text="工具执行失败" />}
      {media.images.length > 0 ? (
        <>
          <div className="space-y-2">
            {media.images.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`工具结果图片 ${i + 1}`}
                className="max-h-96 max-w-full rounded-md border border-border"
              />
            ))}
          </div>
          {media.text.length > 0 && (
            <pre className="overflow-auto rounded-md bg-code px-2.5 py-2 font-mono text-xs leading-relaxed text-code-fg">
              {truncate(media.text, 4000)}
            </pre>
          )}
        </>
      ) : isDiffDisplay(part.display) ? (
        <pre className="max-h-80 overflow-auto rounded-md bg-code px-2.5 py-2 font-mono text-xs leading-relaxed">
          {truncate(resultText, 4000)
            .split('\n')
            .map((line, i) => (
              <span
                key={i}
                className={
                  line.startsWith('+')
                    ? 'text-state-success'
                    : line.startsWith('-')
                      ? 'text-state-error'
                      : 'text-code-fg'
                }
              >
                {line}
                {'\n'}
              </span>
            ))}
        </pre>
      ) : (
        <pre className="max-h-80 overflow-auto rounded-md bg-code px-2.5 py-2 font-mono text-xs leading-relaxed text-code-fg">
          {truncate(resultText, 4000)}
        </pre>
      )}
    </div>
  );
}

/**
 * 工具卡片(R11 / have-a-try D 形态):头部两行——状态灯 + 图标 + 摘要 +
 * 常驻元数据 chips;展开体为 输入(命令)/ 输出(结果,diff 着色、error 置顶)
 * 分区卡片上下排布。被拒绝/取消的调用没有结果输出,命令是唯一可查看的内容。
 */
export function ToolCallView({ part }: { part: ToolPart }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const summary = summarizeDisplay(part.display) ?? part.description ?? null;
  const done = part.status === 'done';
  const Icon = toolIcon(part.display);
  const viewablePath = displayFilePath(part.display);
  const command = displayCommand(part.display);
  const hasBody = command !== null || part.result !== undefined;

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-border bg-surface-1 text-sm shadow-1 transition-shadow hover:shadow-2">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="w-full px-3 pb-1.5 pt-1.5 text-left transition-colors hover:bg-hover"
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-surface-1 ${
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
            <span className="min-w-0 truncate text-xs text-fg-muted">{summary}</span>
          )}
          <ChevronRight
            className={cn(
              'ml-auto size-3.5 shrink-0 text-fg-subtle transition-transform duration-150',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        </span>
        <MetaChips items={toolMeta(part)} />
      </button>
      {open && hasBody && (
        <div className="space-y-2 border-t border-border bg-bg/30 px-2.5 py-2.5">
          {command !== null && (
            <DisclosureSection tint="in" label="输入" note="bash">
              <div className="[&>div]:my-0">
                <CodeBlock code={command} language="bash" streaming={false} />
              </div>
            </DisclosureSection>
          )}
          {part.result !== undefined && (
            <DisclosureSection tint="out" label="输出" note="stdout">
              <ToolOutputBody part={part} />
            </DisclosureSection>
          )}
        </div>
      )}
      {open && viewablePath !== null && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => {
              openFileDrawer(viewablePath);
            }}
            className="w-full rounded-b-lg px-3 py-1.5 text-left text-xs text-brand transition-colors hover:bg-hover"
          >
            查看文件 {viewablePath}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 工具归组摘要行(PRD-0034 R-B2):相邻同 kind 工具折叠为「类型 + 数量 + 总耗时」,
 * 展开可见逐条调用与单次耗时;流式期间未完结组实时更新。头部同 ToolCallView
 * 的两行契约(元数据 chips 常驻)。
 */
export function ToolGroupView({ group }: { group: ToolGroupPart }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const Icon = toolIcon(group.tools[0]?.display);
  const label = TOOL_KIND_LABELS[group.toolKind] ?? '工具调用';
  const errorCount = group.tools.filter((t) => t.isError).length;
  const meta: MetaItem[] = [
    { label: '数量', value: String(group.tools.length) },
    ...(errorCount > 0 ? [{ label: '失败', value: String(errorCount), tone: 'err' as const }] : []),
    ...(group.spanMs !== undefined
      ? [{ label: '总耗时', value: formatDuration(group.spanMs) }]
      : []),
  ];

  return (
    <div className="my-1 overflow-hidden rounded-lg border border-border bg-surface-1 text-sm shadow-1 transition-shadow hover:shadow-2">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="w-full px-3 pb-1.5 pt-1.5 text-left transition-colors hover:bg-hover"
      >
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ring-2 ring-surface-1 ${
              group.hasRunning ? 'animate-pulse bg-state-warning' : 'bg-state-success'
            }`}
            aria-hidden
          />
          <Icon className="size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          <span className="shrink-0 text-fg">{label}</span>
          <span className="shrink-0 text-fg-muted">× {group.tools.length}</span>
          <ChevronRight
            className={cn(
              'ml-auto size-3.5 shrink-0 text-fg-subtle transition-transform duration-150',
              open && 'rotate-90',
            )}
            aria-hidden
          />
        </span>
        <MetaChips items={meta} />
      </button>
      {open && (
        <div className="space-y-1 border-t border-border bg-bg/30 px-2 py-2">
          {group.tools.map((tool) => (
            <ToolCallView key={tool.toolCallId} part={tool} />
          ))}
        </div>
      )}
    </div>
  );
}
