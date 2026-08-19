/**
 * 检视 tab（IA 合并：原轨迹 + 上下文 + 代理三 tab → 单 tab 双视图）。
 *
 * 结构：顶部一行 = 层级作用域选择器（ScopeSelector）+「轨迹 | 上下文投影」
 * 双视图切换；下方按视图渲染 WireTab（轨迹）或 ContextTab（上下文投影）。
 * 作用域为 InspectTab 单一状态 —— 两个视图共享同一 agent，无第二套控件
 * 可联动；深链 agentId 经 initialAgentId 初始化（ChatPage 以 key 重挂）。
 */
import { useEffect, useState } from 'react';

import { ContextTab } from './context/ContextTab';
import { ScopeSelector } from './ScopeSelector';
import { WireTab } from './wire/WireTab';

interface InspectTabProps {
  sessionId: string;
  /** 初始作用域（深链 /agents/:agentId 传入）；默认 'main'。 */
  initialAgentId?: string;
}

type InspectView = 'trace' | 'context';

export function InspectTab({
  sessionId,
  initialAgentId = 'main',
}: InspectTabProps): React.JSX.Element {
  const [view, setView] = useState<InspectView>('trace');
  const [agentId, setAgentId] = useState(initialAgentId);
  // 会话/深链变化时重挂作用域（与 WireTab 原逻辑一致：跨会话不残留旧 agent）。
  useEffect(() => {
    setAgentId(initialAgentId);
  }, [sessionId, initialAgentId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg px-4 pt-2">
        <ScopeSelector sessionId={sessionId} agentId={agentId} onSelect={setAgentId} />
        <div className="-mb-px ml-2 flex">
          {(['trace', 'context'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                setView(v);
              }}
              className={
                view === v
                  ? 'border-b-2 border-brand px-3 py-1.5 text-sm font-medium text-fg'
                  : 'border-b-2 border-transparent px-3 py-1.5 text-sm text-fg-muted hover:text-fg'
              }
            >
              {v === 'trace' ? '轨迹' : '上下文投影'}
            </button>
          ))}
        </div>
        <span className="flex-1" aria-hidden />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {view === 'trace' ? (
          <WireTab key={agentId} sessionId={sessionId} agentId={agentId} />
        ) : (
          <ContextTab key={agentId} sessionId={sessionId} agentId={agentId} />
        )}
      </div>
    </div>
  );
}
