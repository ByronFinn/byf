import { Route, Routes, useParams } from 'react-router-dom';

import { AppShell } from '#/components/layout/AppShell';
import { ChatPage } from '#/pages/ChatPage';
import { SessionListPage } from '#/pages/SessionListPage';

export function App(): React.JSX.Element {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<SessionListPage />} />
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
