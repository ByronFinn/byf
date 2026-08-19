/**
 * 检视作用域选择器（层级面包屑）：当前值以 `main → agent-0` 面包屑显示
 * 层级关系，下拉 = agent 树（缩进 + 记录数 + no-wire 警告）。检视内唯一
 * 作用域控件 —— 单一事实源，轨迹/上下文投影共享，无跨视图联动。
 *
 * 数据源 GET /api/sessions/:id/agents（useAgentTree）；「全部」不在选择
 * 之列——wire/context 端点 agent 缺省即 main，作用域恒为具体 agent。
 */
import { ChevronDown, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useAgentTree } from '#/hooks/useSubagents';
import type { AgentNode } from '#/types';

interface ScopeSelectorProps {
  sessionId: string;
  /** 当前作用域 agentId（受控于父级 InspectTab）。 */
  agentId: string;
  onSelect: (agentId: string) => void;
}

function flatten(node: AgentNode, depth: number, out: { node: AgentNode; depth: number }[]): void {
  out.push({ node, depth });
  for (const child of node.children) {
    flatten(child, depth + 1, out);
  }
}

/** 在树中查找 agentId 的根路径（如 [main, agent-0]）；找不到返回 null。 */
function findPath(nodes: readonly AgentNode[], agentId: string): string[] | null {
  for (const n of nodes) {
    if (n.agentId === agentId) return [n.agentId];
    const sub = findPath(n.children, agentId);
    if (sub !== null) return [n.agentId, ...sub];
  }
  return null;
}

export function ScopeSelector({
  sessionId,
  agentId,
  onSelect,
}: ScopeSelectorProps): React.JSX.Element {
  const { data } = useAgentTree(sessionId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击外部 / Esc 关闭下拉。
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 工具栏组件随输入/流式刷新频繁重渲,树展平与路径解析记忆化。
  const rows = useMemo(() => {
    return (data?.tree ?? []).flatMap((n) => {
      const out: { node: AgentNode; depth: number }[] = [];
      flatten(n, 0, out);
      return out;
    });
  }, [data?.tree]);
  const path = useMemo(() => findPath(data?.tree ?? [], agentId), [data?.tree, agentId]);
  const label = path !== null ? path.join(' → ') : agentId;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="选择作用域（agent 层级）"
        className="flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2 py-1 font-mono text-[11px] text-fg transition-colors hover:bg-hover"
      >
        {label}
        <ChevronDown
          className={`size-3 shrink-0 text-fg-subtle transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="作用域"
          className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-2"
        >
          {rows.length === 0 ? (
            <p className="px-3 py-2 font-mono text-[11px] text-fg-subtle">agent 加载中…</p>
          ) : (
            rows.map(({ node, depth }) => (
              <button
                key={node.agentId}
                type="button"
                role="option"
                aria-selected={node.agentId === agentId}
                onClick={() => {
                  onSelect(node.agentId);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-hover ${
                  node.agentId === agentId ? 'text-fg' : 'text-fg-muted'
                }`}
                style={{ paddingLeft: 12 + depth * 16 }}
              >
                <span className="min-w-0 flex-1 truncate">{node.agentId}</span>
                {!node.wireExists && (
                  <TriangleAlert
                    className="size-3 shrink-0 text-state-warning"
                    aria-label="no wire"
                  />
                )}
                <span className="shrink-0 text-[10px] text-fg-subtle">
                  {node.wireRecordCount} recs
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
