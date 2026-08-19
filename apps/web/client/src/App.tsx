import { Navigate, Route, Routes, useParams } from 'react-router-dom';

import { AppShell } from '#/components/layout/AppShell';
import { ChatPage } from '#/pages/ChatPage';

export function App(): React.JSX.Element {
  return (
    <AppShell>
      <Routes>
        {/* "/" = 新会话 hero(无 sessionId);带 id 走 ChatRoute */}
        <Route path="/" element={<ChatPage />} />
        <Route path="/sessions/:sessionId" element={<ChatRoute />} />
        {/* 深链路由(PRD-0035 R-D4 演化):/sessions/:id/agents/:agentId 保留,
            进入自动聚焦检视 tab 并设定该 agent 作用域 */}
        <Route path="/sessions/:sessionId/agents/:agentId" element={<AgentRoute />} />
        {/* 未知路径兜底:避免空匹配渲染空白页 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

/** 以 sessionId 为 key 重挂 ChatPage:切换会话时连 reducer 一起重建,零残留。 */
function ChatRoute(): React.JSX.Element {
  const { sessionId } = useParams();
  return <ChatPage key={sessionId ?? 'none'} />;
}

/** agent 深链:同样以 sessionId+agentId 重挂,进入后自动聚焦 Agents tab 并高亮该节点。 */
function AgentRoute(): React.JSX.Element {
  const { sessionId, agentId } = useParams();
  return <ChatPage key={`${sessionId ?? 'none'}:${agentId ?? ''}`} agentId={agentId} />;
}
