import { Route, Routes, useParams } from 'react-router-dom';

import { AppShell } from '#/components/layout/AppShell';
import { ChatPage } from '#/pages/ChatPage';

export function App(): React.JSX.Element {
  return (
    <AppShell>
      <Routes>
        {/* "/" = 新会话 hero(无 sessionId);带 id 走 ChatRoute */}
        <Route path="/" element={<ChatPage />} />
        <Route path="/sessions/:sessionId" element={<ChatRoute />} />
      </Routes>
    </AppShell>
  );
}

/** 以 sessionId 为 key 重挂 ChatPage:切换会话时连 reducer 一起重建,零残留。 */
function ChatRoute(): React.JSX.Element {
  const { sessionId } = useParams();
  return <ChatPage key={sessionId ?? 'none'} />;
}
